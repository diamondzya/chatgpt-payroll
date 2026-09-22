import {firebaseConfig,cloudSettings} from './firebase-config.js';

const SDK='12.19.0';
const stateCollections=['employees','attendance','holidays','loans','payrolls','audit','rules','closures'];
let api=null,app=null,auth=null,db=null,currentUser=null,currentMember=null,lastLoadedState=null;

function configured(){return Boolean(cloudSettings.enabled&&firebaseConfig.apiKey&&firebaseConfig.authDomain&&firebaseConfig.projectId&&firebaseConfig.appId&&cloudSettings.workspaceId)}
export function cloudEnabled(){return configured()}
export function cloudConfigStatus(){return {enabled:configured(),workspaceId:cloudSettings.workspaceId,ownerEmail:cloudSettings.ownerEmail,projectId:firebaseConfig.projectId||'',configuredFields:Boolean(firebaseConfig.apiKey&&firebaseConfig.authDomain&&firebaseConfig.projectId&&firebaseConfig.appId)}}

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
  auth=f.getAuth(app);db=f.getFirestore(app);
  try{await f.setPersistence(auth,f.browserLocalPersistence)}catch{}
  return true;
}

function wsDoc(...parts){return api.doc(db,'workspaces',cloudSettings.workspaceId,...parts)}
function wsCollection(name){return api.collection(db,'workspaces',cloudSettings.workspaceId,name)}
function normalizedEmail(value){return String(value||'').trim().toLowerCase()}
function publicUser(user){return user?{uid:user.uid,email:user.email||'',name:user.displayName||user.email||'Google user',picture:user.photoURL||''}:null}
export function currentCloudIdentity(){return {user:publicUser(currentUser),member:currentMember?structuredClone(currentMember):null}}

export async function signInCloud(){
  await initCloud();
  const provider=new api.GoogleAuthProvider();
  provider.setCustomParameters({prompt:'select_account'});
  const result=await api.signInWithPopup(auth,provider);
  return publicUser(result.user);
}
export async function signOutCloud(){if(auth)await api.signOut(auth);currentUser=null;currentMember=null}
export function onCloudAuth(callback){if(!auth)throw Error('Cloud authentication is not initialized.');return api.onAuthStateChanged(auth,user=>{currentUser=user;callback(publicUser(user))})}

async function memberDoc(uid){const snap=await api.getDoc(wsDoc('members',uid));return snap.exists()?snap.data():null}
export async function authorizeCloudUser(){
  if(!currentUser)throw Error('Sign in with Google first.');
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
  const state={schema:meta.schema||1,settings:meta.settings||{},employees:[],attendance:[],holidays:[],loans:[],payrolls:[],audit:[],rules:[],closures:[]};
  const snapshots=await Promise.all(stateCollections.map(name=>api.getDocs(wsCollection(name))));
  snapshots.forEach((snap,index)=>{state[stateCollections[index]]=snap.docs.map(d=>d.data().record).filter(Boolean)});
  lastLoadedState=structuredClone(state);return state;
}

function mapById(list){return new Map((list||[]).map(item=>[item.id,JSON.stringify(item)]))}
export async function saveCloudWorkspaceState(state){
  assertAdmin();
  const ops=[];
  await api.setDoc(wsDoc('state','meta'),{schema:state.schema||1,settings:cleanData(state.settings||{}),updatedAt:api.serverTimestamp(),updatedBy:currentUser.uid},{merge:false});
  for(const name of stateCollections){
    const next=mapById(state[name]),prev=mapById(lastLoadedState?.[name]);
    for(const item of state[name]||[]){if(prev.get(item.id)!==JSON.stringify(item))ops.push({type:'set',ref:wsDoc(name,item.id),data:recordData(item)})}
    for(const id of prev.keys())if(!next.has(id))ops.push({type:'delete',ref:wsDoc(name,id)});
  }
  // Mirror a privacy-limited self-service record for linked employees. Employees never need read access to the full payroll workspace.
  const oldAccess=new Set((lastLoadedState?.employees||[]).map(e=>e.id));
  for(const employee of state.employees||[]){
    const self={employeeId:employee.id,code:employee.code,firstName:employee.firstName||'',middleName:employee.middleName||'',lastName:employee.lastName||'',suffix:employee.suffix||'',department:employee.department||'',position:employee.position||'',googleEmail:normalizedEmail(employee.googleEmail),qrToken:employee.qrToken||'',updatedAt:api.serverTimestamp()};
    ops.push({type:'set',ref:wsDoc('employeeAccess',employee.id),data:self});oldAccess.delete(employee.id);
  }
  for(const id of oldAccess)ops.push({type:'delete',ref:wsDoc('employeeAccess',id)});
  if(ops.length)await commitChunks(ops);
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
export function roleLabel(role){return role==='SUPER_ADMIN'?'Super Admin':role==='ADMIN'?'Admin / HR':'Employee'}
