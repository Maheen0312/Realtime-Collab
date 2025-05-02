// src/firebase.js

// Import only what you need (modular SDK)
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database'; // For Realtime DB (optional)
import { getStorage } from 'firebase/storage';   // For file uploads (optional)

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDl7aQVZ_3ruCVGxSXlOxLRrbD2qsPze2w",
  authDomain: "code-collaboration-20fdf.firebaseapp.com",
  projectId: "code-collaboration-20fdf",
  storageBucket: "code-collaboration-20fdf.firebasestorage.app",
  messagingSenderId: "329341018408",
  appId: "1:329341018408:web:772ae684804118f982f01d",
  measurementId: "G-PE87NFK1DX"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize services
const firestore = getFirestore(app);
const auth = getAuth(app);
const realtimeDB = getDatabase(app);
const storage = getStorage(app);

// Export services
export { app, firestore, auth, realtimeDB, storage };
