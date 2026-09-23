import {validDate,uid,today} from './utils.js';
import {audit} from './storage.js';

export const statuses=['ACTIVE','INACTIVE','SUSPENDED','RESIGNED','TERMINATED'];
export const leaveEntitlementTypes=['Vacation Leave','Sick Leave','Emergency Leave','Bereavement Leave','Other'];
export function normalizeLeaveEntitlements(value={}){
  return Object.fromEntries(leaveEntitlementTypes.map(type=>{
    const n=Number(value?.[type]??0);
    return [type,Number.isFinite(n)&&n>=0?Math.floor(n):0];
  }));
}

export function statusOn(e,date){
  if(date<e.hireDate)return 'NOT_HIRED';
  return [...(e.statusHistory||[])]
    .filter(h=>h.effectiveDate<=date)
    .sort((a,b)=>a.effectiveDate.localeCompare(b.effectiveDate)||String(a.timestamp||'').localeCompare(String(b.timestamp||'')))
    .at(-1)?.status||'INACTIVE';
}
export const activeOn=(e,date)=>statusOn(e,date)==='ACTIVE';
export function employeeOn(e,date){
  const r=[...(e.rateHistory||[])].filter(x=>x.effectiveDate<=date).sort((a,b)=>a.effectiveDate.localeCompare(b.effectiveDate)).at(-1);
  return {...e,...(r?.values||{})};
}

export const rateFields=['payrollType','monthlyBasic','weeklyRate','dailyRate','hourlyRate','normalHours','normalDays','restDay','scheduleIn','scheduleOut','breakStart','breakMinutes','monthlyDivisor','minimumWage','wageBasis','allowance','branch'];

function normalizedEmail(value){return String(value||'').trim().toLowerCase()}
function validOptionalEmail(value){return !value||/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)}
function validClock(value){return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value||''))}

export function issueEmployeeQr(employee,{reason='Issued'}={}){
  const old=employee.qrToken||'';
  employee.qrToken=crypto.randomUUID();
  employee.qrStatus='ACTIVE';
  employee.qrVersion=Number(employee.qrVersion||0)+1;
  employee.qrIssuedAt=new Date().toISOString();
  employee.qrRevokedAt='';
  employee.qrRevokeReason='';
  return {oldTokenSuffix:old.slice(-6),tokenSuffix:employee.qrToken.slice(-6),version:employee.qrVersion,reason};
}

export function revokeEmployeeQr(employee,reason='Employment status changed'){
  if(employee.qrStatus==='REVOKED')return false;
  employee.qrStatus='REVOKED';
  employee.qrRevokedAt=new Date().toISOString();
  employee.qrRevokeReason=reason;
  return true;
}

export function saveEmployee(state,input){
  if(!input.firstName?.trim()||!input.lastName?.trim())throw Error('First and last names are required.');
  if(!validDate(input.hireDate)||!validDate(input.effectiveDate))throw Error('Valid hire and rate effective dates are required.');
  if(input.effectiveDate<input.hireDate)throw Error('Salary effective date cannot precede hiring.');
  if(!(input.hourlyRate>0)||!(input.monthlyBasic>0))throw Error('Enter a positive hourly rate and monthly basic salary.');
  if(!(input.normalHours>0&&input.normalHours<=8)||!(input.normalDays>=1&&input.normalDays<=6))throw Error('Use 1–8 normal hours and 1–6 normal working days.');
  if(!validClock(input.scheduleIn)||!validClock(input.scheduleOut))throw Error('Enter valid scheduled clock-in and clock-out times.');
  if(Number(input.breakMinutes||0)>0&&!validClock(input.breakStart||'12:00'))throw Error('Enter a valid scheduled break start time.');
  if(Number(input.breakMinutes||0)<0||Number(input.breakMinutes||0)>240)throw Error('Unpaid break must be between 0 and 240 minutes.');
  if(input.minimumWage&&!input.wageBasis?.trim())throw Error('Enter the applicable regional wage order / basis for MWE status.');
  input.leaveEntitlements=normalizeLeaveEntitlements(input.leaveEntitlements);
  for(const [type,value] of Object.entries(input.leaveEntitlements)){
    if(!Number.isInteger(value)||value<0||value>366)throw Error(`${type} entitlement must be a whole number from 0 to 366 days.`);
  }

  input.googleEmail=normalizedEmail(input.googleEmail);
  input.email=String(input.email||'').trim();
  if(!validOptionalEmail(input.googleEmail)||!validOptionalEmail(input.email))throw Error('Enter a valid email address.');

  const old=state.employees.find(e=>e.id===input.id);
  if(state.employees.some(e=>e.code===input.code&&e.id!==input.id))throw Error('Employee ID already exists.');
  if(input.googleEmail&&state.employees.some(e=>e.id!==input.id&&normalizedEmail(e.googleEmail)===input.googleEmail))throw Error('That Google account is already linked to another employee.');
  if(old&&input.effectiveDate<old.hireDate)throw Error('Invalid effective date.');

  const {effectiveDate,...fields}=input;
  const values=Object.fromEntries(rateFields.map(k=>[k,fields[k]]));
  const rateHistory=[...(old?.rateHistory||[]).filter(x=>x.effectiveDate!==effectiveDate),{effectiveDate,values}].sort((a,b)=>a.effectiveDate.localeCompare(b.effectiveDate));
  const e={
    ...old,
    ...fields,
    id:old?.id||uid('EMP'),
    qrToken:old?.qrToken||crypto.randomUUID(),
    qrStatus:old?.qrStatus||'ACTIVE',
    qrVersion:Number(old?.qrVersion||1),
    qrIssuedAt:old?.qrIssuedAt||new Date().toISOString(),
    qrRevokedAt:old?.qrRevokedAt||'',
    qrRevokeReason:old?.qrRevokeReason||'',
    rateHistory,
    statusHistory:old?.statusHistory||[{status:'ACTIVE',effectiveDate:input.hireDate,reason:'Hired',changedBy:state.settings.operator,timestamp:new Date().toISOString()}]
  };
  if(old)state.employees[state.employees.indexOf(old)]=e;else state.employees.push(e);
  audit(state,old?'Employee edited':'Employee created',e.code,old||null,e);
  return e;
}

export function changeStatus(state,id,status,date,reason){
  const e=state.employees.find(e=>e.id===id);
  if(!e||!statuses.includes(status)||!validDate(date)||!reason?.trim())throw Error('Status, effective date, and reason are required.');
  if(date<e.hireDate)throw Error('Status date precedes hiring.');
  if(state.payrolls.some(p=>['Approved','Paid'].includes(p.status)&&p.period.to>=date&&p.lines.some(l=>l.employeeId===id)))throw Error('This status date affects a finalized payroll. Use a later effective date or a separate correction.');
  const old=statusOn(e,date);
  e.statusHistory.push({status,effectiveDate:date,reason,changedBy:state.settings.operator,timestamp:new Date().toISOString()});
  if(date<=today()&&status!=='ACTIVE'){
    const changed=revokeEmployeeQr(e,`${status}: ${reason}`);
    if(changed)audit(state,'Employee QR revoked',e.code,null,{reason:`${status}: ${reason}`,effectiveDate:date});
  }
  audit(state,`Employee ${status.toLowerCase()}`,e.code,old,{status,date,reason});
}
