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
