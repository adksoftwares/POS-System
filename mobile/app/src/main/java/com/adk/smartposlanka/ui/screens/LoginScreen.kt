package com.adk.smartposlanka.ui.screens

import android.widget.Toast
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.KeyboardCapitalization
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.launch
import java.util.UUID
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LoginScreen(
    onLoginSuccess: (String) -> Unit,
    onBiometricAuthClick: () -> Unit
) {
    var isRegisterMode by remember { mutableStateOf(false) }
    var step by remember { mutableStateOf(1) } // Step 1: Input details, Step 2: Verification

    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var shopName by remember { mutableStateOf("") }
    var ownerName by remember { mutableStateOf("") }
    var otpCode by remember { mutableStateOf("") }

    var isLoading by remember { mutableStateOf(false) }
    var errorMsg by remember { mutableStateOf("") }

    val coroutineScope = rememberCoroutineScope()
    val context = LocalContext.current

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    colors = listOf(
                        MaterialTheme.colorScheme.primaryContainer,
                        MaterialTheme.colorScheme.background
                    )
                )
            ),
        contentAlignment = Alignment.Center
    ) {
        Card(
            modifier = Modifier
                .fillMaxWidth(0.92f)
                .padding(16.dp),
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.9f)
            ),
            elevation = CardDefaults.cardElevation(defaultElevation = 12.dp),
            shape = RoundedCornerShape(28.dp)
        ) {
            Column(
                modifier = Modifier
                    .padding(24.dp)
                    .fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(
                    text = "ADK POS",
                    fontSize = 34.sp,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.primary
                )
                Text(
                    text = if (isRegisterMode) "Register Shop & Account" else "Worldwide Professional Edition",
                    fontSize = 14.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(bottom = 24.dp)
                )

                if (errorMsg.isNotEmpty()) {
                    Surface(
                        color = MaterialTheme.colorScheme.errorContainer,
                        shape = RoundedCornerShape(8.dp),
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(bottom = 16.dp)
                    ) {
                        Text(
                            text = errorMsg,
                            color = MaterialTheme.colorScheme.onErrorContainer,
                            modifier = Modifier.padding(8.dp),
                            fontSize = 13.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                    }
                }

                if (!isRegisterMode) {
                    // LOGIN FLOW
                    OutlinedTextField(
                        value = email,
                        onValueChange = { email = it },
                        label = { Text("Email Address") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Email,
                            capitalization = KeyboardCapitalization.None
                        ),
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(bottom = 16.dp),
                        shape = RoundedCornerShape(12.dp)
                    )

                    OutlinedTextField(
                        value = password,
                        onValueChange = { password = it },
                        label = { Text("Password") },
                        visualTransformation = PasswordVisualTransformation(),
                        singleLine = true,
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(bottom = 24.dp),
                        shape = RoundedCornerShape(12.dp)
                    )

                    Button(
                        onClick = {
                            val cleanEmail = email.trim().lowercase(Locale.US)
                            if (cleanEmail.isEmpty() || password.isEmpty()) {
                                errorMsg = "Fields cannot be empty"
                                return@Button
                            }
                            isLoading = true
                            errorMsg = ""
                            FirebaseAuth.getInstance().signInWithEmailAndPassword(cleanEmail, password)
                                .addOnSuccessListener { authResult ->
                                    val uid = authResult.user?.uid ?: ""
                                    FirebaseFirestore.getInstance().collection("Users").document(uid).get()
                                        .addOnSuccessListener { doc ->
                                            isLoading = false
                                            if (doc.exists()) {
                                                val orgId = doc.getString("organizationId") ?: ""
                                                onLoginSuccess(orgId)
                                            } else {
                                                // Self-Healing Organization creation for mobile
                                                val orgId = UUID.randomUUID().toString()
                                                val orgData = hashMapOf(
                                                    "shopName" to "ADK Supermart",
                                                    "subscriptionTier" to "Free",
                                                    "createdAt" to SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).apply {
                                                        timeZone = TimeZone.getTimeZone("UTC")
                                                    }.format(Date())
                                                )
                                                val userData = hashMapOf(
                                                    "fullName" to "Store Manager",
                                                    "email" to cleanEmail,
                                                    "role" to "Owner",
                                                    "organizationId" to orgId,
                                                    "branchId" to "Main"
                                                )
                                                FirebaseFirestore.getInstance().collection("Organizations").document(orgId).set(orgData)
                                                FirebaseFirestore.getInstance().collection("Users").document(uid).set(userData)
                                                onLoginSuccess(orgId)
                                            }
                                        }
                                        .addOnFailureListener {
                                            isLoading = false
                                            errorMsg = "Failed loading profile: ${it.localizedMessage}"
                                        }
                                }
                                .addOnFailureListener {
                                    isLoading = false
                                    errorMsg = "Incorrect email or password."
                                }
                        },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(56.dp),
                        shape = RoundedCornerShape(12.dp),
                        enabled = !isLoading
                    ) {
                        if (isLoading) {
                            CircularProgressIndicator(color = MaterialTheme.colorScheme.onPrimary, modifier = Modifier.size(24.dp))
                        } else {
                            Text("Sign In", fontSize = 16.sp, fontWeight = FontWeight.Bold)
                        }
                    }

                    Spacer(modifier = Modifier.height(16.dp))

                    OutlinedButton(
                        onClick = onBiometricAuthClick,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(56.dp),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Text("Use Fingerprint / Face ID", fontSize = 16.sp)
                    }

                    Spacer(modifier = Modifier.height(24.dp))

                    Text(
                        text = "Don't have an account? Register your shop.",
                        color = MaterialTheme.colorScheme.primary,
                        fontWeight = FontWeight.Bold,
                        textDecoration = TextDecoration.Underline,
                        modifier = Modifier.clickable {
                            isRegisterMode = true
                            step = 1
                            errorMsg = ""
                        }
                    )
                } else {
                    // REGISTRATION FLOW
                    if (step == 1) {
                        OutlinedTextField(
                            value = shopName,
                            onValueChange = { shopName = it },
                            label = { Text("Shop Name") },
                            singleLine = true,
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(bottom = 12.dp),
                            shape = RoundedCornerShape(12.dp)
                        )

                        OutlinedTextField(
                            value = ownerName,
                            onValueChange = { ownerName = it },
                            label = { Text("Owner Full Name") },
                            singleLine = true,
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(bottom = 12.dp),
                            shape = RoundedCornerShape(12.dp)
                        )

                        OutlinedTextField(
                            value = email,
                            onValueChange = { email = it },
                            label = { Text("Email Address") },
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(
                                keyboardType = KeyboardType.Email,
                                capitalization = KeyboardCapitalization.None
                            ),
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(bottom = 12.dp),
                            shape = RoundedCornerShape(12.dp)
                        )

                        OutlinedTextField(
                            value = password,
                            onValueChange = { password = it },
                            label = { Text("Password") },
                            visualTransformation = PasswordVisualTransformation(),
                            singleLine = true,
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(bottom = 20.dp),
                            shape = RoundedCornerShape(12.dp)
                        )

                        Button(
                            onClick = {
                                val cleanEmail = email.trim().lowercase(Locale.US)
                                if (shopName.isEmpty() || ownerName.isEmpty() || cleanEmail.isEmpty() || password.isEmpty()) {
                                    errorMsg = "All fields are required"
                                    return@Button
                                }
                                if (password.length < 6) {
                                    errorMsg = "Password must be at least 6 characters"
                                    return@Button
                                }
                                isLoading = true
                                errorMsg = ""

                                // Generate direct OTP verification code (resilient sandbox fallback)
                                val generatedOtp = (100000..999999).random().toString()
                                val otpData = hashMapOf(
                                    "otp" to generatedOtp,
                                    "expiresAt" to System.currentTimeMillis() + 5 * 60 * 1000
                                )

                                FirebaseFirestore.getInstance().collection("OTP_Verifications").document(cleanEmail)
                                    .set(otpData)
                                    .addOnSuccessListener {
                                        isLoading = false
                                        step = 2
                                        Toast.makeText(context, "Verification code: $generatedOtp", Toast.LENGTH_LONG).show()
                                    }
                                    .addOnFailureListener {
                                        isLoading = false
                                        errorMsg = "Failed generating verification: ${it.localizedMessage}"
                                    }
                            },
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(56.dp),
                            shape = RoundedCornerShape(12.dp),
                            enabled = !isLoading
                        ) {
                            if (isLoading) {
                                CircularProgressIndicator(color = MaterialTheme.colorScheme.onPrimary, modifier = Modifier.size(24.dp))
                            } else {
                                Text("Send Verification Code", fontSize = 16.sp, fontWeight = FontWeight.Bold)
                            }
                        }
                    } else {
                        // STEP 2: Verify OTP code
                        Text(
                            text = "A 6-digit verification code has been generated. Input the code to complete registration.",
                            fontSize = 14.sp,
                            modifier = Modifier.padding(bottom = 20.dp),
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )

                        OutlinedTextField(
                            value = otpCode,
                            onValueChange = { otpCode = it },
                            label = { Text("6-Digit Verification Code") },
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(
                                keyboardType = KeyboardType.Number
                            ),
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(bottom = 20.dp),
                            shape = RoundedCornerShape(12.dp)
                        )

                        Button(
                            onClick = {
                                val cleanOtp = otpCode.trim()
                                if (cleanOtp.isEmpty()) {
                                    errorMsg = "Verification code is required"
                                    return@Button
                                }
                                val cleanEmail = email.trim().lowercase(Locale.US)
                                isLoading = true
                                errorMsg = ""

                                FirebaseFirestore.getInstance().collection("OTP_Verifications").document(cleanEmail).get()
                                    .addOnSuccessListener { docSnapshot ->
                                        if (docSnapshot.exists()) {
                                            val validOtp = docSnapshot.getString("otp") ?: ""
                                            val expiresAt = docSnapshot.getLong("expiresAt") ?: 0L
                                            
                                            if (validOtp == cleanOtp && System.currentTimeMillis() < expiresAt) {
                                                // Create user with FirebaseAuth
                                                FirebaseAuth.getInstance().createUserWithEmailAndPassword(cleanEmail, password)
                                                    .addOnSuccessListener { authResult ->
                                                        val uid = authResult.user?.uid ?: ""
                                                        val newOrgId = UUID.randomUUID().toString()

                                                        val orgData = hashMapOf(
                                                            "shopName" to shopName,
                                                            "subscriptionTier" to "Free",
                                                            "createdAt" to SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).apply {
                                                                timeZone = TimeZone.getTimeZone("UTC")
                                                            }.format(Date())
                                                        )

                                                        val userData = hashMapOf(
                                                            "fullName" to ownerName,
                                                            "email" to cleanEmail,
                                                            "role" to "Owner",
                                                            "organizationId" to newOrgId,
                                                            "branchId" to "Main"
                                                        )

                                                        FirebaseFirestore.getInstance().collection("Organizations").document(newOrgId).set(orgData)
                                                        FirebaseFirestore.getInstance().collection("Users").document(uid).set(userData)
                                                            .addOnSuccessListener {
                                                                isLoading = false
                                                                onLoginSuccess(newOrgId)
                                                            }
                                                    }
                                                    .addOnFailureListener {
                                                        isLoading = false
                                                        errorMsg = "Auth registration failed: ${it.localizedMessage}"
                                                    }
                                            } else {
                                                isLoading = false
                                                errorMsg = "Invalid or expired verification code."
                                            }
                                        } else {
                                            isLoading = false
                                            errorMsg = "No verification request found for this email."
                                        }
                                    }
                                    .addOnFailureListener {
                                        isLoading = false
                                        errorMsg = "Failed verifying code: ${it.localizedMessage}"
                                    }
                            },
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(56.dp),
                            shape = RoundedCornerShape(12.dp),
                            enabled = !isLoading
                        ) {
                            if (isLoading) {
                                CircularProgressIndicator(color = MaterialTheme.colorScheme.onPrimary, modifier = Modifier.size(24.dp))
                            } else {
                                Text("Verify & Register", fontSize = 16.sp, fontWeight = FontWeight.Bold)
                            }
                        }

                        Spacer(modifier = Modifier.height(16.dp))

                        OutlinedButton(
                            onClick = { step = 1; errorMsg = "" },
                            modifier = Modifier.fillMaxWidth().height(56.dp),
                            shape = RoundedCornerShape(12.dp)
                        ) {
                            Text("Go Back")
                        }
                    }

                    Spacer(modifier = Modifier.height(24.dp))

                    Text(
                        text = "Already have an account? Sign In.",
                        color = MaterialTheme.colorScheme.primary,
                        fontWeight = FontWeight.Bold,
                        textDecoration = TextDecoration.Underline,
                        modifier = Modifier.clickable {
                            isRegisterMode = false
                            errorMsg = ""
                        }
                    )
                }
            }
        }
    }
}
