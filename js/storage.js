import {uid,validDate} from './utils.js';

const DATABASE='sahod-payroll-v1';
let db;
let revision=0;
let remoteSaver=null;
let auditActor=null;

export async function openDatabase(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DATABASE,1);
    req.onupgradeneeded=()=>{
      if(!req.result.objectStoreNames.contains('workspace'))req.result.createObjectStore('workspace');
    };
    req.onsuccess=()=>{db=req.result;resolve()};
    req.onerror=()=>reject(req.error);
  });
}

export async function loadState(){
  return new Promise((resolve,reject)=>{
    const r=db.transaction('workspace').objectStore('workspace').get('state');
    r.onsuccess=()=>{revision=r.result?.revision||0;resolve(r.result?.data??null)};
    r.onerror=()=>reject(r.error);
  });
}

export function setRemotePersistence(saver){remoteSaver=typeof saver==='function'?saver:null}
export function setAuditActor(actor){
  auditActor=actor&&typeof actor==='object'?{
    uid:String(actor.uid||''),
    email:String(actor.email||''),
    name:String(actor.name||actor.displayName||actor.email||'')
  }:null;
}

export async function saveLocalState(state,{force=false}={}){
  const data=structuredClone(state);
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('workspace','readwrite');
    const store=tx.objectStore('workspace');
    const r=store.get('state');
    let nextRevision=revision+1;
    r.onsuccess=()=>{
      const currentRevision=r.result?.revision||0;
      if(!force&&currentRevision!==revision){tx.abort();return}
      nextRevision=currentRevision+1;
      store.put({data,revision:nextRevision},'state');
    };
    tx.oncomplete=()=>{revision=nextRevision;resolve()};
    tx.onerror=()=>reject(tx.error);
    tx.onabort=()=>reject(Error('This workspace changed in another tab. Reload the latest cloud/local state before saving again.'));
  });
}

// In cloud mode Firestore is the source of truth. Save remotely first so a
// failed cloud write never leaves a newer local cache that was not accepted by
// the shared workspace. Once the cloud commit succeeds, refresh the cache even
// if another local tab changed its IndexedDB revision in the meantime.
export async function saveState(state){
  if(remoteSaver){
    // Firestore is authoritative in cloud mode. Once the remote commit succeeds,
    // a local IndexedDB/cache failure must not make the UI roll back a change
    // that is already durable in the shared workspace.
    await remoteSaver(structuredClone(state));
    try{await saveLocalState(state,{force:true})}catch(error){console.warn('Cloud save succeeded, but the local IndexedDB cache could not be refreshed.',error)}
    return;
  }
  await saveLocalState(state);
}

export function audit(state,action,entity,oldValue=null,newValue=null){
  const actor=auditActor?.email||auditActor?.name||state.settings.operator||'Administrator';
  state.audit.unshift({
    id:uid('AUD'),
    timestamp:new Date().toISOString(),
    user:actor,
    userUid:auditActor?.uid||'',
    userEmail:auditActor?.email||'',
    action,
    entity,
    oldValue:structuredClone(oldValue),
    newValue:structuredClone(newValue)
  });
}

export function validateBackup(data){
  if(data?.schema!==1)throw Error('Unsupported backup format.');
  data.leaves=Array.isArray(data.leaves)?data.leaves:[];for(const k of ['employees','attendance','leaves','payrolls','holidays','loans','audit','rules','closures'])if(!Array.isArray(data[k]))throw Error(`Missing ${k} records.`);
  if(!data.settings?.company)throw Error('Missing company settings.');
  if(data.employees.length>20000||data.attendance.length>500000)throw Error('Backup is too large for this prototype.');
  for(const k of ['employees','attendance','leaves','payrolls','holidays','loans']){
    const ids=data[k].map(x=>x.id);
    if(ids.some(x=>typeof x!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(x))||new Set(ids).size!==ids.length)throw Error(`Invalid or duplicate ${k} identifiers.`);
  }
  for(const e of data.employees){
    if(!Array.isArray(e.statusHistory)||!validDate(e.hireDate)||!e.firstName||!e.lastName||!Array.isArray(e.rateHistory))throw Error('Invalid employee record.');
  }
  for(const a of data.attendance)if(!validDate(a.date)||!data.employees.some(e=>e.id===a.employeeId))throw Error('Invalid attendance record.');
  for(const r of data.leaves)if(!validDate(r.from)||!validDate(r.to)||r.from>r.to||!data.employees.some(e=>e.id===r.employeeId))throw Error('Invalid leave request.');
  for(const h of data.holidays)if(!validDate(h.date)||typeof h.name!=='string')throw Error('Invalid holiday record.');
  for(const p of data.payrolls){
    if(!validDate(p.payDate)||!validDate(p.period?.from)||!validDate(p.period?.to)||!p.company||!Array.isArray(p.ruleSnapshots))throw Error('Invalid payroll dates or snapshots.');
    if(!Array.isArray(p.lines)||!['Draft','Calculated','Reviewed','Approved','Paid','Voided'].includes(p.status))throw Error('Invalid payroll record.');
    for(const l of p.lines)for(const k of ['gross','net','tax','totalDeductions'])if(!Number.isSafeInteger(l[k]))throw Error('Invalid payroll monetary amount.');
  }
  return data;
}

export function backup(state){return JSON.stringify({...state,exportedAt:new Date().toISOString()},null,2)}
