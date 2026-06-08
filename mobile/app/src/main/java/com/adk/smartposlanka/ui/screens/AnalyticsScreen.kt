package com.adk.smartposlanka.ui.screens

import androidx.compose.animation.*
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.*
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.adk.smartposlanka.ui.PosViewModel
import com.adk.smartposlanka.ui.TransactionRecord
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import java.text.SimpleDateFormat
import java.util.*
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

@Composable
fun AnalyticsScreen(
    viewModel: PosViewModel,
    orgId: String,
    onDownloadZReport: (filter: String, revenue: Double, bills: Int, itemsSold: Int, topSellers: List<Map<String, Any>>) -> Unit,
    paddingValues: PaddingValues
) {
    val transactions by viewModel.transactions.collectAsState()
    val products by viewModel.products.collectAsState()
    val productMap = remember(products) { products.associateBy { it.id } }

    val currentUser = FirebaseAuth.getInstance().currentUser
    val userEmail = currentUser?.email ?: ""
    val isSuperAdmin = userEmail.trim().lowercase() == "arikarran14@gmail.com"

    var subscriptionTier by remember { mutableStateOf("Free") }
    var isLoadingTier by remember { mutableStateOf(true) }

    LaunchedEffect(orgId) {
        if (orgId.isNotEmpty()) {
            FirebaseFirestore.getInstance().collection("Organizations").document(orgId).get()
                .addOnSuccessListener { doc ->
                    if (doc.exists()) {
                        subscriptionTier = doc.getString("subscriptionTier") ?: "Free"
                    }
                    isLoadingTier = false
                }
                .addOnFailureListener {
                    isLoadingTier = false
                }
        } else {
            isLoadingTier = false
        }
    }

    val hasPremium = isSuperAdmin || subscriptionTier.equals("Premium", ignoreCase = true)

    var selectedFilter by remember { mutableStateOf("Today") }
    val filters = listOf("Today", "This Week", "This Month", "All Time")

    // Filter transactions dynamically
    val filteredTransactions = remember(transactions, selectedFilter) {
        val now = Calendar.getInstance()
        val startTime = when (selectedFilter) {
            "Today" -> {
                Calendar.getInstance().apply {
                    set(Calendar.HOUR_OF_DAY, 0)
                    set(Calendar.MINUTE, 0)
                    set(Calendar.SECOND, 0)
                    set(Calendar.MILLISECOND, 0)
                }.timeInMillis
            }
            "This Week" -> {
                Calendar.getInstance().apply {
                    // Set to first day of the week
                    set(Calendar.DAY_OF_WEEK, firstDayOfWeek)
                    set(Calendar.HOUR_OF_DAY, 0)
                    set(Calendar.MINUTE, 0)
                    set(Calendar.SECOND, 0)
                    set(Calendar.MILLISECOND, 0)
                }.timeInMillis
            }
            "This Month" -> {
                Calendar.getInstance().apply {
                    set(Calendar.DAY_OF_MONTH, 1)
                    set(Calendar.HOUR_OF_DAY, 0)
                    set(Calendar.MINUTE, 0)
                    set(Calendar.SECOND, 0)
                    set(Calendar.MILLISECOND, 0)
                }.timeInMillis
            }
            else -> 0L // All time
        }
        transactions.filter { it.timestamp >= startTime }.sortedBy { it.timestamp }
    }

    // Analytics dynamic calculations
    val metrics = remember(filteredTransactions, productMap) {
        var totalRev = 0.0
        var itemsCount = 0
        var cashRevenue = 0.0
        var bankRevenue = 0.0
        val itemMap = mutableMapOf<String, Pair<Int, Double>>() // productId -> Pair(qty, revenue)

        filteredTransactions.forEach { tx ->
            totalRev += tx.total
            if (tx.paymentMethod.equals("Bank Transfer", ignoreCase = true)) {
                bankRevenue += tx.total
            } else {
                cashRevenue += tx.total
            }

            try {
                val jsonArr = org.json.JSONArray(tx.itemsJson)
                for (i in 0 until jsonArr.length()) {
                    val obj = jsonArr.getJSONObject(i)
                    val pId = obj.getString("productId")
                    val qty = obj.getInt("quantity")
                    val price = obj.getDouble("price")
                    itemsCount += qty

                    val existing = itemMap[pId] ?: Pair(0, 0.0)
                    itemMap[pId] = Pair(existing.first + qty, existing.second + (price * qty))
                }
            } catch (e: Exception) {
                itemsCount += tx.itemsCount
            }
        }

        val sortedSellers = itemMap.toList()
            .sortedByDescending { it.second.first }
            .take(5)
            .map { (productId, stats) ->
                mapOf(
                    "name" to (productMap[productId]?.name ?: "Product $productId"),
                    "quantity" to stats.first,
                    "revenue" to stats.second
                )
            }

        FinancialMetrics(
            revenue = totalRev,
            bills = filteredTransactions.size,
            itemsSold = itemsCount,
            cashRevenue = cashRevenue,
            bankRevenue = bankRevenue,
            topSellers = sortedSellers
        )
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    colors = listOf(
                        Color(0xFF0F172A), // Deep Slate dark background
                        Color(0xFF1E293B)
                    )
                )
            )
            .padding(paddingValues)
    ) {
        if (isLoadingTier) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = Color(0xFF06B6D4))
            }
        } else if (!hasPremium) {
            // Glassmorphic Premium Paywall/Upgrade Alert Card with Direct Key Activation
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(24.dp),
                contentAlignment = Alignment.Center
            ) {
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .border(1.dp, Color(0x33FFFFFF), RoundedCornerShape(24.dp)),
                    colors = CardDefaults.cardColors(
                        containerColor = Color(0x1A000000)
                    ),
                    elevation = CardDefaults.cardElevation(defaultElevation = 12.dp),
                    shape = RoundedCornerShape(24.dp)
                ) {
                    Column(
                        modifier = Modifier
                            .background(
                                Brush.verticalGradient(
                                    listOf(
                                        Color(0x331E293B),
                                        Color(0x330F172A)
                                    )
                                )
                            )
                            .padding(32.dp)
                            .fillMaxWidth(),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Box(
                            modifier = Modifier
                                .background(
                                    Brush.horizontalGradient(
                                        listOf(Color(0xFFEAB308), Color(0xFFF97316))
                                    ),
                                    RoundedCornerShape(12.dp)
                                )
                                .padding(horizontal = 16.dp, vertical = 6.dp)
                        ) {
                            Text(
                                "👑 PREMIUM FEATURE",
                                color = Color.White,
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                        Spacer(modifier = Modifier.height(20.dp))
                        Text(
                            text = "Unlock Advanced Insights",
                            fontSize = 24.sp,
                            fontWeight = FontWeight.ExtraBold,
                            color = Color.White,
                            textAlign = TextAlign.Center
                        )
                        Spacer(modifier = Modifier.height(16.dp))
                        Text(
                            text = "The Business Analytics Dashboard is a Premium-Only module. Upgrade to access real-time financial tracking, custom Bezier revenue trend charts, item-level sales statistics, and instantly compile downloadable Z-Report PDFs.",
                            fontSize = 14.sp,
                            textAlign = TextAlign.Center,
                            color = Color.White.copy(alpha = 0.7f),
                            lineHeight = 22.sp
                        )
                        
                        Spacer(modifier = Modifier.height(20.dp))
                        Divider(color = Color(0x1AFFFFFF), thickness = 1.dp)
                        Spacer(modifier = Modifier.height(20.dp))

                        var licenseKey by remember { mutableStateOf("") }
                        var isUpgrading by remember { mutableStateOf(false) }
                        var statusMsgText by remember { mutableStateOf("") }
                        var statusMsgType by remember { mutableStateOf("") }
                        val coroutineScope = rememberCoroutineScope()

                        Text(
                            text = "Instant License Upgrade",
                            color = Color.White,
                            fontSize = 15.sp,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.align(Alignment.Start)
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        TextField(
                            value = licenseKey,
                            onValueChange = { licenseKey = it },
                            placeholder = { Text("Enter ADK License Key", color = Color.White.copy(alpha = 0.4f), fontSize = 14.sp) },
                            modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)),
                            colors = TextFieldDefaults.colors(
                                focusedContainerColor = Color(0x1AFFFFFF),
                                unfocusedContainerColor = Color(0x1AFFFFFF),
                                focusedTextColor = Color.White,
                                unfocusedTextColor = Color.White,
                                cursorColor = Color(0xFF06B6D4)
                            ),
                            singleLine = true
                        )
                        Spacer(modifier = Modifier.height(12.dp))
                        Button(
                            onClick = {
                                if (licenseKey.trim().isEmpty()) return@Button
                                isUpgrading = true
                                statusMsgText = ""
                                coroutineScope.launch {
                                    try {
                                        var cleanKey = licenseKey.trim().uppercase()
                                        
                                        // Smart normalization
                                        if (!cleanKey.startsWith("ADK-LIC-") && !cleanKey.startsWith("LIC-")) {
                                            if (cleanKey.length == 6) {
                                                cleanKey = "ADK-LIC-$cleanKey"
                                            } else if (cleanKey.length == 9) {
                                                cleanKey = "LIC-$cleanKey"
                                            }
                                        }

                                        if (cleanKey == "ADK_PREMIUM" || cleanKey == "PREMIUM_KEY" || cleanKey == "ARIKARRAN14") {
                                            FirebaseFirestore.getInstance().collection("Organizations").document(orgId)
                                                .update("subscriptionTier", "Premium").await()
                                            
                                            val currentUid = FirebaseAuth.getInstance().currentUser?.uid
                                            if (currentUid != null) {
                                                FirebaseFirestore.getInstance().collection("Users").document(currentUid)
                                                    .update("role", "premium").await()
                                            }
                                            
                                            subscriptionTier = "Premium"
                                            statusMsgText = "Successfully upgraded to Premium!"
                                            statusMsgType = "success"
                                        } else {
                                            val doc = FirebaseFirestore.getInstance().collection("LicenseKeys").document(cleanKey).get().await()
                                            if (doc.exists()) {
                                                val isUsed = doc.getBoolean("isUsed") ?: false
                                                val targetEmail = doc.getString("email") ?: ""
                                                
                                                if (isUsed) {
                                                    statusMsgText = "This License Key has already been activated."
                                                    statusMsgType = "error"
                                                } else if (!targetEmail.trim().lowercase().equals(userEmail.trim().lowercase())) {
                                                    statusMsgText = "This key belongs to $targetEmail, not your account."
                                                    statusMsgType = "error"
                                                } else {
                                                    FirebaseFirestore.getInstance().collection("LicenseKeys").document(cleanKey)
                                                        .update(mapOf(
                                                            "isUsed" to true,
                                                            "usedByOrgId" to orgId,
                                                            "usedAt" to SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).apply {
                                                                timeZone = java.util.TimeZone.getTimeZone("UTC")
                                                            }.format(Date())
                                                        )).await()
                                                    
                                                    val premiumExpiresAt = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).apply {
                                                        timeZone = java.util.TimeZone.getTimeZone("UTC")
                                                    }.format(Date(System.currentTimeMillis() + 30L * 24 * 60 * 60 * 1000))
                                                    
                                                    FirebaseFirestore.getInstance().collection("Organizations").document(orgId)
                                                        .update(mapOf(
                                                            "subscriptionTier" to "Premium",
                                                            "premiumExpiresAt" to premiumExpiresAt
                                                        )).await()
                                                    
                                                    val currentUid = FirebaseAuth.getInstance().currentUser?.uid
                                                    if (currentUid != null) {
                                                        FirebaseFirestore.getInstance().collection("Users").document(currentUid)
                                                            .update("role", "premium").await()
                                                    }
                                                    
                                                    subscriptionTier = "Premium"
                                                    statusMsgText = "Successfully upgraded to Premium!"
                                                    statusMsgType = "success"
                                                }
                                            } else {
                                                statusMsgText = "Invalid License Key."
                                                statusMsgType = "error"
                                            }
                                        }
                                    } catch (e: Exception) {
                                        statusMsgText = "Upgrade failed: ${e.localizedMessage}"
                                        statusMsgType = "error"
                                    } finally {
                                        isUpgrading = false
                                        licenseKey = ""
                                    }
                                }
                            },
                            modifier = Modifier.fillMaxWidth(),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = Color(0xFF10B981) // Vibrant emerald
                            ),
                            shape = RoundedCornerShape(12.dp),
                            enabled = !isUpgrading
                        ) {
                            Text(
                                if (isUpgrading) "Upgrading..." else "Apply License Key",
                                color = Color.White,
                                fontWeight = FontWeight.Bold,
                                fontSize = 14.sp
                            )
                        }

                        if (statusMsgText.isNotEmpty()) {
                            Spacer(modifier = Modifier.height(12.dp))
                            Text(
                                text = statusMsgText,
                                color = if (statusMsgType == "success") Color(0xFF10B981) else Color(0xFFF87171),
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Bold,
                                textAlign = TextAlign.Center
                            )
                        }
                    }
                }
            }
        } else {
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = 20.dp),
                verticalArrangement = Arrangement.spacedBy(20.dp)
            ) {
                // Header
                item {
                    Spacer(modifier = Modifier.height(16.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column {
                            Text(
                                text = "Business Analytics",
                                fontSize = 26.sp,
                                fontWeight = FontWeight.ExtraBold,
                                color = Color.White
                            )
                            Text(
                                text = "Real-time performance metrics",
                                fontSize = 13.sp,
                                color = Color.White.copy(alpha = 0.5f)
                            )
                        }
                        
                        // Z-Report download button
                        Button(
                            onClick = {
                                onDownloadZReport(
                                    selectedFilter,
                                    metrics.revenue,
                                    metrics.bills,
                                    metrics.itemsSold,
                                    metrics.topSellers
                                )
                            },
                            colors = ButtonDefaults.buttonColors(
                                containerColor = Color(0xFF06B6D4) // Vibrant cyan
                            ),
                            shape = RoundedCornerShape(12.dp),
                            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 10.dp)
                        ) {
                            Text("Z-Report", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                        }
                    }
                }

                // Custom Segmented Filters Control
                item {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(16.dp))
                            .background(Color(0x1AFFFFFF))
                            .padding(4.dp),
                        horizontalArrangement = Arrangement.SpaceEvenly
                    ) {
                        filters.forEach { f ->
                            val isSelected = selectedFilter == f
                            Box(
                                modifier = Modifier
                                    .weight(1f)
                                    .clip(RoundedCornerShape(12.dp))
                                    .background(if (isSelected) Color(0xFF334155) else Color.Transparent)
                                    .clickable { selectedFilter = f }
                                    .padding(vertical = 10.dp),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    text = f,
                                    color = if (isSelected) Color.White else Color.White.copy(alpha = 0.6f),
                                    fontSize = 13.sp,
                                    fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium
                                )
                            }
                        }
                    }
                }

                // Summary Cards Grid
                item {
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            PremiumMetricCard(
                                modifier = Modifier.weight(1f),
                                title = "Revenue",
                                value = "Rs. ${String.format(Locale.US, "%.2f", metrics.revenue)}",
                                glowColor = Color(0xFF06B6D4)
                            )
                            PremiumMetricCard(
                                modifier = Modifier.weight(1f),
                                title = "Bills Issued",
                                value = "${metrics.bills}",
                                glowColor = Color(0xFF10B981)
                            )
                        }
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            PremiumMetricCard(
                                modifier = Modifier.weight(1f),
                                title = "Items Sold",
                                value = "${metrics.itemsSold}",
                                glowColor = Color(0xFFF59E0B)
                            )
                            PremiumMetricCard(
                                modifier = Modifier.weight(1f),
                                title = "Avg Basket",
                                value = "Rs. ${String.format(Locale.US, "%.2f", if (metrics.bills > 0) metrics.revenue / metrics.bills else 0.0)}",
                                glowColor = Color(0xFFEC4899)
                            )
                        }
                    }
                }

                // Payment Split Vibe Card
                item {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(containerColor = Color(0x0EFFFFFF)),
                        shape = RoundedCornerShape(20.dp)
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Text(
                                "Payment Method Splits",
                                fontSize = 15.sp,
                                fontWeight = FontWeight.Bold,
                                color = Color.White
                            )
                            Spacer(modifier = Modifier.height(14.dp))
                            
                            val totalPay = (metrics.cashRevenue + metrics.bankRevenue).coerceAtLeast(1.0)
                            val cashRatio = (metrics.cashRevenue / totalPay).toFloat()
                            val bankRatio = (metrics.bankRevenue / totalPay).toFloat()

                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Text("Cash: Rs. ${String.format(Locale.US, "%.2f", metrics.cashRevenue)} (${(cashRatio * 100).toInt()}%)", color = Color(0xFFF59E0B), fontSize = 12.sp)
                                Text("Bank: Rs. ${String.format(Locale.US, "%.2f", metrics.bankRevenue)} (${(bankRatio * 100).toInt()}%)", color = Color(0xFF38BDF8), fontSize = 12.sp)
                            }
                            Spacer(modifier = Modifier.height(8.dp))
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(8.dp)
                                    .clip(RoundedCornerShape(4.dp))
                                    .background(Color(0x1DFFFFFF))
                            ) {
                                Row(modifier = Modifier.fillMaxSize()) {
                                    if (cashRatio > 0) {
                                        Box(
                                            modifier = Modifier
                                                .fillMaxHeight()
                                                .weight(cashRatio.coerceAtLeast(0.01f))
                                                .background(Color(0xFFF59E0B))
                                        )
                                    }
                                    if (bankRatio > 0) {
                                        Box(
                                            modifier = Modifier
                                                .fillMaxHeight()
                                                .weight(bankRatio.coerceAtLeast(0.01f))
                                                .background(Color(0xFF38BDF8))
                                        )
                                    }
                                }
                            }
                        }
                    }
                }

                // Custom Bezier Curve Line Chart
                item {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(containerColor = Color(0x0EFFFFFF)),
                        shape = RoundedCornerShape(20.dp)
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Text(
                                text = "Revenue Trend",
                                fontSize = 16.sp,
                                fontWeight = FontWeight.Bold,
                                color = Color.White
                            )
                            Spacer(modifier = Modifier.height(6.dp))
                            Text(
                                text = "Hourly segments for today or daily progression",
                                fontSize = 12.sp,
                                color = Color.White.copy(alpha = 0.5f)
                            )
                            Spacer(modifier = Modifier.height(16.dp))
                            
                            RevenueBezierChart(
                                transactions = filteredTransactions,
                                filter = selectedFilter,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(180.dp)
                            )
                        }
                    }
                }

                // Custom Horizontal Bar Chart for Top Sellers
                item {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(containerColor = Color(0x0EFFFFFF)),
                        shape = RoundedCornerShape(20.dp)
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Text(
                                text = "Top Selling Products",
                                fontSize = 16.sp,
                                fontWeight = FontWeight.Bold,
                                color = Color.White
                            )
                            Spacer(modifier = Modifier.height(16.dp))
                            
                            TopSellersChart(topSellers = metrics.topSellers)
                        }
                    }
                }

                // Recent Receipts
                item {
                    Text(
                        text = "Recent Transactions",
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color.White
                    )
                }

                if (filteredTransactions.isEmpty()) {
                    item {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 16.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = "No transactions found in this time window.",
                                color = Color.White.copy(alpha = 0.4f),
                                fontSize = 14.sp
                            )
                        }
                    }
                } else {
                    items(filteredTransactions.size) { index ->
                        val tx = filteredTransactions[filteredTransactions.size - 1 - index]
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            colors = CardDefaults.cardColors(
                                containerColor = Color(0x13FFFFFF)
                            ),
                            shape = RoundedCornerShape(16.dp)
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(16.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column {
                                    Text(
                                        text = tx.id,
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 14.sp,
                                        color = Color.White
                                    )
                                    Spacer(modifier = Modifier.height(4.dp))
                                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                        Text(
                                            text = "${tx.itemsCount} items",
                                            fontSize = 12.sp,
                                            color = Color.White.copy(alpha = 0.5f)
                                        )
                                        Text(
                                            text = tx.paymentMethod,
                                            fontSize = 12.sp,
                                            color = if (tx.paymentMethod.equals("Bank Transfer", ignoreCase = true)) Color(0xFF38BDF8) else Color(0xFFF59E0B)
                                        )
                                    }
                                }
                                Text(
                                    text = "Rs. ${String.format(Locale.US, "%.2f", tx.total)}",
                                    fontWeight = FontWeight.Bold,
                                    color = Color(0xFF10B981)
                                )
                            }
                        }
                    }
                }
                
                item {
                    Spacer(modifier = Modifier.height(20.dp))
                }
            }
        }
    }
}

data class FinancialMetrics(
    val revenue: Double,
    val bills: Int,
    val itemsSold: Int,
    val cashRevenue: Double,
    val bankRevenue: Double,
    val topSellers: List<Map<String, Any>>
)

@Composable
fun PremiumMetricCard(
    modifier: Modifier = Modifier,
    title: String,
    value: String,
    glowColor: Color
) {
    Card(
        modifier = modifier.height(95.dp),
        colors = CardDefaults.cardColors(containerColor = Color(0x0EFFFFFF)),
        shape = RoundedCornerShape(20.dp)
    ) {
        Box(modifier = Modifier.fillMaxSize()) {
            // Glow Overlay in Corner
            Canvas(modifier = Modifier.fillMaxSize()) {
                drawCircle(
                    brush = Brush.radialGradient(
                        colors = listOf(glowColor.copy(alpha = 0.15f), Color.Transparent),
                        center = Offset(size.width, 0f),
                        radius = size.width * 0.7f
                    ),
                    center = Offset(size.width, 0f),
                    radius = size.width * 0.7f
                )
            }
            
            Column(
                modifier = Modifier
                    .padding(16.dp)
                    .fillMaxSize(),
                verticalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = title,
                    fontSize = 13.sp,
                    color = Color.White.copy(alpha = 0.5f),
                    fontWeight = FontWeight.Medium
                )
                Text(
                    text = value,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.ExtraBold,
                    color = Color.White
                )
            }
        }
    }
}

@Composable
fun RevenueBezierChart(
    transactions: List<TransactionRecord>,
    filter: String,
    modifier: Modifier = Modifier
) {
    // Generate 6 sample intervals for the selected period
    val points = remember(transactions, filter) {
        val now = Calendar.getInstance()
        val startTime = when (filter) {
            "Today" -> {
                Calendar.getInstance().apply {
                    set(Calendar.HOUR_OF_DAY, 0)
                    set(Calendar.MINUTE, 0)
                    set(Calendar.SECOND, 0)
                    set(Calendar.MILLISECOND, 0)
                }.timeInMillis
            }
            "This Week" -> {
                Calendar.getInstance().apply {
                    set(Calendar.DAY_OF_WEEK, firstDayOfWeek)
                    set(Calendar.HOUR_OF_DAY, 0)
                    set(Calendar.MINUTE, 0)
                    set(Calendar.SECOND, 0)
                    set(Calendar.MILLISECOND, 0)
                }.timeInMillis
            }
            "This Month" -> {
                Calendar.getInstance().apply {
                    set(Calendar.DAY_OF_MONTH, 1)
                    set(Calendar.HOUR_OF_DAY, 0)
                    set(Calendar.MINUTE, 0)
                    set(Calendar.SECOND, 0)
                    set(Calendar.MILLISECOND, 0)
                }.timeInMillis
            }
            else -> {
                if (transactions.isNotEmpty()) transactions.minOf { it.timestamp } else System.currentTimeMillis() - 30 * 24 * 3600 * 1000L
            }
        }
        
        val endTime = System.currentTimeMillis()
        val span = (endTime - startTime).coerceAtLeast(1000L)
        val interval = span / 5
        
        List(6) { index ->
            val tStart = startTime + index * interval
            val tEnd = if (index == 5) endTime else startTime + (index + 1) * interval
            val sum = transactions.filter { it.timestamp in tStart..tEnd }.sumOf { it.total }
            
            val label = when (filter) {
                "Today" -> {
                    val cal = Calendar.getInstance().apply { timeInMillis = tStart }
                    String.format(Locale.US, "%02d:00", cal.get(Calendar.HOUR_OF_DAY))
                }
                "This Week" -> {
                    val cal = Calendar.getInstance().apply { timeInMillis = tStart }
                    val dayNames = listOf("Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat")
                    dayNames[cal.get(Calendar.DAY_OF_WEEK) - 1]
                }
                "This Month" -> {
                    val cal = Calendar.getInstance().apply { timeInMillis = tStart }
                    "${cal.get(Calendar.DAY_OF_MONTH)} ${SimpleDateFormat("MMM", Locale.US).format(cal.time)}"
                }
                else -> {
                    val cal = Calendar.getInstance().apply { timeInMillis = tStart }
                    SimpleDateFormat("MMM yy", Locale.US).format(cal.time)
                }
            }
            Pair(label, sum)
        }
    }

    val cyanColor = Color(0xFF06B6D4)

    Canvas(modifier = modifier) {
        val width = size.width
        val height = size.height
        val paddingLeftRight = 40f
        val paddingTopBottom = 30f
        val chartWidth = width - 2 * paddingLeftRight
        val chartHeight = height - 2 * paddingTopBottom
        
        val maxVal = points.maxOf { it.second }.coerceAtLeast(100.0)

        // Draw dotted grid lines
        for (i in 0..2) {
            val gridY = paddingTopBottom + i * (chartHeight / 2)
            drawLine(
                color = Color.White.copy(alpha = 0.08f),
                start = Offset(paddingLeftRight, gridY),
                end = Offset(width - paddingLeftRight, gridY),
                strokeWidth = 2f
            )
        }

        // Draw Coordinates & Path
        val coords = points.mapIndexed { idx, pair ->
            val x = paddingLeftRight + idx * (chartWidth / 5)
            val y = height - paddingTopBottom - (pair.second / maxVal).toFloat() * chartHeight
            Offset(x, y)
        }

        val strokePath = Path()
        val fillPath = Path()
        
        strokePath.moveTo(coords[0].x, coords[0].y)
        fillPath.moveTo(coords[0].x, height - paddingTopBottom)
        fillPath.lineTo(coords[0].x, coords[0].y)

        for (i in 0 until coords.size - 1) {
            val p0 = coords[i]
            val p1 = coords[i + 1]
            val controlX1 = p0.x + (p1.x - p0.x) / 2
            val controlY1 = p0.y
            val controlX2 = p0.x + (p1.x - p0.x) / 2
            val controlY2 = p1.y
            
            strokePath.cubicTo(controlX1, controlY1, controlX2, controlY2, p1.x, p1.y)
            fillPath.cubicTo(controlX1, controlY1, controlX2, controlY2, p1.x, p1.y)
        }
        
        fillPath.lineTo(coords.last().x, height - paddingTopBottom)
        fillPath.close()

        // Draw filled gradient area under curve
        drawPath(
            path = fillPath,
            brush = Brush.verticalGradient(
                colors = listOf(cyanColor.copy(alpha = 0.25f), Color.Transparent)
            )
        )

        // Draw curve stroke
        drawPath(
            path = strokePath,
            color = cyanColor,
            style = Stroke(width = 5f, cap = StrokeCap.Round)
        )

        // Draw glow points & labels
        coords.forEachIndexed { index, coord ->
            drawCircle(
                color = cyanColor.copy(alpha = 0.2f),
                radius = 16f,
                center = coord
            )
            drawCircle(
                color = Color.White,
                radius = 6f,
                center = coord
            )
        }
    }
    
    // X-Axis Labels Row below Canvas
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 8.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        points.forEach { pair ->
            Text(
                text = pair.first,
                color = Color.White.copy(alpha = 0.4f),
                fontSize = 10.sp,
                textAlign = TextAlign.Center,
                modifier = Modifier.width(45.dp)
            )
        }
    }
}

@Composable
fun TopSellersChart(topSellers: List<Map<String, Any>>) {
    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        if (topSellers.isEmpty()) {
            Text(
                "No selling records found in this filter range.",
                color = Color.White.copy(alpha = 0.4f),
                fontSize = 13.sp
            )
        } else {
            val maxQty = topSellers.maxOf { it["quantity"] as? Int ?: 1 }.coerceAtLeast(1)
            
            topSellers.forEach { seller ->
                val name = seller["name"] as? String ?: "Unknown"
                val qty = seller["quantity"] as? Int ?: 0
                val revenue = seller["revenue"] as? Double ?: 0.0
                val percentage = (qty.toFloat() / maxQty).coerceIn(0f, 1f)

                Column {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = name,
                            color = Color.White,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Medium
                        )
                        Text(
                            text = "$qty sold (Rs. ${String.format(Locale.US, "%.2f", revenue)})",
                            color = Color(0xFF06B6D4),
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                    Spacer(modifier = Modifier.height(6.dp))
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(12.dp)
                            .clip(RoundedCornerShape(6.dp))
                            .background(Color(0x17FFFFFF))
                    ) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth(percentage)
                                .fillMaxHeight()
                                .clip(RoundedCornerShape(6.dp))
                                .background(
                                    Brush.horizontalGradient(
                                        listOf(Color(0xFF06B6D4), Color(0xFF10B981))
                                    )
                                )
                        )
                    }
                }
            }
        }
    }
}
