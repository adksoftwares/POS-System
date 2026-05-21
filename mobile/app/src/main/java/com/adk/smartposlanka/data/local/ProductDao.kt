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

    @Transaction
    suspend fun refreshProducts(products: List<ProductEntity>) {
        clearProducts()
        insertProducts(products)
    }
    
    @Query("UPDATE products SET quantity = quantity - :amount WHERE id = :productId")
    suspend fun deductStock(productId: String, amount: Int)
}
