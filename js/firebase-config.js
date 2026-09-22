// Firebase web configuration for Sahod Payroll.
// This file is intentionally safe to ship with a web app: Firebase web config is not a secret.
// Security MUST be enforced by Firebase Authentication + Firestore Security Rules.
//
// 1) Firebase Console -> Project settings -> Your apps -> Web app -> SDK setup and configuration.
// 2) Paste the values below.
// 3) Set enabled: true and enter the Google email that owns this payroll workspace.
// 4) Deploy the included firestore.rules after replacing OWNER_EMAIL_HERE with the same owner email.

export const firebaseConfig = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: ''
};

export const cloudSettings = {
  enabled: false,
  workspaceId: 'sahod-main',
  ownerEmail: 'owner@example.com'
};
