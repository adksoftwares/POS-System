package com.adk.smartposlanka.data.remote

import com.adk.smartposlanka.data.local.ProductDao
import com.adk.smartposlanka.data.local.ProductEntity
import com.adk.smartposlanka.ui.TransactionRecord
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await

class SyncManager(
    private val firestore: FirebaseFirestore,
    private val productDao: ProductDao
) {
    // 1. Convert Firestore real-time updates to a Kotlin Flow
    fun getFirestoreProductsFlow(orgId: String, branchId: String): Flow<List<ProductEntity>> = callbackFlow {
        val query = firestore.collection("Organizations")
            .document(orgId)
            .collection("Branches")
            .document(branchId)
            .collection("Products")

        val listenerRegistration = query.addSnapshotListener { snapshot, error ->
            if (error != null) {
                close(error)
                return@addSnapshotListener
            }
            if (snapshot != null) {
                val products = snapshot.documents.mapNotNull { doc ->
                    val name = doc.getString("name") ?: return@mapNotNull null
                    
                    // Robust numeric parser to avoid Firebase Android SDK double casting gotchas
                    val priceRaw = doc.get("price")
                    val price = when (priceRaw) {
                        is Number -> priceRaw.toDouble()
                        else -> 0.0
                    }
                    
                    val qtyRaw = doc.get("quantity")
                    val quantity = when (qtyRaw) {
                        is Number -> qtyRaw.toInt()
                        else -> 0
                    }

                    ProductEntity(
                        id = doc.id,
                        name = name,
                        price = price,
                        quantity = quantity,
                        barcode = doc.getString("barcode") ?: "",
                        category = doc.getString("category") ?: "General"
                    )
                }
                
                // Safe check: Only propagate updates if we have documents OR the update is verified from the server.
                // This prevents clearing the Room database if the app is offline and local Firestore cache is empty on startup.
                if (products.isNotEmpty() || !snapshot.metadata.isFromCache) {
                    trySend(products)
                }
            }
        }
        awaitClose { listenerRegistration.remove() }
    }

    // 2. Continuous synchronization: Collect Flow and update local Room DB
    suspend fun startRealtimeSync(orgId: String, branchId: String) {
        getFirestoreProductsFlow(orgId, branchId).collect { cloudProducts ->
            // Atomic table update ensures deletions/edits sync perfectly
            productDao.refreshProducts(cloudProducts)
        }
    }

    // 3. Convert Firestore transactions updates to a Kotlin Flow
    fun getFirestoreTransactionsFlow(orgId: String, branchId: String): Flow<List<TransactionRecord>> = callbackFlow {
        val query = firestore.collection("Organizations")
            .document(orgId)
            .collection("Branches")
            .document(branchId)
            .collection("Transactions")

        val listenerRegistration = query.addSnapshotListener { snapshot, error ->
            if (error != null) {
                close(error)
                return@addSnapshotListener
            }
            if (snapshot != null) {
                val transactions = snapshot.documents.mapNotNull { doc ->
                    val totalRaw = doc.get("totalAmount")
                    val total = when (totalRaw) {
                        is Number -> totalRaw.toDouble()
                        else -> 0.0
                    }
                    
                    val timestampRaw = doc.get("timestamp")
                    val timestamp = when (timestampRaw) {
                        is Number -> timestampRaw.toLong()
                        else -> System.currentTimeMillis()
                    }

                    TransactionRecord(
                        id = doc.getString("receiptId") ?: doc.id,
                        total = total,
                        itemsCount = 1, // Simulated fallback
                        timestamp = timestamp
                    )
                }
                
                if (transactions.isNotEmpty() || !snapshot.metadata.isFromCache) {
                    trySend(transactions)
                }
            }
        }
        awaitClose { listenerRegistration.remove() }
    }

    // 4. Keep backward compatibility with ViewModel's one-time sync function
    suspend fun syncProductsFromCloud(orgId: String, branchId: String) {
        try {
            val snapshot = firestore.collection("Organizations")
                .document(orgId)
                .collection("Branches")
                .document(branchId)
                .collection("Products")
                .get()
                .await()

            val cloudProducts = snapshot.documents.mapNotNull { doc ->
                val name = doc.getString("name") ?: return@mapNotNull null
                
                val priceRaw = doc.get("price")
                val price = when (priceRaw) {
                    is Number -> priceRaw.toDouble()
                    else -> 0.0
                }
                
                val qtyRaw = doc.get("quantity")
                val quantity = when (qtyRaw) {
                    is Number -> qtyRaw.toInt()
                    else -> 0
                }

                ProductEntity(
                    id = doc.id,
                    name = name,
                    price = price,
                    quantity = quantity,
                    barcode = doc.getString("barcode") ?: "",
                    category = doc.getString("category") ?: "General"
                )
            }
            
            productDao.refreshProducts(cloudProducts)
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    // 5. Deduct stock locally and sync stock deduction to Firestore
    suspend fun deductStockAndSync(orgId: String, branchId: String, productId: String, amount: Int) {
        try {
            // First deduct stock in local Room database
            productDao.deductStock(productId, amount)

            // Then decrement in Firebase Firestore in real-time
            firestore.collection("Organizations")
                .document(orgId)
                .collection("Branches")
                .document(branchId)
                .collection("Products")
                .document(productId)
                .update("quantity", FieldValue.increment(-amount.toLong()))
                .await()
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }
}
