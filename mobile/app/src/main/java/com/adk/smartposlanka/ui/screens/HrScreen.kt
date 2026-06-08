package com.adk.smartposlanka.ui.screens

import android.widget.Toast
import androidx.compose.animation.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.adk.smartposlanka.ui.PosViewModel
import com.adk.smartposlanka.data.local.AttendanceLogEntity
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HrScreen(
    viewModel: PosViewModel,
    orgId: String,
    branchId: String,
    paddingValues: PaddingValues
) {
    val shifts by viewModel.shifts.collectAsState()
    val activeShift by viewModel.activeShift.collectAsState()
    val isClockedIn = activeShift != null
    
    val context = LocalContext.current

    var showClockInDialog by remember { mutableStateOf(false) }
    var startingFloatInput by remember { mutableStateOf("") }

    var showClockOutDialog by remember { mutableStateOf(false) }
    var endingFloatInput by remember { mutableStateOf("") }

    var showReconciliationDialog by remember { mutableStateOf<AttendanceLogEntity?>(null) }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    colors = listOf(
                        MaterialTheme.colorScheme.background,
                        MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
                    )
                )
            )
            .padding(paddingValues)
    ) {
        Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
            Text(
                "Human Resources",
                fontSize = 24.sp,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onBackground
            )
            Spacer(modifier = Modifier.height(24.dp))
            
            // Timesheet Clock Card
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.85f)
                ),
                shape = RoundedCornerShape(24.dp),
                elevation = CardDefaults.cardElevation(defaultElevation = 8.dp)
            ) {
                Column(
                    modifier = Modifier.padding(24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Icon(
                        Icons.Default.DateRange, 
                        contentDescription = "Time", 
                        modifier = Modifier.size(64.dp),
                        tint = if (isClockedIn) MaterialTheme.colorScheme.secondary else MaterialTheme.colorScheme.primary
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                    Text(
                        if (isClockedIn) "You are currently Clocked In" else "You are Clocked Out",
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Medium
                    )
                    if (isClockedIn && activeShift != null) {
                        val activeInTime = remember(activeShift) {
                            SimpleDateFormat("hh:mm a", Locale.US).format(Date(activeShift!!.clockIn))
                        }
                        Text(
                            "Shift started at $activeInTime (Float: Rs. ${activeShift!!.startingFloat})",
                            fontSize = 14.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f),
                            modifier = Modifier.padding(top = 4.dp)
                        )
                    }
                    Spacer(modifier = Modifier.height(24.dp))
                    
                    Button(
                        onClick = {
                            if (!isClockedIn) {
                                startingFloatInput = "5000.0"
                                showClockInDialog = true
                            } else {
                                endingFloatInput = ""
                                showClockOutDialog = true
                            }
                        },
                        modifier = Modifier.fillMaxWidth().height(56.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = if (isClockedIn) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary
                        ),
                        shape = RoundedCornerShape(16.dp)
                    ) {
                        Text(
                            text = if (isClockedIn) "Clock Out & Balance Drawer" else "Clock In (Start Shift)",
                            fontSize = 16.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(24.dp))
            Text("Attendance & Timesheet History", fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
            Spacer(modifier = Modifier.height(8.dp))
            
            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(10.dp),
                modifier = Modifier.fillMaxSize()
            ) {
                if (shifts.isEmpty()) {
                    item {
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f)),
                            shape = RoundedCornerShape(12.dp)
                        ) {
                            Box(
                                modifier = Modifier.fillMaxWidth().padding(24.dp),
                                contentAlignment = Alignment.Center
                            ) {
                                Text("No attendance records found. Tap Clock In above.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                } else {
                    items(shifts) { log ->
                        val clockInStr = SimpleDateFormat("MMM dd, hh:mm a", Locale.US).format(Date(log.clockIn))
                        val clockOutStr = if (log.clockOut != null) {
                            SimpleDateFormat("hh:mm a", Locale.US).format(Date(log.clockOut))
                        } else "Active Shift"

                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f)),
                            shape = RoundedCornerShape(12.dp)
                        ) {
                            Row(
                                modifier = Modifier.fillMaxWidth().padding(16.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column {
                                    Text("$clockInStr - $clockOutStr", fontWeight = FontWeight.Bold, fontSize = 15.sp)
                                    Text("Cashier: ${log.employeeId.split("@")[0]}", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    if (log.clockOut != null) {
                                        Text("Expected Drawer: Rs. ${log.expectedEndingCash}", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                        Text("Drawer Count: Rs. ${log.endingFloat}", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    }
                                }
                                
                                Column(horizontalAlignment = Alignment.End) {
                                    if (log.clockOut != null) {
                                        val discrepancyColor = when {
                                            log.discrepancy == 0.0 -> Color(0xFF10B981) // Balanced: Emerald
                                            log.discrepancy < 0.0 -> Color(0xFFEF4444) // Shortage: Red
                                            else -> Color(0xFFF59E0B) // Surplus: Amber
                                        }
                                        val discrepancyLabel = when {
                                            log.discrepancy == 0.0 -> "Balanced"
                                            log.discrepancy < 0.0 -> "Short: Rs. ${String.format(Locale.US, "%.2f", -log.discrepancy)}"
                                            else -> "Surplus: Rs. ${String.format(Locale.US, "%.2f", log.discrepancy)}"
                                        }
                                        Surface(
                                            color = discrepancyColor.copy(alpha = 0.15f),
                                            shape = RoundedCornerShape(6.dp)
                                        ) {
                                            Text(
                                                text = discrepancyLabel,
                                                color = discrepancyColor,
                                                fontSize = 11.sp,
                                                fontWeight = FontWeight.Bold,
                                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                                            )
                                        }
                                        Spacer(modifier = Modifier.height(4.dp))
                                        Text("Sales: Rs. ${log.cashSales}", fontSize = 12.sp, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
                                    } else {
                                        Surface(
                                            color = MaterialTheme.colorScheme.secondary.copy(alpha = 0.15f),
                                            shape = RoundedCornerShape(6.dp)
                                        ) {
                                            Text(
                                                text = "Working...",
                                                color = MaterialTheme.colorScheme.secondary,
                                                fontSize = 11.sp,
                                                fontWeight = FontWeight.Bold,
                                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // Clock In Dialog
        if (showClockInDialog) {
            AlertDialog(
                onDismissRequest = { showClockInDialog = false },
                title = { Text("Start Work Shift", fontWeight = FontWeight.Bold) },
                text = {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("Enter the starting cash drawer float balance (starting cash float):")
                        OutlinedTextField(
                            value = startingFloatInput,
                            onValueChange = { startingFloatInput = it },
                            label = { Text("Starting Float (Rs.)") },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth()
                        )
                    }
                },
                confirmButton = {
                    Button(
                        onClick = {
                            val floatVal = startingFloatInput.toDoubleOrNull()
                            if (floatVal == null || floatVal < 0.0) {
                                Toast.makeText(context, "Invalid starting float amount.", Toast.LENGTH_SHORT).show()
                                return@Button
                            }
                            viewModel.clockIn(orgId, branchId, floatVal) {
                                showClockInDialog = false
                                Toast.makeText(context, "Clocked In successfully!", Toast.LENGTH_SHORT).show()
                            }
                        }
                    ) {
                        Text("Clock In")
                    }
                },
                dismissButton = {
                    OutlinedButton(onClick = { showClockInDialog = false }) {
                        Text("Cancel")
                    }
                }
            )
        }

        // Clock Out Dialog
        if (showClockOutDialog) {
            AlertDialog(
                onDismissRequest = { showClockOutDialog = false },
                title = { Text("End Shift & Reconcile Drawer", fontWeight = FontWeight.Bold) },
                text = {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("Count all physical cash in the drawer and enter the total below:")
                        OutlinedTextField(
                            value = endingFloatInput,
                            onValueChange = { endingFloatInput = it },
                            label = { Text("Ending Float / Cash Count (Rs.)") },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth()
                        )
                    }
                },
                confirmButton = {
                    Button(
                        onClick = {
                            val endingVal = endingFloatInput.toDoubleOrNull()
                            if (endingVal == null || endingVal < 0.0) {
                                Toast.makeText(context, "Please enter a valid cash drawer count.", Toast.LENGTH_SHORT).show()
                                return@Button
                            }
                            viewModel.clockOut(orgId, branchId, endingVal) { reconciledLog ->
                                showClockOutDialog = false
                                showReconciliationDialog = reconciledLog
                            }
                        }
                    ) {
                        Text("Confirm Clock Out")
                    }
                },
                dismissButton = {
                    OutlinedButton(onClick = { showClockOutDialog = false }) {
                        Text("Cancel")
                    }
                }
            )
        }

        // Reconciliation Report Dialog
        if (showReconciliationDialog != null) {
            val report = showReconciliationDialog!!
            AlertDialog(
                onDismissRequest = { showReconciliationDialog = null },
                title = { 
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        val icon = if (report.discrepancy == 0.0) Icons.Default.CheckCircle else Icons.Default.Warning
                        val tint = if (report.discrepancy == 0.0) Color(0xFF10B981) else if (report.discrepancy < 0) Color(0xFFEF4444) else Color(0xFFF59E0B)
                        Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(28.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Reconciliation Report")
                    }
                },
                text = {
                    Column(
                        modifier = Modifier.fillMaxWidth(),
                        verticalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Divider()
                        Spacer(modifier = Modifier.height(4.dp))
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("Starting Float:", fontWeight = FontWeight.SemiBold)
                            Text("Rs. ${String.format(Locale.US, "%.2f", report.startingFloat)}")
                        }
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("Shift Cash Sales:", fontWeight = FontWeight.SemiBold)
                            Text("Rs. ${String.format(Locale.US, "%.2f", report.cashSales)}")
                        }
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("Expected Cash in Drawer:", fontWeight = FontWeight.SemiBold)
                            Text("Rs. ${String.format(Locale.US, "%.2f", report.expectedEndingCash)}")
                        }
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("Actual Drawer Cash Count:", fontWeight = FontWeight.SemiBold)
                            Text("Rs. ${String.format(Locale.US, "%.2f", report.endingFloat)}")
                        }
                        Spacer(modifier = Modifier.height(4.dp))
                        Divider()
                        Spacer(modifier = Modifier.height(4.dp))
                        
                        val status = when {
                            report.discrepancy == 0.0 -> "Drawer is perfectly balanced!"
                            report.discrepancy < 0.0 -> "Drawer shortage: Rs. ${String.format(Locale.US, "%.2f", -report.discrepancy)}"
                            else -> "Drawer surplus: Rs. ${String.format(Locale.US, "%.2f", report.discrepancy)}"
                        }
                        val color = when {
                            report.discrepancy == 0.0 -> Color(0xFF10B981)
                            report.discrepancy < 0.0 -> Color(0xFFEF4444)
                            else -> Color(0xFFF59E0B)
                        }
                        Text(
                            text = status,
                            fontWeight = FontWeight.ExtraBold,
                            color = color,
                            fontSize = 15.sp,
                            modifier = Modifier.fillMaxWidth(),
                            textAlign = TextAlign.Center
                        )
                    }
                },
                confirmButton = {
                    Button(onClick = { showReconciliationDialog = null }) {
                        Text("Close")
                    }
                }
            )
        }
    }
}
