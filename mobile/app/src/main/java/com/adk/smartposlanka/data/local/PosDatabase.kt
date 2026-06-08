package com.adk.smartposlanka.data.local

import androidx.room.Database
import androidx.room.RoomDatabase

@Database(entities = [ProductEntity::class, AttendanceLogEntity::class], version = 2, exportSchema = false)
abstract class PosDatabase : RoomDatabase() {
    abstract fun productDao(): ProductDao
    abstract fun attendanceLogDao(): AttendanceLogDao
}
