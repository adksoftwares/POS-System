package com.adk.smartposlanka.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import kotlinx.coroutines.flow.Flow

@Dao
interface AttendanceLogDao {
    @Query("SELECT * FROM attendance_logs ORDER BY clockIn DESC")
    fun getAllLogs(): Flow<List<AttendanceLogEntity>>

    @Query("SELECT * FROM attendance_logs WHERE id = :id LIMIT 1")
    suspend fun getLogById(id: String): AttendanceLogEntity?

    @Query("SELECT * FROM attendance_logs WHERE clockOut IS NULL ORDER BY clockIn DESC LIMIT 1")
    fun getActiveLogFlow(): Flow<AttendanceLogEntity?>

    @Query("SELECT * FROM attendance_logs WHERE clockOut IS NULL ORDER BY clockIn DESC LIMIT 1")
    suspend fun getActiveLogSync(): AttendanceLogEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertLogs(logs: List<AttendanceLogEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertLog(log: AttendanceLogEntity)

    @Query("DELETE FROM attendance_logs")
    suspend fun clearLogs()

    @Transaction
    suspend fun refreshLogs(logs: List<AttendanceLogEntity>) {
        clearLogs()
        insertLogs(logs)
    }

    @Query("DELETE FROM attendance_logs WHERE id = :id")
    suspend fun deleteLogById(id: String)
}
