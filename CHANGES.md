
## Premium login front page

- Rebuilt the Google/Firebase login gate as a full-screen finance-themed front page.
- Added the blue financial-growth background artwork with responsive dark overlays.
- Added glassmorphism payroll access card, stronger Sahod branding, security status, and trust messaging.
- Improved Google sign-in, Firestore retry/diagnostic states, long-email wrapping, and responsive mobile layout.
- Prevented the underlying admin workspace from scrolling while the sign-in gate is open.
- Fixed local prototype access leaving the page in a locked-scroll state.

# 2026-09-23 Owner access recovery fix

- Added automatic self-repair for the configured owner member record.
- If an older build left the owner as EMPLOYEE/ADMIN, inactive, or linked to an employee ID, signing in with the configured owner email restores the same Firebase UID to `SUPER_ADMIN`.
- Added a narrowly scoped Firestore recovery rule: only `madriagakenneth22@gmail.com`, only its own UID, and only workspace `ph-payroll-main` can use this recovery path.
- This prevents the owner from being locked out by stale cloud member data while preserving employee/admin isolation.

# Update summary

## Requested feature changes

- Monthly-paid employees now get automatic compensation reference rates while editing an employee:
  - Daily rate = Monthly Basic × 12 ÷ Annual-Day Divisor
  - Hourly rate = Daily Rate ÷ Normal Hours Per Day
  - Weekly reference rate = Monthly Basic × 12 ÷ 52
- The calculated rate fields update live when monthly salary, divisor, normal hours, or salary basis changes.
- The same monthly-rate derivation is enforced again on save so stale/manual values cannot be stored accidentally.

- Attendance now includes **Generate custom dates**:
  - Choose one employee or all active employees.
  - Choose any From / To date range up to 62 days.
  - Choose attendance status and default clock/break values.
  - Optionally skip each employee's rest days.
  - Existing employee/date attendance is skipped instead of overwritten.
  - Inactive dates are skipped automatically.

- Payslips now show attendance adjustments as separate lines:
  - Late
  - Undertime
  - Absence
  These values are clearly marked as already reflected in earned basic pay so they are not double-deducted.

## UI refresh

- Dark enterprise sidebar with blue active navigation.
- Updated blue/neutral professional color system.
- Refined panels, cards, buttons, inputs, tables, dialogs, focus states, shadows, and mobile behavior.
- Added automatic-rate information card and read-only styling for system-calculated rate fields.
- Improved payslip/report visual hierarchy.

## Validation

- JavaScript syntax checks passed.
- Existing automated payroll suite passed: 26/26 tests.

---

# September 22, 2026 update

## BIR Form 2316 visual redesign

- Reworked the Form 2316 preview to visually follow the supplied **BIR Form No. 2316 September 2021 (ENCS)** layout.
- Added the supplied form as the printable visual underlay and positioned payroll values over the corresponding boxes.
- Added 8.5 × 13-inch print styling for the Form 2316 output.
- Preserved the "verify before filing" warning because generated payroll data still requires review before official use.

## Automatic Time In / Time Out

- Added **Time In** and **Time Out** controls directly beside each employee.
- Clicking Time In automatically records the current Philippine date/time.
- Clicking Time Out automatically closes the employee's open shift using the current Philippine time.
- Open shifts are supported in attendance without causing payroll calculation errors.
- Automatic punches are written into the audit trail.
- The attendance page shows open/in-progress shifts distinctly.

## Overtime threshold

- Overtime premium now qualifies only when actual overtime is **more than 60 minutes**.
- Exactly 60 minutes or less is not tagged as overtime premium.
- Added an automated regression test for the 60-minute / 61-minute boundary.

## Employee QR time clock

- Every employee receives a unique random QR attendance token.
- Added **QR** action in the employee list and employee details.
- QR can be generated, regenerated, and downloaded as PNG.
- Added a dedicated **QR Time Clock** page with camera scanning.
- Valid employee QR scan automatically performs Time In or Time Out depending on whether the employee currently has an open shift.
- Added warnings to treat QR images as attendance credentials.

## Google account access

- Added Google Identity Services integration for **Sign in / Sign up with Google**.
- Added **Settings → Access & QR** for the Google OAuth Web Client ID and optional required-login mode.
- Added an optional employee **Assigned Google account** email field.
- Signed-in Google account appears in the top-right profile.
- Added Google sign-out and account/access controls.
- Documented that secure production deployment still needs backend token verification and a central database.

## Light / dark mode

- Added a persistent light/dark mode toggle in the top bar.
- Added dark-mode styling across navigation, dashboard cards, forms, tables, dialogs, attendance, scanner, and reports.

## UI refinement

- Added a dedicated company attendance kiosk layout.
- Added professional live-shift states, QR credential cards, security/access panels, and enhanced top-bar account controls.
- Extended the enterprise blue/charcoal design system for a more company-oriented HR/payroll look.

## Validation

- JavaScript syntax checks passed for all application modules.
- Automated payroll test suite passed: **27/27 tests**.

## 2026-09-22 — Firebase cross-device workspace update

- Added optional Firebase Authentication + Cloud Firestore integration using Firebase JS SDK 12.19.0 browser modules.
- Same authorized Google Admin/Super Admin account now loads the same payroll workspace on another device when Firebase mode is configured.
- Added `js/firebase-config.js` for Web App configuration, workspace ID, and bootstrap owner email.
- Added `firestore.rules` with role-aware access for `SUPER_ADMIN`, `ADMIN`, and `EMPLOYEE`.
- Added cloud member/invitation records. Roles are no longer conceptually tied to `USR-001` or user sequence numbers.
- Added **Users & roles** management for cloud invitations.
- Added privacy-limited Employee Portal for employee Google accounts with their own QR credential.
- Full payroll collections remain restricted to Admin/Super Admin accounts by the included Firestore rules.
- Added IndexedDB + Firestore dual persistence for authorized administrators. IndexedDB remains a local cache.
- Added **Sync from cloud** control in Access & QR settings.
- QR scanner now validates the unique QR token first, so changing an employee code does not automatically invalidate an otherwise valid QR.
- Employee QR credentials are mirrored to restricted self-service cloud records.
- Added cloud connection/status UI and additional responsive/dark-mode styling.


## Google/Firebase sign-in reliability fix
- Fixed a case where clicking **Continue with Google** appeared to do nothing when a browser blocked the Firebase popup.
- Firebase is initialized before user interaction; the click handler now opens the popup without an extra initialization await.
- Automatically falls back to Firebase redirect sign-in when popup sign-in is blocked or unsupported.
- Redirect results are completed during Firebase startup.
- Authentication errors are displayed inline on the access screen, and toast messages now render above the authentication overlay.
- Added clearer messages for unauthorized domain, disabled Google provider, network failures, and popup cancellation.
- Firebase Web App configuration and the initial Super Admin owner email supplied for this project are already populated in `js/firebase-config.js`.
- `firestore.rules` now contains the same owner email. Publish those rules in Firebase Console before using cloud data.


## 2026-09-22 · Firebase first-login fix

- Fixed first Super Admin cloud bootstrap returning to the Google button. The cloud serializer incorrectly assumed every collection record had an `id`; statutory rule records use `version`, which caused the initial Firestore upload to throw after Google authentication succeeded.
- Cloud collection keys are now collection-aware (`rules` uses `version`; normal records use `id`).
- Cloud metadata is now written only after collection records succeed and includes `initialized: true`, preventing an incomplete prior bootstrap from being mistaken for a valid empty cloud workspace.
- Existing partial `state/meta` created by the failed bootstrap is automatically treated as uninitialized so the Super Admin can safely seed Firestore from the intact local workspace.
- Post-Google Firestore errors are now persistent on the sign-in screen, with retry and switch-account controls instead of silently signing the user back out.

## Firestore connectivity update

- Firebase Authentication success is now separated from Firestore connectivity errors.
- Cloud Firestore is initialized with forced long-polling for better compatibility with GitHub Pages users behind buffering proxies, antivirus software, or restrictive networks.
- Added `cloudSettings.databaseId` (defaults to `(default)`) and `forceLongPolling` in `js/firebase-config.js`.
- Added **Run Firestore diagnostic** on the login gate after Google authentication succeeds but Firestore cannot open.
- The diagnostic calls the Firestore REST endpoint with the current Firebase ID token and distinguishes backend reachability, missing default database, permission/rules problems, rejected auth, and browser/network blocking.
- Improved the `unavailable` message with the configured Firebase project/database and concrete checks.


## 2026-09-23 · Reliability, QR, attendance, and cloud hardening

- Made Firestore remote-first in cloud mode so failed cloud writes do not leave an unsynchronized local IndexedDB state.
- Added cloud revision checks plus a short-lived workspace save lock to detect stale cross-device writes and prevent silent last-writer overwrites.
- Added Firebase-authenticated audit actor details (`userUid`, `userEmail`).
- Added QR credential lifecycle fields (`qrStatus`, `qrVersion`, issued/revoked timestamps and reason). Regenerating a QR invalidates the prior token; inactive employment revokes the credential.
- Reduced QR payloads to the random credential token only; no employee name/email/salary data is encoded. Existing token-based QR payloads remain readable.
- Added a five-second QR scan cooldown to reduce accidental immediate double punches.
- Automatic Time In / Time Out uses Firebase server time when cloud admin/kiosk access is available and records whether the timestamp came from Firebase or device fallback.
- Added configurable **Minimum OT minutes** and **Maximum shift hours** in Payroll settings.
- Fixed a payroll bug where excess minutes at/below the OT threshold could fall back into ordinary basic pay.
- Qualified overtime is excluded from pay until the attendance record is approved.
- Long shifts beyond the configured maximum are blocked for manual review.
- Improved attendance UI so it distinguishes approved OT from OT that still requires approval.
- Tightened employee Google-email validation and prevents linking one Google account to multiple employees.
- Cloud Employee self-service records stop exposing an active QR token when employment/credential is inactive.
- Employee self-service now includes the latest synchronized attendance records, current clock status, and recent paid payroll summaries on any device using the linked Google account.
- Normal Admin / HR accounts may deactivate Employee cloud members but may not modify roles or deactivate another Admin; Super Admin retains role-management authority.
- Fixed the Users & Roles table renderer so pre-rendered cloud rows no longer throw a `rows.join is not a function` error.
- Cloud saves now commit record changes, employee-access mirrors, member deactivations, and the new workspace revision in one atomic Firestore batch when within the safe browser write limit; oversized changes are rejected before partial data is written.
- If a cloud commit succeeds but the local IndexedDB cache fails, the durable Firestore save is retained instead of rolling the UI back to stale data.
- Added employee-specific scheduled break start, validation for work schedule/break times, and automatic QR punches now use that configured break start.
- Backup restore now warns when cloud mode will replace the shared workspace as well as the local cache.
- Attendance CSV templates now use the current date instead of a hard-coded sample date.
- Added regression tests for the exact OT threshold, unapproved OT, configurable attendance limits, and QR revocation/reissue.
- Validation: all application JavaScript passes syntax checks and the automated payroll suite passes **33/33 tests**.

## 2026-09-23 · Workflow, leave, kiosk, and payroll health update

- Added an explicit attendance review workflow: `OPEN` → `NEEDS_REVIEW` → `APPROVED` → `LOCKED`.
- New/manual/QR-completed attendance is no longer automatically payroll-ready. HR/Admin must approve it before regular payroll can pass validation.
- Editing an existing attendance record requires a fresh correction reason and locked attendance cannot be edited directly.
- Added explicit overtime decisions (`PENDING`, `APPROVED`, `REJECTED`). Qualifying overtime blocks payroll review until HR/Admin approves or rejects it.
- Approved regular payroll now locks the attendance records used by that payroll. Voiding an unpaid approved payroll unlocks those records back to `APPROVED`.
- Added **Leave management** with Vacation, Sick, Emergency, Bereavement, Unpaid, and Other leave types.
- Employees can submit their own pending leave request from the Firebase employee portal. HR/Admin approval creates approved Paid Leave / Unpaid Leave attendance for eligible scheduled workdays.
- Leave overlap, closed-month, existing-attendance, rest-day, holiday, and active-employment checks were added. Approved leave cancellation removes generated attendance unless payroll has already locked it.
- Added a **Payroll health** tab that surfaces open shifts, attendance awaiting review, pending OT, pending leave, missing government IDs, and payroll validation errors before approval.
- Added dedicated **Kiosk mode** for the QR Time Clock. Kiosk mode hides administrative navigation and focuses the screen on employee scanning.
- Added sidebar counters for attendance items requiring action and pending leave requests.
- Hardened Firestore rules: removed the previous broad owner wildcard, scoped owner bootstrap to `ph-payroll-main`, prevented normal Admin accounts from creating Admin invitations, tightened invite claiming, and restricted employee leave creation to pending requests for the signed-in employee only.
- Employee self-service now includes leave requests in addition to QR, attendance, and paid payroll summaries.
- Added regression tests covering attendance approval, OT approval, leave approval/cancellation, and payroll attendance locking.
- Validation: automated payroll/workflow suite passes **37/37 tests**.


## Employee cloud-session routing hotfix — 2026-09-23
- Made cloud role/session establishment atomic: an employee is no longer treated as connected until Employee Access has loaded successfully.
- Fixed Retry workspace connection leaving a partial EMPLOYEE session that could hide the login gate and reveal the cached administrator shell.
- Retry now clears partial cloud persistence/session state before reconnecting and again on failure.
- Relaxed the employeeAccess Firestore read rule to rely on the authenticated member-to-employee link instead of duplicated mirror email/active fields, preventing valid employees from being locked out by older mirror documents.
- Employee portal can fall back to its privacy-limited mirrored leave list if an older Firestore deployment temporarily blocks the direct leave query.
- Removed the administrator Access & QR settings button from employee account/profile UI.


## 2026-09-23 · Employee leave entitlement + login layout update

- Added **employee-specific annual paid leave entitlements** for Vacation, Sick, Emergency, Bereavement, and Other paid leave.
- HR/employer can set a different whole-day entitlement for every employee from the employee record.
- Leave credits reset by calendar year; existing employees without configured credits migrate safely to `0` days until HR assigns them.
- Leave requests are **not blocked** when paid credits are exhausted. HR may still approve or reject the request.
- On approval, available paid credits are consumed first and any excess eligible workdays are automatically converted to **Unpaid Leave**.
- Mixed requests are supported, e.g. a 5-workday Vacation Leave with 2 days remaining becomes **2 paid + 3 unpaid** when approved.
- Leave balances now show Entitled, Used, Pending, and Remaining amounts in the employee detail view and Employee self-service portal.
- Leave management now shows projected paid/unpaid allocation for pending requests and final allocation for approved requests.
- Employee self-service now receives privacy-limited leave balance data through the existing `employeeAccess` mirror.
- Added annual-reset and automatic-unpaid regression coverage.
- Fixed the secure Google/Firebase login gate overflowing outside its card when Firestore errors and three retry buttons were shown. Retry controls now stack inside the card, wrap safely, and remain responsive on small screens.
- Validation: all JavaScript passes syntax checks and the automated payroll/workflow suite passes **40/40 tests**.

## 2026-09-23 · Rest days, modal safety, dark mode, employee payslips

- Replaced the employee "Primary rest day" selector with a multi-day weekly rest-day picker (1–6 days).
- Preserved legacy schedules: old single-rest-day records are upgraded using their previous normal-days-per-week behavior.
- Rest-day classification now honors the exact employee-specific selected rest days in attendance, leave allocation, and payroll premium calculations.
- Dialogs no longer close when clicking the backdrop; Escape is also blocked so users do not accidentally lose form work. Use the X/Cancel controls explicitly.
- Fixed dark-mode readability for automatic compensation cards and read-only auto-computed salary fields.
- Fixed dark-mode readability across payslip/report previews, tables, notes, callouts, modal content, schedule controls, and several other light-only surfaces found during the UI scan.
- Print/PDF report styling is forced to a clean white document even when the application is in dark mode.
- Employee self-service payslip rows now open a full earnings/deductions/YTD breakdown.
- Employees can download their own payslip directly as an A4 PDF (html2pdf.js) or print it.
- Employee self-service Firestore mirrors now include privacy-limited detailed payslip data instead of summary totals only.
- Added an automatic admin-login refresh for employee self-service mirrors, so older Firestore employeeAccess documents are upgraded without needing a payroll edit.
- Fixed employeeAccess synchronization to compare against the actual Firestore mirror instead of regenerating the previous local snapshot, preventing schema upgrades from being skipped.
- Added regression coverage for multiple rest days and compatibility migration.
