package com.adk.smartposlanka.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey
import java.util.UUID

@Entity(tableName = "attendance_logs")
data class AttendanceLogEntity(
    @PrimaryKey
    val id: String = UUID.randomUUID().toString(),
    val employeeId: String,
    val clockIn: Long,
    val clockOut: Long? = null,
    val startingFloat: Double = 0.0,
    val endingFloat: Double = 0.0,
    val expectedEndingCash: Double = 0.0,
    val discrepancy: Double = 0.0,
    val cashSales: Double = 0.0,
    val cardSales: Double = 0.0,
    val bankSales: Double = 0.0
)
