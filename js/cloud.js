import {firebaseConfig,cloudSettings} from './firebase-config.js';

const SDK='12.19.0';
const stateCollections=['employees','attendance','holidays','loans','payrolls','audit','rules','closures'];
let api=null,app=null,auth=null,db=null,currentUser=null,currentMember=null,lastLoadedState=null;
const databaseId=cloudSettings.databaseId||'(default)';

function configured(){return Boolean(cloudSettings.enabled&&firebaseConfig.apiKey&&firebaseConfig.authDomain&&firebaseConfig.projectId&&firebaseConfig.appId&&cloudSettings.workspaceId)}
export function cloudEnabled(){return configured()}
export function cloudConfigStatus(){return {enabled:configured(),workspaceId:cloudSettings.workspaceId,ownerEmail:cloudSettings.ownerEmail,projectId:firebaseConfig.projectId||'',databaseId,forceLongPolling:cloudSettings.forceLongPolling!==false,configuredFields:Boolean(firebaseConfig.apiKey&&firebaseConfig.authDomain&&firebaseConfig.projectId&&firebaseConfig.appId)}}

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
  // Firestore's WebChannel transport can be blocked/buffered by some proxies,
  // antivirus products and restrictive browser/network setups. Force long polling
  // for this static GitHub Pages deployment unless explicitly disabled.
  db=f.initializeFirestore(app,{
    ignoreUndefinedProperties:true,
    experimentalForceLongPolling:cloudSettings.forceLongPolling!==false,
    experimentalLongPollingOptions:{timeoutSeconds:25}
  },databaseId);
  try{await f.setPersistence(auth,f.browserLocalPersistence)}catch{}
  // Complete a redirect sign-in when a browser blocks popups. getRedirectResult()
  // is safe to call when there is no pending redirect and surfaces redirect errors.
  try{await f.getRedirectResult(auth)}catch(error){
    error.message=friendlyAuthError(error);
    throw error;
  }
  return true;
}

function wsDoc(...parts){return api.doc(db,'workspaces',cloudSettings.workspaceId,...parts)}
function wsCollection(name){return api.collection(db,'workspaces',cloudSettings.workspaceId,name)}
function normalizedEmail(value){return String(value||'').trim().toLowerCase()}
function publicUser(user){return user?{uid:user.uid,email:user.email||'',name:user.displayName||user.email||'Google user',picture:user.photoURL||''}:null}
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
    'unavailable':`Google sign-in succeeded, but Firestore could not reach the backend (unavailable). Verify that Cloud Firestore exists in project ${firebaseConfig.projectId} using database ${databaseId}, publish the Firestore rules, and make sure your browser/network is not blocking firestore.googleapis.com. This build uses long-polling for better GitHub Pages / proxy compatibility.`,
    'unauthenticated':'Firebase lost the authenticated Google session before the payroll workspace could be opened. Sign in again.'
  };
  return messages[code]||error?.message||'The payroll cloud workspace could not be opened.';
}

function recordKey(collectionName,item){
  if(collectionName==='rules')return item?.version;
  return item?.id;
}
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
  // initCloud() runs at application startup. Do not perform an awaited network import
  // here before opening the popup because some browsers then treat it as not
  // originating from the user's click and block it.
  if(!api||!auth)throw Error('Firebase Authentication is still starting. Reload the page and try again.');
  const provider=new api.GoogleAuthProvider();
  provider.setCustomParameters({prompt:'select_account'});
  if(forceRedirect){
    await api.signInWithRedirect(auth,provider);
    return null;
  }
  try{
    const result=await api.signInWithPopup(auth,provider);
    return publicUser(result.user);
  }catch(error){
    const code=String(error?.code||'');
    if(code==='auth/popup-blocked'||code==='auth/operation-not-supported-in-this-environment'){
      // Redirect is more reliable on strict/mobile browsers and does not depend on a popup.
      await api.signInWithRedirect(auth,provider);
      return null;
    }
    error.message=friendlyAuthError(error);
    throw error;
  }
}
export async function signOutCloud(){if(auth)await api.signOut(auth);currentUser=null;currentMember=null}
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
        member={uid:currentUser.uid,email,displayName:currentUser.displayName||email,role:'SUPER_ADMIN',employeeId:null,active:true,createdAt:new Date().toISOString()};
        await api.setDoc(wsDoc('members',currentUser.uid),member,{merge:true});
      }else{
        const inviteRef=wsDoc('invites',email),inviteSnap=await api.getDoc(inviteRef),invite=inviteSnap.exists()?inviteSnap.data():null;
        if(!invite||invite.active===false)throw Error('This Google account is not registered in this payroll workspace. Ask the payroll administrator to invite your Google email.');
        member={uid:currentUser.uid,email,displayName:currentUser.displayName||email,role:invite.role||'EMPLOYEE',employeeId:invite.employeeId||null,active:true,createdAt:new Date().toISOString()};
        await api.setDoc(wsDoc('members',currentUser.uid),member,{merge:true});
        await api.setDoc(inviteRef,{active:false,claimedBy:currentUser.uid,claimedAt:api.serverTimestamp()},{merge:true});
      }
    }
    currentMember=member;return structuredClone(member);
  }catch(error){
    error.message=friendlyWorkspaceError(error);
    throw error;
  }
}

function assertAdmin(){if(!currentUser||!currentMember||!['SUPER_ADMIN','ADMIN'].includes(currentMember.role))throw Error('Administrator cloud access is required for this action.')}
function cleanData(value){return JSON.parse(JSON.stringify(value))}
function recordData(record){return {record:cleanData(record),updatedAt:api.serverTimestamp(),updatedBy:currentUser.uid}}
async function commitChunks(ops){
  for(let i=0;i<ops.length;i+=400){const batch=api.writeBatch(db);for(const op of ops.slice(i,i+400)){if(op.type==='delete')batch.delete(op.ref);else batch.set(op.ref,op.data,{merge:false})}await batch.commit()}
}

export async function loadCloudWorkspaceState(){
  assertAdmin();
  const metaSnap=await api.getDoc(wsDoc('state','meta'));
  if(!metaSnap.exists())return null;
  const meta=metaSnap.data();
  // Older failed bootstrap attempts could create state/meta before the collection
  // records were written. Treat those as uninitialized so the Super Admin can
  // safely seed the cloud from the browser's intact local workspace.
  if(meta.initialized!==true)return null;
  const state={schema:meta.schema||1,settings:meta.settings||{},employees:[],attendance:[],holidays:[],loans:[],payrolls:[],audit:[],rules:[],closures:[]};
  const snapshots=await Promise.all(stateCollections.map(name=>api.getDocs(wsCollection(name))));
  snapshots.forEach((snap,index)=>{state[stateCollections[index]]=snap.docs.map(d=>d.data().record).filter(Boolean)});
  lastLoadedState=structuredClone(state);return state;
}

export async function saveCloudWorkspaceState(state){
  assertAdmin();
  const ops=[];
  for(const name of stateCollections){
    const next=mapByRecordKey(name,state[name]),prev=mapByRecordKey(name,lastLoadedState?.[name]);
    for(const item of state[name]||[]){
      const key=recordKey(name,item);
      if(prev.get(key)!==JSON.stringify(item))ops.push({type:'set',ref:wsDoc(name,key),data:recordData(item)});
    }
    for(const key of prev.keys())if(!next.has(key))ops.push({type:'delete',ref:wsDoc(name,key)});
  }
  // Mirror a privacy-limited self-service record for linked employees. Employees never need read access to the full payroll workspace.
  const oldAccess=new Set((lastLoadedState?.employees||[]).map(e=>e.id));
  for(const employee of state.employees||[]){
    const self={employeeId:employee.id,code:employee.code,firstName:employee.firstName||'',middleName:employee.middleName||'',lastName:employee.lastName||'',suffix:employee.suffix||'',department:employee.department||'',position:employee.position||'',googleEmail:normalizedEmail(employee.googleEmail),qrToken:employee.qrToken||'',updatedAt:api.serverTimestamp()};
    ops.push({type:'set',ref:wsDoc('employeeAccess',employee.id),data:self});oldAccess.delete(employee.id);
  }
  for(const id of oldAccess)ops.push({type:'delete',ref:wsDoc('employeeAccess',id)});
  if(ops.length)await commitChunks(ops);
  await api.setDoc(wsDoc('state','meta'),{
    schema:state.schema||1,
    settings:cleanData(state.settings||{}),
    initialized:true,
    recordCounts:Object.fromEntries(stateCollections.map(name=>[name,(state[name]||[]).length])),
    updatedAt:api.serverTimestamp(),
    updatedBy:currentUser.uid
  },{merge:false});
  lastLoadedState=structuredClone(state);return true
}

export async function getEmployeeAccess(employeeId){
  if(!currentUser||!currentMember)throw Error('Sign in first.');
  if(currentMember.role!=='EMPLOYEE'&&currentMember.role!=='ADMIN'&&currentMember.role!=='SUPER_ADMIN')throw Error('This account has no employee access.');
  const id=employeeId||currentMember.employeeId;if(!id)return null;
  const snap=await api.getDoc(wsDoc('employeeAccess',id));return snap.exists()?snap.data():null
}

export async function inviteCloudUser({email,role,employeeId=null}){
  assertAdmin();email=normalizedEmail(email);if(!email||!email.includes('@'))throw Error('Enter a valid Google email.');
  if(!['ADMIN','EMPLOYEE'].includes(role))throw Error('Choose Admin or Employee.');
  if(role==='ADMIN'&&currentMember.role!=='SUPER_ADMIN')throw Error('Only the Super Admin can invite another administrator.');
  if(role==='EMPLOYEE'&&!employeeId)throw Error('Choose the employee account to link.');
  const data={email,role,employeeId:role==='EMPLOYEE'?employeeId:null,active:true,invitedBy:currentUser.uid,invitedAt:api.serverTimestamp()};
  await api.setDoc(wsDoc('invites',email),data,{merge:true});return data
}
export async function listCloudAccess(){
  assertAdmin();
  const [members,invites]=await Promise.all([api.getDocs(wsCollection('members')),api.getDocs(wsCollection('invites'))]);
  return {members:members.docs.map(d=>({id:d.id,...d.data()})),invites:invites.docs.map(d=>({id:d.id,...d.data()}))}
}
export async function deactivateCloudMember(uid){assertAdmin();if(uid===currentUser.uid)throw Error('You cannot deactivate your own signed-in account.');const target=await memberDoc(uid);if(!target)throw Error('Cloud member not found.');if(target.role==='SUPER_ADMIN')throw Error('The Super Admin cannot be deactivated here.');await api.setDoc(wsDoc('members',uid),{active:false,deactivatedAt:api.serverTimestamp(),deactivatedBy:currentUser.uid},{merge:true})}
export async function cancelCloudInvite(email){assertAdmin();await api.setDoc(wsDoc('invites',normalizedEmail(email)),{active:false,cancelledAt:api.serverTimestamp(),cancelledBy:currentUser.uid},{merge:true})}
export async function diagnoseCloudConnection(){
  if(!currentUser)throw Error('Sign in with Google before running the Firestore diagnostic.');
  const token=await currentUser.getIdToken();
  const project=encodeURIComponent(firebaseConfig.projectId);
  const dbId=encodeURIComponent(databaseId);
  const ws=encodeURIComponent(cloudSettings.workspaceId);
  const uid=encodeURIComponent(currentUser.uid);
  const url=`https://firestore.googleapis.com/v1/projects/${project}/databases/${dbId}/documents/workspaces/${ws}/members/${uid}`;
  try{
    const response=await fetch(url,{headers:{Authorization:`Bearer ${token}`}});
    let body='';try{body=await response.text()}catch{}
    const normalized=body.slice(0,700).replace(/\\s+/g,' ').trim();
    if(response.ok)return {ok:true,status:response.status,summary:'Firestore REST endpoint is reachable and the member document is readable.'};
    if(response.status===404){
      if(/database.*does not exist|not found.*database/i.test(normalized))return {ok:false,status:404,summary:`The Firestore database ${databaseId} does not exist in project ${firebaseConfig.projectId}. Create the (default) Firestore database or set cloudSettings.databaseId to the database you created.`};
      return {ok:true,status:404,summary:'Firestore REST endpoint is reachable. The member document does not exist yet, which is normal before the first successful owner bootstrap.'};
    }
    if(response.status===403)return {ok:false,status:403,summary:'Firestore is reachable, but the current security rules denied this request. Publish the included firestore.rules and verify the owner email.'};
    if(response.status===401)return {ok:false,status:401,summary:'Firestore is reachable, but the Firebase ID token was rejected. Sign out, sign in again, and verify the Firebase project configuration.'};
    return {ok:false,status:response.status,summary:`Firestore REST endpoint responded with HTTP ${response.status}${normalized?`: ${normalized}`:''}`};
  }catch(error){
    return {ok:false,status:0,summary:`The browser could not reach firestore.googleapis.com: ${error?.message||'network request failed'}. Check antivirus, firewall, extensions, DNS, or try another network.`};
  }
}

export function roleLabel(role){return role==='SUPER_ADMIN'?'Super Admin':role==='ADMIN'?'Admin / HR':'Employee'}
