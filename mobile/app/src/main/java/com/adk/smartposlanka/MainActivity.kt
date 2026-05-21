package com.adk.smartposlanka

import android.content.Context
import android.content.SharedPreferences
import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.room.Room
import com.adk.smartposlanka.data.local.PosDatabase
import com.adk.smartposlanka.data.local.ProductDao
import com.adk.smartposlanka.data.local.ProductEntity
import com.adk.smartposlanka.data.remote.SyncManager
import com.adk.smartposlanka.ui.PosViewModel
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.util.UUID

class MainActivity : ComponentActivity() {
    private lateinit var sharedPreferences: SharedPreferences

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        sharedPreferences = getSharedPreferences("ADK_POS_PREFS", Context.MODE_PRIVATE)
        val firestore = FirebaseFirestore.getInstance()

        val db = Room.databaseBuilder(
            applicationContext,
            PosDatabase::class.java,
            "adk_pos_db"
        ).fallbackToDestructiveMigration().build()

        val productDao = db.productDao()
        val syncManager = SyncManager(firestore, productDao)

        val viewModelFactory = object : ViewModelProvider.Factory {
            override fun <T : ViewModel> create(modelClass: Class<T>): T {
                if (modelClass.isAssignableFrom(PosViewModel::class.java)) {
                    @Suppress("UNCHECKED_CAST")
                    return PosViewModel(productDao, syncManager) as T
                }
                throw IllegalArgumentException("Unknown ViewModel class")
            }
        }

        val viewModel = ViewModelProvider(this, viewModelFactory)[PosViewModel::class.java]

        setContent {
            // Apply beautiful clean light-mode colors consistent with screenshots
            MaterialTheme(
                colorScheme = lightColorScheme(
                    primary = Color(0xFF1976D2), // Standard Blue from screenshots
                    secondary = Color(0xFF4CAF50),
                    background = Color(0xFFF8FAFC),
                    surface = Color.White
                )
            ) {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    AppNavigation(viewModel, sharedPreferences)
                }
            }
        }
    }
}

@Composable
fun AppNavigation(viewModel: PosViewModel, prefs: SharedPreferences) {
    var isLoggedIn by remember { mutableStateOf(prefs.getBoolean("is_logged_in", false)) }
    var currentScreen by remember { mutableStateOf("pos") } // pos, inventory, history, analytics, account
    
    // Track orgId and branchId as standard reactive Compose state variables so changes trigger recomposition
    var currentOrgId by remember { mutableStateOf(prefs.getString("org_id", "") ?: "") }
    var currentBranchId by remember { mutableStateOf(prefs.getString("branch_id", "Main") ?: "Main") }

    // Auth screens view
    var authView by remember { mutableStateOf("login") }

    // Dynamic background self-healing config resolver
    LaunchedEffect(isLoggedIn) {
        if (isLoggedIn) {
            val currentUser = FirebaseAuth.getInstance().currentUser
            if (currentUser != null) {
                FirebaseFirestore.getInstance().collection("Users").document(currentUser.uid).get()
                    .addOnSuccessListener { doc ->
                        if (doc.exists()) {
                            val orgId = doc.getString("organizationId") ?: ""
                            val branchId = doc.getString("branchId") ?: "Main"
                            if (orgId.isNotEmpty() && orgId != currentOrgId) {
                                prefs.edit()
                                    .putString("org_id", orgId)
                                    .putString("branch_id", branchId)
                                    .apply()
                                currentOrgId = orgId
                                currentBranchId = branchId
                            }
                        }
                    }
            }
        }
    }

    if (!isLoggedIn) {
        when (authView) {
            "login" -> LoginScreen(
                onLoginSuccess = { email, orgId, branchId ->
                    prefs.edit()
                        .putBoolean("is_logged_in", true)
                        .putString("logged_in_email", email)
                        .putString("org_id", orgId)
                        .putString("branch_id", branchId)
                        .apply()
                    currentOrgId = orgId
                    currentBranchId = branchId
                    isLoggedIn = true
                },
                onGoToRegister = { authView = "register" }
            )
            "register" -> RegisterScreen(
                onRegisterSuccess = { email, orgId, branchId ->
                    prefs.edit()
                        .putBoolean("is_logged_in", true)
                        .putString("logged_in_email", email)
                        .putString("org_id", orgId)
                        .putString("branch_id", branchId)
                        .apply()
                    currentOrgId = orgId
                    currentBranchId = branchId
                    isLoggedIn = true
                },
                onGoToLogin = { authView = "login" }
            )
        }
    } else {
        MainLayout(
            viewModel = viewModel,
            prefs = prefs,
            orgId = currentOrgId,
            branchId = currentBranchId,
            currentScreen = currentScreen,
            onScreenSelected = { currentScreen = it },
            onLogout = {
                FirebaseAuth.getInstance().signOut()
                prefs.edit().putBoolean("is_logged_in", false).apply()
                currentOrgId = ""
                currentBranchId = "Main"
                isLoggedIn = false
            }
        )
    }
}

// ----------------------------------------------------
// AUTH SCREENS (AUTHENTIC FIREBASE INTEGRATION)
// ----------------------------------------------------

@Composable
fun LoginScreen(
    onLoginSuccess: (email: String, orgId: String, branchId: String) -> Unit,
    onGoToRegister: () -> Unit
) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var errorMessage by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFFF1F5F9))
            .padding(24.dp),
        contentAlignment = Alignment.Center
    ) {
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = Color.White),
            elevation = CardDefaults.cardElevation(defaultElevation = 8.dp)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(
                    text = "ADK SmartPOS",
                    fontSize = 24.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFF1E293B)
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = "Sign in to your mobile terminal",
                    fontSize = 14.sp,
                    color = Color(0xFF64748B)
                )

                Spacer(modifier = Modifier.height(24.dp))

                if (errorMessage.isNotEmpty()) {
                    Text(
                        text = errorMessage,
                        color = Color.Red,
                        fontSize = 13.sp,
                        modifier = Modifier.padding(bottom = 12.dp),
                        textAlign = TextAlign.Center
                    )
                }

                OutlinedTextField(
                    value = email,
                    onValueChange = { email = it },
                    label = { Text("Email Address") },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    enabled = !loading
                )
                Spacer(modifier = Modifier.height(12.dp))
                OutlinedTextField(
                    value = password,
                    onValueChange = { password = it },
                    label = { Text("Password") },
                    visualTransformation = PasswordVisualTransformation(),
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    enabled = !loading
                )

                Spacer(modifier = Modifier.height(24.dp))

                Button(
                    onClick = {
                        if (email.isNotEmpty() && password.length >= 6) {
                            loading = true
                            errorMessage = ""
                            FirebaseAuth.getInstance().signInWithEmailAndPassword(email.trim(), password)
                                .addOnSuccessListener { authResult ->
                                    val user = authResult.user
                                    if (user != null) {
                                        FirebaseFirestore.getInstance().collection("Users").document(user.uid).get()
                                            .addOnSuccessListener { doc ->
                                                if (doc.exists()) {
                                                    val orgId = doc.getString("organizationId") ?: ""
                                                    val branchId = doc.getString("branchId") ?: "Main"
                                                    onLoginSuccess(email.trim(), orgId, branchId)
                                                } else {
                                                    // Self-Healing Auto-Registration for user profiles missing from Firestore
                                                    val newOrgId = java.util.UUID.randomUUID().toString()
                                                    val db = FirebaseFirestore.getInstance()
                                                    
                                                    val orgData = hashMapOf(
                                                        "shopName" to "ADK Supermart",
                                                        "subscriptionTier" to "Free",
                                                        "createdAt" to java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US).format(java.util.Date())
                                                    )
                                                    
                                                    val userData = hashMapOf(
                                                        "fullName" to "Store Owner",
                                                        "email" to email.trim(),
                                                        "role" to "Owner",
                                                        "organizationId" to newOrgId,
                                                        "branchId" to "Main"
                                                    )
                                                    
                                                    db.collection("Organizations").document(newOrgId).set(orgData)
                                                        .addOnSuccessListener {
                                                            db.collection("Users").document(user.uid).set(userData)
                                                                .addOnSuccessListener {
                                                                    onLoginSuccess(email.trim(), newOrgId, "Main")
                                                                }
                                                                .addOnFailureListener { e ->
                                                                    errorMessage = "Profile creation failed: ${e.localizedMessage}"
                                                                    loading = false
                                                                }
                                                        }
                                                        .addOnFailureListener { e ->
                                                            errorMessage = "Org creation failed: ${e.localizedMessage}"
                                                            loading = false
                                                        }
                                                }
                                            }
                                            .addOnFailureListener { e ->
                                                errorMessage = "Profile fetch failed: ${e.localizedMessage}"
                                                loading = false
                                            }
                                    }
                                }
                                .addOnFailureListener { e ->
                                    errorMessage = "Login failed: ${e.localizedMessage}"
                                    loading = false
                                }
                        } else {
                            errorMessage = "Invalid email or password (min 6 characters)"
                        }
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp),
                    shape = RoundedCornerShape(12.dp),
                    enabled = !loading
                ) {
                    Text(if (loading) "SIGNING IN..." else "SIGN IN", fontWeight = FontWeight.Bold)
                }

                Spacer(modifier = Modifier.height(16.dp))

                Text(
                    text = "Don't have an account? Register your shop.",
                    color = Color(0xFF1976D2),
                    fontSize = 13.sp,
                    modifier = Modifier
                        .clickable(enabled = !loading) { onGoToRegister() }
                        .padding(8.dp)
                )
            }
        }
    }
}

@Composable
fun RegisterScreen(
    onRegisterSuccess: (email: String, orgId: String, branchId: String) -> Unit,
    onGoToLogin: () -> Unit
) {
    var shopName by remember { mutableStateOf("") }
    var ownerName by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var errorMsg by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFFF1F5F9))
            .padding(24.dp),
        contentAlignment = Alignment.Center
    ) {
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = Color.White),
            elevation = CardDefaults.cardElevation(defaultElevation = 8.dp)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(
                    text = "Register Shop",
                    fontSize = 22.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFF1E293B)
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = "Set up your ADK POS account",
                    fontSize = 14.sp,
                    color = Color(0xFF64748B)
                )

                Spacer(modifier = Modifier.height(20.dp))

                if (errorMsg.isNotEmpty()) {
                    Text(
                        text = errorMsg,
                        color = Color.Red,
                        fontSize = 13.sp,
                        modifier = Modifier.padding(bottom = 12.dp),
                        textAlign = TextAlign.Center
                    )
                }

                OutlinedTextField(
                    value = shopName,
                    onValueChange = { shopName = it },
                    label = { Text("Shop Name") },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(10.dp),
                    enabled = !loading
                )
                Spacer(modifier = Modifier.height(10.dp))
                OutlinedTextField(
                    value = ownerName,
                    onValueChange = { ownerName = it },
                    label = { Text("Owner Full Name") },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(10.dp),
                    enabled = !loading
                )
                Spacer(modifier = Modifier.height(10.dp))
                OutlinedTextField(
                    value = email,
                    onValueChange = { email = it },
                    label = { Text("Email Address") },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(10.dp),
                    enabled = !loading
                )
                Spacer(modifier = Modifier.height(10.dp))
                OutlinedTextField(
                    value = password,
                    onValueChange = { password = it },
                    label = { Text("Password") },
                    visualTransformation = PasswordVisualTransformation(),
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(10.dp),
                    enabled = !loading
                )

                Spacer(modifier = Modifier.height(20.dp))

                Button(
                    onClick = {
                        if (shopName.isNotEmpty() && ownerName.isNotEmpty() && email.isNotEmpty() && password.length >= 6) {
                            loading = true
                            errorMsg = ""
                            FirebaseAuth.getInstance().createUserWithEmailAndPassword(email.trim(), password)
                                .addOnSuccessListener { authResult ->
                                    val user = authResult.user
                                    if (user != null) {
                                        val orgId = UUID.randomUUID().toString()
                                        
                                        // Save Organization to Firestore
                                        val orgData = hashMapOf(
                                            "shopName" to shopName,
                                            "subscriptionTier" to "Free",
                                            "createdAt" to java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'").format(java.util.Date())
                                        )
                                        
                                        FirebaseFirestore.getInstance().collection("Organizations").document(orgId)
                                            .set(orgData)
                                            .addOnSuccessListener {
                                                // Save User Profile to Firestore
                                                val userData = hashMapOf(
                                                    "fullName" to ownerName,
                                                    "email" to email.trim(),
                                                    "role" to "Owner",
                                                    "organizationId" to orgId,
                                                    "branchId" to "Main"
                                                )
                                                
                                                FirebaseFirestore.getInstance().collection("Users").document(user.uid)
                                                    .set(userData)
                                                    .addOnSuccessListener {
                                                        onRegisterSuccess(email.trim(), orgId, "Main")
                                                    }
                                                    .addOnFailureListener { e ->
                                                        errorMsg = "User profile creation failed: ${e.localizedMessage}"
                                                        loading = false
                                                    }
                                            }
                                            .addOnFailureListener { e ->
                                                errorMsg = "Organization creation failed: ${e.localizedMessage}"
                                                loading = false
                                            }
                                    }
                                }
                                .addOnFailureListener { e ->
                                    errorMsg = "Registration failed: ${e.localizedMessage}"
                                    loading = false
                                }
                        } else {
                            errorMsg = "Please fill in all details (password min 6 chars)."
                        }
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp),
                    shape = RoundedCornerShape(10.dp),
                    enabled = !loading
                ) {
                    Text(if (loading) "REGISTERING..." else "REGISTER SHOP", fontWeight = FontWeight.Bold)
                }

                Spacer(modifier = Modifier.height(12.dp))

                Text(
                    text = "Already have an account? Sign in.",
                    color = Color(0xFF1976D2),
                    fontSize = 13.sp,
                    modifier = Modifier
                        .clickable(enabled = !loading) { onGoToLogin() }
                        .padding(8.dp)
                )
            }
        }
    }
}

// ----------------------------------------------------
// MAIN CONTAINER & BOTTOM NAVIGATION SHELL
// ----------------------------------------------------

@Composable
fun MainLayout(
    viewModel: PosViewModel,
    prefs: SharedPreferences,
    orgId: String,
    branchId: String,
    currentScreen: String,
    onScreenSelected: (String) -> Unit,
    onLogout: () -> Unit
) {
    val coroutineScope = rememberCoroutineScope()
    var showCustomToast by remember { mutableStateOf(false) }

    // Real Firestore background sync launches immediately with real tracked orgId Compose state!
    LaunchedEffect(orgId, branchId) {
        if (orgId.isNotEmpty()) {
            viewModel.startRealtimeSync(orgId, branchId)
        }
    }

    Scaffold(
        topBar = {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color.White)
                    .padding(horizontal = 16.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = "ADK SmartPOS",
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFF334155)
                )

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    // 1. Force Sync Button
                    val syncStatus by viewModel.syncStatus.collectAsState()
                    val context = androidx.compose.ui.platform.LocalContext.current
                    Row(
                        modifier = Modifier
                            .clickable {
                                if (orgId.isNotEmpty()) {
                                    viewModel.syncProducts(orgId, branchId)
                                    Toast.makeText(context, "Cloud Sync triggered!", Toast.LENGTH_SHORT).show()
                                } else {
                                    Toast.makeText(context, "No active organization ID.", Toast.LENGTH_SHORT).show()
                                }
                            }
                            .padding(4.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            imageVector = Icons.Default.Refresh,
                            contentDescription = "Force Cloud Sync",
                            tint = Color(0xFF10B981), // Emerald Green
                            modifier = Modifier.size(20.dp)
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(
                            text = "SYNC",
                            color = Color(0xFF10B981),
                            fontWeight = FontWeight.Bold,
                            fontSize = 13.sp
                        )
                    }

                    // 2. Logout Button
                    Row(
                        modifier = Modifier
                            .clickable { onLogout() }
                            .padding(4.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            imageVector = Icons.Default.ExitToApp,
                            contentDescription = "Logout",
                            tint = Color(0xFFEF4444), // Crimson Red
                            modifier = Modifier.size(20.dp)
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(
                            text = "LOGOUT",
                            color = Color(0xFFEF4444),
                            fontWeight = FontWeight.Bold,
                            fontSize = 13.sp
                        )
                    }
                }
            }
        },
        bottomBar = {
            Column {
                // Bottom Navigation Bar with Purple active indicators matching screenshot
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color.White)
                        .padding(vertical = 8.dp)
                        .border(1.dp, Color(0xFFE2E8F0)),
                    horizontalArrangement = Arrangement.SpaceAround,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    val tabs = listOf(
                        NavigationTab("pos", "POS", Icons.Default.Edit),
                        NavigationTab("inventory", "Inventory", Icons.Default.DateRange),
                        NavigationTab("history", "Billing", Icons.Default.List),
                        NavigationTab("analytics", "Analytics", Icons.Default.Star),
                        NavigationTab("account", "Account", Icons.Default.Build)
                    )

                    tabs.forEach { tab ->
                        val isActive = currentScreen == tab.id
                        Column(
                            modifier = Modifier
                                .clickable { onScreenSelected(tab.id) }
                                .padding(horizontal = 8.dp),
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            // Purple Active capsule indicator background matching screen exact style
                            Box(
                                modifier = Modifier
                                    .background(
                                        color = if (isActive) Color(0xFFE8DEF8) else Color.Transparent,
                                        shape = RoundedCornerShape(50)
                                    )
                                    .padding(horizontal = 20.dp, vertical = 4.dp),
                                contentAlignment = Alignment.Center
                            ) {
                                Icon(
                                    imageVector = tab.icon,
                                    contentDescription = tab.label,
                                    tint = if (isActive) Color(0xFF1D1B20) else Color(0xFF64748B),
                                    modifier = Modifier.size(24.dp)
                                )
                            }
                            Spacer(modifier = Modifier.height(2.dp))
                            Text(
                                text = tab.label,
                                fontSize = 11.sp,
                                fontWeight = if (isActive) FontWeight.Bold else FontWeight.Normal,
                                color = if (isActive) Color(0xFF1D1B20) else Color(0xFF64748B)
                            )
                        }
                    }
                }

                // Black footer bar: "POWERED BY ADK SOFTWARE SOLUTIONS"
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color(0xFF0F172A))
                        .padding(vertical = 8.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = "POWERED BY ADK SOFTWARE SOLUTIONS",
                        color = Color.White,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        textAlign = TextAlign.Center
                    )
                }
            }
        }
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            when (currentScreen) {
                "pos" -> PosTabScreen(
                    viewModel = viewModel,
                    orgId = orgId,
                    branchId = branchId,
                    onCheckoutTriggered = {
                        coroutineScope.launch {
                            showCustomToast = true
                            delay(3000)
                            showCustomToast = false
                        }
                    }
                )
                "inventory" -> InventoryTabScreen(viewModel = viewModel, orgId = orgId, branchId = branchId)
                "history" -> TransactionsTabScreen(viewModel = viewModel)
                "analytics" -> AnalyticsTabScreen(viewModel = viewModel)
                "account" -> AccountTabScreen(
                    viewModel = viewModel,
                    orgId = orgId,
                    branchId = branchId,
                    prefs = prefs,
                    onLogout = onLogout
                )
            }

            // Beautiful Rounded Capsule Custom Toast matching the screenshot overlay
            if (showCustomToast) {
                Box(
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .padding(bottom = 80.dp)
                        .background(Color(0xFF334155), RoundedCornerShape(24.dp))
                        .padding(horizontal = 16.dp, vertical = 10.dp)
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .size(20.dp)
                                .background(Color(0xFF1976D2), CircleShape),
                            contentAlignment = Alignment.Center
                        ) {
                            Text("A", color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                        }
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = "ADK Cloud Sync Complete!",
                            color = Color.White,
                            fontSize = 13.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                    }
                }
            }
        }
    }
}

data class NavigationTab(
    val id: String,
    val label: String,
    val icon: ImageVector
)

// ----------------------------------------------------
// TAB 1: POS SCREEN
// ----------------------------------------------------

@Composable
fun PosTabScreen(
    viewModel: PosViewModel,
    orgId: String,
    branchId: String,
    onCheckoutTriggered: () -> Unit
) {
    var searchQuery by remember { mutableStateOf("") }
    var showDiscountDialog by remember { mutableStateOf(false) }
    var discountInput by remember { mutableStateOf("") }

    var editingCartItem by remember { mutableStateOf<ProductEntity?>(null) }
    var editingQtyInput by remember { mutableStateOf("") }

    val products by viewModel.products.collectAsState()
    val cart by viewModel.cart.collectAsState()
    val discount by viewModel.discount.collectAsState()

    val context = androidx.compose.ui.platform.LocalContext.current

    Column(modifier = Modifier.fillMaxSize()) {
        // Rounded search/scan input matching screenshot
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp)
                .background(Color(0xFFF1F5F9), RoundedCornerShape(28.dp))
                .border(1.dp, Color(0xFFCBD5E1), RoundedCornerShape(28.dp))
                .padding(horizontal = 16.dp, vertical = 6.dp),
            contentAlignment = Alignment.Center
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(Icons.Default.Search, contentDescription = "Search", tint = Color(0xFF64748B))
                Spacer(modifier = Modifier.width(8.dp))
                Box(modifier = Modifier.weight(1f)) {
                    if (searchQuery.isEmpty()) {
                        Text("Search or Scan...", color = Color(0xFF94A3B8), fontSize = 15.sp)
                    }
                    OutlinedTextField(
                        value = searchQuery,
                        onValueChange = { searchQuery = it },
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = Color.Transparent,
                            unfocusedBorderColor = Color.Transparent
                        ),
                        modifier = Modifier.fillMaxWidth()
                    )
                }
                Icon(Icons.Default.ShoppingCart, contentDescription = "Scan", tint = Color(0xFF1976D2))
            }
        }

        // Horizontal split: Cart elements (top) / Products list
        val filtered = products.filter {
            it.name.contains(searchQuery, ignoreCase = true) || it.barcode.contains(searchQuery, ignoreCase = true)
        }.sortedBy { it.name }

        LazyColumn(
            modifier = Modifier
                .weight(1f)
                .padding(horizontal = 16.dp)
        ) {
            if (cart.isNotEmpty()) {
                item {
                    Text(
                        text = "Current Items in Cart (Tap to edit quantity)",
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFF334155),
                        fontSize = 15.sp,
                        modifier = Modifier.padding(bottom = 8.dp)
                    )
                }
                items(cart.toList()) { (item, qty) ->
                    Card(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 4.dp)
                            .clickable {
                                editingCartItem = item
                                editingQtyInput = qty.toString()
                            },
                        shape = RoundedCornerShape(12.dp),
                        colors = CardDefaults.cardColors(containerColor = Color.White),
                        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(12.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column {
                                Text(item.name, fontWeight = FontWeight.Bold, color = Color(0xFF1E293B), fontSize = 15.sp)
                                Text("LKR ${item.price} x $qty = LKR ${item.price * qty}", color = Color(0xFF10B981), fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                            }
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Button(
                                    onClick = { viewModel.updateCartQty(item, qty - 1) },
                                    modifier = Modifier.size(32.dp),
                                    contentPadding = PaddingValues(0.dp),
                                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFEF4444))
                                ) {
                                    Text("-", color = Color.White, fontWeight = FontWeight.Bold)
                                }
                                Text("$qty", modifier = Modifier.padding(horizontal = 12.dp), fontWeight = FontWeight.Bold, fontSize = 15.sp)
                                Button(
                                    onClick = { viewModel.updateCartQty(item, qty + 1) },
                                    modifier = Modifier.size(32.dp),
                                    contentPadding = PaddingValues(0.dp),
                                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF10B981))
                                ) {
                                    Text("+", color = Color.White, fontWeight = FontWeight.Bold)
                                }
                            }
                        }
                    }
                }
                item {
                    Divider(modifier = Modifier.padding(vertical = 12.dp))
                }
            }

            item {
                Text(
                    text = "Quick Products Catalog",
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFF334155),
                    fontSize = 15.sp,
                    modifier = Modifier.padding(vertical = 8.dp)
                )
            }

            items(filtered) { prod ->
                // Beautiful highly premium catalog card format with colorful initials avatars and elegant status badges
                val firstLetter = prod.name.firstOrNull()?.uppercase() ?: "P"
                val nameHash = prod.name.hashCode()
                val bgCol = remember(nameHash) {
                    val colors = listOf(
                        Color(0xFFE0F2FE), Color(0xFFF0FDF4), Color(0xFFFEF3C7),
                        Color(0xFFFCE7F3), Color(0xFFEDE9FE), Color(0xFFF3F4F6)
                    )
                    colors[kotlin.math.abs(nameHash) % colors.size]
                }
                val textCol = remember(nameHash) {
                    val colors = listOf(
                        Color(0xFF0369A1), Color(0xFF15803D), Color(0xFFB45309),
                        Color(0xFFBE185D), Color(0xFF6D28D9), Color(0xFF374151)
                    )
                    colors[kotlin.math.abs(nameHash) % colors.size]
                }

                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 6.dp)
                        .clickable { viewModel.addToCart(prod) },
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = Color.White),
                    elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
                    border = borderStroke(1.dp, Color(0xFFE2E8F0))
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        // Initials Avatar Badge
                        Box(
                            modifier = Modifier
                                .size(48.dp)
                                .background(bgCol, CircleShape),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = firstLetter,
                                color = textCol,
                                fontWeight = FontWeight.Bold,
                                fontSize = 18.sp
                            )
                        }

                        Spacer(modifier = Modifier.width(12.dp))

                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = prod.name,
                                fontWeight = FontWeight.Bold,
                                fontSize = 16.sp,
                                color = Color(0xFF1E293B)
                            )
                            Spacer(modifier = Modifier.height(2.dp))
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                // Category Tag
                                Box(
                                    modifier = Modifier
                                        .background(Color(0xFFF1F5F9), RoundedCornerShape(6.dp))
                                        .padding(horizontal = 6.dp, vertical = 2.dp)
                                ) {
                                    Text(
                                        text = prod.category,
                                        color = Color(0xFF475569),
                                        fontSize = 10.sp,
                                        fontWeight = FontWeight.Medium
                                    )
                                }
                                // Barcode Tag
                                if (prod.barcode.isNotEmpty()) {
                                    Text(
                                        text = "Code: ${prod.barcode}",
                                        color = Color(0xFF64748B),
                                        fontSize = 11.sp
                                    )
                                }
                            }
                            Spacer(modifier = Modifier.height(2.dp))
                            Text(
                                text = "Stock: ${prod.quantity} available",
                                color = if (prod.quantity > 5) Color(0xFF15803D) else Color(0xFFEF4444),
                                fontSize = 12.sp,
                                fontWeight = FontWeight.SemiBold
                            )
                        }

                        Text(
                            text = "LKR ${prod.price}",
                            color = Color(0xFF1E3A8A), // Premium dark indigo
                            fontWeight = FontWeight.ExtraBold,
                            fontSize = 16.sp
                        )
                    }
                }
            }
        }

        // Blue Horizontal checkout banner bottom sheet matching screenshot EXACTLY
        val subtotal = cart.toList().sumOf { (item, qty) -> item.price * qty }
        val finalTotal = maxOf(0.0, subtotal - discount)

        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(Color(0xFF0D5CBE)) // Precise blue color from Screen 3
                .padding(16.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        text = "Subtotal: Rs. ${"%.2f".format(subtotal)}",
                        color = Color.White,
                        fontSize = 14.sp
                    )
                    Text(
                        text = "Discount: -Rs. ${"%.2f".format(discount)} (TAP TO EDIT)",
                        color = Color(0xFFFFCC80), // Orange tint matching screen
                        fontSize = 13.sp,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier
                            .clickable { showDiscountDialog = true }
                            .padding(vertical = 2.dp)
                    )
                    Text(
                        text = "Total: Rs. ${"%.2f".format(finalTotal)}",
                        color = Color.White,
                        fontSize = 20.sp,
                        fontWeight = FontWeight.Bold
                    )
                }

                // Bright Green CHECKOUT button
                Button(
                    onClick = {
                        viewModel.checkout(
                            orgId = orgId,
                            branchId = branchId,
                            onSuccess = { receiptId, items, sub, disc, tot ->
                                generateReceiptPdf(context, receiptId, items, sub, disc, tot)
                                onCheckoutTriggered()
                            },
                            onError = { err ->
                                Toast.makeText(context, err, Toast.LENGTH_SHORT).show()
                            }
                        )
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF00C853)), // Green checkout
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.height(48.dp)
                ) {
                    Text("CHECKOUT", fontWeight = FontWeight.Bold, color = Color.White)
                }
            }
        }

        // Discount edit Dialog
        if (showDiscountDialog) {
            AlertDialog(
                onDismissRequest = { showDiscountDialog = false },
                title = { Text("Apply Cash Discount") },
                text = {
                    OutlinedTextField(
                        value = discountInput,
                        onValueChange = { discountInput = it },
                        placeholder = { Text("Enter discount amount (LKR)") },
                        modifier = Modifier.fillMaxWidth()
                    )
                },
                confirmButton = {
                    Button(
                        onClick = {
                            val amt = discountInput.toDoubleOrNull() ?: 0.0
                            viewModel.setDiscount(amt)
                            showDiscountDialog = false
                        }
                    ) {
                        Text("Apply")
                    }
                },
                dismissButton = {
                    TextButton(onClick = { showDiscountDialog = false }) {
                        Text("Cancel")
                    }
                }
            )
        }

        // Manual cart quantity edit dialog
        if (editingCartItem != null) {
            val item = editingCartItem!!
            AlertDialog(
                onDismissRequest = { editingCartItem = null },
                title = { Text("Edit Quantity: ${item.name}") },
                text = {
                    OutlinedTextField(
                        value = editingQtyInput,
                        onValueChange = { editingQtyInput = it },
                        keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(
                            keyboardType = androidx.compose.ui.text.input.KeyboardType.Number
                        ),
                        placeholder = { Text("Enter exact quantity...") },
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(10.dp)
                    )
                },
                confirmButton = {
                    Button(
                        onClick = {
                            val enteredQty = editingQtyInput.toIntOrNull() ?: 0
                            if (enteredQty > 0) {
                                if (enteredQty <= item.quantity) {
                                    viewModel.updateCartQty(item, enteredQty)
                                    editingCartItem = null
                                } else {
                                    Toast.makeText(context, "Only ${item.quantity} available in stock!", Toast.LENGTH_SHORT).show()
                                }
                            } else {
                                viewModel.updateCartQty(item, 0) // Remove
                                editingCartItem = null
                            }
                        }
                    ) {
                        Text("Update")
                    }
                },
                dismissButton = {
                    TextButton(onClick = { editingCartItem = null }) {
                        Text("Cancel")
                    }
                }
            )
        }
    }
}

// ----------------------------------------------------
// TAB 2: INVENTORY/PRODUCT MANAGER
// ----------------------------------------------------

@Composable
fun InventoryTabScreen(viewModel: PosViewModel, orgId: String, branchId: String) {
    var name by remember { mutableStateOf("") }
    var price by remember { mutableStateOf("") }
    var quantity by remember { mutableStateOf("") }
    var barcode by remember { mutableStateOf("") }

    var editingProduct by remember { mutableStateOf<ProductEntity?>(null) }
    var editName by remember { mutableStateOf("") }
    var editPrice by remember { mutableStateOf("") }
    var editQuantity by remember { mutableStateOf("") }
    var editBarcode by remember { mutableStateOf("") }
    var editCategory by remember { mutableStateOf("") }

    val products by viewModel.products.collectAsState()
    val context = androidx.compose.ui.platform.LocalContext.current

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
    ) {
        Text("Add New Product", fontWeight = FontWeight.Bold, fontSize = 18.sp, color = Color(0xFF1E293B))
        Spacer(modifier = Modifier.height(12.dp))

        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = Color.White),
            shape = RoundedCornerShape(12.dp),
            elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("Product Name") },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(8.dp)
                )
                Spacer(modifier = Modifier.height(8.dp))
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = price,
                        onValueChange = { price = it },
                        label = { Text("Price") },
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(8.dp)
                    )
                    OutlinedTextField(
                        value = quantity,
                        onValueChange = { quantity = it },
                        label = { Text("Stock Quantity") },
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(8.dp)
                    )
                }
                Spacer(modifier = Modifier.height(8.dp))
                OutlinedTextField(
                    value = barcode,
                    onValueChange = { barcode = it },
                    label = { Text("Barcode / Code") },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(8.dp)
                )
                Spacer(modifier = Modifier.height(16.dp))

                Button(
                    onClick = {
                        val newProduct = ProductEntity(
                            id = UUID.randomUUID().toString(),
                            name = name,
                            price = price.toDoubleOrNull() ?: 0.0,
                            quantity = quantity.toIntOrNull() ?: 0,
                            barcode = barcode,
                            category = "General"
                        )
                        
                        // Call the ViewModel's offline-first dynamic adder
                        viewModel.addProduct(orgId, branchId, newProduct)
                        
                        name = ""
                        price = ""
                        quantity = ""
                        barcode = ""
                    },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Text("SAVE PRODUCT")
                }
            }
        }

        Spacer(modifier = Modifier.height(16.dp))
        Text("Current Product Catalog", fontWeight = FontWeight.Bold, fontSize = 16.sp, color = Color(0xFF1E293B))
        Spacer(modifier = Modifier.height(8.dp))

        LazyColumn(modifier = Modifier.weight(1f)) {
            items(products) { prod ->
                // Initials Avatar Badge
                val firstLetter = prod.name.firstOrNull()?.uppercase() ?: "P"
                val nameHash = prod.name.hashCode()
                val bgCol = remember(nameHash) {
                    val colors = listOf(
                        Color(0xFFE0F2FE), Color(0xFFF0FDF4), Color(0xFFFEF3C7),
                        Color(0xFFFCE7F3), Color(0xFFEDE9FE), Color(0xFFF3F4F6)
                    )
                    colors[kotlin.math.abs(nameHash) % colors.size]
                }
                val textCol = remember(nameHash) {
                    val colors = listOf(
                        Color(0xFF0369A1), Color(0xFF15803D), Color(0xFFB45309),
                        Color(0xFFBE185D), Color(0xFF6D28D9), Color(0xFF374151)
                    )
                    colors[kotlin.math.abs(nameHash) % colors.size]
                }

                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 4.dp),
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = Color.White),
                    border = borderStroke(1.dp, Color(0xFFE2E8F0)),
                    elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        // Avatar Badge
                        Box(
                            modifier = Modifier
                                .size(40.dp)
                                .background(bgCol, CircleShape),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = firstLetter,
                                color = textCol,
                                fontWeight = FontWeight.Bold,
                                fontSize = 16.sp
                            )
                        }

                        Spacer(modifier = Modifier.width(12.dp))

                        Column(modifier = Modifier.weight(1f)) {
                            Text(prod.name, fontWeight = FontWeight.Bold, fontSize = 15.sp, color = Color(0xFF1E293B))
                            Spacer(modifier = Modifier.height(2.dp))
                            Text("Category: ${prod.category} | Code: ${prod.barcode}", color = Color.Gray, fontSize = 12.sp)
                            Text("Stock: ${prod.quantity} available", color = if (prod.quantity > 5) Color(0xFF15803D) else Color(0xFFEF4444), fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                        }

                        Column(horizontalAlignment = Alignment.End) {
                            Text("Rs. ${prod.price}", fontWeight = FontWeight.ExtraBold, color = Color(0xFF1E3A8A), fontSize = 15.sp)
                            Spacer(modifier = Modifier.height(4.dp))
                            // Elegant edit details icon button
                            IconButton(
                                onClick = {
                                    editingProduct = prod
                                    editName = prod.name
                                    editPrice = prod.price.toString()
                                    editQuantity = prod.quantity.toString()
                                    editBarcode = prod.barcode
                                    editCategory = prod.category
                                },
                                modifier = Modifier.size(24.dp)
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Edit,
                                    contentDescription = "Edit Product Details",
                                    tint = Color(0xFF64748B),
                                    modifier = Modifier.size(16.dp)
                                )
                            }
                        }
                    }
                }
            }
        }

        // Full Edit Details dialog Popup
        if (editingProduct != null) {
            val original = editingProduct!!
            AlertDialog(
                onDismissRequest = { editingProduct = null },
                title = { Text("Edit Product Details", fontWeight = FontWeight.Bold) },
                text = {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(
                            value = editName,
                            onValueChange = { editName = it },
                            label = { Text("Product Name") },
                            modifier = Modifier.fillMaxWidth()
                        )
                        OutlinedTextField(
                            value = editPrice,
                            onValueChange = { editPrice = it },
                            label = { Text("Price (LKR)") },
                            modifier = Modifier.fillMaxWidth()
                        )
                        OutlinedTextField(
                            value = editQuantity,
                            onValueChange = { editQuantity = it },
                            label = { Text("Stock Quantity") },
                            modifier = Modifier.fillMaxWidth()
                        )
                        OutlinedTextField(
                            value = editBarcode,
                            onValueChange = { editBarcode = it },
                            label = { Text("Barcode / Code") },
                            modifier = Modifier.fillMaxWidth()
                        )
                        OutlinedTextField(
                            value = editCategory,
                            onValueChange = { editCategory = it },
                            label = { Text("Category") },
                            modifier = Modifier.fillMaxWidth()
                        )
                    }
                },
                confirmButton = {
                    Button(
                        onClick = {
                            val updated = original.copy(
                                name = editName,
                                price = editPrice.toDoubleOrNull() ?: original.price,
                                quantity = editQuantity.toIntOrNull() ?: original.quantity,
                                barcode = editBarcode,
                                category = editCategory
                            )
                            viewModel.updateProduct(orgId, branchId, updated)
                            editingProduct = null
                            Toast.makeText(context, "Product details updated successfully!", Toast.LENGTH_SHORT).show()
                        }
                    ) {
                        Text("Save Changes")
                    }
                },
                dismissButton = {
                    TextButton(onClick = { editingProduct = null }) {
                        Text("Cancel")
                    }
                }
            )
        }
    }
}

// ----------------------------------------------------
// TAB 3: TRANSACTION JOURNAL / BILLING
// ----------------------------------------------------

@Composable
fun TransactionsTabScreen(viewModel: PosViewModel) {
    val transactions by viewModel.transactions.collectAsState()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
    ) {
        Text("Billing & Transaction Logs", fontWeight = FontWeight.Bold, fontSize = 18.sp, color = Color(0xFF1E293B))
        Spacer(modifier = Modifier.height(12.dp))

        if (transactions.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text("No bills generated in this session yet.", color = Color.Gray)
            }
        } else {
            LazyColumn(modifier = Modifier.fillMaxSize()) {
                items(transactions.reversed()) { tx ->
                    Card(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 6.dp),
                        colors = CardDefaults.cardColors(containerColor = Color.White),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Column(modifier = Modifier.padding(14.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Text("Receipt: TX-${tx.id.take(8).uppercase()}", fontWeight = FontWeight.Bold)
                                Text("LKR ${"%.2f".format(tx.total)}", color = Color(0xFF4CAF50), fontWeight = FontWeight.Bold)
                            }
                            Spacer(modifier = Modifier.height(4.dp))
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Text("Items purchased: ${tx.itemsCount}", color = Color.Gray, fontSize = 13.sp)
                                val date = java.text.SimpleDateFormat("yyyy-MM-dd HH:mm").format(java.util.Date(tx.timestamp))
                                Text(date, color = Color.Gray, fontSize = 12.sp)
                            }
                        }
                    }
                }
            }
        }
    }
}

// ----------------------------------------------------
// TAB 4: SALES ANALYTICS (EXACT CARDS MATCH)
// ----------------------------------------------------

@Composable
fun AnalyticsTabScreen(viewModel: PosViewModel) {
    val todayRev = viewModel.getTodayRevenue()
    val monthRev = viewModel.getMonthRevenue()
    val yearRev = viewModel.getYearRevenue()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
    ) {
        Text(
            text = "Sales Analytics",
            fontWeight = FontWeight.Bold,
            fontSize = 22.sp,
            color = Color(0xFF1E293B),
            modifier = Modifier.padding(bottom = 16.dp)
        )

        // Today's Revenue Card (Light Blue matching screenshot)
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 8.dp),
            colors = CardDefaults.cardColors(containerColor = Color(0xFFEAF2FF)), // Light Blue background
            shape = RoundedCornerShape(16.dp),
            elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(20.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(
                    text = "Today's Revenue (Tap for Graph)",
                    color = Color(0xFF0056C6), // Dark Blue header text
                    fontWeight = FontWeight.Bold,
                    fontSize = 15.sp
                )
                Spacer(modifier = Modifier.height(10.dp))
                Text(
                    text = "Rs. ${"%.2f".format(todayRev)}",
                    color = Color(0xFF0056C6),
                    fontWeight = FontWeight.ExtraBold,
                    fontSize = 32.sp
                )
            }
        }

        // This Month's Revenue Card (Light Green matching screenshot)
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 8.dp),
            colors = CardDefaults.cardColors(containerColor = Color(0xFFEAF8F0)), // Light Green background
            shape = RoundedCornerShape(16.dp),
            elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(20.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(
                    text = "This Month's Revenue (Tap for Graph)",
                    color = Color(0xFF00873C), // Dark Green header text
                    fontWeight = FontWeight.Bold,
                    fontSize = 15.sp
                )
                Spacer(modifier = Modifier.height(10.dp))
                Text(
                    text = "Rs. ${"%.2f".format(monthRev)}",
                    color = Color(0xFF00873C),
                    fontWeight = FontWeight.ExtraBold,
                    fontSize = 32.sp
                )
            }
        }

        // This Year's Revenue Card (Light Peach/Orange matching screenshot)
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 8.dp),
            colors = CardDefaults.cardColors(containerColor = Color(0xFFFFF6EA)), // Light Orange background
            shape = RoundedCornerShape(16.dp),
            elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(20.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(
                    text = "This Year's Revenue (Tap for Graph)",
                    color = Color(0xFFC65A00), // Dark Orange header text
                    fontWeight = FontWeight.Bold,
                    fontSize = 15.sp
                )
                Spacer(modifier = Modifier.height(10.dp))
                Text(
                    text = "Rs. ${"%.2f".format(yearRev)}",
                    color = Color(0xFFC65A00),
                    fontWeight = FontWeight.ExtraBold,
                    fontSize = 32.sp
                )
            }
        }
    }
}

// ----------------------------------------------------
// TAB 5: ACCOUNT & SETTINGS (EXACT MATCH)
// ----------------------------------------------------

@Composable
fun AccountTabScreen(
    viewModel: PosViewModel,
    orgId: String,
    branchId: String,
    prefs: SharedPreferences,
    onLogout: () -> Unit
) {
    var shopName by remember { mutableStateOf(prefs.getString("receipt_shop", "My Shop") ?: "My Shop") }
    var address by remember { mutableStateOf(prefs.getString("receipt_address", "123 Main St, City") ?: "123 Main St, City") }
    var phone by remember { mutableStateOf(prefs.getString("receipt_phone", "07X XXX XXXX") ?: "07X XXX XXXX") }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        // Silhouetted flag-bearer icon matching screenshot
        Box(
            modifier = Modifier
                .size(90.dp)
                .background(Color(0xFFE2E8F0), CircleShape),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                imageVector = Icons.Default.Person,
                contentDescription = "Flag Bearer Silhouette",
                tint = Color(0xFF1E3A8A), // Dark blue tint
                modifier = Modifier.size(54.dp)
            )
        }

        Spacer(modifier = Modifier.height(12.dp))

        Text(
            text = "My Account & Settings",
            fontWeight = FontWeight.Bold,
            fontSize = 20.sp,
            color = Color(0xFF1E293B)
        )

        Spacer(modifier = Modifier.height(16.dp))

        // Receipt Details Form Container matching Screen 3 layout
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = Color.White),
            shape = RoundedCornerShape(12.dp),
            elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(20.dp)
            ) {
                Text(
                    text = "Receipt Details",
                    fontWeight = FontWeight.Bold,
                    fontSize = 14.sp,
                    color = Color(0xFF1E293B),
                    modifier = Modifier.padding(bottom = 12.dp)
                )

                // Input Box 1: Shop Name
                OutlinedTextField(
                    value = shopName,
                    onValueChange = { shopName = it },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(8.dp)
                )
                Spacer(modifier = Modifier.height(12.dp))

                // Input Box 2: Address
                OutlinedTextField(
                    value = address,
                    onValueChange = { address = it },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(8.dp)
                )
                Spacer(modifier = Modifier.height(12.dp))

                // Input Box 3: Phone
                OutlinedTextField(
                    value = phone,
                    onValueChange = { phone = it },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(8.dp)
                )

                Spacer(modifier = Modifier.height(20.dp))

                // Solid blue "SAVE SETTINGS" button
                Button(
                    onClick = {
                        prefs.edit()
                            .putString("receipt_shop", shopName)
                            .putString("receipt_address", address)
                            .putString("receipt_phone", phone)
                            .apply()
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0D5CBE)), // Blue button from screenshot
                    shape = RoundedCornerShape(24.dp)
                ) {
                    Text("SAVE SETTINGS", fontWeight = FontWeight.Bold, color = Color.White)
                }
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        // Outlined Change Password button
        OutlinedButton(
            onClick = { /* Simulated trigger */ },
            modifier = Modifier
                .fillMaxWidth()
                .height(48.dp),
            colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFF0D5CBE)),
            border = borderStroke(1.dp, Color(0xFFCBD5E1)),
            shape = RoundedCornerShape(8.dp)
        ) {
            Text("CHANGE PASSWORD", fontWeight = FontWeight.Bold)
        }

        Spacer(modifier = Modifier.height(20.dp))

        // Display current active organization ID for diagnostic clarity
        Text(
            text = "Active Org ID: ${if (orgId.isEmpty()) "Resolving..." else orgId}",
            color = Color(0xFF64748B),
            fontSize = 12.sp,
            fontWeight = FontWeight.Medium,
            textAlign = TextAlign.Center
        )

        Spacer(modifier = Modifier.height(8.dp))

        // Beautiful highly visible green FORCE CLOUD SYNC button
        val context = androidx.compose.ui.platform.LocalContext.current
        val syncStatus by viewModel.syncStatus.collectAsState()
        Button(
            onClick = {
                if (orgId.isNotEmpty()) {
                    viewModel.syncProducts(orgId, branchId)
                    android.widget.Toast.makeText(context, "Force Cloud Sync triggered!", android.widget.Toast.LENGTH_SHORT).show()
                } else {
                    android.widget.Toast.makeText(context, "No active organization found.", android.widget.Toast.LENGTH_SHORT).show()
                }
            },
            modifier = Modifier
                .fillMaxWidth()
                .height(48.dp),
            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF10B981)), // Emerald Green
            shape = RoundedCornerShape(24.dp)
        ) {
            Text("FORCE CLOUD SYNC (${syncStatus})", fontWeight = FontWeight.Bold, color = Color.White)
        }

        Spacer(modifier = Modifier.height(16.dp))

        // Beautiful highly visible red LOGOUT button
        Button(
            onClick = { onLogout() },
            modifier = Modifier
                .fillMaxWidth()
                .height(48.dp),
            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFEF4444)),
            shape = RoundedCornerShape(24.dp)
        ) {
            Text("LOGOUT", fontWeight = FontWeight.Bold, color = Color.White)
        }
    }
}

// Simple helper to avoid layout error imports
fun borderStroke(width: androidx.compose.ui.unit.Dp, color: Color) = 
    androidx.compose.foundation.BorderStroke(width, color)

// Beautiful helper function to generate a standard 300px width thermal PDF receipt, save to device, and trigger a print/view intent
fun generateReceiptPdf(
    context: Context,
    transactionId: String,
    items: Map<ProductEntity, Int>,
    subtotal: Double,
    discount: Double,
    total: Double
) {
    val pdfDocument = android.graphics.pdf.PdfDocument()
    
    // Page dimensions: 300 width (thermal receipt size), dynamic height based on item count
    val dynamicHeight = 220 + (items.size * 20)
    val pageInfo = android.graphics.pdf.PdfDocument.PageInfo.Builder(300, dynamicHeight, 1).create()
    val page = pdfDocument.startPage(pageInfo)
    val canvas = page.canvas
    
    val paint = android.graphics.Paint().apply {
        color = android.graphics.Color.BLACK
        strokeWidth = 1f
    }
    
    val textPaint = android.graphics.Paint().apply {
        textSize = 10f
        color = android.graphics.Color.BLACK
        isAntiAlias = true
    }
    
    val boldPaint = android.graphics.Paint().apply {
        textSize = 11f
        isFakeBoldText = true
        color = android.graphics.Color.BLACK
        isAntiAlias = true
    }
    
    val titlePaint = android.graphics.Paint().apply {
        textSize = 14f
        isFakeBoldText = true
        color = android.graphics.Color.BLACK
        isAntiAlias = true
    }
    
    var y = 35f
    canvas.drawText("ADK SUPERMART", 85f, y, titlePaint)
    y += 20f
    canvas.drawText("Mobile Branch - Receipt", 80f, y, textPaint)
    y += 18f
    canvas.drawText("Receipt ID: TX-${transactionId.take(8).uppercase()}", 15f, y, textPaint)
    y += 14f
    canvas.drawText("Date: " + java.text.SimpleDateFormat("yyyy-MM-dd HH:mm").format(java.util.Date()), 15f, y, textPaint)
    y += 10f
    canvas.drawLine(15f, y, 285f, y, paint)
    y += 18f
    
    canvas.drawText("Item Details", 15f, y, boldPaint)
    canvas.drawText("Total", 240f, y, boldPaint)
    y += 14f
    canvas.drawLine(15f, y, 285f, y, paint)
    y += 16f
    
    items.forEach { (item, qty) ->
        canvas.drawText("${item.name} x $qty", 15f, y, textPaint)
        val priceStr = "LKR %.2f".format(item.price * qty)
        canvas.drawText(priceStr, 220f, y, textPaint)
        y += 18f
    }
    
    canvas.drawLine(15f, y, 285f, y, paint)
    y += 16f
    
    canvas.drawText("Subtotal:", 15f, y, textPaint)
    canvas.drawText("LKR %.2f".format(subtotal), 220f, y, textPaint)
    y += 16f
    
    canvas.drawText("Discount:", 15f, y, textPaint)
    canvas.drawText("LKR %.2f".format(discount), 220f, y, textPaint)
    y += 16f
    
    canvas.drawText("TOTAL AMOUNT:", 15f, y, boldPaint)
    canvas.drawText("LKR %.2f".format(total), 220f, y, boldPaint)
    y += 25f
    
    canvas.drawText("Thank you for shopping with us!", 65f, y, textPaint)
    
    pdfDocument.finishPage(page)
    
    // Scoped storage save routine
    try {
        val resolver = context.contentResolver
        val contentValues = android.content.ContentValues().apply {
            put(android.provider.MediaStore.MediaColumns.DISPLAY_NAME, "ADK_Receipt_${transactionId.take(8)}.pdf")
            put(android.provider.MediaStore.MediaColumns.MIME_TYPE, "application/pdf")
            put(android.provider.MediaStore.MediaColumns.RELATIVE_PATH, android.os.Environment.DIRECTORY_DOWNLOADS)
        }
        
        val uri = resolver.insert(android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI, contentValues)
        if (uri != null) {
            resolver.openOutputStream(uri).use { outputStream ->
                pdfDocument.writeTo(outputStream)
            }
            android.widget.Toast.makeText(context, "PDF Receipt Saved to Downloads!", android.widget.Toast.LENGTH_LONG).show()
            
            // Fire native share/chooser view action
            val intent = android.content.Intent(android.content.Intent.ACTION_VIEW).apply {
                setDataAndType(uri, "application/pdf")
                addFlags(android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            context.startActivity(android.content.Intent.createChooser(intent, "Open & Print Receipt"))
        }
    } catch (e: Exception) {
        e.printStackTrace()
        android.widget.Toast.makeText(context, "PDF Error: ${e.localizedMessage}", android.widget.Toast.LENGTH_SHORT).show()
    } finally {
        pdfDocument.close()
    }
}
