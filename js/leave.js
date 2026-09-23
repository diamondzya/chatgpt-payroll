import {uid,validDate,dates,today} from './utils.js';
import {activeOn,employeeOn,leaveEntitlementTypes,normalizeLeaveEntitlements} from './employees.js';
import {isRest,saveAttendance} from './attendance.js';
import {audit} from './storage.js';
import {holidayOn} from './holidays.js';

export const leaveTypes=[...leaveEntitlementTypes.slice(0,4),'Unpaid Leave','Other'];
export const leaveStatuses=['PENDING','APPROVED','REJECTED','CANCELLED'];

export function leaveWorkDates(state,request){
  const employee=state.employees.find(e=>e.id===request.employeeId);
  if(!employee)return [];
  return dates(request.from,request.to).filter(date=>{
    if(!activeOn(employee,date))return false;
    const effective=employeeOn(employee,date);
    if(isRest(effective,date))return false;
    const holiday=holidayOn(state,date,effective.branch);
    return !holiday||holiday.type==='Special Working Day';
  });
}

function leaveTypeForAttendance(state,attendance){
  if(!attendance?.sourceLeaveId)return '';
  return state.leaves.find(r=>r.id===attendance.sourceLeaveId)?.type||'';
}

export function leaveBalances(state,employeeId,year=today().slice(0,4)){
  const employee=state.employees.find(e=>e.id===employeeId);
  if(!employee)return [];
  const entitlements=normalizeLeaveEntitlements(employee.leaveEntitlements);
  return leaveEntitlementTypes.map(type=>{
    const entitlement=Number(entitlements[type]||0);
    const used=(state.attendance||[]).filter(a=>
      a.employeeId===employeeId
      && a.date?.startsWith(year)
      && a.status==='Paid Leave'
      && leaveTypeForAttendance(state,a)===type
    ).length;
    const pending=(state.leaves||[]).filter(r=>
      r.employeeId===employeeId
      && r.type===type
      && r.status==='PENDING'
      && r.paid!==false
    ).reduce((count,r)=>count+leaveWorkDates(state,r).filter(d=>d.startsWith(year)).length,0);
    const remaining=Math.max(0,entitlement-used);
    return {type,year,entitlement,used,pending,remaining,availableAfterPending:Math.max(0,remaining-pending)};
  });
}

export function leaveBalance(state,employeeId,type,year=today().slice(0,4)){
  return leaveBalances(state,employeeId,year).find(x=>x.type===type)||{type,year,entitlement:0,used:0,pending:0,remaining:0,availableAfterPending:0};
}

export function projectLeaveAllocation(state,request){
  const workDates=leaveWorkDates(state,request).sort();
  const employee=state.employees.find(e=>e.id===request.employeeId);
  const requestedPaid=request.type!=='Unpaid Leave'&&request.paid!==false;
  const remainingByYear=new Map();
  const allocation=[];
  for(const date of workDates){
    const year=date.slice(0,4);
    if(!remainingByYear.has(year)){
      const balance=employee&&leaveEntitlementTypes.includes(request.type)
        ?leaveBalance(state,request.employeeId,request.type,year)
        :{remaining:0};
      remainingByYear.set(year,Number(balance.remaining||0));
    }
    const remaining=remainingByYear.get(year);
    const paid=Boolean(requestedPaid&&leaveEntitlementTypes.includes(request.type)&&remaining>0);
    if(paid)remainingByYear.set(year,remaining-1);
    allocation.push({date,paid});
  }
  const paidDates=allocation.filter(x=>x.paid).map(x=>x.date);
  const unpaidDates=allocation.filter(x=>!x.paid).map(x=>x.date);
  return {workDates,allocation,paidDates,unpaidDates,paidDays:paidDates.length,unpaidDays:unpaidDates.length};
}

export function leavePaySummary(state,request){
  if(request.status==='APPROVED'){
    if(request.approvedPaidDays!==undefined||request.approvedUnpaidDays!==undefined){
      return {paidDays:Number(request.approvedPaidDays||0),unpaidDays:Number(request.approvedUnpaidDays||0),final:true};
    }
    const generated=(state.attendance||[]).filter(a=>a.sourceLeaveId===request.id);
    if(generated.length){
      return {paidDays:generated.filter(a=>a.status==='Paid Leave').length,unpaidDays:generated.filter(a=>a.status==='Unpaid Leave').length,final:true};
    }
  }
  const p=projectLeaveAllocation(state,request);
  return {paidDays:p.paidDays,unpaidDays:p.unpaidDays,final:false};
}

export function saveLeaveRequest(state,input){
  if(!input.employeeId||!leaveTypes.includes(input.type))throw Error('Choose an employee and leave type.');
  if(!validDate(input.from)||!validDate(input.to)||input.from>input.to)throw Error('Choose a valid leave date range.');
  if(dates(input.from,input.to).length>62)throw Error('A single leave request can cover at most 62 calendar days.');
  const employee=state.employees.find(e=>e.id===input.employeeId);
  if(!employee)throw Error('Employee was not found.');
  if(!leaveWorkDates(state,input).length)throw Error('The request does not contain an active scheduled workday.');
  if(state.leaves.some(r=>r.id!==input.id&&r.employeeId===input.employeeId&&!['REJECTED','CANCELLED'].includes(r.status)&&r.from<=input.to&&r.to>=input.from))throw Error('This employee already has an overlapping leave request.');
  if(state.closures.some(c=>c.status==='Closed'&&c.month>=input.from.slice(0,7)&&c.month<=input.to.slice(0,7)))throw Error('The leave range touches a closed payroll month. Reopen the month before changing leave records.');
  const old=state.leaves.find(r=>r.id===input.id);
  if(old&&old.status==='APPROVED')throw Error('Approved leave cannot be edited directly. Cancel it with an audit reason and create a replacement request.');
  const item={
    ...old,
    ...input,
    id:old?.id||uid('LEAVE'),
    paid:input.type==='Unpaid Leave'?false:Boolean(input.paid),
    status:old?.status||'PENDING',
    requestedAt:old?.requestedAt||new Date().toISOString(),
    updatedAt:new Date().toISOString()
  };
  delete item.approvedPaidDays;
  delete item.approvedUnpaidDays;
  delete item.approvedAllocation;
  if(old)state.leaves[state.leaves.indexOf(old)]=item;else state.leaves.unshift(item);
  audit(state,old?'Leave request edited':'Leave request created',employee.code,old||null,item);
  return item;
}

export function approveLeave(state,id,{reviewer='Administrator',note=''}={}){
  const request=state.leaves.find(r=>r.id===id);if(!request)throw Error('Leave request was not found.');
  if(request.status!=='PENDING')throw Error('Only pending leave requests can be approved.');
  const employee=state.employees.find(e=>e.id===request.employeeId);if(!employee)throw Error('Employee was not found.');
  const allocation=projectLeaveAllocation(state,request);
  const conflicts=allocation.workDates.filter(date=>state.attendance.some(a=>a.employeeId===employee.id&&a.date===date));
  if(conflicts.length)throw Error(`Attendance already exists for ${conflicts.slice(0,3).join(', ')}${conflicts.length>3?'…':''}. Resolve those dates before approving leave.`);
  const old=structuredClone(request);
  request.status='APPROVED';
  request.reviewedAt=new Date().toISOString();
  request.reviewedBy=reviewer;
  request.reviewNote=note||'Approved';
  request.approvedPaidDays=allocation.paidDays;
  request.approvedUnpaidDays=allocation.unpaidDays;
  request.approvedAllocation=allocation.allocation;
  for(const item of allocation.allocation){
    saveAttendance(state,{
      employeeId:employee.id,
      date:item.date,
      status:item.paid?'Paid Leave':'Unpaid Leave',
      timeIn:'',timeOut:'',overnight:false,breakStart:'',breakMinutes:0,
      otApproved:false,otStatus:'NONE',holidayEligible:false,
      note:`Approved ${request.type} · ${request.id}${item.paid?' · paid credit':' · unpaid / no available paid credit'}`,
      reviewStatus:'APPROVED',
      sourceLeaveId:request.id
    });
  }
  audit(state,'Leave request approved',employee.code,old,request);
  return request;
}

export function rejectLeave(state,id,{reviewer='Administrator',note=''}={}){
  const request=state.leaves.find(r=>r.id===id);if(!request)throw Error('Leave request was not found.');
  if(request.status!=='PENDING')throw Error('Only pending leave requests can be rejected.');
  if(!note.trim())throw Error('Enter a rejection reason.');
  const old=structuredClone(request);request.status='REJECTED';request.reviewedAt=new Date().toISOString();request.reviewedBy=reviewer;request.reviewNote=note.trim();
  const employee=state.employees.find(e=>e.id===request.employeeId);audit(state,'Leave request rejected',employee?.code||request.employeeId,old,request);return request;
}

export function cancelLeave(state,id,{reviewer='Administrator',note=''}={}){
  const request=state.leaves.find(r=>r.id===id);if(!request)throw Error('Leave request was not found.');
  if(!['PENDING','APPROVED'].includes(request.status))throw Error('Only pending or approved leave can be cancelled.');
  if(!note.trim())throw Error('Enter a cancellation reason.');
  const old=structuredClone(request);
  if(request.status==='APPROVED'){
    const attendance=state.attendance.filter(a=>a.sourceLeaveId===request.id);
    if(attendance.some(a=>a.reviewStatus==='LOCKED'))throw Error('This leave is already locked in finalized payroll. Use a payroll adjustment instead.');
    state.attendance=state.attendance.filter(a=>a.sourceLeaveId!==request.id);
  }
  request.status='CANCELLED';request.cancelledAt=new Date().toISOString();request.cancelledBy=reviewer;request.cancelReason=note.trim();
  const employee=state.employees.find(e=>e.id===request.employeeId);audit(state,'Leave request cancelled',employee?.code||request.employeeId,old,request);return request;
}

export function leaveSummary(state,year=today().slice(0,4)){
  const rows=state.leaves.filter(r=>r.from.startsWith(year)||r.to.startsWith(year));
  const approvedIds=new Set(rows.filter(r=>r.status==='APPROVED').map(r=>r.id));
  const generated=(state.attendance||[]).filter(a=>a.sourceLeaveId&&approvedIds.has(a.sourceLeaveId)&&a.date?.startsWith(year));
  return {
    pending:rows.filter(r=>r.status==='PENDING').length,
    approved:rows.filter(r=>r.status==='APPROVED').length,
    rejected:rows.filter(r=>r.status==='REJECTED').length,
    approvedDays:generated.length||rows.filter(r=>r.status==='APPROVED').reduce((n,r)=>n+leaveWorkDates(state,r).filter(d=>d.startsWith(year)).length,0),
    approvedPaidDays:generated.filter(a=>a.status==='Paid Leave').length,
    approvedUnpaidDays:generated.filter(a=>a.status==='Unpaid Leave').length
  };
}
