package com.adk.smartposlanka.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.adk.smartposlanka.data.local.ProductDao
import com.adk.smartposlanka.data.local.ProductEntity
import com.adk.smartposlanka.data.remote.SyncManager
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.util.Calendar

data class TransactionRecord(
    val id: String,
    val total: Double,
    val itemsCount: Int,
    val timestamp: Long
)

class PosViewModel(
    private val productDao: ProductDao,
    private val syncManager: SyncManager
) : ViewModel() {

    // Expose products directly from local database
    val products: StateFlow<List<ProductEntity>> = productDao.getAllProducts()
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5000),
            initialValue = emptyList()
        )

    private val _cart = MutableStateFlow<Map<ProductEntity, Int>>(emptyMap())
    val cart: StateFlow<Map<ProductEntity, Int>> = _cart

    private val _discount = MutableStateFlow(0.0)
    val discount: StateFlow<Double> = _discount

    private val _syncStatus = MutableStateFlow("Connected")
    val syncStatus: StateFlow<String> = _syncStatus

    // Completed Transactions for Analytics
    private val _transactions = MutableStateFlow<List<TransactionRecord>>(emptyList())
    val transactions: StateFlow<List<TransactionRecord>> = _transactions

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
        viewModelScope.launch {
            while (true) {
                _syncStatus.value = "Connected"
                try {
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
                    barcode = if (product.barcode.isNotEmpty()) product.barcode else existing.barcode
                )
            } else {
                product
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
                productDao.insertProducts(listOf(product))
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

    fun addToCart(product: ProductEntity) {
        val currentQtyInCart = _cart.value[product] ?: 0
        if (currentQtyInCart < product.quantity) {
            val newCart = _cart.value.toMutableMap()
            newCart[product] = currentQtyInCart + 1
            _cart.value = newCart
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

    fun removeFromCart(product: ProductEntity) {
        val newCart = _cart.value.toMutableMap()
        newCart.remove(product)
        _cart.value = newCart
    }

    fun setDiscount(amount: Double) {
        _discount.value = amount
    }

    fun checkout(
        orgId: String,
        branchId: String,
        onSuccess: (receiptId: String, items: Map<ProductEntity, Int>, subtotal: Double, discount: Double, total: Double) -> Unit,
        onError: (String) -> Unit
    ) {
        viewModelScope.launch {
            try {
                if (_cart.value.isEmpty()) {
                    onError("Cart is empty!")
                    return@launch
                }

                val totalItems = _cart.value.values.sum()
                val totalBeforeDiscount = _cart.value.toList().sumOf { (item, qty) -> item.price * qty }
                val finalTotal = maxOf(0.0, totalBeforeDiscount - _discount.value)

                val receiptTimestamp = System.currentTimeMillis()
                val receiptId = "ADK-M-$receiptTimestamp"

                // Create identical JSON structure for items to match web app
                val cartItemsList = _cart.value.map { (product, qty) ->
                    mapOf(
                        "productId" to product.id,
                        "quantity" to qty,
                        "price" to product.price
                    )
                }
                val itemsJson = "[" + cartItemsList.joinToString(",") { item ->
                    """{"productId":"${item["productId"]}","quantity":${item["quantity"]},"price":${item["price"]}}"""
                } + "]"

                // 1. Deduct stock for each cart item
                for ((product, qty) in _cart.value) {
                    syncManager.deductStockAndSync(orgId, branchId, product.id, qty)
                }

                // 2. Upload identical transaction record to Cloud Firestore
                val transactionData = hashMapOf(
                    "receiptId" to receiptId,
                    "totalAmount" to finalTotal,
                    "paymentMethod" to "Cash",
                    "timestamp" to receiptTimestamp,
                    "itemsJson" to itemsJson
                )

                val orgIdFinal = if (orgId.isEmpty()) "ORG_ID" else orgId
                FirebaseFirestore.getInstance()
                    .collection("Organizations").document(orgIdFinal)
                    .collection("Branches").document(branchId)
                    .collection("Transactions").document(receiptId)
                    .set(transactionData)

                // Add to transactions list locally for fallback and instant update
                val record = TransactionRecord(
                    id = receiptId,
                    total = finalTotal,
                    itemsCount = totalItems,
                    timestamp = receiptTimestamp
                )
                _transactions.value = _transactions.value + record

                // Copy current details before resetting
                val finalItems = _cart.value.toMap()
                val finalDiscount = _discount.value

                // Reset cart & discount
                _cart.value = emptyMap()
                _discount.value = 0.0

                onSuccess(receiptId, finalItems, totalBeforeDiscount, finalDiscount, finalTotal)
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
}
