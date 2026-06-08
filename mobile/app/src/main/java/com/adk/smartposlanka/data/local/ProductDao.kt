package com.adk.smartposlanka.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import kotlinx.coroutines.flow.Flow

@Dao
interface ProductDao {
    @Query("SELECT * FROM products")
    fun getAllProducts(): Flow<List<ProductEntity>>

    @Query("SELECT * FROM products WHERE name LIKE '%' || :query || '%'")
    fun searchProducts(query: String): Flow<List<ProductEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertProducts(products: List<ProductEntity>)

    @Query("DELETE FROM products")
    suspend fun clearProducts()

    @Query("SELECT * FROM products WHERE pendingSync = 1")
    suspend fun getUnsyncedProducts(): List<ProductEntity>

    @Query("UPDATE products SET pendingSync = 0 WHERE id = :productId")
    suspend fun markAsSynced(productId: String)

    @Query("SELECT * FROM products")
    suspend fun getAllProductsSync(): List<ProductEntity>

    @Transaction
    suspend fun refreshProducts(cloudProducts: List<ProductEntity>) {
        val unsyncedIds = getUnsyncedProducts().map { it.id }.toSet()
        val cloudIds = cloudProducts.map { it.id }.toSet()
        val allLocal = getAllProductsSync()
        for (local in allLocal) {
            if (!cloudIds.contains(local.id) && !unsyncedIds.contains(local.id)) {
                deleteProductById(local.id)
            }
        }
        val toInsert = cloudProducts.filter { !unsyncedIds.contains(it.id) }
        insertProducts(toInsert)
    }
    
    @Query("UPDATE products SET quantity = quantity - :amount, pendingSync = 1 WHERE id = :productId")
    suspend fun deductStock(productId: String, amount: Int)

    @Query("DELETE FROM products WHERE id = :productId")
    suspend fun deleteProductById(productId: String)
}
