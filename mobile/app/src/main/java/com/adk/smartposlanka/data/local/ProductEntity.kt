package com.adk.smartposlanka.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey
import java.util.UUID

@Entity(tableName = "products")
data class ProductEntity(
    @PrimaryKey
    val id: String = UUID.randomUUID().toString(),
    val name: String,
    val price: Double,
    val quantity: Int,
    val barcode: String,
    val category: String
)
