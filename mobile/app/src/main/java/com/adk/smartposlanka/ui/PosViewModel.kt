package com.adk.smartposlanka.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.adk.smartposlanka.data.local.ProductDao
import com.adk.smartposlanka.data.local.ProductEntity
import com.adk.smartposlanka.data.local.AttendanceLogDao
import com.adk.smartposlanka.data.local.AttendanceLogEntity
import com.adk.smartposlanka.data.remote.SyncManager
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import java.util.Calendar

data class TransactionRecord(
    val id: String,
    val total: Double,
    val itemsCount: Int,
    val timestamp: Long,
    val itemsJson: String = "[]",
    val paymentMethod: String = "Cash"
)

class PosViewModel(
    private val productDao: ProductDao,
    private val syncManager: SyncManager,
    private val attendanceLogDao: AttendanceLogDao
) : ViewModel() {

    // Expose products directly from local database
    val products: StateFlow<List<ProductEntity>> = productDao.getAllProducts()
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5000),
            initialValue = emptyList()
        )

    val shifts: StateFlow<List<AttendanceLogEntity>> = attendanceLogDao.getAllLogs()
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5000),
            initialValue = emptyList()
        )

    val activeShift: StateFlow<AttendanceLogEntity?> = attendanceLogDao.getActiveLogFlow()
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5000),
            initialValue = null
        )

    private val _cart = MutableStateFlow<Map<ProductEntity, Int>>(emptyMap())
    val cart: StateFlow<Map<ProductEntity, Int>> = _cart
 
    private val _productDiscounts = MutableStateFlow<Map<String, Double>>(emptyMap())
    val productDiscounts: StateFlow<Map<String, Double>> = _productDiscounts

    private val _discount = MutableStateFlow(0.0)
    val discount: StateFlow<Double> = _discount

    private val _syncStatus = MutableStateFlow("Connected")
    val syncStatus: StateFlow<String> = _syncStatus

    // Completed Transactions for Analytics
    private val _transactions = MutableStateFlow<List<TransactionRecord>>(emptyList())
    val transactions: StateFlow<List<TransactionRecord>> = _transactions

    private var isSyncActive = false

    fun syncProducts(orgId: String, branchId: String) {
        viewModelScope.launch {
            _syncStatus.value = "Syncing..."
            try {
                syncManager.syncProductsFromCloud(orgId, branchId)
                _syncStatus.value = "Synced"
            } catch (e: Exception) {
                _syncStatus.value = "Failed: ${e.localizedMessage}"
            }
        }
    }

    fun startRealtimeSync(orgId: String, branchId: String) {
        if (isSyncActive) return
        isSyncActive = true
        viewModelScope.launch {
            while (true) {
                _syncStatus.value = "Connected"
                try {
                    syncManager.pushLocalChangesToCloud(orgId, branchId)
                    syncManager.startRealtimeSync(orgId, branchId)
                } catch (e: Exception) {
                    _syncStatus.value = "Offline Mode (Reconnecting...)"
                    e.printStackTrace()
                }
                kotlinx.coroutines.delay(5000)
            }
        }

        viewModelScope.launch {
            while (true) {
                try {
                    // Fetch and stream real-time transaction updates from cloud
                    syncManager.getFirestoreTransactionsFlow(orgId, branchId).collect { cloudTxs ->
                        _transactions.value = cloudTxs
                    }
                } catch (e: Exception) {
                    e.printStackTrace()
                }
                kotlinx.coroutines.delay(5000)
            }
        }
    }

    // Dynamic offline-first product addition: merges duplicate product names, inserts into Room, and uploads to Firestore
    fun addProduct(orgId: String, branchId: String, product: ProductEntity) {
        viewModelScope.launch {
            // Self-Healing product merge: if a product with the same name exists, combine stock quantities
            val existing = products.value.firstOrNull { it.name.trim().equals(product.name.trim(), ignoreCase = true) }
            val mergedProduct = if (existing != null) {
                existing.copy(
                    quantity = existing.quantity + product.quantity,
                    price = product.price, // update to newest price
                    barcode = if (product.barcode.isNotEmpty()) product.barcode else existing.barcode,
                    pendingSync = true
                )
            } else {
                product.copy(pendingSync = true)
            }

            try {
                productDao.insertProducts(listOf(mergedProduct))
            } catch (e: Exception) {
                e.printStackTrace()
            }
            
            try {
                val orgIdFinal = if (orgId.isEmpty()) "ORG_ID" else orgId
                FirebaseFirestore.getInstance()
                    .collection("Organizations").document(orgIdFinal)
                    .collection("Branches").document(branchId)
                    .collection("Products").document(mergedProduct.id)
                    .set(mergedProduct)
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    // Direct product update (for editing products directly from the inventory catalog)
    fun updateProduct(orgId: String, branchId: String, product: ProductEntity) {
        viewModelScope.launch {
            try {
                productDao.insertProducts(listOf(product.copy(pendingSync = true)))
            } catch (e: Exception) {
                e.printStackTrace()
            }
            
            try {
                val orgIdFinal = if (orgId.isEmpty()) "ORG_ID" else orgId
                FirebaseFirestore.getInstance()
                    .collection("Organizations").document(orgIdFinal)
                    .collection("Branches").document(branchId)
                    .collection("Products").document(product.id)
                    .set(product)
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    // Direct product deletion
    fun deleteProduct(orgId: String, branchId: String, productId: String) {
        viewModelScope.launch {
            try {
                productDao.deleteProductById(productId)
            } catch (e: Exception) {
                e.printStackTrace()
            }
            
            try {
                val orgIdFinal = if (orgId.isEmpty()) "ORG_ID" else orgId
                FirebaseFirestore.getInstance()
                    .collection("Organizations").document(orgIdFinal)
                    .collection("Branches").document(branchId)
                    .collection("Products").document(productId)
                    .delete()
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    fun addToCart(product: ProductEntity) {
        val currentQtyInCart = _cart.value[product] ?: 0
        if (currentQtyInCart < product.quantity) {
            val newCart = _cart.value.toMutableMap()
            newCart[product] = currentQtyInCart + 1
            _cart.value = newCart
        }
    }

    fun scanBarcode(barcode: String, onNotFound: () -> Unit) {
        val product = products.value.firstOrNull { it.barcode == barcode }
        if (product != null) {
            addToCart(product)
        } else {
            onNotFound()
        }
    }

    fun updateCartQty(product: ProductEntity, newQty: Int) {
        if (newQty <= 0) {
            removeFromCart(product)
            return
        }
        if (newQty <= product.quantity) {
            val newCart = _cart.value.toMutableMap()
            newCart[product] = newQty
            _cart.value = newCart
        }
    }

    fun updateProductDiscount(productId: String, discount: Double) {
        val newDiscounts = _productDiscounts.value.toMutableMap()
        newDiscounts[productId] = discount
        _productDiscounts.value = newDiscounts
    }

    fun removeFromCart(product: ProductEntity) {
        val newCart = _cart.value.toMutableMap()
        newCart.remove(product)
        _cart.value = newCart

        val newDiscounts = _productDiscounts.value.toMutableMap()
        newDiscounts.remove(product.id)
        _productDiscounts.value = newDiscounts
    }

    fun loadCart(newCart: Map<ProductEntity, Int>) {
        _cart.value = newCart
        if (newCart.isEmpty()) {
            _productDiscounts.value = emptyMap()
        }
    }

    fun setDiscount(amount: Double) {
        _discount.value = amount
    }

    fun checkout(
        orgId: String,
        branchId: String,
        selectedBankId: String?,
        onSuccess: (receiptId: String, items: Map<ProductEntity, Int>, subtotal: Double, discount: Double, total: Double) -> Unit,
        onError: (String) -> Unit
    ) {
        viewModelScope.launch {
            try {
                if (_cart.value.isEmpty()) {
                    onError("Cart is empty!")
                    return@launch
                }

                val orgIdFinal = if (orgId.isEmpty()) "ORG_ID" else orgId
                val userEmail = com.google.firebase.auth.FirebaseAuth.getInstance().currentUser?.email ?: ""
                val isSuperAdmin = userEmail.trim().lowercase() == "arikarran14@gmail.com"

                // 1. Fetch organization tier and print limits from Firestore
                var subscriptionTier = "Free"
                var billPrintCount = 0
                
                try {
                    val orgSnapshot = com.google.firebase.firestore.FirebaseFirestore.getInstance()
                        .collection("Organizations").document(orgIdFinal)
                        .get().await()
                    if (orgSnapshot.exists()) {
                        subscriptionTier = orgSnapshot.getString("subscriptionTier") ?: "Free"
                        billPrintCount = orgSnapshot.getLong("billPrintCount")?.toInt() ?: 0
                    }
                } catch (e: Exception) {
                    e.printStackTrace()
                }

                // 2. Validate Limit Guard
                if (!isSuperAdmin && !subscriptionTier.equals("Premium", ignoreCase = true) && billPrintCount >= 50) {
                    onError("Billing Limit Reached! Free accounts are limited to 50 bills. Please upgrade to the Premium Package in settings to print unlimited bills.")
                    return@launch
                }

                val totalItems = _cart.value.values.sum()
                val totalBeforeDiscount = _cart.value.toList().sumOf { (item, qty) -> item.price * qty }
                val totalProductDiscounts = _cart.value.toList().sumOf { (item, qty) -> ((_productDiscounts.value[item.id] ?: 0.0) / 100.0) * (item.price * qty) }
                val finalTotal = maxOf(0.0, totalBeforeDiscount - _discount.value - totalProductDiscounts)

                val receiptTimestamp = System.currentTimeMillis()
                val receiptId = "ADK-M-$receiptTimestamp"

                // Create identical JSON structure for items to match web app
                val cartItemsList = _cart.value.map { (product, qty) ->
                    val pDisc = ((_productDiscounts.value[product.id] ?: 0.0) / 100.0) * (product.price * qty)
                    mapOf(
                        "productId" to product.id,
                        "quantity" to qty,
                        "price" to product.price,
                        "discount" to pDisc
                    )
                }
                val itemsJson = "[" + cartItemsList.joinToString(",") { item ->
                    """{"productId":"${item["productId"]}","quantity":${item["quantity"]},"price":${item["price"]},"discount":${item["discount"]}}"""
                } + "]"

                // 1. Deduct stock for each cart item
                for ((product, qty) in _cart.value) {
                    syncManager.deductStockAndSync(orgIdFinal, branchId, product.id, qty)
                }

                // 2. Upload identical transaction record to Cloud Firestore
                val transactionData = hashMapOf(
                    "receiptId" to receiptId,
                    "totalAmount" to finalTotal,
                    "paymentMethod" to if (selectedBankId != null) "Bank Transfer" else "Cash",
                    "selectedBankAccountId" to (selectedBankId ?: ""),
                    "timestamp" to receiptTimestamp,
                    "itemsJson" to itemsJson
                )

                com.google.firebase.firestore.FirebaseFirestore.getInstance()
                    .collection("Organizations").document(orgIdFinal)
                    .collection("Branches").document(branchId)
                    .collection("Transactions").document(receiptId)
                    .set(transactionData).await()

                if (!isSuperAdmin && !subscriptionTier.equals("Premium", ignoreCase = true)) {
                    com.google.firebase.firestore.FirebaseFirestore.getInstance()
                        .collection("Organizations").document(orgIdFinal)
                        .update("billPrintCount", billPrintCount + 1).await()
                }

                // Add to transactions list locally for fallback and instant update
                val record = TransactionRecord(
                    id = receiptId,
                    total = finalTotal,
                    itemsCount = totalItems,
                    timestamp = receiptTimestamp,
                    itemsJson = itemsJson,
                    paymentMethod = if (selectedBankId != null) "Bank Transfer" else "Cash"
                )
                _transactions.value = _transactions.value + record

                // Copy current details before resetting
                val finalItems = _cart.value.toMap()
                val finalDiscount = _discount.value

                // Reset cart, discount & product discounts
                _cart.value = emptyMap()
                _discount.value = 0.0
                _productDiscounts.value = emptyMap()

                onSuccess(receiptId, finalItems, totalBeforeDiscount, finalDiscount + totalProductDiscounts, finalTotal)
            } catch (e: Exception) {
                onError(e.localizedMessage ?: "Checkout failed")
            }
        }
    }

    // Analytics calculations
    fun getTodayRevenue(): Double {
        val today = Calendar.getInstance()
        return _transactions.value.filter {
            val cal = Calendar.getInstance().apply { timeInMillis = it.timestamp }
            cal.get(Calendar.YEAR) == today.get(Calendar.YEAR) &&
            cal.get(Calendar.DAY_OF_YEAR) == today.get(Calendar.DAY_OF_YEAR)
        }.sumOf { it.total }
    }

    fun getMonthRevenue(): Double {
        val today = Calendar.getInstance()
        return _transactions.value.filter {
            val cal = Calendar.getInstance().apply { timeInMillis = it.timestamp }
            cal.get(Calendar.YEAR) == today.get(Calendar.YEAR) &&
            cal.get(Calendar.MONTH) == today.get(Calendar.MONTH)
        }.sumOf { it.total }
    }

    fun getYearRevenue(): Double {
        val today = Calendar.getInstance()
        return _transactions.value.filter {
            val cal = Calendar.getInstance().apply { timeInMillis = it.timestamp }
            cal.get(Calendar.YEAR) == today.get(Calendar.YEAR)
        }.sumOf { it.total }
    }

    fun clockIn(orgId: String, branchId: String, startingFloat: Double, onComplete: () -> Unit = {}) {
        viewModelScope.launch {
            val userEmail = com.google.firebase.auth.FirebaseAuth.getInstance().currentUser?.email ?: "cashier@adk.com"
            val newLog = AttendanceLogEntity(
                id = java.util.UUID.randomUUID().toString(),
                employeeId = userEmail,
                clockIn = System.currentTimeMillis(),
                startingFloat = startingFloat
            )
            attendanceLogDao.insertLog(newLog)
            syncManager.pushShiftToCloud(orgId, branchId, newLog)
            onComplete()
        }
    }

    fun clockOut(orgId: String, branchId: String, endingFloat: Double, onComplete: (AttendanceLogEntity) -> Unit = {}) {
        viewModelScope.launch {
            val active = attendanceLogDao.getActiveLogSync() ?: return@launch
            val now = System.currentTimeMillis()
            
            // Query transactions completed during this shift: timestamp in [active.clockIn, now]
            val shiftTx = transactions.value.filter { it.timestamp in active.clockIn..now }
            
            var cashSales = 0.0
            var cardSales = 0.0
            var bankSales = 0.0
            
            shiftTx.forEach { t ->
                val method = t.paymentMethod.lowercase()
                if (method == "cash") {
                    cashSales += t.total
                } else if (method == "card") {
                    cardSales += t.total
                } else {
                    bankSales += t.total
                }
            }
            
            val expectedEndingCash = active.startingFloat + cashSales
            val discrepancy = endingFloat - expectedEndingCash
            
            val updated = active.copy(
                clockOut = now,
                endingFloat = endingFloat,
                expectedEndingCash = expectedEndingCash,
                discrepancy = discrepancy,
                cashSales = cashSales,
                cardSales = cardSales,
                bankSales = bankSales
            )
            
            attendanceLogDao.insertLog(updated)
            syncManager.pushShiftToCloud(orgId, branchId, updated)
            onComplete(updated)
        }
    }

    fun clearLocalData() {
        viewModelScope.launch {
            try {
                productDao.clearProducts()
                attendanceLogDao.clearLogs()
            } catch (e: Exception) {
                e.printStackTrace()
            }
            _cart.value = emptyMap()
            _transactions.value = emptyList()
        }
    }
}
