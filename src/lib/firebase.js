import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBiDCeO1dHTm5YRJ21LWUboKKRSkioFCrg",
  authDomain: "test-ub3.firebaseapp.com",
  projectId: "test-ub3",
  storageBucket: "test-ub3.firebasestorage.app",
  messagingSenderId: "919394117624",
  appId: "1:919394117624:web:0b836538d89ae35766980d"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export default app;
