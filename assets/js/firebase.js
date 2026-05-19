// ══════════════════════════════════════════════
// HisseMatik — Firebase Katmanı
// assets/js/firebase.js
//
// Tek sorumluluk: Firebase'i başlat ve dışarıya aç.
// Bu dosya hiçbir uygulama mantığı içermez.
// ══════════════════════════════════════════════

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';

import {
  getAuth,
  GoogleAuthProvider,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  deleteField,
  // #5 — Offline destek için ağ kontrol fonksiyonları
  enableNetwork,
  disableNetwork,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// ── CONFIG ────────────────────────────────────
const firebaseConfig = {
  apiKey:            'AIzaSyAuKxk5ftUNjlbFtrKMwFmT_AAvrleOdPE',
  authDomain:        'hissematik-d6691.firebaseapp.com',
  projectId:         'hissematik-d6691',
  storageBucket:     'hissematik-d6691.firebasestorage.app',
  messagingSenderId: '674361520711',
  appId:             '1:674361520711:web:5ddd6db6a7d8b1a314f762',
};

// ── BAŞLATMA ──────────────────────────────────
const app      = initializeApp(firebaseConfig);
const auth     = getAuth(app);
const db       = getFirestore(app);
const provider = new GoogleAuthProvider();

// ── EXPORT ────────────────────────────────────
// Auth
export {
  auth,
  provider,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  onAuthStateChanged,
};

// Firestore — instance
export { db };

// Firestore — yardımcı fonksiyonlar
export {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  deleteField,
  // #5 — Offline banner için dışarıya aç
  enableNetwork,
  disableNetwork,
};