import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, collectionGroup } from "firebase/firestore";
import dotenv from "dotenv";

dotenv.config();

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID
};

console.log("Firebase project config connecting:", firebaseConfig.projectId);

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function inspectDb() {
  try {
    console.log("\n--- 1. Users ---");
    const usersSnap = await getDocs(collection(db, "Users"));
    usersSnap.forEach(doc => {
      console.log(`User ID: ${doc.id} =>`, doc.data());
    });

    console.log("\n--- 2. Organizations ---");
    const orgsSnap = await getDocs(collection(db, "Organizations"));
    orgsSnap.forEach(doc => {
      console.log(`Org ID: ${doc.id} =>`, doc.data());
    });

    console.log("\n--- 3. All Products ---");
    const productsSnap = await getDocs(collectionGroup(db, "Products"));
    productsSnap.forEach(doc => {
      console.log(`Product Path: ${doc.ref.path} =>`, doc.data());
    });

  } catch (err) {
    console.error("Inspection failed:", err);
  }
}

inspectDb();
