// Firebase web configuration for Sahod Payroll.
// This file is intentionally safe to ship with a web app: Firebase web config is not a secret.
// Security MUST be enforced by Firebase Authentication + Firestore Security Rules.
//
// 1) Firebase Console -> Project settings -> Your apps -> Web app -> SDK setup and configuration.
// 2) Paste the values below.
// 3) Set enabled: true and enter the Google email that owns this payroll workspace.
// 4) Deploy the included firestore.rules after replacing OWNER_EMAIL_HERE with the same owner email.

export const firebaseConfig = {
  apiKey: "AIzaSyDPjXmx9PEFZQlKuuO8ILjyHGPM4aUe-XQ",
  authDomain: "ph-payroll-system.firebaseapp.com",
  projectId: "ph-payroll-system",
  storageBucket: "ph-payroll-system.firebasestorage.app",
  messagingSenderId: "952797118192",
  appId: "1:952797118192:web:1050b90e102b151b8e8c35",
  measurementId: "G-ZKMLLC6ZN8"
};

export const cloudSettings = {
  enabled: true,
  workspaceId: "ph-payroll-main",
  ownerEmail: "madriagakennet22@gmail.com"
};