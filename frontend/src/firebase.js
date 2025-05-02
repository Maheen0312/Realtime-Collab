import firebase from "firebase/app";
import "firebase/firestore";

// Firebase config
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
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
} else {
  firebase.app(); // Use the default app if already initialized
}

// Initialize Firestore
const firestore = firebase.firestore();

export { firestore };
