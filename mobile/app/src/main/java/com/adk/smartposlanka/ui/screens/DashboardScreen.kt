package com.adk.smartposlanka.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.List
import androidx.compose.material.icons.filled.ExitToApp
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material.icons.filled.Build
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.draw.clip
import com.adk.smartposlanka.ui.PosViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DashboardScreen(
    viewModel: PosViewModel,
    orgId: String,
    branchId: String,
    onLogout: () -> Unit,
    onGoToPos: () -> Unit,
    onDownloadZReport: (filter: String, revenue: Double, bills: Int, itemsSold: Int, topSellers: List<Map<String, Any>>) -> Unit
) {
    var currentTab by remember { mutableStateOf("home") }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("ADK Hub", fontWeight = FontWeight.Bold) },
                actions = {
                    IconButton(onClick = { /* Notifications */ }) {
                        Icon(Icons.Default.Notifications, contentDescription = "Notifications")
                    }
                    IconButton(onClick = onLogout) {
                        Icon(Icons.Default.ExitToApp, contentDescription = "Logout")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.primary,
                    titleContentColor = MaterialTheme.colorScheme.onPrimary,
                    navigationIconContentColor = MaterialTheme.colorScheme.onPrimary,
                    actionIconContentColor = MaterialTheme.colorScheme.onPrimary
                )
            )
        },
        bottomBar = {
            NavigationBar(
                containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.95f),
                tonalElevation = 8.dp
            ) {
                NavigationBarItem(
                    icon = { Icon(Icons.Default.Home, contentDescription = "Home") },
                    label = { Text("Home") },
                    selected = currentTab == "home",
                    onClick = { currentTab = "home" }
                )
                NavigationBarItem(
                    icon = { Icon(Icons.Default.Build, contentDescription = "Inventory") },
                    label = { Text("Stock") },
                    selected = currentTab == "inventory",
                    onClick = { currentTab = "inventory" }
                )
                NavigationBarItem(
                    icon = { Icon(Icons.Default.List, contentDescription = "Analytics") },
                    label = { Text("Stats") },
                    selected = currentTab == "analytics",
                    onClick = { currentTab = "analytics" }
                )
                NavigationBarItem(
                    icon = { Icon(Icons.Default.Person, contentDescription = "HR") },
                    label = { Text("HR") },
                    selected = currentTab == "hr",
                    onClick = { currentTab = "hr" }
                )
                NavigationBarItem(
                    icon = { Icon(Icons.Default.Settings, contentDescription = "Settings") },
                    label = { Text("Setup") },
                    selected = currentTab == "settings",
                    onClick = { currentTab = "settings" }
                )
            }
        },
        floatingActionButton = {
            if (currentTab == "home") {
                ExtendedFloatingActionButton(
                    onClick = onGoToPos,
                    containerColor = MaterialTheme.colorScheme.secondary,
                    contentColor = MaterialTheme.colorScheme.onSecondary,
                    icon = { Icon(Icons.Default.ShoppingCart, "Start Selling") },
                    text = { Text("Checkout", fontWeight = FontWeight.Bold) },
                    elevation = FloatingActionButtonDefaults.elevation(8.dp)
                )
            }
        }
    ) { paddingValues ->
        when (currentTab) {
            "home" -> DashboardHome(viewModel, paddingValues)
            "inventory" -> InventoryScreen(viewModel, orgId, branchId, paddingValues)
            "analytics" -> AnalyticsScreen(viewModel, orgId, onDownloadZReport, paddingValues)
            "hr" -> HrScreen(viewModel, orgId, branchId, paddingValues)
            "settings" -> SettingsScreen(viewModel, orgId, branchId, onLogout, paddingValues)
        }
    }
}

@Composable
fun DashboardHome(viewModel: PosViewModel, paddingValues: PaddingValues) {
    val transactions by viewModel.transactions.collectAsState()
    val todayTransactions = remember(transactions) {
        val today = java.util.Calendar.getInstance()
        transactions.filter {
            val cal = java.util.Calendar.getInstance().apply { timeInMillis = it.timestamp }
            cal.get(java.util.Calendar.YEAR) == today.get(java.util.Calendar.YEAR) &&
            cal.get(java.util.Calendar.DAY_OF_YEAR) == today.get(java.util.Calendar.DAY_OF_YEAR)
        }
    }
    
    val todayRevenue = remember(todayTransactions) {
        todayTransactions.sumOf { it.total }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    colors = listOf(
                        MaterialTheme.colorScheme.background,
                        MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f)
                    )
                )
            )
            .padding(paddingValues)
    ) {
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            item {
                Text("Today's Overview", fontSize = 20.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onBackground)
            }
            
            item {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    MetricCard(
                        modifier = Modifier.weight(1f),
                        title = "Revenue",
                        value = "Rs. ${String.format(java.util.Locale.US, "%.2f", todayRevenue)}",
                        subtitle = "Today's sales",
                        gradientColors = listOf(androidx.compose.ui.graphics.Color(0xFF6366F1), androidx.compose.ui.graphics.Color(0xFF818CF8))
                    )
                    MetricCard(
                        modifier = Modifier.weight(1f),
                        title = "Orders",
                        value = todayTransactions.size.toString(),
                        subtitle = "Completed bills",
                        gradientColors = listOf(androidx.compose.ui.graphics.Color(0xFF10B981), androidx.compose.ui.graphics.Color(0xFF34D399))
                    )
                }
            }

            item {
                Spacer(modifier = Modifier.height(8.dp))
                Text("Recent Transactions", fontSize = 18.sp, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onBackground)
            }

            if (todayTransactions.isEmpty()) {
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
                            Text("No transactions completed today.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            } else {
                items(todayTransactions.take(5)) { trx ->
                    val formattedTime = remember(trx.timestamp) {
                        java.text.SimpleDateFormat("hh:mm a", java.util.Locale.US).format(java.util.Date(trx.timestamp))
                    }
                    TransactionItem(
                        id = trx.id,
                        amount = "Rs. ${String.format(java.util.Locale.US, "%.2f", trx.total)}",
                        time = formattedTime
                    )
                }
            }
        }
    }
}

@Composable
fun MetricCard(
    modifier: Modifier = Modifier,
    title: String,
    value: String,
    subtitle: String,
    gradientColors: List<androidx.compose.ui.graphics.Color>
) {
    Card(
        modifier = modifier.height(130.dp),
        shape = RoundedCornerShape(24.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 8.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp, androidx.compose.ui.graphics.Color.White.copy(alpha = 0.15f)),
        colors = CardDefaults.cardColors(containerColor = androidx.compose.ui.graphics.Color.Transparent)
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(Brush.linearGradient(colors = gradientColors))
                .padding(18.dp),
            verticalArrangement = Arrangement.SpaceBetween
        ) {
            Text(title, fontSize = 14.sp, fontWeight = FontWeight.Bold, color = androidx.compose.ui.graphics.Color.White.copy(alpha = 0.85f))
            Text(value, fontSize = 24.sp, fontWeight = FontWeight.ExtraBold, color = androidx.compose.ui.graphics.Color.White)
            Text(subtitle, fontSize = 11.sp, color = androidx.compose.ui.graphics.Color.White.copy(alpha = 0.7f))
        }
    }
}

@Composable
fun TransactionItem(id: String, amount: String, time: String) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.6f)),
        shape = RoundedCornerShape(20.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.2f)),
        elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                // Indigo vertical indicator bar
                Box(
                    modifier = Modifier
                        .width(4.dp)
                        .height(36.dp)
                        .clip(RoundedCornerShape(2.dp))
                        .background(MaterialTheme.colorScheme.primary)
                )
                Column {
                    Text(id, fontWeight = FontWeight.Bold, fontSize = 15.sp, color = MaterialTheme.colorScheme.onBackground)
                    Text(time, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f))
                }
            }
            Text(amount, fontWeight = FontWeight.ExtraBold, fontSize = 16.sp, color = MaterialTheme.colorScheme.primary)
        }
    }
}
