import test from 'node:test';import assert from 'node:assert/strict';
import {demoState} from '../js/seed.js';import {calculateAttendance,payDay,saveAttendance,approveAttendance,decideOvertime} from '../js/attendance.js';import {selectRule,calculateSSS,calculatePhilHealth,calculatePagIBIG,contributionKeys,validateRule} from '../js/statutory.js';import {calculateWithholdingTax} from '../js/tax.js';import {generatePayroll,storePayroll,transitionPayroll,validatePayroll,remainingLoan,monthReconciliation,reconcilePayroll,closeMonth,reopenMonth,paidLines,generateThirteenth,yearEndPayroll,adjustmentPayroll,finishLine,baseLine} from '../js/payroll.js';import {generate1601C,generate2316} from '../js/reports.js';import {activeOn,changeStatus,issueEmployeeQr,saveEmployee} from '../js/employees.js';import {sum,esc,parseCSV,cents} from '../js/utils.js';import {table} from '../js/ui.js';import {saveLeaveRequest,approveLeave,cancelLeave} from '../js/leave.js';
const clean=()=>{const s=demoState();s.payrolls=[];s.employees=s.employees.slice(0,1);s.employees[0].payrollType='Daily';s.employees[0].hourlyRate=10000;s.employees[0].dailyRate=80000;s.employees[0].minimumWage=false;return s};
const pay=(s,p)=>{storePayroll(s,p);transitionPayroll(s,p.id,'Reviewed');transitionPayroll(s,p.id,'Approved');transitionPayroll(s,p.id,'Paid');return p};
const shift=(extra={})=>({date:'2026-09-14',status:'Present',timeIn:'09:00',timeOut:'20:00',breakStart:'12:00',breakMinutes:60,otApproved:true,...extra});
test('SSS bracket boundaries and MPF/EC components',()=>{const s=clean(),r=selectRule(s,'sss','2026-09-01');assert.equal(calculateSSS(524999,r).msc,500000);assert.equal(calculateSSS(525000,r).msc,550000);const high=calculateSSS(99999999,r);assert.equal(high.msc,3500000);assert.equal(high.employee,175000);assert.equal(high.employer,350000);assert.equal(high.employeeMPF,75000);assert.equal(high.ec,3000);assert.equal(high.total,528000)});
test('PhilHealth floor and ceiling apply only to basic salary input',()=>{const s=clean(),r=selectRule(s,'philhealth','2026-01-01');assert.equal(calculatePhilHealth(500000,r).employee,25000);assert.equal(calculatePhilHealth(20000000,r).employee,250000)});
test('Pag-IBIG threshold and capped compensation base',()=>{const s=clean(),r=selectRule(s,'pagibig','2026-01-01');assert.equal(calculatePagIBIG(150000,r).employee,1500);assert.equal(calculatePagIBIG(150100,r).employee,3002);assert.equal(calculatePagIBIG(9000000,r).employee,20000)});
test('weekly withholding exemption and bracket formula',()=>{const s=clean(),r=selectRule(s,'tax','2026-01-01');assert.equal(calculateWithholdingTax(480800,'weekly',r).amount,0);assert.equal(calculateWithholdingTax(1000000,'weekly',r).amount,89420);assert.equal(calculateWithholdingTax(40000000,'annual',r).amount,2250000)});
test('all frequency tables cover boundary centavos without gaps',()=>{const s=clean(),r=selectRule(s,'tax','2026-01-01');for(const freq of ['daily','weekly','semiMonthly','monthly','annual'])for(const b of r.values[freq]){assert(Number.isInteger(calculateWithholdingTax(b.minimum,freq,r).amount));if(b.minimum)assert(Number.isInteger(calculateWithholdingTax(b.minimum-1,freq,r).amount))}});
test('ordinary overtime: base 800 + two OT hours at 125',()=>{const s=clean(),r=payDay(s,shift(),s.employees[0]);assert.equal(r.earnings.basic,80000);assert.equal(r.earnings.overtime,25000);assert.equal(r.earnings.night,0)});
test('overtime premium starts only when overtime is more than one hour',()=>{const s=clean();const oneHour=payDay(s,shift({timeOut:'19:00'}),s.employees[0]);assert.equal(oneHour.metrics.rawOvertimeMinutes,60);assert.equal(oneHour.metrics.overtimeMinutes,0);assert.equal(oneHour.earnings.overtime,0);const sixtyOne=payDay(s,shift({timeOut:'19:01'}),s.employees[0]);assert.equal(sixtyOne.metrics.overtimeMinutes,61);assert(sixtyOne.earnings.overtime>0)});
test('regular holiday overtime at 260% without duplicate base',()=>{const s=clean(),r=payDay(s,shift({date:'2026-08-31'}),s.employees[0]);assert.equal(r.earnings.basic,80000);assert.equal(r.earnings.holiday,80000);assert.equal(r.earnings.overtime,52000);assert.equal(r.qualifiedBasic,0)});
test('rest day and regular holiday on rest day premiums',()=>{const s=clean();const a=payDay(s,shift({date:'2026-09-13'}),s.employees[0]);assert.equal(a.earnings.restDay,24000);assert.equal(a.earnings.overtime,33800);s.holidays.push({id:'h',date:'2026-09-13',name:'Test',type:'Regular Holiday',scope:'Nationwide',active:true});const b=payDay(s,shift({date:'2026-09-13'}),s.employees[0]);assert.equal(b.earnings.holiday,128000);assert.equal(b.earnings.overtime,67600)});
test('night overtime multiplies applicable base, skips unpaid break',()=>{const s=clean();const r=payDay(s,shift({timeIn:'18:00',timeOut:'05:00',overnight:true,breakStart:'23:00'}),s.employees[0]);assert.equal(r.metrics.totalMinutes,600);assert.equal(r.metrics.nightMinutes,360);assert.equal(r.earnings.night,6500)});
test('cross-midnight holiday classification changes at midnight',()=>{const s=clean();s.holidays.push({id:'test-h',date:'2026-09-15',name:'Test holiday',type:'Regular Holiday',scope:'Nationwide',active:true});const r=payDay(s,shift({timeIn:'22:00',timeOut:'07:00',overnight:true,breakStart:'02:00'}),s.employees[0]);assert.equal(r.earnings.basic,80000);assert.equal(r.earnings.holiday,60000);assert.equal(r.earnings.night,12000)});
test('invalid times and breaks fail explicitly',()=>{const s=clean(),e=s.employees[0];assert.throws(()=>calculateAttendance(shift({timeOut:'08:00'}),e));assert.throws(()=>calculateAttendance(shift({breakMinutes:999}),e));assert.throws(()=>calculateAttendance(shift({breakStart:'23:00'}),e))});
test('unworked holiday requires explicit eligibility',()=>{const s=clean(),e=s.employees[0];assert.equal(payDay(s,shift({date:'2026-08-31',timeIn:'',timeOut:'',status:'Regular Holiday',holidayEligible:true}),e).earnings.holiday,80000);assert.equal(payDay(s,shift({date:'2026-08-31',timeIn:'',timeOut:'',status:'Regular Holiday',holidayEligible:false}),e).earnings.holiday,0)});
test('status effective date controls attendance and payroll eligibility',()=>{const s=clean(),e=s.employees[0];changeStatus(s,e.id,'INACTIVE','2026-09-16','Leave');assert.equal(activeOn(e,'2026-09-15'),true);assert.equal(activeOn(e,'2026-09-16'),false);assert.throws(()=>saveAttendance(s,{...shift(),employeeId:e.id,date:'2026-09-17'}));const p=generatePayroll(s,{from:'2026-09-12',to:'2026-09-18',payDate:'2026-09-18'});assert.equal(p.lines[0].daysWorked,2)});
test('duplicate and overlapping payroll periods blocked',()=>{const s=clean();pay(s,generatePayroll(s,{from:'2026-09-01',to:'2026-09-04',payDate:'2026-09-04'}));assert.throws(()=>generatePayroll(s,{from:'2026-09-01',to:'2026-09-04',payDate:'2026-09-04'}));assert.throws(()=>generatePayroll(s,{from:'2026-09-04',to:'2026-09-10',payDate:'2026-09-11'}))});
test('missing attendance blocks approval',()=>{const s=clean();s.attendance=s.attendance.filter(a=>a.date!=='2026-09-02');const p=generatePayroll(s,{from:'2026-09-01',to:'2026-09-04',payDate:'2026-09-04'});storePayroll(s,p);assert(validatePayroll(s,p).errors.some(x=>x.includes('Missing attendance')));assert.throws(()=>transitionPayroll(s,p.id,'Reviewed'))});
test('stale draft detects source edits',()=>{const s=clean(),p=generatePayroll(s,{from:'2026-09-01',to:'2026-09-04',payDate:'2026-09-04'});storePayroll(s,p);s.employees[0].department='Changed';assert(validatePayroll(s,p).errors.some(x=>x.includes('Source data changed')))});
test('paid snapshot remains unchanged after future rule addition',()=>{const s=clean(),p=pay(s,generatePayroll(s,{from:'2026-09-01',to:'2026-09-04',payDate:'2026-09-04'}));const snapshot=JSON.stringify(p.lines);s.rules.push({...structuredClone(s.rules[0]),version:'future',effectiveFrom:'2027-01-01'});assert.equal(JSON.stringify(p.lines),snapshot);assert.throws(()=>transitionPayroll(s,p.id,'Voided','correction'));assert.throws(()=>saveAttendance(s,{...shift(),employeeId:s.employees[0].id,date:'2026-09-02'}))});
test('four-week employee and employer contribution totals reconcile',()=>{const s=clean();for(const [from,to] of [['2026-09-01','2026-09-04'],['2026-09-05','2026-09-11'],['2026-09-12','2026-09-18'],['2026-09-19','2026-09-25']])pay(s,generatePayroll(s,{from,to,payDate:to}));const r=monthReconciliation(s,'2026-09');for(const k of contributionKeys)assert.equal(r[0].delta[k],0,k);closeMonth(s,'2026-09','Complete schedule reviewed');assert.throws(()=>adjustmentPayroll(s,{employeeId:s.employees[0].id,payDate:'2026-09-30',type:'Additional Pay',amount:100,reason:'test'}));reopenMonth(s,'2026-09','Correction');assert.equal(s.closures[0].status,'Reopened')});
test('five scheduled pay dates do not repeat full monthly deductions',()=>{const s=clean();s.settings.schedules['2026-09']=['2026-09-04','2026-09-11','2026-09-18','2026-09-24','2026-09-25'];for(const [from,to] of [['2026-09-01','2026-09-04'],['2026-09-05','2026-09-11'],['2026-09-12','2026-09-18'],['2026-09-19','2026-09-24'],['2026-09-25','2026-09-25']])pay(s,generatePayroll(s,{from,to,payDate:to}));for(const k of contributionKeys)assert.equal(monthReconciliation(s,'2026-09')[0].delta[k],0,k)});
test('loan deduction stops at principal and rejects double paid transition',()=>{const s=clean();s.loans=[{id:'test-loan',employeeId:s.employees[0].id,original:60000,perPayroll:50000,startDate:'2026-09-01',status:'Active'}];const p=pay(s,generatePayroll(s,{from:'2026-09-01',to:'2026-09-04',payDate:'2026-09-04'}));assert.equal(remainingLoan(s,s.loans[0]),10000);const p2=pay(s,generatePayroll(s,{from:'2026-09-05',to:'2026-09-11',payDate:'2026-09-11'}));assert.equal(p2.lines[0].loan,10000);assert.equal(remainingLoan(s,s.loans[0]),0);assert.throws(()=>transitionPayroll(s,p2.id,'Paid'))});
test('real payroll blocked while statutory rules remain unverified',()=>{const s=clean();s.employees[0].sample=false;const p=generatePayroll(s,{from:'2026-09-01',to:'2026-09-04',payDate:'2026-09-04'});assert(p.lines[0].errors.some(e=>e.includes('statutory')))});
test('BIR aggregates use Paid records only and preserve equations',()=>{const s=demoState(),r=generate1601C(s,'2026-09');assert.equal(r.gross,sum(s.payrolls.filter(p=>p.status==='Paid'&&p.month==='2026-09').flatMap(p=>p.lines),'gross'));assert.equal(r.gross-r.nonTaxable,r.taxable);assert.equal(r.requiredRemittance,r.tax)});
test('13th-month payment enters immutable payroll and is not released twice',()=>{const s=clean();pay(s,generatePayroll(s,{from:'2026-09-01',to:'2026-09-04',payDate:'2026-09-04'}));const p=pay(s,generateThirteenth(s,'2026','2026-09-05'));assert(p.lines[0].earnings.thirteenth>0);assert.equal(p.lines[0].taxable,0);assert.throws(()=>generateThirteenth(s,'2026','2026-09-06'))});
test('annual refund is posted separately and reflected by 2316',()=>{const s=clean();pay(s,generatePayroll(s,{from:'2026-09-01',to:'2026-09-04',payDate:'2026-09-04'}));const p=yearEndPayroll(s,'2026','2026-12-31');assert(p.lines[0].tax<0);pay(s,p);const f=generate2316(s,2026,s.employees[0].id);assert.equal(f.annual.adjustment,0);assert.equal(f.annual.taxDue,f.annual.taxWithheld)});
test('rule validation rejects gapped brackets and invalid rates',()=>{const s=clean(),r=structuredClone(s.rules[0]);r.values.rows[1].minimum++;assert.throws(()=>validateRule(r));const p=structuredClone(s.rules[1]);p.values.rate=2;assert.throws(()=>validateRule(p))});
test('CSV handles quotes and escaping neutralizes markup',()=>{assert.equal(parseCSV('name,note\n"Santos, Mika","A ""quote"""')[0].name,'Santos, Mika');assert.equal(esc('<img src=x onerror="alert(1)">'),'&lt;img src=x onerror=&quot;alert(1)&quot;&gt;')});


test('OT threshold minutes are not accidentally paid as ordinary basic time',()=>{
  const s=clean();
  const exactlyOneHour=payDay(s,shift({timeOut:'19:00'}),s.employees[0]);
  assert.equal(exactlyOneHour.metrics.rawOvertimeMinutes,60);
  assert.equal(exactlyOneHour.earnings.basic,80000);
  assert.equal(exactlyOneHour.earnings.overtime,0);
});

test('qualified but unapproved overtime is excluded from payroll earnings',()=>{
  const s=clean();
  const r=payDay(s,shift({timeOut:'19:01',otApproved:false}),s.employees[0]);
  assert.equal(r.metrics.overtimeMinutes,61);
  assert.equal(r.earnings.basic,80000);
  assert.equal(r.earnings.overtime,0);
});

test('overtime threshold and maximum shift length are configurable',()=>{
  const s=clean();
  s.settings.otMinimumMinutes=30;
  const r=payDay(s,shift({timeOut:'18:31'}),s.employees[0]);
  assert.equal(r.metrics.overtimeMinutes,31);
  s.settings.maxShiftHours=9;
  assert.throws(()=>payDay(s,shift({timeOut:'20:00'}),s.employees[0]),/configured 9-hour maximum/);
});

test('inactive employment revokes employee QR and reissue creates a new credential',()=>{
  const s=clean(),e=s.employees[0],before=e.qrToken;
  changeStatus(s,e.id,'INACTIVE','2026-09-16','Separation');
  assert.equal(e.qrStatus,'REVOKED');
  changeStatus(s,e.id,'ACTIVE','2026-09-17','Rehired');
  const result=issueEmployeeQr(e,{reason:'Reactivated'});
  assert.equal(e.qrStatus,'ACTIVE');
  assert.notEqual(e.qrToken,before);
  assert(result.version>=2);
});


test('employee schedule validation catches invalid break configuration',()=>{
  const s=clean(),e=structuredClone(s.employees[0]);
  assert.throws(()=>saveEmployee(s,{...e,effectiveDate:'2026-09-01',scheduleIn:'09:00',scheduleOut:'18:00',breakStart:'not-a-time',breakMinutes:60}),/break start/i);
});

test('table renderer accepts both row arrays and pre-rendered row markup',()=>{
  assert.match(table(['A'],['<tr><td>one</td></tr>']),/one/);
  assert.match(table(['A'],'<tr><td>two</td></tr>'),/two/);
});


test('new attendance requires review before payroll and can be approved',()=>{
  const s=clean();s.attendance=[];
  const a=saveAttendance(s,{employeeId:s.employees[0].id,date:'2026-10-05',status:'Present',timeIn:'09:00',timeOut:'18:00',breakStart:'12:00',breakMinutes:60,overnight:false,otApproved:false});
  assert.equal(a.reviewStatus,'NEEDS_REVIEW');
  let p=generatePayroll(s,{from:'2026-10-05',to:'2026-10-05',payDate:'2026-10-05'});
  assert(p.lines[0].errors.some(x=>x.includes('awaiting approval')));
  approveAttendance(s,a.id,{reviewer:'HR'});
  assert.equal(a.reviewStatus,'APPROVED');
  p=generatePayroll(s,{from:'2026-10-05',to:'2026-10-05',payDate:'2026-10-05'});
  assert(!p.lines[0].errors.some(x=>x.includes('awaiting approval')));
});

test('qualifying overtime uses explicit approve or reject workflow',()=>{
  const s=clean();s.attendance=[];
  const a=saveAttendance(s,{employeeId:s.employees[0].id,date:'2026-10-05',status:'Present',timeIn:'09:00',timeOut:'19:01',breakStart:'12:00',breakMinutes:60,overnight:false,otApproved:false});
  assert.equal(a.otStatus,'PENDING');
  approveAttendance(s,a.id,{reviewer:'HR'});
  let p=generatePayroll(s,{from:'2026-10-05',to:'2026-10-05',payDate:'2026-10-05'});
  assert(p.lines[0].errors.some(x=>x.includes('Approve or reject qualifying overtime')));
  decideOvertime(s,a.id,true,{reviewer:'HR'});
  assert.equal(a.otStatus,'APPROVED');
  p=generatePayroll(s,{from:'2026-10-05',to:'2026-10-05',payDate:'2026-10-05'});
  assert(p.lines[0].earnings.overtime>0);
});

test('approved leave creates approved attendance and cancellation removes it',()=>{
  const s=clean();s.attendance=[];s.leaves=[];
  const req=saveLeaveRequest(s,{employeeId:s.employees[0].id,type:'Vacation Leave',from:'2026-10-05',to:'2026-10-06',paid:true,note:'Family matter'});
  assert.equal(req.status,'PENDING');
  approveLeave(s,req.id,{reviewer:'HR'});
  assert.equal(req.status,'APPROVED');
  const generated=s.attendance.filter(a=>a.sourceLeaveId===req.id);
  assert.equal(generated.length,2);
  assert(generated.every(a=>a.reviewStatus==='APPROVED'&&a.status==='Paid Leave'));
  cancelLeave(s,req.id,{reviewer:'HR',note:'Employee withdrew request'});
  assert.equal(req.status,'CANCELLED');
  assert.equal(s.attendance.filter(a=>a.sourceLeaveId===req.id).length,0);
});

test('approved regular payroll locks source attendance and void unlocks it',()=>{
  const s=clean();s.attendance=[];s.settings.schedules['2026-10']=['2026-10-05'];
  const a=saveAttendance(s,{employeeId:s.employees[0].id,date:'2026-10-05',status:'Present',timeIn:'09:00',timeOut:'18:00',breakStart:'12:00',breakMinutes:60,overnight:false,otApproved:false});
  approveAttendance(s,a.id,{reviewer:'HR'});
  const p=generatePayroll(s,{from:'2026-10-05',to:'2026-10-05',payDate:'2026-10-05'});storePayroll(s,p);
  transitionPayroll(s,p.id,'Reviewed');transitionPayroll(s,p.id,'Approved');
  assert.equal(a.reviewStatus,'LOCKED');
  assert.equal(a.payrollLockId,p.id);
  transitionPayroll(s,p.id,'Voided','Correction before payment');
  assert.equal(a.reviewStatus,'APPROVED');
  assert.equal(a.payrollLockId,undefined);
});
