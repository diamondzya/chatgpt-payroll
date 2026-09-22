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

Cloud mode is intentionally disabled until you configure your Firebase project.

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

Open `firestore.rules` and replace:

```text
OWNER_EMAIL_HERE
```

with the exact same email you configured as `ownerEmail` in `js/firebase-config.js`.

You can paste the rules into **Firestore Database → Rules**, or deploy with Firebase CLI.

The rules implement these roles:

- `SUPER_ADMIN` — full payroll workspace and cloud account management.
- `ADMIN` — full payroll workspace; can invite employees.
- `EMPLOYEE` — can read only their privacy-limited self-service employee/QR record, not the full company payroll database.

### 5. First cloud sign-in

Serve/redeploy the website, then sign in using the configured owner Google account.

On the first successful owner login, the app creates the cloud workspace from the current local payroll data if no cloud workspace exists yet.

After that:

- same owner/Admin account + another PC/browser/phone → same cloud workspace;
- payroll changes save to local IndexedDB cache **and** Firestore;
- **Settings → Access & QR → Sync from cloud** reloads the current cloud state;
- QR tokens are mirrored to employee self-service access records.

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
- the employee can display their own attendance QR on any device using the same Google account;
- the employee does not receive the full payroll workspace, other employees' salaries, BIR reports, or company settings.

The company QR kiosk should normally be opened by an authorized payroll Admin/Super Admin. Because that kiosk loads the same Firestore workspace, it can recognize QR credentials generated on another authorized device.

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
