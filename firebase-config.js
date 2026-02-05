import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-analytics.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyBYVrOYeD9-9cnuPM-536zac5hfe2GgWX4",
  authDomain: "cr-report-backend.firebaseapp.com",
  projectId: "cr-report-backend",
  storageBucket: "cr-report-backend.firebasestorage.app",
  messagingSenderId: "310789212993",
  appId: "1:310789212993:web:02e75824c32ee71e50efc0",
  measurementId: "G-R65FNF3YXS"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);
const auth = getAuth(app);

export { app, db, analytics, auth };
