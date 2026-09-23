# Sahod Philippine Payroll Workspace

A professional HTML/CSS/vanilla-JavaScript Philippine payroll prototype with employee records, attendance, QR timekeeping, weekly payroll, government contributions, withholding tax, payslips, BIR preparation reports, light/dark mode, Google authentication, and optional Firebase cloud synchronization.

## Run locally

Use HTTP/HTTPS. Do not open `index.html` through `file://` when testing Google sign-in or the camera scanner.

```bash
python -m http.server 8080
```

Open `http://localhost:8080`.

## Firebase cloud mode — same Google account, same data on another device

The project now supports Firebase Authentication + Cloud Firestore. When enabled, an authorized Admin/Super Admin who signs in with the same Google account on another device loads the same payroll workspace instead of a separate IndexedDB copy.

This repository is currently configured for the `ph-payroll-system` Firebase project and the `ph-payroll-main` workspace. If you fork or reuse it for another company, update `js/firebase-config.js` and `firestore.rules` together before deployment.

### 1. Create / select a Firebase project

In Firebase Console:

1. Create a project or use the Google Cloud project you already use for the payroll app.
2. Add a **Web app**.
3. Copy the Firebase Web App configuration object.
4. Open `js/firebase-config.js` and paste the values into `firebaseConfig`.
5. Set `cloudSettings.enabled` to `true`.
6. Set a stable `workspaceId`, for example `northstar-payroll`.
7. Change `ownerEmail` to the Google email that will be the initial **Super Admin**.

Example structure:

```js
export const firebaseConfig = {
  apiKey: '...',
  authDomain: 'your-project.firebaseapp.com',
  projectId: 'your-project',
  storageBucket: 'your-project.firebasestorage.app',
  messagingSenderId: '...',
  appId: '...'
};

export const cloudSettings = {
  enabled: true,
  workspaceId: 'company-payroll',
  ownerEmail: 'owner@company.com'
};
```

Firebase web configuration is not treated as a password. Access is protected by Firebase Authentication and Firestore Security Rules.

### 2. Enable Google Authentication

In Firebase Console:

**Authentication → Sign-in method → Google → Enable**

Add your deployed domain under Firebase Authentication authorized domains if needed. Localhost is normally used during development.

### 3. Create Cloud Firestore

In Firebase Console:

**Firestore Database → Create database**

Do not leave the payroll database on permissive test rules for production use.

### 4. Deploy the included Firestore rules

The included `firestore.rules` is already scoped to the configured workspace and bootstrap owner for this project. If you change `cloudSettings.workspaceId` or `cloudSettings.ownerEmail`, update the same values in `firestore.rules` before publishing it.

Paste the rules into **Firestore Database → Rules** and click **Publish**, or deploy them with Firebase CLI. Keeping a `firestore.rules` file in GitHub does **not** publish the rules to Firebase automatically.

The rules implement these roles:

- `SUPER_ADMIN` — full payroll workspace and cloud account management.
- `ADMIN` — full payroll workspace; can invite employees and deactivate Employee access, but cannot promote/deactivate another administrator.
- `EMPLOYEE` — can read only their privacy-limited self-service employee/QR record, not the full company payroll database.

### 5. First cloud sign-in

Serve/redeploy the website, then sign in using the configured owner Google account.

On the first successful owner login, the app creates the cloud workspace from the current local payroll data if no cloud workspace exists yet.

After that:

- same owner/Admin account + another PC/browser/phone → same cloud workspace;
- payroll changes save to local IndexedDB cache **and** Firestore;
- **Settings → Access & QR → Sync from cloud** reloads the current cloud state;
- QR tokens are mirrored to employee self-service access records.


## Reliability and security hardening in this build

- Firestore is the source of truth in cloud mode; a failed remote save no longer leaves a newer unsynchronized local cache.
- Cloud saves use a workspace revision and short-lived sync lock to reject stale cross-device writes instead of silently overwriting newer data.
- Attendance QR payloads contain only the random QR credential token. Employee names, salary data, and Google email are not encoded in the QR.
- QR credentials have issue/revoke/version state. Regenerating a QR invalidates the previous credential. Inactive employment revokes QR access.
- QR scans use Firebase server time when the admin/kiosk is online; device time is used only as an explicit fallback and the authority is stored with the punch.
- Accidental rapid repeat QR scans are ignored for a short cooldown period.
- Overtime is payroll-eligible only when it is above the configured threshold **and** approved. Minutes at/below the threshold are no longer accidentally paid as ordinary basic time.
- Shifts longer than the configured maximum are blocked for manual review.
- Restores warn when they will replace the shared Firebase workspace, not only the browser cache.
- Cloud audit entries record the authenticated Firebase UID/email in addition to the human-readable actor.
- Employee self-service mirrors only privacy-limited data: QR state, up to 60 recent attendance records, current shift status, and up to 12 recent paid payroll summaries. Employees can refresh this data without receiving the full payroll workspace.
- One cloud workspace save is committed atomically (record changes + employee access + member revocations + revision) within a safe client-side write limit, preventing partially applied multi-batch saves.

## Users and roles

When cloud mode is connected, open:

**Settings → Access & QR → Users & roles**

The Super Admin can invite:

- another Admin / HR account; or
- an Employee account linked to an employee record.

An Admin can invite Employee accounts. An employee invitation must be linked to an employee record.

Roles are attached to Firebase user/member records. They are **not** based on `USR-001`, employee number, or login order.

## Employee self-service QR

After an employee is invited and signs in using the exact Google email:

- the employee receives an Employee role;
- the app opens a privacy-limited Employee Portal;
- the employee can display their own attendance QR, recent attendance, current clock status, and recent paid payroll summaries on any device using the same Google account;
- the employee does not receive the full payroll workspace, other employees' salaries, BIR reports, or company settings.

The company QR kiosk should normally be opened by an authorized payroll Admin/Super Admin. Because that kiosk loads the same Firestore workspace, it can recognize QR credentials generated on another authorized device.



## Employee-specific leave entitlement

HR can assign annual paid leave credits per employee under **Employees → Edit employee → Annual leave entitlement**.

Supported paid-credit categories:

- Vacation Leave
- Sick Leave
- Emergency Leave
- Bereavement Leave
- Other paid leave

Credits reset each calendar year. `Unpaid Leave` does not use a paid-credit entitlement.

A leave request is still allowed even when the employee has no remaining paid credits. On HR approval:

1. eligible scheduled workdays use the employee's remaining paid credits first;
2. any excess eligible workdays are automatically created as **Unpaid Leave** attendance;
3. HR can reject the request instead of approving it.

Example: if an employee has 2 Vacation Leave days remaining and HR approves a 5-workday request, the system records **2 Paid Leave days + 3 Unpaid Leave days**.

Employee detail and Employee self-service show Entitled, Used, Pending, and Remaining credits. Pending requests do not permanently consume credits until approval; the final allocation is recalculated at approval time so already-approved leave is respected.

## QR attendance

- Each employee has a unique random QR token.
- Use **Employees → QR** to display/download it.
- Use **QR Time Clock** on an authorized company device.
- First valid scan with no open shift → automatic **Time In**.
- Next valid scan while the shift is open → automatic **Time Out**.
- Manual Time In / Time Out buttons are still available beside employees for authorized administrators.
- QR lookup now primarily validates the unique QR token. Changing an employee display/code does not unnecessarily invalidate a valid token.

Time display uses the Philippine timezone (`Asia/Manila`).

## Overtime threshold

Current requested company rule:

- overtime of **60 minutes or less** → no OT premium tagged;
- overtime of **more than 60 minutes** → the actual OT minutes qualify.

Confirm that this policy and the rest of the payroll configuration remain compliant with applicable labor rules and employment agreements before live use.

## Local mode / legacy Google login

If `cloudSettings.enabled` is `false`, the app keeps the previous IndexedDB behavior. The older Google Identity Services Client ID field remains available under the **Legacy browser-only Google Identity fallback** section in Settings.

Local mode does **not** synchronize data between devices.

## BIR Form 2316

The 2316 preview uses the supplied September 2021 ENCS form as the visual underlay and overlays payroll values for review/printing on 8.5 × 13-inch paper.

It is a preparation output and still requires review of values, signatures, eligibility, current BIR requirements, and filing procedures.

## Theme

Use the moon/sun control in the top-right corner to switch between light and dark mode. Theme preference remains local to each device.

## Backup

Use **Settings → Backup & restore** to export JSON backups even when Firebase mode is enabled. IndexedDB is retained as a local cache, while Firestore becomes the cross-device source for authorized administrators.

## Production notes

This version improves cross-device identity and data sharing, but a live payroll deployment should still have formal operational controls, regular backups, Firebase App Check where appropriate, reviewed Firestore rules, least-privilege roles, HTTPS, and a controlled process for payroll approval and statutory updates.

## Troubleshooting: Google sign-in works but Firestore says unavailable

If the Google account chooser succeeds but the app stays on the secure-access screen with a Firestore `unavailable` message, Firebase Authentication is working and the failure is specifically the Firestore data connection.

1. In Firebase Console open **Build → Firestore Database**. If you still see **Create database**, create Cloud Firestore first.
2. This build expects the database ID `(default)`. If you intentionally created a named Firestore database, change `cloudSettings.databaseId` in `js/firebase-config.js` to that database ID.
3. Publish the included `firestore.rules` and make sure its owner email exactly matches `cloudSettings.ownerEmail`.
4. On the secure-access screen click **Run Firestore diagnostic**. A 404 for the member document can be normal before first bootstrap; the diagnostic will specifically call out a missing database when the backend reports it.
5. This build sets `forceLongPolling: true`. Firebase documents forced long-polling as a compatibility option for proxies, antivirus software, or other environments that buffer/interrupt Firestore WebChannel traffic. If your network is known-good, it can later be set to `false`.
6. If the diagnostic cannot reach `firestore.googleapis.com`, try an InPrivate/Incognito window with extensions disabled, temporarily test another network/device, and review firewall/antivirus web filtering.

## Attendance review and payroll locking

Attendance now has a review lifecycle:

- `OPEN` — employee has timed in but not yet timed out.
- `NEEDS_REVIEW` — completed/manual attendance waiting for HR/Admin review.
- `APPROVED` — eligible for payroll calculations.
- `LOCKED` — used by an approved regular payroll and no longer directly editable.

Qualifying overtime has a separate `PENDING / APPROVED / REJECTED` decision. A regular payroll will report a validation error when attendance is still open/unapproved or qualifying OT has not been explicitly decided.

When a regular payroll reaches **Approved**, its source attendance is locked. If that approved-but-unpaid payroll is voided with a reason, its attendance is returned to `APPROVED`. Paid payroll remains immutable and corrections should use adjustment transactions.

## Leave management

Open **Leave management** to create and review leave requests. Supported types are Vacation, Sick, Emergency, Bereavement, Unpaid, and Other.

- Pending requests do not affect payroll.
- Approval creates approved Paid Leave or Unpaid Leave attendance for eligible scheduled workdays.
- Rest days and non-working holidays are skipped.
- Requests cannot overlap another active leave request.
- Existing attendance must be resolved before overlapping leave can be approved.
- Closed payroll months block leave changes that would affect payroll history.
- Cancelling approved leave removes its generated attendance unless that attendance is already locked by payroll.

Linked employees can also use **Request leave** from Employee Self-Service. Firestore rules allow employees to create only a `PENDING` request for their own linked employee ID; approval/rejection remains an administrator action.

## Payroll health

Open **Payroll → Payroll health** before approval. It highlights:

- open shifts;
- attendance awaiting approval;
- pending OT decisions;
- pending leave requests;
- missing TIN/SSS/PhilHealth/Pag-IBIG identifiers; and
- existing payroll validation errors.

Treat this screen as a preflight checklist; the authoritative approval block remains the payroll validation engine.

## QR kiosk mode

Open **QR Time Clock → Enter kiosk mode** on a dedicated company scanner. Kiosk mode hides the normal sidebar/top navigation and focuses the interface on QR scanning. Exit kiosk mode from the kiosk banner/button or the browser fullscreen controls.

QR punches are still subject to attendance review before payroll. Kiosk mode does not grant an Employee account access to the full workspace; it is intended for an authenticated Admin/Super Admin company device.

## Firestore rules update required

This build changes Firestore permissions. After deploying the website, also copy the new `firestore.rules` into **Firebase Console → Firestore Database → Rules** and click **Publish**.

Notable hardening in these rules:

- owner bootstrap is limited to workspace `ph-payroll-main`;
- normal Admin / HR cannot create administrator invitations;
- invitees may only mark their own invite as claimed;
- employees may read only their own leave records and create only pending leave requests for their own linked employee ID;
- leave approval/update/delete remains administrator-only;
- the previous broad owner wildcard workspace permission is removed after the normal Super Admin member bootstrap path became reliable.


## Premium login front page

The login screen uses `assets/login-finance-bg.png` as a finance/payroll visual backdrop. The sign-in card remains real HTML/CSS, so Google/Firebase buttons and authentication errors remain interactive and responsive instead of being baked into a screenshot.
