import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyBKat-tCeDuoRr-uzdOeoQXT6PpXHBWJno",
  authDomain: "plating-app-db29f.firebaseapp.com",
  projectId: "plating-app-db29f",
  storageBucket: "plating-app-db29f.firebasestorage.app",
  messagingSenderId: "455835477529"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

export default app;
