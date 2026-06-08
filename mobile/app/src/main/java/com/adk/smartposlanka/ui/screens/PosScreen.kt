package com.adk.smartposlanka.ui.screens

import android.widget.Toast
import androidx.compose.ui.res.painterResource
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items as lazyItems
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Search
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.adk.smartposlanka.ui.PosViewModel
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PosScreen(
    viewModel: PosViewModel,
    orgId: String,
    branchId: String,
    onMenuClick: () -> Unit,
    onPrintReceipt: (receiptId: String, shopName: String, address: String, phone: String, items: List<Map<String, Any>>, subtotal: Double, discount: Double, total: Double, cashier: String, paymentMethod: String) -> Unit
) {
    val products by viewModel.products.collectAsState()
    val cart by viewModel.cart.collectAsState()
    val productDiscounts by viewModel.productDiscounts.collectAsState()
    
    var isScannerOpen by remember { mutableStateOf(false) }
    var isCartOpen by remember { mutableStateOf(false) }
    
    var selectedCategory by remember { mutableStateOf("All") }
    val dynamicCategories = remember(products) {
        val list = products.map { it.category }.distinct().filter { it.isNotEmpty() }
        (listOf("All") + list).distinct()
    }
    val filteredProducts = remember(products, selectedCategory) {
        if (selectedCategory == "All") products else {
            products.filter { it.category.equals(selectedCategory, ignoreCase = true) }
        }
    }

    var showQuickAddDialog by remember { mutableStateOf(false) }
    var quickAddBarcode by remember { mutableStateOf("") }
    
    val tableCarts = remember { mutableStateMapOf<Int, Map<com.adk.smartposlanka.data.local.ProductEntity, Int>>() }
    var selectedTable by remember { mutableStateOf(0) }

    var showPaymentDialog by remember { mutableStateOf(false) }
    var selectedPaymentMethod by remember { mutableStateOf("Cash") }
    var bankAccounts by remember { mutableStateOf<List<Map<String, Any>>>(emptyList()) }
    var selectedBankId by remember { mutableStateOf("") }
    
    val context = LocalContext.current

    var subscriptionTier by remember { mutableStateOf("Free") }
    var shopName by remember { mutableStateOf("ADK Supermart") }
    var address by remember { mutableStateOf("No. 45, Galle Road, Colombo, Sri Lanka") }
    var phone by remember { mutableStateOf("+94 11 234 5678") }
    var billPrintCount by remember { mutableStateOf(0) }
    
    LaunchedEffect(orgId) {
        if (orgId.isNotEmpty()) {
            FirebaseFirestore.getInstance().collection("Organizations").document(orgId)
                .addSnapshotListener { snapshot, e ->
                    if (snapshot != null && snapshot.exists()) {
                        val tierStr = snapshot.getString("subscriptionTier") ?: "Free"
                        val expiresAtStr = snapshot.getString("premiumExpiresAt")
                        
                        if (tierStr.equals("Premium", ignoreCase = true) && expiresAtStr != null) {
                            val sdf = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", java.util.Locale.US).apply {
                                timeZone = java.util.TimeZone.getTimeZone("UTC")
                            }
                            try {
                                val expiryDate = sdf.parse(expiresAtStr)
                                if (expiryDate != null && expiryDate.before(java.util.Date())) {
                                    FirebaseFirestore.getInstance().collection("Organizations").document(orgId)
                                        .update("subscriptionTier", "Free")
                                    subscriptionTier = "Free"
                                } else {
                                    subscriptionTier = "Premium"
                                }
                            } catch (err: Exception) {
                                subscriptionTier = tierStr
                            }
                        } else {
                            subscriptionTier = tierStr
                        }
                        
                        shopName = snapshot.getString("shopName") ?: "ADK Supermart"
                        address = snapshot.getString("address") ?: "No. 45, Galle Road, Colombo, Sri Lanka"
                        phone = snapshot.getString("phone") ?: "+94 11 234 5678"
                        billPrintCount = snapshot.getLong("billPrintCount")?.toInt() ?: 0
                    }
                }
        }
    }

    val isSuperAdmin = FirebaseAuth.getInstance().currentUser?.email?.trim()?.lowercase() == "arikarran14@gmail.com"
    val hasPremium = isSuperAdmin || subscriptionTier.equals("Premium", ignoreCase = true)

    LaunchedEffect(showPaymentDialog) {
        if (showPaymentDialog) {
            FirebaseFirestore.getInstance().collection("BankAccounts").get()
                .addOnSuccessListener { snap ->
                    val list = snap.documents.mapNotNull { doc ->
                        val isEnabled = doc.getBoolean("isEnabled") ?: true
                        if (isEnabled) {
                            mapOf(
                                "id" to doc.id,
                                "bankName" to (doc.getString("bankName") ?: ""),
                                "accountHolder" to (doc.getString("accountHolder") ?: ""),
                                "accountNumber" to (doc.getString("accountNumber") ?: "")
                            )
                        } else null
                    }
                    bankAccounts = list
                    if (list.isNotEmpty()) {
                        selectedBankId = list[0]["id"] as String
                    }
                }
        }
    }

    if (isScannerOpen) {
        BarcodeScannerScreen(
            onBarcodeScanned = { code ->
                isScannerOpen = false
                viewModel.scanBarcode(code, onNotFound = {
                    quickAddBarcode = code
                    showQuickAddDialog = true
                })
            },
            onClose = { isScannerOpen = false }
        )
        return
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("ADK Point of Sale", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onMenuClick) {
                        Icon(Icons.Default.Menu, contentDescription = "Menu")
                    }
                },
                actions = {
                    IconButton(onClick = { isCartOpen = !isCartOpen }) {
                        BadgedBox(
                            badge = {
                                if (cart.isNotEmpty()) {
                                    Badge { Text(cart.values.sum().toString()) }
                                }
                            }
                        ) {
                            Icon(Icons.Default.ShoppingCart, contentDescription = "Cart")
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.primaryContainer,
                    titleContentColor = MaterialTheme.colorScheme.onPrimaryContainer
                )
            )
        },
        floatingActionButton = {
            FloatingActionButton(
                onClick = { 
                    if (!hasPremium) {
                        Toast.makeText(context, "Barcode Scanning is a Premium-Only Feature! Please upgrade in settings.", Toast.LENGTH_LONG).show()
                    } else {
                        isScannerOpen = true 
                    }
                },
                containerColor = MaterialTheme.colorScheme.primary,
                contentColor = MaterialTheme.colorScheme.onPrimary,
                modifier = Modifier.padding(16.dp)
            ) {
                Icon(
                    painter = painterResource(id = com.adk.smartposlanka.R.drawable.ic_camera),
                    contentDescription = "Scan Barcode",
                    modifier = Modifier.size(24.dp)
                )
            }
        }
    ) { paddingValues ->
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
            Column(modifier = Modifier.fillMaxSize()) {
                // Horizontal scrollable table selector
                Text(
                    text = "Active Seating & Table Map",
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.padding(start = 16.dp, top = 8.dp, bottom = 4.dp)
                )

                androidx.compose.foundation.lazy.LazyRow(
                    contentPadding = PaddingValues(horizontal = 16.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.fillMaxWidth().height(48.dp)
                ) {
                    item {
                        val isSelected = selectedTable == 0
                        val cartItems = tableCarts[0] ?: emptyMap()
                        val hasItems = cartItems.isNotEmpty()
                        
                        FilterChip(
                            selected = isSelected,
                            onClick = {
                                tableCarts[selectedTable] = cart
                                selectedTable = 0
                                viewModel.loadCart(tableCarts[0] ?: emptyMap())
                            },
                            label = { 
                                Text(
                                    if (hasItems) "Retail Walk-in (${cartItems.values.sum()})" else "Retail Walk-in"
                                ) 
                            },
                            leadingIcon = {
                                if (hasItems) {
                                    Box(
                                        modifier = Modifier
                                            .size(8.dp)
                                            .clip(RoundedCornerShape(4.dp))
                                            .background(Color(0xFFE53935))
                                    )
                                }
                            },
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = MaterialTheme.colorScheme.primary,
                                selectedLabelColor = MaterialTheme.colorScheme.onPrimary
                            )
                        )
                    }

                    items(12) { index ->
                        val tableId = index + 1
                        val isSelected = selectedTable == tableId
                        val cartItems = tableCarts[tableId] ?: emptyMap()
                        val hasItems = cartItems.isNotEmpty()

                        FilterChip(
                            selected = isSelected,
                            onClick = {
                                tableCarts[selectedTable] = cart
                                selectedTable = tableId
                                viewModel.loadCart(tableCarts[tableId] ?: emptyMap())
                            },
                            label = { 
                                Text(
                                    if (hasItems) "Table $tableId (${cartItems.values.sum()})" else "Table $tableId"
                                ) 
                            },
                            leadingIcon = {
                                if (hasItems) {
                                    Box(
                                        modifier = Modifier
                                            .size(8.dp)
                                            .clip(RoundedCornerShape(4.dp))
                                            .background(Color(0xFFE53935))
                                    )
                                }
                            },
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = MaterialTheme.colorScheme.primary,
                                selectedLabelColor = MaterialTheme.colorScheme.onPrimary
                            )
                        )
                    }
                }

                // Dynamic Categories selector
                Text(
                    text = "Categories Map",
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.padding(start = 16.dp, top = 8.dp, bottom = 4.dp)
                )

                androidx.compose.foundation.lazy.LazyRow(
                    contentPadding = PaddingValues(horizontal = 16.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.fillMaxWidth().height(48.dp)
                ) {
                    lazyItems(dynamicCategories) { cat ->
                        val isSelected = selectedCategory == cat
                        FilterChip(
                            selected = isSelected,
                            onClick = { selectedCategory = cat },
                            label = { Text(cat) },
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = MaterialTheme.colorScheme.primary,
                                selectedLabelColor = MaterialTheme.colorScheme.onPrimary
                            )
                        )
                    }
                }

                // Header details
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 8.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        "Products",
                        fontSize = 20.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onBackground
                    )
                    Text(
                        "Branch: $branchId",
                        fontSize = 14.sp,
                        color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.7f)
                    )
                }

                // Beautiful Product Grid
                LazyVerticalGrid(
                    columns = GridCells.Adaptive(150.dp),
                    contentPadding = PaddingValues(16.dp),
                    horizontalArrangement = Arrangement.spacedBy(16.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp),
                    modifier = Modifier.weight(1f)
                ) {
                    items(filteredProducts) { product ->
                        Card(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(175.dp)
                                .clickable { viewModel.addToCart(product) },
                            border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.4f)),
                            colors = CardDefaults.cardColors(
                                containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.85f)
                            ),
                            elevation = CardDefaults.cardElevation(defaultElevation = 6.dp),
                            shape = RoundedCornerShape(20.dp)
                        ) {
                            Column(
                                modifier = Modifier
                                    .fillMaxSize()
                                    .padding(12.dp),
                                verticalArrangement = Arrangement.SpaceBetween
                            ) {
                                Box(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .height(70.dp)
                                        .clip(RoundedCornerShape(12.dp))
                                        .background(Brush.linearGradient(listOf(MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.35f), MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.05f)))),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Text(
                                        product.name.take(1).uppercase(),
                                        fontSize = 26.sp,
                                        fontWeight = FontWeight.ExtraBold,
                                        color = MaterialTheme.colorScheme.primary
                                    )
                                }
                                
                                Column(modifier = Modifier.padding(top = 8.dp)) {
                                    Text(
                                        text = product.name,
                                        fontSize = 16.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = MaterialTheme.colorScheme.onSurface,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                    Spacer(modifier = Modifier.height(4.dp))
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Text(
                                            text = "Rs. ${String.format(java.util.Locale.US, "%.2f", product.price)}",
                                            color = MaterialTheme.colorScheme.primary,
                                            fontWeight = FontWeight.ExtraBold,
                                            fontSize = 14.sp
                                        )
                                        Surface(
                                            color = if (product.quantity <= 5) Color(0xFFEF4444).copy(alpha = 0.15f) else MaterialTheme.colorScheme.surfaceVariant,
                                            shape = RoundedCornerShape(6.dp),
                                            border = if (product.quantity <= 5) androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFEF4444).copy(alpha = 0.25f)) else null
                                        ) {
                                            Text(
                                                text = "Qty: ${product.quantity}",
                                                fontSize = 11.sp,
                                                fontWeight = FontWeight.Bold,
                                                color = if (product.quantity <= 5) Color(0xFFEF4444) else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f),
                                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                // If cart is open, show in a standalone fullscreen Dialog window
                if (isCartOpen) {
                    Dialog(
                        onDismissRequest = { isCartOpen = false },
                        properties = DialogProperties(usePlatformDefaultWidth = false)
                    ) {
                        Surface(
                            modifier = Modifier.fillMaxSize(),
                            color = MaterialTheme.colorScheme.background
                        ) {
                            Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
                                // Header Row
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        IconButton(onClick = { isCartOpen = false }) {
                                            Icon(
                                                imageVector = Icons.Default.ArrowBack,
                                                contentDescription = "Close Cart",
                                                tint = MaterialTheme.colorScheme.onBackground
                                            )
                                        }
                                        Spacer(modifier = Modifier.width(8.dp))
                                        Text(
                                            text = "Active Shopping Cart",
                                            fontSize = 20.sp,
                                            fontWeight = FontWeight.ExtraBold,
                                            color = MaterialTheme.colorScheme.onBackground
                                        )
                                    }
                                    IconButton(
                                        onClick = {
                                            if (!hasPremium) {
                                                Toast.makeText(context, "Barcode Scanning is a Premium-Only Feature! Please upgrade in settings.", Toast.LENGTH_LONG).show()
                                            } else {
                                                isScannerOpen = true
                                            }
                                        }
                                    ) {
                                        Icon(
                                            painter = painterResource(id = com.adk.smartposlanka.R.drawable.ic_camera),
                                            contentDescription = "Scan Barcode with Camera",
                                            tint = MaterialTheme.colorScheme.primary,
                                            modifier = Modifier.size(24.dp)
                                        )
                                    }
                                }

                                Spacer(modifier = Modifier.height(16.dp))

                                // Search & Add Product Bar inside cart dialog
                                var cartSearchQuery by remember { mutableStateOf("") }
                                val cartSuggestions = remember(cartSearchQuery, products) {
                                    if (cartSearchQuery.isEmpty()) emptyList()
                                    else products.filter {
                                        it.name.contains(cartSearchQuery, ignoreCase = true) ||
                                        it.barcode.contains(cartSearchQuery, ignoreCase = true)
                                    }.take(5)
                                }

                                Box(modifier = Modifier.fillMaxWidth().wrapContentHeight()) {
                                    Column {
                                        OutlinedTextField(
                                            value = cartSearchQuery,
                                            onValueChange = { cartSearchQuery = it },
                                            label = { Text("Search and add products to cart...") },
                                            leadingIcon = { Icon(Icons.Default.Search, contentDescription = "Search") },
                                            trailingIcon = {
                                                if (cartSearchQuery.isNotEmpty()) {
                                                    IconButton(onClick = { cartSearchQuery = "" }) {
                                                        Icon(Icons.Default.Close, contentDescription = "Clear")
                                                    }
                                                }
                                            },
                                            singleLine = true,
                                            modifier = Modifier.fillMaxWidth(),
                                            colors = OutlinedTextFieldDefaults.colors(
                                                focusedBorderColor = MaterialTheme.colorScheme.primary,
                                                unfocusedBorderColor = MaterialTheme.colorScheme.outline
                                            )
                                        )

                                        if (cartSuggestions.isNotEmpty()) {
                                            Spacer(modifier = Modifier.height(4.dp))
                                            Card(
                                                modifier = Modifier
                                                    .fillMaxWidth()
                                                    .wrapContentHeight(),
                                                elevation = CardDefaults.cardElevation(defaultElevation = 8.dp),
                                                colors = CardDefaults.cardColors(
                                                    containerColor = MaterialTheme.colorScheme.surfaceVariant
                                                )
                                            ) {
                                                Column {
                                                    cartSuggestions.forEach { prod ->
                                                        Row(
                                                            modifier = Modifier
                                                                .fillMaxWidth()
                                                                .clickable {
                                                                    viewModel.addToCart(prod)
                                                                    cartSearchQuery = ""
                                                                }
                                                                .padding(12.dp),
                                                            horizontalArrangement = Arrangement.SpaceBetween,
                                                            verticalAlignment = Alignment.CenterVertically
                                                        ) {
                                                            Column(modifier = Modifier.weight(1f)) {
                                                                Text(prod.name, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                                                                Text("Stock: ${prod.quantity} | Barcode: ${prod.barcode}", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f))
                                                            }
                                                            Text("Rs. ${String.format(java.util.Locale.US, "%.2f", prod.price)}", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary, fontSize = 14.sp)
                                                        }
                                                        Box(modifier = Modifier.fillMaxWidth().height(1.dp).background(MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.1f)))
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }

                                Spacer(modifier = Modifier.height(16.dp))

                                if (cart.isEmpty()) {
                                    Box(
                                        modifier = Modifier
                                            .weight(1f)
                                            .fillMaxWidth(),
                                        contentAlignment = Alignment.Center
                                    ) {
                                        Column(
                                            horizontalAlignment = Alignment.CenterHorizontally,
                                            verticalArrangement = Arrangement.Center
                                        ) {
                                            Icon(
                                                imageVector = Icons.Default.ShoppingCart,
                                                contentDescription = "Empty Cart",
                                                tint = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.2f),
                                                modifier = Modifier.size(72.dp)
                                            )
                                            Spacer(modifier = Modifier.height(16.dp))
                                            Text(
                                                text = "Your shopping cart is empty.",
                                                fontSize = 16.sp,
                                                fontWeight = FontWeight.Bold,
                                                color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.6f)
                                            )
                                            Spacer(modifier = Modifier.height(8.dp))
                                            Text(
                                                text = "Select products from the main screen to add them here.",
                                                fontSize = 14.sp,
                                                color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.4f),
                                                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                                                modifier = Modifier.padding(horizontal = 24.dp)
                                            )
                                        }
                                    }
                                } else {
                                    // Scrollable list of cart items
                                    Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
                                        androidx.compose.foundation.lazy.LazyColumn(
                                            verticalArrangement = Arrangement.spacedBy(10.dp),
                                            modifier = Modifier.fillMaxSize()
                                        ) {
                                            lazyItems(cart.toList()) { pair ->
                                                val (item, qty) = pair
                                                var qtyText by remember(qty) { mutableStateOf(qty.toString()) }
                                                
                                                Column(
                                                    modifier = Modifier
                                                        .fillMaxWidth()
                                                        .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f), RoundedCornerShape(16.dp))
                                                        .border(androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.2f)), RoundedCornerShape(16.dp))
                                                        .padding(12.dp)
                                                ) {
                                                    Row(
                                                        modifier = Modifier.fillMaxWidth(),
                                                        horizontalArrangement = Arrangement.SpaceBetween,
                                                        verticalAlignment = Alignment.CenterVertically
                                                    ) {
                                                        Column(modifier = Modifier.weight(1f)) {
                                                            Text(item.name, fontWeight = FontWeight.Bold, fontSize = 16.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                                            Spacer(modifier = Modifier.height(2.dp))
                                                            Text("Rs. ${String.format(java.util.Locale.US, "%.2f", item.price)}", fontSize = 13.sp, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
                                                        }
                                                        Row(verticalAlignment = Alignment.CenterVertically) {
                                                            IconButton(
                                                                onClick = { viewModel.updateCartQty(item, qty - 1) },
                                                                modifier = Modifier.size(32.dp)
                                                            ) {
                                                                Icon(
                                                                    painter = painterResource(id = com.adk.smartposlanka.R.drawable.ic_minus),
                                                                    contentDescription = "Decrease Quantity",
                                                                    tint = MaterialTheme.colorScheme.primary,
                                                                    modifier = Modifier.size(18.dp)
                                                                )
                                                            }
                                                            androidx.compose.foundation.text.BasicTextField(
                                                                value = qtyText,
                                                                onValueChange = { newValue ->
                                                                    val digitsOnly = newValue.filter { it.isDigit() }
                                                                    qtyText = digitsOnly
                                                                    val parsed = digitsOnly.toIntOrNull()
                                                                    if (parsed != null) {
                                                                        if (parsed <= 0) {
                                                                            viewModel.removeFromCart(item)
                                                                        } else if (parsed <= item.quantity) {
                                                                            viewModel.updateCartQty(item, parsed)
                                                                        } else {
                                                                            qtyText = item.quantity.toString()
                                                                            viewModel.updateCartQty(item, item.quantity)
                                                                            Toast.makeText(context, "Only ${item.quantity} items available in stock.", Toast.LENGTH_SHORT).show()
                                                                        }
                                                                    }
                                                                },
                                                                textStyle = androidx.compose.ui.text.TextStyle(
                                                                    textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                                                                    fontWeight = FontWeight.ExtraBold,
                                                                    fontSize = 14.sp,
                                                                    color = MaterialTheme.colorScheme.onSurface
                                                                ),
                                                                singleLine = true,
                                                                keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(
                                                                    keyboardType = androidx.compose.ui.text.input.KeyboardType.Number
                                                                ),
                                                                modifier = Modifier
                                                                    .width(44.dp)
                                                                    .background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(6.dp))
                                                                    .padding(vertical = 6.dp)
                                                            )
                                                            IconButton(
                                                                onClick = { viewModel.updateCartQty(item, qty + 1) },
                                                                modifier = Modifier.size(32.dp)
                                                            ) {
                                                                Icon(
                                                                    imageVector = Icons.Default.Add,
                                                                    contentDescription = "Increase Quantity",
                                                                    tint = MaterialTheme.colorScheme.primary,
                                                                    modifier = Modifier.size(18.dp)
                                                                )
                                                            }
                                                        }
                                                        
                                                        Spacer(modifier = Modifier.width(8.dp))
                                                        IconButton(
                                                            onClick = { viewModel.removeFromCart(item) },
                                                            modifier = Modifier.size(32.dp)
                                                        ) {
                                                            Icon(
                                                                imageVector = Icons.Default.Delete,
                                                                contentDescription = "Remove Item",
                                                                tint = MaterialTheme.colorScheme.error,
                                                                modifier = Modifier.size(20.dp)
                                                            )
                                                        }
                                                    }
                                                    
                                                    Spacer(modifier = Modifier.height(8.dp))
                                                    
                                                    // Discount Row & Total Price
                                                    Row(
                                                        modifier = Modifier.fillMaxWidth(),
                                                        horizontalArrangement = Arrangement.SpaceBetween,
                                                        verticalAlignment = Alignment.CenterVertically
                                                    ) {
                                                        Row(
                                                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                                                            verticalAlignment = Alignment.CenterVertically
                                                        ) {
                                                            Text("Disc (%):", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
                                                            val discPercentage = productDiscounts[item.id] ?: 0.0
                                                            val discTextFormatted = if (discPercentage > 0.0) {
                                                                if (discPercentage % 1.0 == 0.0) discPercentage.toInt().toString() else discPercentage.toString()
                                                            } else ""
                                                            var discText by remember(discPercentage) { mutableStateOf(discTextFormatted) }
                                                            androidx.compose.foundation.text.BasicTextField(
                                                                value = discText,
                                                                onValueChange = { newValue ->
                                                                    val digitsAndDot = newValue.filter { it.isDigit() || it == '.' }
                                                                    discText = digitsAndDot
                                                                    val parsed = digitsAndDot.toDoubleOrNull() ?: 0.0
                                                                    val cleanDiscountPercentage = minOf(maxOf(0.0, parsed), 100.0)
                                                                    viewModel.updateProductDiscount(item.id, cleanDiscountPercentage)
                                                                },
                                                                textStyle = androidx.compose.ui.text.TextStyle(
                                                                    textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                                                                    fontSize = 12.sp,
                                                                    color = MaterialTheme.colorScheme.onSurface,
                                                                    fontWeight = FontWeight.Bold
                                                                ),
                                                                singleLine = true,
                                                                keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(
                                                                    keyboardType = androidx.compose.ui.text.input.KeyboardType.Number
                                                                ),
                                                                modifier = Modifier
                                                                    .width(60.dp)
                                                                    .background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(4.dp))
                                                                    .padding(vertical = 4.dp, horizontal = 6.dp)
                                                            )
                                                            if (discPercentage > 0.0) {
                                                                Text("-Rs. ${String.format(java.util.Locale.US, "%.2f", (discPercentage / 100.0) * (item.price * qty))}", fontSize = 12.sp, color = MaterialTheme.colorScheme.primary, fontStyle = androidx.compose.ui.text.font.FontStyle.Normal, fontWeight = FontWeight.Bold)
                                                            }
                                                        }
                                                        
                                                        val discPercentage = productDiscounts[item.id] ?: 0.0
                                                        val itemDisc = (discPercentage / 100.0) * (item.price * qty)
                                                        val finalItemPrice = (item.price * qty) - itemDisc
                                                        Text("Rs. ${String.format(java.util.Locale.US, "%.2f", finalItemPrice)}", fontWeight = FontWeight.ExtraBold, fontSize = 15.sp, color = MaterialTheme.colorScheme.onSurface)
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }

                                if (cart.isNotEmpty()) {
                                    // 50-bill limit bar for Free trial tier users
                                    if (!hasPremium) {
                                        Spacer(modifier = Modifier.height(12.dp))
                                        Column(
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .background(MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.1f), RoundedCornerShape(12.dp))
                                                .padding(10.dp)
                                        ) {
                                            Row(
                                                modifier = Modifier.fillMaxWidth(),
                                                horizontalArrangement = Arrangement.SpaceBetween,
                                                verticalAlignment = Alignment.CenterVertically
                                            ) {
                                                Text("Free Bill Usage Status", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                                Text("$billPrintCount / 50 Bills Printed", fontSize = 12.sp, fontWeight = FontWeight.ExtraBold, color = if (billPrintCount >= 45) Color(0xFFEF4444) else MaterialTheme.colorScheme.primary)
                                            }
                                            Spacer(modifier = Modifier.height(6.dp))
                                            LinearProgressIndicator(
                                                progress = (billPrintCount.toFloat() / 50f).coerceIn(0f, 1f),
                                                modifier = Modifier.fillMaxWidth().height(6.dp).clip(RoundedCornerShape(3.dp)),
                                                color = if (billPrintCount >= 45) Color(0xFFEF4444) else if (billPrintCount >= 35) Color(0xFFF59E0B) else MaterialTheme.colorScheme.primary,
                                                trackColor = MaterialTheme.colorScheme.surfaceVariant
                                            )
                                            if (billPrintCount >= 50) {
                                                Spacer(modifier = Modifier.height(4.dp))
                                                Text("Billing limit reached! Upgrade in settings to checkout.", fontSize = 11.sp, color = Color(0xFFEF4444), fontWeight = FontWeight.Bold)
                                            }
                                        }
                                    }

                                    Spacer(modifier = Modifier.height(14.dp))
                                    val limitReached = !hasPremium && billPrintCount >= 50
                                    val cartTotalBeforeDiscount = cart.toList().sumOf { (item, qty) -> item.price * qty }
                                    val totalProductDiscounts = cart.toList().sumOf { (item, qty) -> ((productDiscounts[item.id] ?: 0.0) / 100.0) * (item.price * qty) }
                                    val cartTotal = maxOf(0.0, cartTotalBeforeDiscount - totalProductDiscounts)
                                    
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        OutlinedButton(
                                            onClick = {
                                                tableCarts.remove(selectedTable)
                                                viewModel.loadCart(emptyMap())
                                                isCartOpen = false
                                                Toast.makeText(context, "Bill placed on hold", Toast.LENGTH_SHORT).show()
                                            },
                                            modifier = Modifier.weight(1f).height(48.dp),
                                            shape = RoundedCornerShape(12.dp)
                                        ) {
                                            Text(
                                                text = "Hold Bill",
                                                fontWeight = FontWeight.Bold,
                                                fontSize = 15.sp
                                            )
                                        }

                                        Button(
                                            onClick = { showPaymentDialog = true },
                                            modifier = Modifier.weight(1.5f).height(48.dp),
                                            shape = RoundedCornerShape(12.dp),
                                            enabled = !limitReached,
                                            colors = ButtonDefaults.buttonColors(
                                                containerColor = if (limitReached) MaterialTheme.colorScheme.errorContainer else MaterialTheme.colorScheme.primary
                                            )
                                        ) {
                                            Text(
                                                text = if (limitReached) "Limit Reached" else "Pay: Rs. ${String.format(java.util.Locale.US, "%.2f", cartTotal)}",
                                                fontSize = 15.sp,
                                                fontWeight = FontWeight.Bold,
                                                maxLines = 1,
                                                overflow = TextOverflow.Ellipsis
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

        if (showPaymentDialog) {
            AlertDialog(
                onDismissRequest = { showPaymentDialog = false },
                title = { Text("Complete Invoice Payment", fontWeight = FontWeight.Bold) },
                text = {
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text("Select Payment Method", fontWeight = FontWeight.SemiBold)
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            RadioButton(
                                selected = selectedPaymentMethod == "Cash",
                                onClick = { selectedPaymentMethod = "Cash" }
                            )
                            Text("Cash Payment", modifier = Modifier.clickable { selectedPaymentMethod = "Cash" })
                            Spacer(modifier = Modifier.width(16.dp))
                            RadioButton(
                                selected = selectedPaymentMethod == "Bank Transfer",
                                onClick = { selectedPaymentMethod = "Bank Transfer" }
                            )
                            Text("Bank Transfer", modifier = Modifier.clickable { selectedPaymentMethod = "Bank Transfer" })
                        }

                        if (selectedPaymentMethod == "Bank Transfer") {
                            Spacer(modifier = Modifier.height(8.dp))
                            Text("Route to Admin Bank Account", fontWeight = FontWeight.SemiBold)
                            if (bankAccounts.isEmpty()) {
                                Text("No bank accounts configured by Admin!", color = MaterialTheme.colorScheme.error, fontWeight = FontWeight.Bold)
                            } else {
                                var expanded by remember { mutableStateOf(false) }
                                val selectedBankName = bankAccounts.firstOrNull { it["id"] == selectedBankId }?.let { 
                                    "${it["bankName"]} - ${it["accountNumber"]}"
                                } ?: "Select Bank Account"
                                
                                Box {
                                    OutlinedButton(onClick = { expanded = true }, modifier = Modifier.fillMaxWidth()) {
                                        Text(selectedBankName)
                                    }
                                    DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                                        bankAccounts.forEach { bank ->
                                            val bankId = bank["id"] as String
                                            DropdownMenuItem(
                                                text = { Text("${bank["bankName"]} - ${bank["accountNumber"]} (${bank["accountHolder"]})") },
                                                onClick = {
                                                    selectedBankId = bankId
                                                    expanded = false
                                                }
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }
                },
                confirmButton = {
                    Button(
                        onClick = {
                            viewModel.checkout(
                                orgId = orgId,
                                branchId = branchId,
                                selectedBankId = if (selectedPaymentMethod == "Bank Transfer") selectedBankId else null,
                                onSuccess = { receiptId, items, subtotal, discount, total ->
                                    tableCarts.remove(selectedTable)
                                    val cashierEmail = FirebaseAuth.getInstance().currentUser?.email ?: "cashier@adk.com"
                                    val mappedItems = items.map { (prod, qty) ->
                                        mapOf(
                                            "name" to prod.name,
                                            "price" to prod.price,
                                            "quantity" to qty,
                                             "discount" to (((productDiscounts[prod.id] ?: 0.0) / 100.0) * (prod.price * qty))
                                        )
                                    }
                                    onPrintReceipt(
                                        receiptId,
                                        shopName,
                                        address,
                                        phone,
                                        mappedItems,
                                        subtotal,
                                        discount,
                                        total,
                                        cashierEmail,
                                        selectedPaymentMethod
                                    )
                                    showPaymentDialog = false
                                    isCartOpen = false
                                },
                                onError = {
                                    Toast.makeText(context, "Error: $it", Toast.LENGTH_LONG).show()
                                }
                            )
                        },
                        enabled = selectedPaymentMethod != "Bank Transfer" || bankAccounts.isNotEmpty()
                    ) {
                        Text("Confirm Pay")
                    }
                },
                dismissButton = {
                    OutlinedButton(onClick = { showPaymentDialog = false }) {
                        Text("Cancel")
                    }
                }
            )
        }

        if (showQuickAddDialog) {
            var qaName by remember { mutableStateOf("") }
            var qaCategory by remember { mutableStateOf("General") }
            var qaPrice by remember { mutableStateOf("") }
            var qaQty by remember { mutableStateOf("1") }
            
            AlertDialog(
                onDismissRequest = { showQuickAddDialog = false },
                title = { Text("Quick Add Unrecognized Barcode", fontWeight = FontWeight.Bold) },
                text = {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("Barcode: $quickAddBarcode", fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.primary)
                        Spacer(modifier = Modifier.height(4.dp))
                        OutlinedTextField(
                            value = qaName,
                            onValueChange = { qaName = it },
                            label = { Text("Product Name") },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth()
                        )
                        OutlinedTextField(
                            value = qaPrice,
                            onValueChange = { qaPrice = it },
                            label = { Text("Price (Rs.)") },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth()
                        )
                        OutlinedTextField(
                            value = qaQty,
                            onValueChange = { qaQty = it },
                            label = { Text("Stock Quantity") },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth()
                        )
                        OutlinedTextField(
                            value = qaCategory,
                            onValueChange = { qaCategory = it },
                            label = { Text("Category") },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth()
                        )
                    }
                },
                confirmButton = {
                    Button(
                        onClick = {
                            val priceParsed = qaPrice.toDoubleOrNull()
                            val qtyParsed = qaQty.toIntOrNull()
                            if (qaName.isEmpty() || priceParsed == null || qtyParsed == null) {
                                Toast.makeText(context, "Please enter valid fields.", Toast.LENGTH_SHORT).show()
                                return@Button
                            }
                            val newProd = com.adk.smartposlanka.data.local.ProductEntity(
                                id = java.util.UUID.randomUUID().toString(),
                                name = qaName,
                                price = priceParsed,
                                quantity = qtyParsed,
                                barcode = quickAddBarcode,
                                category = qaCategory
                            )
                            viewModel.addProduct(orgId, branchId, newProd)
                            viewModel.addToCart(newProd)
                            showQuickAddDialog = false
                            Toast.makeText(context, "${qaName} added to stock and cart!", Toast.LENGTH_SHORT).show()
                        }
                    ) {
                        Text("Add & Sync")
                    }
                },
                dismissButton = {
                    OutlinedButton(onClick = { showQuickAddDialog = false }) {
                        Text("Cancel")
                    }
                }
            )
        }
    }
}
