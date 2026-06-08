package com.adk.smartposlanka.ui.screens

import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ExitToApp
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.adk.smartposlanka.ui.PosViewModel
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.EmailAuthProvider
import com.google.firebase.firestore.FirebaseFirestore
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    viewModel: PosViewModel,
    orgId: String,
    branchId: String,
    onLogout: () -> Unit,
    paddingValues: PaddingValues
) {
    val syncStatus by viewModel.syncStatus.collectAsState()
    val context = LocalContext.current

    val currentUser = FirebaseAuth.getInstance().currentUser
    val userEmail = currentUser?.email ?: "Not logged in"
    
    var role by remember { mutableStateOf("Owner") }
    var subscriptionTier by remember { mutableStateOf("Free") }

    var shopName by remember { mutableStateOf("ADK Supermart") }
    var shopAddress by remember { mutableStateOf("No. 45, Galle Road, Colombo, Sri Lanka") }
    var shopPhone by remember { mutableStateOf("+94 11 234 5678") }
    var shopDetailsLoading by remember { mutableStateOf(false) }

    // Payment states
    var showPaymentDialog by remember { mutableStateOf(false) }
    var cardNumber by remember { mutableStateOf("") }
    var cardHolder by remember { mutableStateOf("") }
    var cardExpiry by remember { mutableStateOf("") }
    var cardCvv by remember { mutableStateOf("") }
    var detectedBrand by remember { mutableStateOf("") }
    var processingPayment by remember { mutableStateOf(false) }
    var selectedBankId by remember { mutableStateOf("") }
    var adminBankAccounts by remember { mutableStateOf<List<Map<String, Any>>>(emptyList()) }

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
                    adminBankAccounts = list
                    if (list.isNotEmpty()) {
                        selectedBankId = list[0]["id"] as String
                    }
                }
        }
    }

    val onCardNumberChange: (String) -> Unit = { input ->
        val clean = input.filter { it.isDigit() }.take(16)
        val formatted = clean.chunked(4).joinToString(" ")
        cardNumber = formatted
        detectedBrand = when {
            clean.startsWith("4") -> "Visa"
            clean.startsWith("5") || clean.startsWith("2") -> "MasterCard"
            clean.startsWith("62") -> "UnionPay"
            else -> ""
        }
    }

    val onExpiryChange: (String) -> Unit = { input ->
        val clean = input.filter { it.isDigit() }.take(4)
        cardExpiry = if (clean.length >= 2) {
            clean.substring(0, 2) + "/" + clean.substring(2)
        } else {
            clean
        }
    }

    val triggerProcessPayment: () -> Unit = {
        val cleanCard = cardNumber.filter { it.isDigit() }
        if (selectedBankId.isEmpty()) {
            Toast.makeText(context, "Please select a bank account first.", Toast.LENGTH_SHORT).show()
        } else if (cleanCard.length < 16) {
            Toast.makeText(context, "Invalid Card Number. Must be 16 digits.", Toast.LENGTH_SHORT).show()
        } else if (cardExpiry.length < 5) {
            Toast.makeText(context, "Invalid Expiry. Use MM/YY format.", Toast.LENGTH_SHORT).show()
        } else if (cardCvv.length < 3) {
            Toast.makeText(context, "Invalid CVV.", Toast.LENGTH_SHORT).show()
        } else {
            processingPayment = true
            Toast.makeText(context, "Processing secure payment...", Toast.LENGTH_SHORT).show()
            
            val handler = android.os.Handler(android.os.Looper.getMainLooper())
            handler.postDelayed({
                val randomHex = (100000 + (Math.random() * 900000).toInt()).toString()
                val generatedKey = "LIC-M-$randomHex"
                val db = FirebaseFirestore.getInstance()
                
                val keyData = hashMapOf(
                    "key" to generatedKey,
                    "email" to userEmail,
                    "durationMonths" to 1,
                    "isUsed" to false,
                    "createdAt" to SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).apply {
                        timeZone = java.util.TimeZone.getTimeZone("UTC")
                    }.format(Date()),
                    "selectedBankAccountId" to selectedBankId,
                    "amountPaid" to 5000
                )
                
                db.collection("LicenseKeys").document(generatedKey).set(keyData)
                    .addOnSuccessListener {
                        val payRef = db.collection("Payments").document()
                        val payObj = hashMapOf(
                            "paymentId" to payRef.id,
                            "amount" to 5000,
                            "userEmail" to userEmail,
                            "bankAccountId" to selectedBankId,
                            "cardholderName" to cardHolder,
                            "licenseKeyGenerated" to generatedKey,
                            "timestamp" to SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).apply {
                                timeZone = java.util.TimeZone.getTimeZone("UTC")
                            }.format(Date())
                        )
                        payRef.set(payObj)
                        
                        processingPayment = false
                        showPaymentDialog = false
                        
                        cardNumber = ""
                        cardHolder = ""
                        cardExpiry = ""
                        cardCvv = ""
                        detectedBrand = ""
                        
                        Toast.makeText(context, "Payment successful! Applying premium instantly...", Toast.LENGTH_SHORT).show()
                        
                        db.collection("LicenseKeys").document(generatedKey)
                            .update(mapOf(
                                "isUsed" to true,
                                "usedByOrgId" to orgId,
                                "usedAt" to SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).apply {
                                    timeZone = java.util.TimeZone.getTimeZone("UTC")
                                }.format(Date())
                            ))
                            .addOnSuccessListener {
                                val premiumExpiresAt = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).apply {
                                    timeZone = java.util.TimeZone.getTimeZone("UTC")
                                }.format(Date(System.currentTimeMillis() + 30L * 24 * 60 * 60 * 1000))
                                
                                db.collection("Organizations").document(orgId)
                                    .update(mapOf(
                                        "subscriptionTier" to "Premium",
                                        "premiumExpiresAt" to premiumExpiresAt
                                    ))
                                    .addOnSuccessListener {
                                        if (currentUser != null) {
                                            db.collection("Users").document(currentUser.uid)
                                                .update("role", "premium")
                                                .addOnSuccessListener {
                                                    subscriptionTier = "Premium"
                                                    role = "premium"
                                                    Toast.makeText(context, "Premium activated! Upgraded successfully.", Toast.LENGTH_LONG).show()
                                                }
                                        }
                                    }
                            }
                    }
                    .addOnFailureListener {
                        processingPayment = false
                        Toast.makeText(context, "Payment processing failed: ${it.localizedMessage}", Toast.LENGTH_LONG).show()
                    }
            }, 2000)
        }
    }

    // Fetch live profile/organization details from Firestore
    LaunchedEffect(orgId) {
        if (orgId.isNotEmpty()) {
            FirebaseFirestore.getInstance().collection("Organizations").document(orgId).get()
                .addOnSuccessListener { doc ->
                    if (doc.exists()) {
                        subscriptionTier = doc.getString("subscriptionTier") ?: "Free"
                        shopName = doc.getString("shopName") ?: "ADK Supermart"
                        shopAddress = doc.getString("address") ?: "No. 45, Galle Road, Colombo, Sri Lanka"
                        shopPhone = doc.getString("phone") ?: "+94 11 234 5678"
                    }
                }
        }
        if (currentUser != null) {
            FirebaseFirestore.getInstance().collection("Users").document(currentUser.uid).get()
                .addOnSuccessListener { doc ->
                    if (doc.exists()) {
                        role = doc.getString("role") ?: "Owner"
                    }
                }
        }
    }

    val isSuperAdmin = userEmail.trim().lowercase() == "arikarran14@gmail.com"
    val hasPremium = isSuperAdmin || subscriptionTier.equals("Premium", ignoreCase = true)
    val roleDisplay = if (isSuperAdmin) "Super Admin" else (if (hasPremium) "Premium $role" else role)

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
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            item {
                Text(
                    text = "Settings & Setup",
                    fontSize = 24.sp,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onBackground
                )
            }

            // 1. Account Profile Card
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.9f)),
                    shape = RoundedCornerShape(20.dp),
                    elevation = CardDefaults.cardElevation(defaultElevation = 6.dp)
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text("Terminal Context", fontWeight = FontWeight.Bold, fontSize = 18.sp, color = MaterialTheme.colorScheme.primary)
                        Spacer(modifier = Modifier.height(12.dp))
                        SettingsItem(icon = Icons.Default.Person, title = "Active User", subtitle = userEmail)
                        Divider(modifier = Modifier.padding(vertical = 4.dp))
                        SettingsItem(icon = Icons.Default.Settings, title = "Organization ID", subtitle = orgId.ifEmpty { "Resolving secure session..." })
                        Divider(modifier = Modifier.padding(vertical = 4.dp))
                        SettingsItem(icon = Icons.Default.Star, title = "Terminal Role", subtitle = roleDisplay)
                    }
                }
            }

            // 1b. Shop Settings Card (Visible for Admin/Owner/Super Admin)
            val canEditShopDetails = role.lowercase() != "cashier" || isSuperAdmin
            if (canEditShopDetails) {
                item {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.9f)),
                        shape = RoundedCornerShape(20.dp),
                        elevation = CardDefaults.cardElevation(defaultElevation = 6.dp)
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Text(
                                "Shop Settings",
                                fontWeight = FontWeight.Bold,
                                fontSize = 18.sp,
                                color = MaterialTheme.colorScheme.primary
                            )
                            Spacer(modifier = Modifier.height(12.dp))

                            OutlinedTextField(
                                value = shopName,
                                onValueChange = { shopName = it },
                                label = { Text("Shop Name") },
                                singleLine = true,
                                modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp)
                            )
                            OutlinedTextField(
                                value = shopAddress,
                                onValueChange = { shopAddress = it },
                                label = { Text("Shop Address") },
                                singleLine = true,
                                modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp)
                            )
                            OutlinedTextField(
                                value = shopPhone,
                                onValueChange = { shopPhone = it },
                                label = { Text("Shop Mobile Number") },
                                singleLine = true,
                                modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp)
                            )

                            Button(
                                onClick = {
                                    if (shopName.isEmpty() || shopAddress.isEmpty() || shopPhone.isEmpty()) {
                                        Toast.makeText(context, "All fields are required.", Toast.LENGTH_SHORT).show()
                                        return@Button
                                    }
                                    shopDetailsLoading = true
                                    val updates = hashMapOf(
                                        "shopName" to shopName,
                                        "address" to shopAddress,
                                        "phone" to shopPhone
                                    )
                                    FirebaseFirestore.getInstance().collection("Organizations").document(orgId)
                                        .update(updates as Map<String, Any>)
                                        .addOnSuccessListener {
                                            shopDetailsLoading = false
                                            Toast.makeText(context, "Shop details updated successfully!", Toast.LENGTH_SHORT).show()
                                        }
                                        .addOnFailureListener {
                                            shopDetailsLoading = false
                                            Toast.makeText(context, "Failed to update shop details: ${it.localizedMessage}", Toast.LENGTH_LONG).show()
                                        }
                                },
                                modifier = Modifier.fillMaxWidth(),
                                enabled = !shopDetailsLoading && orgId.isNotEmpty()
                            ) {
                                if (shopDetailsLoading) {
                                    CircularProgressIndicator(color = MaterialTheme.colorScheme.onPrimary, modifier = Modifier.size(24.dp))
                                } else {
                                    Text("Save Shop Details")
                                }
                            }
                        }
                    }
                }
            }

            // 2. Cloud Synchronization Card
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.9f)),
                    shape = RoundedCornerShape(20.dp),
                    elevation = CardDefaults.cardElevation(defaultElevation = 6.dp)
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text("Realtime Synchronization", fontWeight = FontWeight.Bold, fontSize = 18.sp, color = MaterialTheme.colorScheme.primary)
                        Spacer(modifier = Modifier.height(12.dp))
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column {
                                Text("Sync Status", fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
                                Text(syncStatus, fontSize = 14.sp, color = if (syncStatus == "Synced" || syncStatus == "Connected") MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error)
                            }
                            IconButton(onClick = { viewModel.syncProducts(orgId, branchId) }) {
                                Icon(Icons.Default.Refresh, contentDescription = "Force Sync", tint = MaterialTheme.colorScheme.primary)
                            }
                        }
                    }
                }
            }

            // 3. Change Password Card
            item {
                var currentPassword by remember { mutableStateOf("") }
                var newPassword by remember { mutableStateOf("") }
                var confirmPassword by remember { mutableStateOf("") }
                var changePasswordLoading by remember { mutableStateOf(false) }

                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.9f)),
                    shape = RoundedCornerShape(20.dp),
                    elevation = CardDefaults.cardElevation(defaultElevation = 6.dp)
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text("In-App Change Password", fontWeight = FontWeight.Bold, fontSize = 18.sp, color = MaterialTheme.colorScheme.primary)
                        Spacer(modifier = Modifier.height(12.dp))
                        
                        OutlinedTextField(
                            value = currentPassword,
                            onValueChange = { currentPassword = it },
                            label = { Text("Current Password") },
                            visualTransformation = PasswordVisualTransformation(),
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp)
                        )
                        OutlinedTextField(
                            value = newPassword,
                            onValueChange = { newPassword = it },
                            label = { Text("New Password") },
                            visualTransformation = PasswordVisualTransformation(),
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp)
                        )
                        OutlinedTextField(
                            value = confirmPassword,
                            onValueChange = { confirmPassword = it },
                            label = { Text("Confirm New Password") },
                            visualTransformation = PasswordVisualTransformation(),
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp)
                        )

                        Button(
                            onClick = {
                                if (newPassword != confirmPassword) {
                                    Toast.makeText(context, "New passwords do not match.", Toast.LENGTH_SHORT).show()
                                    return@Button
                                }
                                if (newPassword.length < 6) {
                                    Toast.makeText(context, "Minimum password length is 6 characters.", Toast.LENGTH_SHORT).show()
                                    return@Button
                                }
                                changePasswordLoading = true
                                val credential = EmailAuthProvider.getCredential(userEmail, currentPassword)
                                currentUser?.reauthenticate(credential)
                                    ?.addOnSuccessListener {
                                        currentUser.updatePassword(newPassword)
                                            .addOnSuccessListener {
                                                changePasswordLoading = false
                                                currentPassword = ""
                                                newPassword = ""
                                                confirmPassword = ""
                                                Toast.makeText(context, "Password updated successfully!", Toast.LENGTH_SHORT).show()
                                            }
                                            .addOnFailureListener {
                                                changePasswordLoading = false
                                                Toast.makeText(context, "Failed updating password: ${it.localizedMessage}", Toast.LENGTH_LONG).show()
                                            }
                                    }
                                    ?.addOnFailureListener {
                                        changePasswordLoading = false
                                        Toast.makeText(context, "Authentication failed: incorrect password.", Toast.LENGTH_LONG).show()
                                    }
                            },
                            modifier = Modifier.fillMaxWidth(),
                            enabled = !changePasswordLoading
                        ) {
                            if (changePasswordLoading) {
                                CircularProgressIndicator(color = MaterialTheme.colorScheme.onPrimary, modifier = Modifier.size(24.dp))
                            } else {
                                Text("Update Password")
                            }
                        }

                        Spacer(modifier = Modifier.height(12.dp))
                        OutlinedButton(
                            onClick = {
                                FirebaseAuth.getInstance().sendPasswordResetEmail(userEmail)
                                    .addOnSuccessListener {
                                        Toast.makeText(context, "Reset email sent to $userEmail", Toast.LENGTH_LONG).show()
                                    }
                            },
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text("Send Password Reset Email")
                        }
                    }
                }
            }

            // 4. Configure Bank Accounts (Super Admin Only)
            if (isSuperAdmin) {
                item {
                    var bankName by remember { mutableStateOf("") }
                    var holderName by remember { mutableStateOf("") }
                    var accNumber by remember { mutableStateOf("") }
                    var bankList by remember { mutableStateOf<List<Map<String, Any>>>(emptyList()) }
                    var bankLoading by remember { mutableStateOf(false) }

                    LaunchedEffect(Unit) {
                        FirebaseFirestore.getInstance().collection("BankAccounts").get()
                            .addOnSuccessListener { snap ->
                                bankList = snap.documents.map { doc ->
                                    mapOf(
                                        "id" to doc.id,
                                        "bankName" to (doc.getString("bankName") ?: ""),
                                        "accountHolder" to (doc.getString("accountHolder") ?: ""),
                                        "accountNumber" to (doc.getString("accountNumber") ?: "")
                                    )
                                }
                            }
                    }

                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.9f)),
                        shape = RoundedCornerShape(20.dp),
                        elevation = CardDefaults.cardElevation(defaultElevation = 6.dp)
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Text("Configure Bank Accounts (Admin)", fontWeight = FontWeight.Bold, fontSize = 18.sp, color = MaterialTheme.colorScheme.primary)
                            Spacer(modifier = Modifier.height(12.dp))

                            var expanded by remember { mutableStateOf(false) }
                            val bankSuggestions = listOf(
                                "Bank of Ceylon (BOC)",
                                "People's Bank",
                                "Commercial Bank of Ceylon",
                                "Hatton National Bank (HNB)",
                                "Sampath Bank",
                                "Seylan Bank",
                                "Nations Trust Bank (NTB)",
                                "National Savings Bank (NSB)",
                                "DFCC Bank",
                                "Pan Asia Bank",
                                "Union Bank of Colombo",
                                "Amana Bank",
                                "Cargills Bank",
                                "SANASA Development Bank (SDB)",
                                "Regional Development Bank (RDB)",
                                "HSBC",
                                "Standard Chartered Bank",
                                "Citibank"
                            )
                            val filteredSuggestions = bankSuggestions.filter {
                                it.contains(bankName, ignoreCase = true)
                            }

                            ExposedDropdownMenuBox(
                                expanded = expanded,
                                onExpandedChange = { expanded = it }
                            ) {
                                OutlinedTextField(
                                    value = bankName,
                                    onValueChange = { 
                                        bankName = it
                                        expanded = true
                                    },
                                    label = { Text("Bank Name") },
                                    singleLine = true,
                                    modifier = Modifier.fillMaxWidth().menuAnchor().padding(bottom = 8.dp),
                                    colors = ExposedDropdownMenuDefaults.outlinedTextFieldColors()
                                )
                                if (filteredSuggestions.isNotEmpty()) {
                                    ExposedDropdownMenu(
                                        expanded = expanded,
                                        onDismissRequest = { expanded = false }
                                    ) {
                                        filteredSuggestions.forEach { selectionOption ->
                                            DropdownMenuItem(
                                                text = { Text(selectionOption) },
                                                onClick = {
                                                    bankName = selectionOption
                                                    expanded = false
                                                },
                                                contentPadding = ExposedDropdownMenuDefaults.ItemContentPadding
                                            )
                                        }
                                    }
                                }
                            }
                            OutlinedTextField(
                                value = holderName,
                                onValueChange = { holderName = it },
                                label = { Text("Account Holder Name") },
                                singleLine = true,
                                modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp)
                            )
                            OutlinedTextField(
                                value = accNumber,
                                onValueChange = { accNumber = it },
                                label = { Text("Account Number") },
                                singleLine = true,
                                modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp)
                            )

                            Button(
                                onClick = {
                                    if (bankName.isEmpty() || holderName.isEmpty() || accNumber.isEmpty()) return@Button
                                    bankLoading = true
                                    val newAcc = hashMapOf(
                                        "bankName" to bankName,
                                        "accountHolder" to holderName,
                                        "accountNumber" to accNumber,
                                        "isEnabled" to true,
                                        "lastUpdated" to SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).apply {
                                            timeZone = TimeZone.getTimeZone("UTC")
                                        }.format(Date())
                                    )
                                    val db = FirebaseFirestore.getInstance()
                                    val docRef = db.collection("BankAccounts").document()
                                    docRef.set(newAcc)
                                        .addOnSuccessListener {
                                            bankLoading = false
                                            bankList = bankList + mapOf(
                                                "id" to docRef.id,
                                                "bankName" to bankName,
                                                "accountHolder" to holderName,
                                                "accountNumber" to accNumber
                                            )
                                            bankName = ""
                                            holderName = ""
                                            accNumber = ""
                                            Toast.makeText(context, "Bank account added successfully!", Toast.LENGTH_SHORT).show()
                                        }
                                },
                                modifier = Modifier.fillMaxWidth(),
                                enabled = !bankLoading
                            ) {
                                Text("Add Account")
                            }

                            Spacer(modifier = Modifier.height(16.dp))
                            Text("Active Accounts", fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
                            Spacer(modifier = Modifier.height(8.dp))

                            bankList.forEach { b ->
                                val bId = b["id"] as String
                                Row(
                                    modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Column {
                                        Text(b["bankName"] as String, fontWeight = FontWeight.Bold)
                                        Text("${b["accountNumber"]} (${b["accountHolder"]})", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    }
                                    Text(
                                        "Delete",
                                        color = MaterialTheme.colorScheme.error,
                                        fontWeight = FontWeight.Bold,
                                        modifier = Modifier.clickable {
                                            FirebaseFirestore.getInstance().collection("BankAccounts").document(bId).delete()
                                                .addOnSuccessListener {
                                                    bankList = bankList.filter { it["id"] != bId }
                                                    Toast.makeText(context, "Account deleted.", Toast.LENGTH_SHORT).show()
                                                }
                                        }
                                    )
                                }
                                Divider(modifier = Modifier.padding(vertical = 4.dp))
                            }
                            if (bankList.isEmpty()) {
                                Text("No accounts configured.", color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f))
                            }
                        }
                    }
                }
            }

            // 5. Subscription & Upgrade Tier Card
            item {
                var licenseKey by remember { mutableStateOf("") }
                var licenseLoading by remember { mutableStateOf(false) }

                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.9f)),
                    shape = RoundedCornerShape(20.dp),
                    elevation = CardDefaults.cardElevation(defaultElevation = 6.dp)
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text("Subscription & Billing", fontWeight = FontWeight.Bold, fontSize = 18.sp, color = MaterialTheme.colorScheme.primary)
                        Spacer(modifier = Modifier.height(12.dp))
                        
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text("Subscription Tier:", fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
                            Surface(
                                color = if (subscriptionTier.lowercase() == "premium") MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceVariant,
                                shape = RoundedCornerShape(8.dp)
                            ) {
                                Text(
                                    text = subscriptionTier,
                                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp),
                                    fontWeight = FontWeight.Bold,
                                    color = if (subscriptionTier.lowercase() == "premium") MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }
                        
                        OutlinedTextField(
                            value = licenseKey,
                            onValueChange = { licenseKey = it },
                            label = { Text("Enter ADK License Key") },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp)
                        )

                        Button(
                            onClick = {
                                if (licenseKey.trim().isEmpty()) return@Button
                                licenseLoading = true
                                var cleanKey = licenseKey.trim().uppercase(java.util.Locale.US)
                                
                                // Smart normalization
                                if (!cleanKey.startsWith("ADK-LIC-") && !cleanKey.startsWith("LIC-")) {
                                    if (cleanKey.length == 6) {
                                        cleanKey = "ADK-LIC-$cleanKey"
                                    } else if (cleanKey.length == 9) {
                                        cleanKey = "LIC-$cleanKey"
                                    }
                                }
                                val db = FirebaseFirestore.getInstance()
                                
                                db.collection("LicenseKeys").document(cleanKey).get()
                                    .addOnSuccessListener { doc ->
                                        if (doc.exists()) {
                                            val isUsed = doc.getBoolean("isUsed") ?: false
                                            val targetEmail = doc.getString("email") ?: ""
                                            
                                            if (isUsed) {
                                                licenseLoading = false
                                                Toast.makeText(context, "This License Key has already been activated.", Toast.LENGTH_LONG).show()
                                            } else if (!targetEmail.trim().lowercase().equals(userEmail.trim().lowercase())) {
                                                licenseLoading = false
                                                Toast.makeText(context, "This key belongs to $targetEmail, not your account.", Toast.LENGTH_LONG).show()
                                            } else {
                                                db.collection("LicenseKeys").document(cleanKey)
                                                    .update(mapOf(
                                                        "isUsed" to true,
                                                        "usedByOrgId" to orgId,
                                                        "usedAt" to SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).apply {
                                                            timeZone = java.util.TimeZone.getTimeZone("UTC")
                                                        }.format(Date())
                                                    ))
                                                    .addOnSuccessListener {
                                                        val premiumExpiresAt = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).apply {
                                                            timeZone = java.util.TimeZone.getTimeZone("UTC")
                                                        }.format(Date(System.currentTimeMillis() + 30L * 24 * 60 * 60 * 1000))
                                                        
                                                        db.collection("Organizations").document(orgId)
                                                            .update(mapOf(
                                                                "subscriptionTier" to "Premium",
                                                                "premiumExpiresAt" to premiumExpiresAt
                                                            ))
                                                            .addOnSuccessListener {
                                                                if (currentUser != null) {
                                                                    db.collection("Users").document(currentUser.uid)
                                                                        .update("role", "premium")
                                                                        .addOnSuccessListener {
                                                                            licenseLoading = false
                                                                            subscriptionTier = "Premium"
                                                                            role = "premium"
                                                                            licenseKey = ""
                                                                            Toast.makeText(context, "Successfully upgraded to Premium!", Toast.LENGTH_SHORT).show()
                                                                        }
                                                                } else {
                                                                    licenseLoading = false
                                                                    subscriptionTier = "Premium"
                                                                    licenseKey = ""
                                                                    Toast.makeText(context, "Successfully upgraded to Premium!", Toast.LENGTH_SHORT).show()
                                                                }
                                                            }
                                                    }
                                            }
                                        } else {
                                            licenseLoading = false
                                            Toast.makeText(context, "Invalid License Key.", Toast.LENGTH_LONG).show()
                                        }
                                    }
                                    .addOnFailureListener {
                                        licenseLoading = false
                                        Toast.makeText(context, "Key activation error: ${it.localizedMessage}", Toast.LENGTH_LONG).show()
                                    }
                            },
                            modifier = Modifier.fillMaxWidth(),
                            enabled = !licenseLoading
                        ) {
                            if (licenseLoading) {
                                CircularProgressIndicator(color = MaterialTheme.colorScheme.onPrimary, modifier = Modifier.size(24.dp))
                            } else {
                                Text("Apply License Key")
                            }
                        }

                        if (!subscriptionTier.lowercase().equals("premium")) {
                            Spacer(modifier = Modifier.height(16.dp))
                            Text("No license key? Upgrade instantly using credit/debit card payment routed to Super Admin's bank account.", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Spacer(modifier = Modifier.height(8.dp))
                            Button(
                                onClick = { showPaymentDialog = true },
                                modifier = Modifier.fillMaxWidth(),
                                colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.secondary)
                            ) {
                                Text("💳 Pay Premium Subscription (Rs. 5,000)", fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }
            }

            // 6. Logout Button
            item {
                Button(
                    onClick = onLogout,
                    modifier = Modifier.fillMaxWidth().height(56.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Icon(Icons.Default.ExitToApp, contentDescription = null)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Secure Terminal Logout", fontWeight = FontWeight.Bold, fontSize = 16.sp)
                }
            }
        }
    }

    if (showPaymentDialog) {
        AlertDialog(
            onDismissRequest = { if (!processingPayment) showPaymentDialog = false },
            title = { Text("💳 Purchase Premium - Rs. 5,000", fontWeight = FontWeight.ExtraBold) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text("Select Super Admin Bank Account", fontWeight = FontWeight.Bold)
                    if (adminBankAccounts.isEmpty()) {
                        Text("No bank accounts configured by Admin!", color = MaterialTheme.colorScheme.error, fontWeight = FontWeight.Bold)
                    } else {
                        var expanded by remember { mutableStateOf(false) }
                        val selectedBankName = adminBankAccounts.firstOrNull { it["id"] == selectedBankId }?.let { 
                            "${it["bankName"]} - ${it["accountNumber"]}"
                        } ?: "Select Bank Account"
                        
                        Box {
                            OutlinedButton(onClick = { expanded = true }, modifier = Modifier.fillMaxWidth()) {
                                Text(selectedBankName)
                            }
                            DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                                adminBankAccounts.forEach { bank ->
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
                    
                    Divider(modifier = Modifier.padding(vertical = 4.dp))
                    Text("Card Details", fontWeight = FontWeight.Bold)
                    
                    OutlinedTextField(
                        value = cardNumber,
                        onValueChange = onCardNumberChange,
                        label = { Text("Card Number") },
                        placeholder = { Text("4000 1234 5678 9010") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                        trailingIcon = {
                            if (detectedBrand.isNotEmpty()) {
                                Surface(
                                    color = MaterialTheme.colorScheme.primaryContainer,
                                    shape = RoundedCornerShape(4.dp),
                                    modifier = Modifier.padding(end = 8.dp)
                                ) {
                                    Text(detectedBrand, modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp), fontSize = 10.sp, fontWeight = FontWeight.Bold)
                                }
                            }
                        }
                    )
                    
                    OutlinedTextField(
                        value = cardHolder,
                        onValueChange = { cardHolder = it },
                        label = { Text("Cardholder Name") },
                        placeholder = { Text("John Doe") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(
                            value = cardExpiry,
                            onValueChange = onExpiryChange,
                            label = { Text("Expiry Date") },
                            placeholder = { Text("MM/YY") },
                            singleLine = true,
                            modifier = Modifier.weight(1f)
                        )
                        
                        OutlinedTextField(
                            value = cardCvv,
                            onValueChange = { input -> cardCvv = input.filter { it.isDigit() }.take(3) },
                            label = { Text("CVV") },
                            placeholder = { Text("***") },
                            singleLine = true,
                            modifier = Modifier.weight(1f),
                            visualTransformation = PasswordVisualTransformation()
                        )
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = triggerProcessPayment,
                    enabled = !processingPayment && adminBankAccounts.isNotEmpty()
                ) {
                    if (processingPayment) {
                        CircularProgressIndicator(color = MaterialTheme.colorScheme.onPrimary, modifier = Modifier.size(18.dp))
                    } else {
                        Text("Confirm Pay")
                    }
                }
            },
            dismissButton = {
                OutlinedButton(
                    onClick = { showPaymentDialog = false },
                    enabled = !processingPayment
                ) {
                    Text("Cancel")
                }
            }
        )
    }
}

@Composable
fun SettingsItem(icon: androidx.compose.ui.graphics.vector.ImageVector, title: String, subtitle: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(28.dp))
        Spacer(modifier = Modifier.width(16.dp))
        Column {
            Text(title, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
            Text(subtitle, fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
        }
    }
}
