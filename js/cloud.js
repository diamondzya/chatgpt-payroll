import {firebaseConfig,cloudSettings} from './firebase-config.js';
import {today} from './utils.js';
import {statusOn} from './employees.js';

const SDK='12.19.0';
const stateCollections=['employees','attendance','holidays','loans','payrolls','audit','rules','closures'];
let api=null,app=null,auth=null,db=null,currentUser=null,currentMember=null,lastLoadedState=null,lastLoadedRevision=0;
const databaseId=cloudSettings.databaseId||'(default)';
const LOCK_MS=90_000;

function configured(){return Boolean(cloudSettings.enabled&&firebaseConfig.apiKey&&firebaseConfig.authDomain&&firebaseConfig.projectId&&firebaseConfig.appId&&cloudSettings.workspaceId)}
export function cloudEnabled(){return configured()}
export function cloudConfigStatus(){return {enabled:configured(),workspaceId:cloudSettings.workspaceId,ownerEmail:cloudSettings.ownerEmail,projectId:firebaseConfig.projectId||'',databaseId,forceLongPolling:cloudSettings.forceLongPolling!==false,configuredFields:Boolean(firebaseConfig.apiKey&&firebaseConfig.authDomain&&firebaseConfig.projectId&&firebaseConfig.appId),revision:lastLoadedRevision}}

async function imports(){
  if(api)return api;
  const [appApi,authApi,firestoreApi]=await Promise.all([
    import(`https://www.gstatic.com/firebasejs/${SDK}/firebase-app.js`),
    import(`https://www.gstatic.com/firebasejs/${SDK}/firebase-auth.js`),
    import(`https://www.gstatic.com/firebasejs/${SDK}/firebase-firestore.js`)
  ]);
  api={...appApi,...authApi,...firestoreApi};return api;
}

export async function initCloud(){
  if(!configured())return false;
  const f=await imports();
  app=f.getApps().length?f.getApp():f.initializeApp(firebaseConfig);
  auth=f.getAuth(app);
  try{
    db=f.initializeFirestore(app,{
      ignoreUndefinedProperties:true,
      experimentalForceLongPolling:cloudSettings.forceLongPolling!==false,
      experimentalLongPollingOptions:{timeoutSeconds:25}
    },databaseId);
  }catch(error){
    // initializeFirestore throws when Firestore was initialized earlier by another
    // module. Reuse the existing instance instead of breaking sign-in.
    if(String(error?.code||'').includes('already-initialized'))db=f.getFirestore(app,databaseId);else throw error;
  }
  try{await f.setPersistence(auth,f.browserLocalPersistence)}catch{}
  try{await f.getRedirectResult(auth)}catch(error){error.message=friendlyAuthError(error);throw error}
  return true;
}

function wsDoc(...parts){return api.doc(db,'workspaces',cloudSettings.workspaceId,...parts)}
function wsCollection(name){return api.collection(db,'workspaces',cloudSettings.workspaceId,name)}
function normalizedEmail(value){return String(value||'').trim().toLowerCase()}
function publicUser(user){return user?{uid:user.uid,email:user.email||'',name:user.displayName||user.email||'Google user',picture:user.photoURL||''}:null}
function isAdminRole(role){return ['SUPER_ADMIN','ADMIN'].includes(role)}
function timestampMillis(value){return typeof value?.toMillis==='function'?value.toMillis():0}
export function currentCloudIdentity(){return {user:publicUser(currentUser),member:currentMember?structuredClone(currentMember):null}}

function friendlyAuthError(error){
  const code=String(error?.code||'');
  const messages={
    'auth/popup-blocked':'Your browser blocked the Google sign-in popup. Sahod will use full-page Google sign-in instead.',
    'auth/popup-closed-by-user':'Google sign-in was closed before it finished.',
    'auth/cancelled-popup-request':'Another Google sign-in request is already open.',
    'auth/unauthorized-domain':'This website domain is not authorized in Firebase Authentication. Add the current host under Authentication → Settings → Authorized domains.',
    'auth/operation-not-allowed':'Google sign-in is not enabled in Firebase Authentication.',
    'auth/network-request-failed':'Google sign-in could not reach Firebase. Check the internet connection, firewall, or browser privacy settings.',
    'auth/operation-not-supported-in-this-environment':'Popup sign-in is not supported in this browser context. Use the redirect sign-in flow.'
  };
  return messages[code]||error?.message||'Google sign-in could not be completed.';
}
export function cloudAuthMessage(error){return friendlyAuthError(error)}

function friendlyWorkspaceError(error){
  const code=String(error?.code||'');
  const messages={
    'permission-denied':'Google sign-in succeeded, but Firestore denied access to this payroll workspace. Publish the included firestore.rules in Firebase Console and make sure the owner email in those rules exactly matches js/firebase-config.js.',
    'failed-precondition':'Google sign-in succeeded, but Cloud Firestore is not ready for this project. Create the Firestore database in Firebase Console, then publish the included firestore.rules.',
    'unavailable':`Google sign-in succeeded, but Firestore could not reach the backend (unavailable). Verify that Cloud Firestore exists in project ${firebaseConfig.projectId} using database ${databaseId}, publish the Firestore rules, and make sure your browser/network is not blocking firestore.googleapis.com.`,
    'unauthenticated':'Firebase lost the authenticated Google session before the payroll workspace could be opened. Sign in again.',
    'aborted':'The shared payroll changed on another device while this device was editing. Sync from cloud, review the newer data, then repeat your change.'
  };
  return messages[code]||error?.message||'The payroll cloud workspace could not be opened.';
}

function conflictError(message='The shared payroll was updated on another device. Sync from cloud before saving again.'){
  const e=Error(message);e.code='aborted';return e;
}
function recordKey(collectionName,item){return collectionName==='rules'?item?.version:item?.id}
function mapByRecordKey(collectionName,list){
  const map=new Map();
  for(const item of list||[]){
    const key=recordKey(collectionName,item);
    if(!key)throw Error(`Cloud sync cannot save a ${collectionName} record without a stable key.`);
    map.set(key,JSON.stringify(item));
  }
  return map;
}

export async function signInCloud({forceRedirect=false}={}){
  if(!api||!auth)throw Error('Firebase Authentication is still starting. Reload the page and try again.');
  const provider=new api.GoogleAuthProvider();provider.setCustomParameters({prompt:'select_account'});
  if(forceRedirect){await api.signInWithRedirect(auth,provider);return null}
  try{return publicUser((await api.signInWithPopup(auth,provider)).user)}catch(error){
    const code=String(error?.code||'');
    if(code==='auth/popup-blocked'||code==='auth/operation-not-supported-in-this-environment'){await api.signInWithRedirect(auth,provider);return null}
    error.message=friendlyAuthError(error);throw error;
  }
}
export async function signOutCloud(){if(auth)await api.signOut(auth);currentUser=null;currentMember=null;lastLoadedState=null;lastLoadedRevision=0}
export function onCloudAuth(callback){if(!auth)throw Error('Cloud authentication is not initialized.');return api.onAuthStateChanged(auth,user=>{currentUser=user;callback(publicUser(user))})}

async function memberDoc(uid){const snap=await api.getDoc(wsDoc('members',uid));return snap.exists()?snap.data():null}
export async function authorizeCloudUser(){
  if(!currentUser)throw Error('Sign in with Google first.');
  try{
    let member=await memberDoc(currentUser.uid);
    if(member?.active===false)throw Error('This payroll account has been deactivated.');
    if(!member){
      const email=normalizedEmail(currentUser.email),owner=normalizedEmail(cloudSettings.ownerEmail);
      if(email&&owner&&email===owner){
        const data={uid:currentUser.uid,email,displayName:currentUser.displayName||email,role:'SUPER_ADMIN',employeeId:null,active:true,createdAt:api.serverTimestamp()};
        await api.setDoc(wsDoc('members',currentUser.uid),data,{merge:true});
      }else{
        const inviteRef=wsDoc('invites',email),inviteSnap=await api.getDoc(inviteRef),invite=inviteSnap.exists()?inviteSnap.data():null;
        if(!invite||invite.active===false)throw Error('This Google account is not registered in this payroll workspace. Ask the payroll administrator to invite your Google email.');
        const data={uid:currentUser.uid,email,displayName:currentUser.displayName||email,role:invite.role||'EMPLOYEE',employeeId:invite.employeeId||null,active:true,createdAt:api.serverTimestamp()};
        await api.setDoc(wsDoc('members',currentUser.uid),data,{merge:true});
        await api.setDoc(inviteRef,{active:false,claimedBy:currentUser.uid,claimedAt:api.serverTimestamp()},{merge:true});
      }
      member=await memberDoc(currentUser.uid);
    }
    currentMember=member;return structuredClone(member);
  }catch(error){error.message=friendlyWorkspaceError(error);throw error}
}

function assertAdmin(){if(!currentUser||!currentMember||!isAdminRole(currentMember.role))throw Error('Administrator cloud access is required for this action.')}
function cleanData(value){return JSON.parse(JSON.stringify(value))}
function recordData(record){return {record:cleanData(record),updatedAt:api.serverTimestamp(),updatedBy:currentUser.uid}}
function applyBatchOp(batch,op){if(op.type==='delete')batch.delete(op.ref);else batch.set(op.ref,op.data,{merge:false})}
async function docsFromServer(collectionRef){return api.getDocsFromServer?api.getDocsFromServer(collectionRef):api.getDocs(collectionRef)}
async function docFromServer(ref){return api.getDocFromServer?api.getDocFromServer(ref):api.getDoc(ref)}

function accessRecord(employee,workspaceState){
  const active=statusOn(employee,today())==='ACTIVE';
  const qrActive=active&&employee.qrStatus!=='REVOKED'&&Boolean(employee.qrToken);
  const attendance=(workspaceState?.attendance||[])
    .filter(a=>a.employeeId===employee.id)
    .sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))||String(b.clockInAt||'').localeCompare(String(a.clockInAt||'')))
    .slice(0,60)
    .map(a=>({id:a.id,date:a.date,status:a.status,timeIn:a.clockInDisplay||a.timeIn||'',timeOut:a.clockOutDisplay||a.timeOut||'',reviewStatus:a.reviewStatus||'',source:a.clockSource||'',otApproved:a.otApproved===true}));
  const payslips=(workspaceState?.payrolls||[])
    .filter(p=>p.status==='Paid')
    .flatMap(p=>(p.lines||[]).filter(l=>l.employeeId===employee.id).map(l=>({payrollId:p.id,number:p.number,payDate:p.payDate,period:p.period,kind:p.kind,gross:l.gross,totalDeductions:l.totalDeductions,net:l.net,tax:l.tax,contributions:{sss:l.contributions?.sss||0,philhealth:l.contributions?.philhealth||0,pagibig:l.contributions?.pagibig||0}})))
    .sort((a,b)=>String(b.payDate||'').localeCompare(String(a.payDate||'')))
    .slice(0,12);
  return {
    employeeId:employee.id,
    code:employee.code,
    firstName:employee.firstName||'',middleName:employee.middleName||'',lastName:employee.lastName||'',suffix:employee.suffix||'',
    department:employee.department||'',position:employee.position||'',googleEmail:normalizedEmail(employee.googleEmail),
    companyName:workspaceState?.settings?.company?.tradeName||workspaceState?.settings?.company?.name||'',
    active,qrStatus:qrActive?'ACTIVE':'REVOKED',qrVersion:Number(employee.qrVersion||1),qrToken:qrActive?employee.qrToken:'',
    recentAttendance:attendance,recentPayslips:payslips
  };
}

export async function loadCloudWorkspaceState(){
  assertAdmin();
  const metaSnap=await docFromServer(wsDoc('state','meta'));
  if(!metaSnap.exists()){lastLoadedRevision=0;lastLoadedState=null;return null}
  const meta=metaSnap.data();
  if(meta.syncLock&&timestampMillis(meta.syncLock.expiresAt)>Date.now())throw conflictError('Another administrator is currently saving the shared payroll. Wait a few seconds, then retry Sync from cloud.');
  lastLoadedRevision=Number(meta.revision||0);
  if(meta.initialized!==true){lastLoadedState=null;return null}
  const state={schema:meta.schema||1,settings:meta.settings||{},employees:[],attendance:[],holidays:[],loans:[],payrolls:[],audit:[],rules:[],closures:[]};
  const snapshots=await Promise.all(stateCollections.map(name=>docsFromServer(wsCollection(name))));
  snapshots.forEach((snap,index)=>{state[stateCollections[index]]=snap.docs.map(d=>d.data().record).filter(Boolean)});
  lastLoadedState=structuredClone(state);return state;
}

async function acquireSyncLock(){
  const ref=wsDoc('state','meta'),token=crypto.randomUUID();
  const baseRevision=await api.runTransaction(db,async tx=>{
    const snap=await tx.get(ref),meta=snap.exists()?snap.data():{},revision=Number(meta.revision||0),lock=meta.syncLock;
    if(lock&&timestampMillis(lock.expiresAt)>Date.now()&&lock.by!==currentUser.uid)throw conflictError('Another administrator is saving changes right now. Wait a moment, sync from cloud, and retry.');
    if(meta.initialized===true&&revision!==lastLoadedRevision)throw conflictError();
    tx.set(ref,{syncLock:{by:currentUser.uid,token,expiresAt:api.Timestamp.fromMillis(Date.now()+LOCK_MS)},revision,initialized:meta.initialized===true},{merge:true});
    return revision;
  });
  return {token,baseRevision};
}
async function releaseSyncLock(token){
  try{
    await api.runTransaction(db,async tx=>{
      const ref=wsDoc('state','meta'),snap=await tx.get(ref);if(!snap.exists())return;
      const meta=snap.data();if(meta.syncLock?.token===token)tx.set(ref,{syncLock:api.deleteField()},{merge:true});
    });
  }catch{}
}

export async function saveCloudWorkspaceState(state){
  assertAdmin();
  const {token,baseRevision}=await acquireSyncLock();
  try{
    const ops=[];
    for(const name of stateCollections){
      const next=mapByRecordKey(name,state[name]),prev=mapByRecordKey(name,lastLoadedState?.[name]);
      for(const item of state[name]||[]){const key=recordKey(name,item);if(prev.get(key)!==JSON.stringify(item))ops.push({type:'set',ref:wsDoc(name,key),data:recordData(item)})}
      for(const key of prev.keys())if(!next.has(key))ops.push({type:'delete',ref:wsDoc(name,key)});
    }

    const prevAccess=new Map((lastLoadedState?.employees||[]).map(e=>[e.id,JSON.stringify(accessRecord(e,lastLoadedState))]));
    const nextAccess=new Map((state.employees||[]).map(e=>[e.id,JSON.stringify(accessRecord(e,state))]));
    for(const employee of state.employees||[]){
      const data=accessRecord(employee,state);
      if(prevAccess.get(employee.id)!==JSON.stringify(data))ops.push({type:'set',ref:wsDoc('employeeAccess',employee.id),data:{...data,updatedAt:api.serverTimestamp(),updatedBy:currentUser.uid}});
      prevAccess.delete(employee.id);
    }
    for(const id of prevAccess.keys())ops.push({type:'delete',ref:wsDoc('employeeAccess',id)});

    // Automatically disable employee cloud accounts when the linked employee is
    // no longer active or the assigned Google email changed. Reactivation still
    // requires an explicit new invitation so an old account cannot silently regain access.
    const members=await docsFromServer(wsCollection('members'));
    const memberOps=[];
    for(const docSnap of members.docs){
      const m=docSnap.data();if(m.role!=='EMPLOYEE'||m.active===false)continue;
      const e=state.employees.find(x=>x.id===m.employeeId);
      const valid=e&&statusOn(e,today())==='ACTIVE'&&normalizedEmail(e.googleEmail)===normalizedEmail(m.email);
      if(!valid)memberOps.push({type:'set',ref:wsDoc('members',docSnap.id),data:{...m,active:false,deactivatedAt:api.serverTimestamp(),deactivatedBy:currentUser.uid,deactivationReason:'Linked employee is inactive or Google account assignment changed.'}});
    }

    // Keep one logical workspace save atomic. The older implementation committed
    // multiple 400-write chunks and only updated state/meta afterwards. If a later
    // chunk failed, Firestore could contain a partially updated workspace while
    // the revision still looked unchanged. A single batch either commits all
    // record/member changes plus the new revision, or none of them.
    const allOps=[...ops,...memberOps];
    if(allOps.length>480)throw Error('This change touches too many cloud records for one safe browser transaction. Sync from cloud and apply the update in smaller batches, or use a server-side migration.');
    const nextRevision=baseRevision+1;
    const batch=api.writeBatch(db);
    for(const op of allOps)applyBatchOp(batch,op);
    batch.set(wsDoc('state','meta'),{
      schema:state.schema||1,settings:cleanData(state.settings||{}),initialized:true,revision:nextRevision,
      recordCounts:Object.fromEntries(stateCollections.map(name=>[name,(state[name]||[]).length])),
      updatedAt:api.serverTimestamp(),updatedBy:currentUser.uid
    },{merge:false});
    await batch.commit();
    lastLoadedRevision=nextRevision;lastLoadedState=structuredClone(state);return true;
  }catch(error){await releaseSyncLock(token);error.message=friendlyWorkspaceError(error);throw error}
}

export async function getCloudServerTime(){
  assertAdmin();
  const ref=wsDoc('state','serverClock'),nonce=crypto.randomUUID();
  await api.setDoc(ref,{nonce,at:api.serverTimestamp(),requestedBy:currentUser.uid},{merge:false});
  if(api.waitForPendingWrites)await api.waitForPendingWrites(db);
  const snap=await docFromServer(ref),data=snap.data();
  if(data?.nonce!==nonce||typeof data?.at?.toDate!=='function')throw Error('Firebase server time could not be confirmed.');
  return data.at.toDate();
}

export async function getEmployeeAccess(employeeId){
  if(!currentUser||!currentMember)throw Error('Sign in first.');
  if(!['EMPLOYEE','ADMIN','SUPER_ADMIN'].includes(currentMember.role))throw Error('This account has no employee access.');
  const id=employeeId||currentMember.employeeId;if(!id)return null;
  const snap=await docFromServer(wsDoc('employeeAccess',id));return snap.exists()?snap.data():null;
}

export async function inviteCloudUser({email,role,employeeId=null}){
  assertAdmin();email=normalizedEmail(email);if(!email||!email.includes('@'))throw Error('Enter a valid Google email.');
  if(!['ADMIN','EMPLOYEE'].includes(role))throw Error('Choose Admin or Employee.');
  if(role==='ADMIN'&&currentMember.role!=='SUPER_ADMIN')throw Error('Only the Super Admin can invite another administrator.');
  if(role==='EMPLOYEE'&&!employeeId)throw Error('Choose the employee account to link.');
  const data={email,role,employeeId:role==='EMPLOYEE'?employeeId:null,active:true,invitedBy:currentUser.uid,invitedAt:api.serverTimestamp()};
  await api.setDoc(wsDoc('invites',email),data,{merge:true});return data;
}
export async function listCloudAccess(){assertAdmin();const [members,invites]=await Promise.all([docsFromServer(wsCollection('members')),docsFromServer(wsCollection('invites'))]);return {members:members.docs.map(d=>({id:d.id,...d.data()})),invites:invites.docs.map(d=>({id:d.id,...d.data()}))}}
export async function deactivateCloudMember(uid){assertAdmin();if(uid===currentUser.uid)throw Error('You cannot deactivate your own signed-in account.');const target=await memberDoc(uid);if(!target)throw Error('Cloud member not found.');if(target.role==='SUPER_ADMIN')throw Error('The Super Admin cannot be deactivated here.');if(target.role==='ADMIN'&&currentMember.role!=='SUPER_ADMIN')throw Error('Only the Super Admin can deactivate another administrator.');await api.setDoc(wsDoc('members',uid),{active:false,deactivatedAt:api.serverTimestamp(),deactivatedBy:currentUser.uid,deactivationReason:'Deactivated by payroll administrator.'},{merge:true})}
export async function cancelCloudInvite(email){assertAdmin();await api.setDoc(wsDoc('invites',normalizedEmail(email)),{active:false,cancelledAt:api.serverTimestamp(),cancelledBy:currentUser.uid},{merge:true})}

export async function diagnoseCloudConnection(){
  if(!currentUser)throw Error('Sign in with Google before running the Firestore diagnostic.');
  const token=await currentUser.getIdToken(),project=encodeURIComponent(firebaseConfig.projectId),dbId=encodeURIComponent(databaseId),ws=encodeURIComponent(cloudSettings.workspaceId),uid=encodeURIComponent(currentUser.uid);
  const url=`https://firestore.googleapis.com/v1/projects/${project}/databases/${dbId}/documents/workspaces/${ws}/members/${uid}`;
  try{
    const response=await fetch(url,{headers:{Authorization:`Bearer ${token}`}});let body='';try{body=await response.text()}catch{}
    const normalized=body.slice(0,700).replace(/\s+/g,' ').trim();
    if(response.ok)return {ok:true,status:response.status,summary:'Firestore REST endpoint is reachable and the member document is readable.'};
    if(response.status===404){if(/database.*does not exist|not found.*database/i.test(normalized))return {ok:false,status:404,summary:`The Firestore database ${databaseId} does not exist in project ${firebaseConfig.projectId}. Create the (default) Firestore database or set cloudSettings.databaseId to the database you created.`};return {ok:true,status:404,summary:'Firestore is reachable. The member document does not exist yet, which is normal before the first successful owner bootstrap.'}}
    if(response.status===403)return {ok:false,status:403,summary:'Firestore is reachable, but the current security rules denied this request. Publish the included firestore.rules and verify the configured owner email.'};
    if(response.status===401)return {ok:false,status:401,summary:'Firestore is reachable, but the Firebase ID token was rejected. Sign out, sign in again, and verify the Firebase project configuration.'};
    return {ok:false,status:response.status,summary:`Firestore REST endpoint responded with HTTP ${response.status}${normalized?`: ${normalized}`:''}`};
  }catch(error){return {ok:false,status:0,summary:`The browser could not reach firestore.googleapis.com: ${error?.message||'network request failed'}. Check antivirus, firewall, extensions, DNS, or try another network.`}}
}

export function roleLabel(role){return role==='SUPER_ADMIN'?'Super Admin':role==='ADMIN'?'Admin / HR':'Employee'}
