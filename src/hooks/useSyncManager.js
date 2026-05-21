import { useEffect, useState } from 'react';
import { db } from '../db/database';
import { dbCloud, auth } from '../config/firebase';
import { collection, onSnapshot, doc, setDoc, getDoc, deleteDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { v4 as uuidv4 } from 'uuid';

export function useSyncManager() {
  const [syncConfig, setSyncConfig] = useState(null);

  useEffect(() => {
    // 1. Reactive Auth Listener to dynamically retrieve the correct orgId and branchId from the database
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const userDoc = await getDoc(doc(dbCloud, "Users", user.uid));
          if (userDoc.exists()) {
            const data = userDoc.data();
            let orgId = data.organizationId;
            const branchId = data.branchId || "Main";
            
            if (!orgId) {
              orgId = uuidv4();
              await setDoc(doc(dbCloud, "Organizations", orgId), {
                shopName: "ADK Supermart",
                subscriptionTier: "Free",
                createdAt: new Date().toISOString()
              });
              await setDoc(doc(dbCloud, "Users", user.uid), {
                organizationId: orgId
              }, { merge: true });
            }

            setSyncConfig({ orgId, branchId });
            localStorage.setItem("adk_orgId", orgId);
            localStorage.setItem("adk_branchId", branchId);
            localStorage.setItem("adk_role", data.role || "Cashier");
            localStorage.setItem("adk_userEmail", user.email);
          } else {
            // Background Self-Healing: Create missing organization and profile
            const orgId = uuidv4();
            const branchId = "Main";
            
            await setDoc(doc(dbCloud, "Organizations", orgId), {
              shopName: "ADK Supermart",
              subscriptionTier: "Free",
              createdAt: new Date().toISOString()
            });

            await setDoc(doc(dbCloud, "Users", user.uid), {
              fullName: "Store Manager",
              email: user.email,
              role: "Owner",
              organizationId: orgId,
              branchId: branchId
            });

            setSyncConfig({ orgId, branchId });
            localStorage.setItem("adk_role", "Owner");
            localStorage.setItem("adk_orgId", orgId);
            localStorage.setItem("adk_branchId", branchId);
            localStorage.setItem("adk_userEmail", user.email);
          }
        } catch (err) {
          console.error("SyncManager: auth profile fetch error", err);
        }
      } else {
        setSyncConfig(null);
      }
    });

    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (!syncConfig) return;
    const { orgId, branchId } = syncConfig;

    console.log(`🔄 Web Cloud Sync Engine started for Org: ${orgId}, Branch: ${branchId}`);

    // 2. PUSH local changes to Firestore periodically & during connection recovery
    const pushLocalToCloud = async () => {
      if (!navigator.onLine) return;
      try {
        // A. Push local Products
        const localProducts = await db.products.toArray();
        for (const prod of localProducts) {
          const docRef = doc(dbCloud, `Organizations/${orgId}/Branches/${branchId}/Products`, prod.id);
          await setDoc(docRef, prod, { merge: true });
        }

        // B. Push local Transactions
        const localTransactions = await db.transactions.toArray();
        for (const tx of localTransactions) {
          const docRef = doc(dbCloud, `Organizations/${orgId}/Branches/${branchId}/Transactions`, tx.receiptId);
          await setDoc(docRef, tx, { merge: true });
        }
        console.log("🚀 Web Local changes successfully pushed to Cloud!");
      } catch (err) {
        console.error("Failed to push local records to Firestore", err);
      }
    };

    // Run initial push immediately, then every 10 seconds
    pushLocalToCloud();
    const pushInterval = setInterval(pushLocalToCloud, 10000);

    // 3. PULL Cloud changes to local Dexie in real-time (Products & Transactions)
    // A. Sync Products
    const productsRef = collection(dbCloud, `Organizations/${orgId}/Branches/${branchId}/Products`);
    const unsubscribeProducts = onSnapshot(productsRef, async (snapshot) => {
      const cloudProducts = [];
      snapshot.forEach((doc) => {
        cloudProducts.push({ id: doc.id, ...doc.data() });
      });

      // Background Self-Healing: Auto-merge any existing product duplicates by name in the cloud
      const nameGroups = {};
      cloudProducts.forEach(prod => {
        const normName = (prod.name || '').trim().toLowerCase();
        if (normName) {
          if (!nameGroups[normName]) {
            nameGroups[normName] = [];
          }
          nameGroups[normName].push(prod);
        }
      });

      const cleanProducts = [];
      const toDeleteFromCloud = [];
      const toUpdateInCloud = [];

      for (const normName of Object.keys(nameGroups)) {
        const group = nameGroups[normName];
        if (group.length > 1) {
          // Select master (first one)
          const master = { ...group[0] };
          // Sum stock quantities of all duplicates
          const totalQty = group.reduce((sum, item) => sum + (parseInt(item.quantity) || 0), 0);
          master.quantity = totalQty;
          
          cleanProducts.push(master);
          toUpdateInCloud.push(master);

          // Mark other duplicate records for cloud deletion
          for (let i = 1; i < group.length; i++) {
            toDeleteFromCloud.push(group[i].id);
          }
        } else {
          cleanProducts.push(group[0]);
        }
      }

      // 1. Perform background deletions in Firestore for duplicate product documents
      if (toDeleteFromCloud.length > 0) {
        console.warn(`🧹 useSyncManager: Deleting ${toDeleteFromCloud.length} duplicate products from cloud...`);
        for (const duplicateId of toDeleteFromCloud) {
          try {
            const docRef = doc(dbCloud, `Organizations/${orgId}/Branches/${branchId}/Products`, duplicateId);
            await deleteDoc(docRef);
            await db.products.delete(duplicateId);
          } catch (err) {
            console.error("Failed to delete duplicate product document:", err);
          }
        }
      }

      // 2. Perform background updates in Firestore for merged master records
      if (toUpdateInCloud.length > 0) {
        console.log(`🧹 useSyncManager: Merging product name groups to cloud...`);
        for (const mergedProd of toUpdateInCloud) {
          try {
            const docRef = doc(dbCloud, `Organizations/${orgId}/Branches/${branchId}/Products`, mergedProd.id);
            await setDoc(docRef, mergedProd, { merge: true });
          } catch (err) {
            console.error("Failed to update merged master product record:", err);
          }
        }
      }

      if (cleanProducts.length > 0) {
        await db.products.bulkPut(cleanProducts);
      }
    }, (error) => {
      console.error("Products subscription error:", error);
    });

    // B. Sync Transactions
    const transactionsRef = collection(dbCloud, `Organizations/${orgId}/Branches/${branchId}/Transactions`);
    const unsubscribeTransactions = onSnapshot(transactionsRef, async (snapshot) => {
      const cloudTransactions = [];
      snapshot.forEach((doc) => {
        cloudTransactions.push({ receiptId: doc.id, ...doc.data() });
      });
      if (cloudTransactions.length > 0) {
        await db.transactions.bulkPut(cloudTransactions);
      }
    }, (error) => {
      console.error("Transactions subscription error:", error);
    });

    // Handle online recovery event
    window.addEventListener('online', pushLocalToCloud);

    return () => {
      clearInterval(pushInterval);
      unsubscribeProducts();
      unsubscribeTransactions();
      window.removeEventListener('online', pushLocalToCloud);
    };
  }, [syncConfig]);

  return syncConfig;
}
