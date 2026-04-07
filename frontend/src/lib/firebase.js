import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyB_ZK50NFoOIqqiMtGCCCOhOCvKgVOh2AU",
  authDomain: "athlytic-dd3ee.firebaseapp.com",
  projectId: "athlytic-dd3ee",
  storageBucket: "athlytic-dd3ee.firebasestorage.app",
  messagingSenderId: "21221529311",
  appId: "1:21221529311:web:311eb27b362e69e8cb7b6a",
  measurementId: "G-TVFBYM4D19",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

export { auth, googleProvider };
