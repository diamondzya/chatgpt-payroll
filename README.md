# Sahod · Philippine Payroll Workspace

A modular HTML5, CSS3 and vanilla JavaScript payroll prototype. No frontend framework, build step, PHP, or application server is required. Sample employees and government identifiers are fictional and clearly marked.

## Read this first

This is a functional browser-based prototype, **not a certified production payroll or BIR filing system**. Several statutory baselines could not be fully verified against current official issuances during implementation on 20 September 2026. They are explicitly flagged as demo / unreviewed. Real employee regular payroll and adjustments cannot be approved while their applicable statutory versions remain unreviewed.

BIR 1601-C and 2316 outputs are **preparation worksheets**, not exact official form replicas, signed certificates, or electronic submissions. PDF export uses the browser's Print → Save as PDF facility. There is no bank transfer integration.

## Project structure

- `index.html` — accessible application shell and module entry point.
- `css/style.css` — corporate dashboard, responsive navigation, forms, tables and print rules.
- `js/app.js` — interface orchestration, modal workflows, imports, commands and optional WebMCP registration.
- `js/views.js`, `js/ui.js` — module views and reusable UI helpers.
- `js/employees.js` — employee records, effective salary changes and status history.
- `js/attendance.js` — time validation, unpaid break placement, minute-level premium segmentation.
- `js/payroll.js` — regular payroll, adjustments, contribution allocation, benefit and month-end workflows.
- `js/statutory.js` — dated contribution schedules, premium matrix, tax tables and rule validation.
- `js/tax.js` — daily, weekly, semi-monthly, monthly and annual tax calculations.
- `js/holidays.js` — editable holiday classifications and local branch coverage.
- `js/reports.js`, `js/forms.js` — report data and printable payslips/BIR worksheets.
- `js/storage.js` — centralized IndexedDB, backup validation and audit records.
- `js/seed.js` — fictional August–September 2026 demonstration data.
- `js/utils.js` — centavo arithmetic, date helpers, escaping, CSV and downloads.
- `tests/payroll.test.js` in the source download — calculation and workflow regression tests.

The downloadable source ZIP places `index.html`, `css/`, and `js/` at its root. The hosted source repository uses `dist/` as its public static directory.

## Run locally

Use any local static web server rather than double-clicking `index.html` (ES modules need HTTP). For example, from the extracted folder:

```sh
python -m http.server 8000
```

Open `http://localhost:8000`. No npm installation is needed to use the application. Optional Google Fonts fall back to system fonts if unavailable. IndexedDB must be enabled.

For the repository version, serve `dist/`. Run tests with `node --test tests/payroll.test.js` from the repository root. The source ZIP includes the same tests under the appropriate relative paths.

## Demo workflow

1. Open Payroll and review the calculated September 18 sample run.
2. Open each employee's **View computation** to inspect wages, contributions and tax.
3. Mark reviewed → Approve payroll → Mark as paid. Confirming payment records an administrator assertion, not a bank instruction.
4. Run payroll for September 19–25, pay date September 25. Sample attendance already exists through September 25.
5. Review and pay that run, then open **Payroll → Month-end close**.
6. Generate a separate reconciliation payroll if monthly contribution differences remain. Review, approve and pay it.
7. Close the month once every configured pay date is present and all contributions reconcile.
8. Generate monthly reports and the 1601-C preparation worksheet.
9. Generate 13th-month pay from accumulated qualifying salary. Use an appropriate benefit pay date and review completeness first.
10. At completed year-end or separation, generate the annual tax adjustment. Pay that transaction before treating 2316 figures as final.

The demo begins with seven payroll runs, eight employees (seven currently active), more than 300 attendance records, a company loan, overtime, night work, holiday work, one MWE example and one inactive employee. The sample MWE rate is illustrative and is not a statement of the current applicable regional minimum wage.

## Employee records and activation

Add personal details, employment information, salary basis, rates, schedule, government identifiers and any previous-employer taxable compensation/withholding. Use **Derive daily / hourly rates** and review the result before saving.

Salary changes have an effective date and are stored in rate history. Active status is resolved for each attendance date and each day of a payroll period. Deactivation never deletes historical employee, time or payroll records. A future payroll excludes inactive days; a historical period can still include dates when the employee was active. Reactivation is a new status-history event. Status changes that would affect a finalized payroll are blocked; create a separate correction instead.

Monthly salary, daily rate, hourly rate and weekly rate are explicit administrator-maintained values. For monthly-paid employees the default conversion divisor is 365 calendar days per year. Different lawful employee arrangements can require different conversion factors; confirm the employment policy. Previous-employer values represent the tax year being processed and must be updated/reset appropriately when changing years.

## Attendance and pay calculation

- Use explicit records for work, absences, leave and holidays. Missing scheduled attendance blocks regular payroll approval; it is not silently treated as absence.
- Eight regular hours is the default, configurable to a lower normal day. Extra hours are calculated and must be reviewed/approved before payroll approval.
- Enter the location of the unpaid break, not only its duration. The engine excludes break minutes before assigning overtime and night pay.
- Overnight clock-out is explicit. Shifts are segmented by actual calendar date so next-day rest/holiday and night classifications apply to the appropriate minutes.
- A shift belongs to the payroll period containing its clock-in date. This convention must be reviewed for a production cutoff policy.
- Overlapping attendance and duplicate employee/date records are rejected. One continuous shift per employee/date is supported; split shifts and multiple break windows are not.
- Primary rest day and normal days per week determine a repeating schedule, with additional off days immediately preceding the primary rest day. Complex rotating rosters are not supported.
- Monthly salary is allocated across calendar days of each month using cumulative centavo rounding. Attendance wage losses reduce earned basic pay. Daily/hourly/weekly-basis employees are paid for recorded regular hours at their configured hourly rate.
- Late, undertime and absence reductions are disclosed on payslips **after already reducing earned basic pay**. They are not deducted twice.
- Unworked regular holiday pay requires an explicit administrator eligibility checkbox. Coverage, preceding-day attendance, successive holidays and statutory exceptions must be assessed by the administrator. Missing eligibility is a warning.
- Double regular holidays are explicitly blocked for a reviewed correction rather than guessed. Local holidays match the employee branch.
- The ordinary/rest/special/regular-holiday premium matrix and night window live in dated configuration. Special working days use ordinary working-day treatment unless they coincide with a rest day.
- Night differential adds only the incremental premium to the applicable regular/OT rate. It does not add base wages again.
- Company holiday treatment, alternative work arrangements, managerial exclusions, allowances that form part of regular wage and special industry rules require tailored production rules.

## Weekly mandatory contributions

SSS uses compensation ranges and MSC table rows, not a flat percentage of actual salary. Employee and employer MPF are components already included in their respective SSS totals; EC is a separate employer cost. PhilHealth takes monthly basic salary, excluding overtime/bonuses, with its configured floor/ceiling. Pag-IBIG has a threshold, employee/employer rates and maximum compensation base.

Configure **Settings → Payroll settings → Contribution schedule** with all regular pay dates in each month. Automatic defaults are weekly on the configured pay weekday. Semi-monthly/monthly users must enter the correct pay-date schedule. Supported allocation strategies are first, second, last, and proportional split.

A payroll reserves its assigned deductions once. Payrolls must be generated chronologically, and an earlier pending regular payroll must be approved or voided before the next one. For proportional split:

`current deduction = round(monthly target × cumulative schedule fraction) − prior non-voided allocations`

The last scheduled allocation uses accumulated compensation rather than the projected basic salary. Employer shares use the same allocation discipline. Four- and five-pay-date months reconcile without deducting a full obligation each week. Negative differences are explicit contribution credits.

**Contribution month in this prototype is assigned by pay date.** Production reporting may require earned-service-month allocation, particularly for payrolls spanning two months. This application does not allocate cross-month wages to separate contribution service months; reconcile this convention with the employer's government reporting process before real use. Full monthly PhilHealth basic salary is used even for partial employment months; special cases require agency review.

Month-end uses paid compensation, excluding recorded 13th-month and bonus categories, as its default SSS/HDMF reconciliation base. Other agency-specific compensation exclusions/inclusions require review; generic adjustments do not infer their statutory treatment.

## Tax calculation and benefits

Taxable compensation is earned gross less qualified exemptions and employee mandatory contributions. The appropriate periodic bracket computes base tax plus the percentage of excess above the bracket base. Daily, weekly, semi-monthly, monthly and annual tables are distinct. Rounding is to centavos at monetary line boundaries.

MWE classification requires a recorded wage basis. MWE wage/premium exemptions are separated from taxable extra income; government contributions and MWE exemption reporting are capped so total non-taxable amounts do not exceed compensation. Rest-day premiums are not automatically classified as an MWE statutory exemption.

Additional pay, retroactive pay, bonus, commission, allowance, hazard, overtime and other earnings can be entered through adjustment transactions with a selected earning category. De minimis and other exemptions are **administrator-classified** and require documentary review; current per-benefit de minimis limits are not automatically enforced. The configurable 13th-month/other-benefits exemption cap is shared across recorded qualifying releases. Fringe-benefit tax and specialized withholding methods for supplementary compensation are not implemented.

Monthly tax reports aggregate actual paid weekly withholding; they do not incorrectly force the sum to a monthly bracket. Annual reconciliation computes annual tax due on recorded annual taxable compensation plus entered prior-employer income, subtracts withheld tax, and posts an additional-tax or refund transaction. A signed contribution correction also changes annual taxable compensation. Annual adjustments must follow all relevant compensation releases, or a later true-up is needed.

13th-month accrual uses qualifying basic salary ÷ 12. Overtime, holiday/rest premiums, night differential, paid-leave categories for daily workers, allowances, commissions and bonuses are excluded by default. Fixed monthly earned basic salary is included. A reviewed additional/retroactive adjustment may explicitly qualify as basic salary. The remaining benefit subtracts prior paid 13th-month releases; an outstanding benefit draft prevents duplicate generation.

## Reports, forms and payslips

Report data includes only **Paid** payrolls unless a specific run is being previewed. Draft payslips display their status. The report builder filters date, employee, department and employment status. CSV export quotes cells and neutralizes formula-like leading characters.

- 1601-C is a monthly preparation report. It consolidates compensation, exemption categories, mandatory deductions, withholding and signed tax adjustments.
- 2316 is an annual/separation preparation report. It includes employee/employer information, category totals, current/previous employer taxable income, tax due, tax withheld and outstanding adjustment.
- Every BIR output says **Prepared Payroll/BIR Report – Verify Before Filing**.
- Select **Print / Save as PDF**, then choose the browser's PDF destination. No external PDF library is needed.
- Official box/line mapping, minimum-threshold reclassification fields, signatures, amended return details, external credits, prior remittances, penalties, substituted-filing eligibility, BIR alphalists and agency submission files are not implemented.
- Employer cost is **gross compensation plus employer SSS, EC, PhilHealth and Pag-IBIG**. Employer obligations are never employee deductions.

## Loans, corrections and audit

Loan/advance schedules have an original principal, per-payroll deduction, start/end dates and active/paused state. Remaining balances are derived from paid allocations. Pending allocations reserve the balance to prevent duplicate deduction. Deductions stop at zero. Interest/amortization schedules are outside this prototype.

Paid payroll cannot be edited, deleted or voided through the application. Corrections create separate signed adjustment records. Drafts detect changes to their source inputs and require recalculation. A snapshot of company details, employee details, rule versions and calculation lines is stored with each run.

Audit records contain timestamp, operator display name, action, target, before and after values. The operator is an attribution label, **not authenticated identity**. Month reopening requires a reason and is recorded. This is not a tamper-proof audit system.

## Rule updates and source review

Open **Settings → Statutory updates**. Inspect a current rule, create a new JSON version, give it a unique version ID and effective date, specify an HTTPS official source, enter a review note, and mark reviewed only after verifying the official rule and its applicability. The JSON money values are integer centavos. Old stored payrolls retain their snapshots. A below-baseline premium produces a warning/error and is not accepted as a reviewed version.

Implementation research, 20 September 2026:

| Area | Official or primary source | Verification status |
| --- | --- | --- |
| SSS | https://www.sss.gov.ph/sss-contribution-table/ and linked employer Circular 2024-006 | Official employer schedule located; transcription requires independent review. |
| PhilHealth | https://www.philhealth.gov.ph/partners/employers/ContributionTable_v2.pdf | Official 2024–2025 schedule read; 2026 continuing applicability not conclusively verified. |
| DOLE | https://nwpc.dole.gov.ph/faqs/ | Base holiday/rest/special factors and monthly conversion guidance read; complete current premium matrix not fully verified. |
| BIR periodic tables | https://www.bir.gov.ph/withholding-tax | Current table attachment could not be retrieved; shipped periodic table remains an unverified demo transcription. |
| Annual TRAIN rates and benefit cap | https://lawphil.net/statutes/repacts/ra2017/ra_10963_2017.html | Statute text checked as a primary legal source; later amendments/applicability still require review. |
| Pag-IBIG | https://www.pagibigfund.gov.ph/ | Circular 460 retrieval blocked; shipped contribution baseline remains unverified. |
| Calendar | Annual presidential/local proclamations | Included holidays are sample entries; no claim of complete annual verification. |

No unseen source was treated as verified. The configuration intentionally records these limitations instead of claiming the rates are permanently current.

## Backup and data safety

Export JSON frequently using **Settings → Backup & restore**. Imports validate shape, IDs, amounts and rule structure, then require confirmation before replacing the current workspace. A failure rolls back the attempted change. IndexedDB saves the full workspace atomically and uses a revision check to reject conflicting saves from another tab. Browser storage can still be cleared by the browser, OS or user. Backups contain sensitive personal and salary data if real records were entered.

Clear sample data removes sample-linked records after confirmation. Mixed real/sample payrolls prevent sample removal to avoid destroying real payroll history.

**Production use requires a secure authenticated server/database** with access roles, server-side validation, encryption and secure backups, independently reviewed payroll/legal rules, reliable migration handling, concurrency control, audited payment integrations and a tamper-resistant audit trail. This prototype neither stores passwords nor pretends to provide application authentication.

## Validation and known limits

The included regression suite checks SSS bracket boundaries and MPF/EC, PhilHealth caps, Pag-IBIG thresholds, tax boundaries and periodic tables, ordinary/holiday/rest OT, night OT, cross-midnight classification, break/time validation, effective employment status, duplicates, missing attendance, stale calculations, paid-record immutability, four/five-pay-date reconciliation, loan exhaustion, statutory verification gates, BIR aggregation, benefit duplicate prevention and annual tax refunds. Tests verify implementation behavior against the stated baseline, **not legal certification**.

Static module syntax, source imports and every view/report generator were checked. A full browser rendering/interaction pass and live WebMCP validation were unavailable in this environment. Responsive CSS and native dialog/print behavior should be checked in the browsers used by payroll personnel.

Optional WebMCP tools provide aggregate overview, module navigation and opening the generation form when the host supports `document.modelContext`. They do not autonomously approve or pay payrolls.
