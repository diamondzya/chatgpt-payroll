import {validDate,uid,weekday,addDays,round,today} from './utils.js';
import {activeOn,employeeOn} from './employees.js';
import {audit} from './storage.js';
import {holidayOn} from './holidays.js';
import {selectRule} from './statutory.js';

export const attendanceStatuses=['Present','Absent','Late','Undertime','Paid Leave','Unpaid Leave','Rest Day','Regular Holiday','Special Non-Working Day'];
export const attendanceReviewStatuses=['OPEN','NEEDS_REVIEW','APPROVED','LOCKED'];
export const overtimeStatuses=['NONE','PENDING','APPROVED','REJECTED'];
export const OT_MINIMUM_MINUTES=60;
export const DEFAULT_MAX_SHIFT_HOURS=16;

const minutes=t=>{
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(t||''))throw Error('Use valid clock times.');
  const [h,m]=t.split(':').map(Number);return h*60+m;
};
const phParts=d=>{
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(d);
  return Object.fromEntries(parts.map(p=>[p.type,p.value]));
};
export function manilaClock(date=new Date()){
  const p=phParts(date);
  return {date:`${p.year}-${p.month}-${p.day}`,time:`${p.hour}:${p.minute}`,timeWithSeconds:`${p.hour}:${p.minute}:${p.second}`,iso:date.toISOString()};
}
export function isRest(e,date){const day=weekday(date),rest=Number(e.restDay);const distance=(day-rest+7)%7;return distance===0||distance>Number(e.normalDays)}

function attendancePolicy(policy={}){
  if(typeof policy==='number')return {otMinimumMinutes:policy,maxShiftHours:DEFAULT_MAX_SHIFT_HOURS};
  return {
    otMinimumMinutes:Number.isFinite(Number(policy.otMinimumMinutes))?Number(policy.otMinimumMinutes):OT_MINIMUM_MINUTES,
    maxShiftHours:Number.isFinite(Number(policy.maxShiftHours))?Number(policy.maxShiftHours):DEFAULT_MAX_SHIFT_HOURS
  };
}

export function calculateAttendance(a,e,policy={}){
  const cfg=attendancePolicy(policy);
  const noWork=['Absent','Unpaid Leave','Paid Leave'].includes(a.status)||(!a.timeIn&&!a.timeOut);
  if(noWork)return {totalMinutes:0,regularMinutes:0,overtimeMinutes:0,rawOvertimeMinutes:0,lateMinutes:0,undertimeMinutes:0,nightMinutes:0,worked:[],breakMinutes:0,openShift:false,otMinimumMinutes:cfg.otMinimumMinutes};
  const scheduleIn=minutes(e.scheduleIn);
  if(a.timeIn&&!a.timeOut){
    return {totalMinutes:0,regularMinutes:0,overtimeMinutes:0,rawOvertimeMinutes:0,lateMinutes:Math.max(0,minutes(a.timeIn)-scheduleIn),undertimeMinutes:0,nightMinutes:0,worked:[],breakMinutes:Number(a.breakMinutes||0),openShift:true,otMinimumMinutes:cfg.otMinimumMinutes};
  }
  if(!a.timeIn&&a.timeOut)throw Error('Clock-in is required before clock-out.');

  const start=minutes(a.timeIn);
  let end=minutes(a.timeOut)+(a.overnight?1440:0);
  if(end<=start)throw Error('Clock-out must follow clock-in (select overnight when needed).');
  const elapsed=end-start;
  if(elapsed>cfg.maxShiftHours*60)throw Error(`Shift exceeds the configured ${cfg.maxShiftHours}-hour maximum. Review this attendance record manually.`);

  const breakM=Number(a.breakMinutes||0);
  if(!Number.isFinite(breakM)||breakM<0||breakM>=elapsed)throw Error('Break must be shorter than the shift.');
  let bs=breakM?minutes(a.breakStart):end;
  if(bs<start)bs+=1440;
  if(breakM&&(bs<start||bs+breakM>end))throw Error('Break must be inside the shift.');

  const worked=[];
  for(let m=start;m<end;m++)if(m<bs||m>=bs+breakM)worked.push(m);
  const normal=round(Number(e.normalHours)*60);
  let scheduleOut=minutes(e.scheduleOut);if(scheduleOut<=scheduleIn)scheduleOut+=1440;
  const late=Math.max(0,start-scheduleIn);
  const undertime=Math.max(0,scheduleOut-end);
  const rawOvertime=Math.max(0,worked.length-normal);
  const qualifiedOvertime=rawOvertime>cfg.otMinimumMinutes?rawOvertime:0;
  return {
    totalMinutes:worked.length,
    regularMinutes:Math.min(normal,worked.length),
    overtimeMinutes:qualifiedOvertime,
    rawOvertimeMinutes:rawOvertime,
    lateMinutes:late,
    undertimeMinutes:undertime,
    nightMinutes:worked.filter(m=>m%1440>=1320||m%1440<360).length,
    worked,
    breakMinutes:breakM,
    openShift:false,
    otMinimumMinutes:cfg.otMinimumMinutes
  };
}

export function saveAttendance(state,a){
  if(!validDate(a.date)||!attendanceStatuses.includes(a.status))throw Error('Valid attendance date and status are required.');
  const e=state.employees.find(e=>e.id===a.employeeId);
  if(!e||!activeOn(e,a.date))throw Error('Employee is inactive on this date. Restore employment status first.');
  if(state.closures.some(c=>c.month===a.date.slice(0,7)&&c.status==='Closed'))throw Error('This month is locked.');
  if(state.payrolls.some(p=>['Approved','Paid'].includes(p.status)&&p.kind==='Regular'&&p.period.from<=a.date&&p.period.to>=a.date&&p.lines.some(l=>l.employeeId===e.id)))throw Error('Attendance is part of a finalized payroll. Create a payroll adjustment.');
  if(state.attendance.some(x=>x.employeeId===a.employeeId&&x.date===a.date&&x.id!==a.id))throw Error('Attendance already exists for this employee and date.');

  const policy={otMinimumMinutes:state.settings.otMinimumMinutes,maxShiftHours:state.settings.maxShiftHours};
  const computed=calculateAttendance(a,employeeOn(e,a.date),policy);
  if(computed.totalMinutes){
    const start=Date.parse(a.date+'T'+a.timeIn+':00Z');
    const end=Date.parse(a.date+'T'+a.timeOut+':00Z')+(a.overnight?86400000:0);
    for(const other of state.attendance.filter(x=>x.employeeId===e.id&&x.id!==a.id&&x.timeIn&&x.timeOut)){
      const os=Date.parse(other.date+'T'+other.timeIn+':00Z');
      const oe=Date.parse(other.date+'T'+other.timeOut+':00Z')+(other.overnight?86400000:0);
      if(start<oe&&end>os)throw Error('This shift overlaps another attendance record.');
    }
  }

  const old=state.attendance.find(x=>x.id===a.id);
  if(old?.reviewStatus==='LOCKED')throw Error('This attendance record is locked by finalized payroll. Create a payroll adjustment instead.');
  if(old&&!String(a.correctionReason||'').trim())throw Error('A new correction reason is required when editing attendance.');
  let reviewStatus=computed.openShift?'OPEN':(a.reviewStatus||(!old?'NEEDS_REVIEW':'NEEDS_REVIEW'));
  if(!attendanceReviewStatuses.includes(reviewStatus))reviewStatus=computed.openShift?'OPEN':'NEEDS_REVIEW';
  const priorOt=a.otStatus||(a.otApproved?'APPROVED':'');
  const otStatus=computed.overtimeMinutes>0?(overtimeStatuses.includes(priorOt)?priorOt:'PENDING'):'NONE';
  const item={
    ...a,
    id:old?.id||uid('ATT'),
    reviewStatus,
    otStatus,
    otApproved:otStatus==='APPROVED',
    correctionReason:old?String(a.correctionReason||'').trim():'',
    updatedAt:new Date().toISOString()
  };
  if(old)state.attendance[state.attendance.indexOf(old)]=item;else state.attendance.push(item);
  audit(state,old?'Attendance corrected':'Attendance created',e.code,old||null,item);
  return item;
}

export function openAttendanceFor(state,employeeId){
  return [...state.attendance]
    .filter(a=>a.employeeId===employeeId&&a.timeIn&&!a.timeOut)
    .sort((a,b)=>(b.clockInAt||b.date+'T'+b.timeIn).localeCompare(a.clockInAt||a.date+'T'+a.timeIn))[0]||null;
}
export function todayAttendanceFor(state,employeeId,date=today()){return state.attendance.find(a=>a.employeeId===employeeId&&a.date===date)||null}

export function approveAttendance(state,id,{reviewer='Administrator',note='Reviewed and approved'}={}){
  const a=state.attendance.find(x=>x.id===id);if(!a)throw Error('Attendance record was not found.');
  if(a.reviewStatus==='OPEN'||(a.timeIn&&!a.timeOut))throw Error('Complete Time Out before approving attendance.');
  if(a.reviewStatus==='LOCKED')throw Error('Attendance is locked by finalized payroll.');
  const old=structuredClone(a);a.reviewStatus='APPROVED';a.reviewedAt=new Date().toISOString();a.reviewedBy=reviewer;a.reviewNote=String(note||'Reviewed and approved').trim();
  audit(state,'Attendance approved',state.employees.find(e=>e.id===a.employeeId)?.code||a.employeeId,old,a);return a;
}

export function decideOvertime(state,id,approved,{reviewer='Administrator',note=''}={}){
  const a=state.attendance.find(x=>x.id===id);if(!a)throw Error('Attendance record was not found.');
  if(a.reviewStatus==='LOCKED')throw Error('Attendance is locked by finalized payroll.');
  const e=state.employees.find(e=>e.id===a.employeeId);if(!e)throw Error('Employee was not found.');
  const metrics=calculateAttendance(a,employeeOn(e,a.date),{otMinimumMinutes:state.settings.otMinimumMinutes,maxShiftHours:state.settings.maxShiftHours});
  if(metrics.overtimeMinutes<=0)throw Error('This attendance record has no qualifying overtime to approve.');
  if(!approved&&!String(note||'').trim())throw Error('Enter a reason when rejecting overtime.');
  const old=structuredClone(a);a.otStatus=approved?'APPROVED':'REJECTED';a.otApproved=approved;a.otReviewedAt=new Date().toISOString();a.otReviewedBy=reviewer;a.otReviewNote=String(note||'').trim();
  audit(state,approved?'Overtime approved':'Overtime rejected',e.code,old,a);return a;
}

export function lockAttendanceForPayroll(state,payroll){
  if(payroll.kind!=='Regular')return;const employeeIds=new Set((payroll.lines||[]).map(l=>l.employeeId));
  for(const a of state.attendance){if(employeeIds.has(a.employeeId)&&a.date>=payroll.period.from&&a.date<=payroll.period.to&&a.reviewStatus==='APPROVED'){a.reviewStatus='LOCKED';a.payrollLockId=payroll.id;a.lockedAt=new Date().toISOString();}}
}
export function unlockAttendanceForPayroll(state,payroll){
  for(const a of state.attendance){if(a.payrollLockId===payroll.id&&a.reviewStatus==='LOCKED'){a.reviewStatus='APPROVED';delete a.payrollLockId;delete a.lockedAt;}}
}

export function clockAttendance(state,employeeId,action,source='button',now=new Date(),timestampAuthority='device'){
  const employee=state.employees.find(e=>e.id===employeeId);
  if(!employee)throw Error('Employee was not found.');
  if(employee.qrStatus==='REVOKED'&&source.toLowerCase().includes('qr'))throw Error('This employee QR credential has been revoked. Generate a new QR after restoring active employment.');
  const clock=manilaClock(now),open=openAttendanceFor(state,employeeId);
  if(action==='in'){
    if(open)throw Error(`${employee.firstName} is already timed in.`);
    if(!activeOn(employee,clock.date))throw Error('Employee is not active today.');
    const existing=todayAttendanceFor(state,employeeId,clock.date);
    if(existing)throw Error('An attendance record already exists for this employee today.');
    const effective=employeeOn(employee,clock.date);
    const item={employeeId,date:clock.date,status:'Present',timeIn:clock.time,timeOut:'',overnight:false,breakStart:effective.breakStart||'12:00',breakMinutes:Number(effective.breakMinutes??60),otApproved:false,otStatus:'NONE',holidayEligible:false,note:`Automatic Time In via ${source}`,clockSource:source,clockInAt:clock.iso,clockInDisplay:clock.timeWithSeconds,clockInAuthority:timestampAuthority,reviewStatus:'OPEN'};
    return saveAttendance(state,item);
  }
  if(action==='out'){
    if(!open)throw Error(`${employee.firstName} has no open Time In.`);
    const days=(Date.parse(clock.date+'T12:00:00Z')-Date.parse(open.date+'T12:00:00Z'))/86400000;
    if(days<0||days>1)throw Error('The open shift is older than one day. Correct it manually.');
    const overnight=clock.date!==open.date;
    let breakMinutes=Number(open.breakMinutes||0);
    if(breakMinutes){
      const start=minutes(open.timeIn),end=minutes(clock.time)+(overnight?1440:0);
      let bs=minutes(open.breakStart||'12:00');if(bs<start)bs+=1440;
      if(bs<start||bs+breakMinutes>end)breakMinutes=0;
    }
    const item={...open,timeOut:clock.time,overnight,breakMinutes,note:`Automatic Time Out via ${source}`,correctionReason:'Automatic clock-out completion',clockOutAt:clock.iso,clockOutDisplay:clock.timeWithSeconds,clockOutAuthority:timestampAuthority,reviewStatus:'NEEDS_REVIEW'};
    return saveAttendance(state,item);
  }
  throw Error('Unknown time clock action.');
}

export function payDay(state,a,e){
  const metrics=calculateAttendance(a,e,{otMinimumMinutes:state.settings.otMinimumMinutes,maxShiftHours:state.settings.maxShiftHours});
  const earnings={basic:0,overtime:0,holiday:0,restDay:0,night:0,paidLeave:0};
  const details=[];
  const holiday=holidayOn(state,a.date,e.branch),rest=isRest(e,a.date),normal=e.normalHours*60,baseline=e.payrollType==='Monthly';
  if(a.status==='Paid Leave'){
    earnings.paidLeave=baseline?0:e.dailyRate;
    return {earnings,metrics,details,qualifiedBasic:0,unearned:0};
  }
  if(metrics.openShift)return {earnings,metrics,details,qualifiedBasic:0,unearned:0};
  if(!metrics.totalMinutes){
    if(holiday?.type==='Regular Holiday'&&a.holidayEligible){
      earnings.holiday=baseline?0:e.dailyRate;
      details.push({date:a.date,label:'Unworked regular holiday',minutes:normal,multiplier:1,amount:earnings.holiday});
    }
    return {earnings,metrics,details,qualifiedBasic:0,unearned:!rest&&(!holiday||holiday.type==='Special Working Day')?e.dailyRate:0};
  }

  // Excess work is paid as overtime only after the configured threshold is
  // exceeded AND the overtime was reviewed/approved. Previously, <= threshold
  // minutes could accidentally fall back to ordinary basic pay.
  const overtimeApproved=metrics.overtimeMinutes>0&&(a.otStatus==='APPROVED'||a.otApproved===true);
  const buckets=new Map();
  metrics.worked.forEach((minute,index)=>{
    const excess=index>=normal;
    if(excess&&!overtimeApproved)return;
    const d=addDays(a.date,Math.floor(minute/1440)),h=holidayOn(state,d,e.branch),r=isRest(e,d),rule=selectRule(state,'premiums',d),v=rule.values;
    const type=h?.type==='Regular Holiday'?(r?'regularHolidayRestDay':'regularHoliday'):h?.type==='Special Non-Working Day'?(r?'specialDayRestDay':'specialDay'):h?.type==='Company Holiday'?'companyHoliday':r?'restDay':'ordinary';
    const ot=excess&&overtimeApproved;
    const multiplier=v[type+(ot?'OT':'')];
    const hour=(minute%1440)/60;
    const night=v.nightStart>v.nightEnd?hour>=v.nightStart||hour<v.nightEnd:hour>=v.nightStart&&hour<v.nightEnd;
    const key=[d,type,ot,night,rule.version].join('|');
    const b=buckets.get(key)||{date:d,type,ot,night,multiplier,nsd:v.nightDifferential,minutes:0,version:rule.version};
    b.minutes++;buckets.set(key,b);
  });

  let qualifyingMinutes=0;
  for(const b of buckets.values()){
    if(!b.ot&&b.type==='ordinary')qualifyingMinutes+=b.minutes;
    const base=e.hourlyRate*b.minutes/60;
    const amount=round(base*b.multiplier);
    if(b.ot)earnings.overtime+=amount;
    else{
      const basePay=round(base);
      if(!baseline)earnings.basic+=basePay;
      const extra=amount-basePay;
      if(b.type.includes('Holiday')||b.type.startsWith('special'))earnings.holiday+=extra;
      else if(b.type==='restDay')earnings.restDay+=baseline?amount:extra;
      else if(b.type==='companyHoliday')earnings.holiday+=extra;
    }
    const nsd=b.night?round(base*b.multiplier*b.nsd):0;
    earnings.night+=nsd;
    details.push({...b,label:`${b.type}${b.ot?' overtime':''}${b.night?' + NSD':''}`,amount,nightAmount:nsd,hourlyRate:e.hourlyRate});
  }
  const regularOrdinary=metrics.regularMinutes;
  return {earnings,metrics,details,qualifiedBasic:baseline?0:round(e.hourlyRate*qualifyingMinutes/60),unearned:baseline&&!rest?round(e.hourlyRate*Math.max(0,normal-regularOrdinary)/60):0};
}
