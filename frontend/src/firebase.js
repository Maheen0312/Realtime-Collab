// firebase.js - This file should properly initialize Firebase and Firestore
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, setDoc, updateDoc, onSnapshot, getDoc, addDoc } from 'firebase/firestore';

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

// Initialize Firestore
const firestore = getFirestore(app);

export { firestore, collection, doc, setDoc, updateDoc, onSnapshot, getDoc, addDoc };