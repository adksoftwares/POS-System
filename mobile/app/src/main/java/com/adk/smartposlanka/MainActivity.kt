package com.adk.smartposlanka

import android.content.Context
import android.content.SharedPreferences
import android.os.Bundle
import android.widget.Toast
import androidx.activity.compose.setContent
import androidx.appcompat.app.AppCompatActivity
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.room.Room
import com.adk.smartposlanka.data.local.PosDatabase
import com.adk.smartposlanka.data.remote.SyncManager
import com.adk.smartposlanka.ui.PosViewModel
import com.adk.smartposlanka.ui.screens.DashboardScreen
import com.adk.smartposlanka.ui.screens.LoginScreen
import com.adk.smartposlanka.ui.screens.PosScreen
import com.google.firebase.FirebaseApp
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore

// Biometrics & NFC
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import android.nfc.NfcAdapter
import android.nfc.Tag
import android.content.Intent

// Native PDF and Printing Integration
import android.graphics.pdf.PdfDocument
import android.graphics.Paint
import android.os.Environment
import android.print.PrintManager
import android.print.PrintDocumentAdapter
import android.print.PrintDocumentInfo
import android.print.PageRange
import android.os.ParcelFileDescriptor
import android.os.CancellationSignal
import java.io.File
import java.io.FileOutputStream
import java.io.FileInputStream
import java.io.InputStream
import java.io.OutputStream
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class MainActivity : AppCompatActivity() {
    private lateinit var sharedPreferences: SharedPreferences
    private var nfcAdapter: NfcAdapter? = null

    // Prepare Biometric Authentication Architecture
    fun promptBiometricAuth(onSuccess: () -> Unit) {
        val executor = ContextCompat.getMainExecutor(this)
        val biometricPrompt = BiometricPrompt(this, executor,
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    super.onAuthenticationSucceeded(result)
                    onSuccess()
                }
            })

        val promptInfo = BiometricPrompt.PromptInfo.Builder()
            .setTitle("ADK POS Secure Login")
            .setSubtitle("Use your fingerprint to authenticate")
            .setNegativeButtonText("Cancel")
            .build()

        biometricPrompt.authenticate(promptInfo)
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        if (NfcAdapter.ACTION_TAG_DISCOVERED == intent?.action) {
            val tag = intent.getParcelableExtra<Tag>(NfcAdapter.EXTRA_TAG)
            Toast.makeText(this, "NFC Tag Scanned", Toast.LENGTH_SHORT).show()
        }
    }

    // Expose PDF generation, saving, and printing helper to Compose screens
    fun printAndDownloadReceipt(
        receiptId: String,
        shopName: String,
        address: String,
        phone: String,
        items: List<Map<String, Any>>, // name, price, qty
        subtotal: Double,
        discount: Double,
        total: Double,
        cashier: String,
        paymentMethod: String
    ) {
        try {
            // 1. Generate PDF document using native Android PdfDocument
            val pdfDocument = android.graphics.pdf.PdfDocument()
            
            val linePaint = android.graphics.Paint().apply {
                color = android.graphics.Color.LTGRAY
                strokeWidth = 1f
                style = android.graphics.Paint.Style.STROKE
            }
            
            val bgPaint = android.graphics.Paint().apply {
                color = android.graphics.Color.parseColor("#F5F5F5")
                style = android.graphics.Paint.Style.FILL
            }

            // Estimate page height dynamically to fit wrapped text
            val paint = android.graphics.Paint().apply {
                textSize = 9f
            }
            
            // Helper function to wrap text within max width
            fun wrapText(text: String, maxWidth: Float, textPaint: android.graphics.Paint): List<String> {
                val words = text.split(" ")
                val lines = mutableListOf<String>()
                var currentLine = ""
                for (word in words) {
                    val testLine = if (currentLine.isEmpty()) word else "$currentLine $word"
                    if (textPaint.measureText(testLine) <= maxWidth) {
                        currentLine = testLine
                    } else {
                        if (currentLine.isNotEmpty()) {
                            lines.add(currentLine)
                        }
                        currentLine = word
                    }
                }
                if (currentLine.isNotEmpty()) {
                    lines.add(currentLine)
                }
                return lines
            }

            // Calculate height dynamically
            var calculatedHeight = 265f // margins, headers, metadata (including paymentMethod), footer
            for (item in items) {
                val name = item["name"] as? String ?: "Unknown"
                val wrappedLines = wrapText(name, 130f, paint)
                val disc = item["discount"] as? Double ?: 0.0
                calculatedHeight += (wrappedLines.size * 12f) + (if (disc > 0.0) 10f else 0f) + 2f
            }
            
            val pageHeight = Math.max(500, calculatedHeight.toInt() + 100)
            val pageInfo = android.graphics.pdf.PdfDocument.PageInfo.Builder(300, pageHeight, 1).create()
            val page = pdfDocument.startPage(pageInfo)
            val canvas = page.canvas
            
            var y = 30f
            
            // Paint Header
            paint.textAlign = android.graphics.Paint.Align.CENTER
            paint.textSize = 12f
            paint.isFakeBoldText = true
            canvas.drawText(shopName.uppercase(), 150f, y, paint)
            y += 18f
            
            paint.textSize = 8f
            paint.isFakeBoldText = false
            canvas.drawText(address, 150f, y, paint)
            y += 13f
            canvas.drawText("Tel: $phone", 150f, y, paint)
            y += 15f
            
            // Divider
            canvas.drawLine(20f, y, 280f, y, linePaint)
            y += 15f
            
            // Paint Metadata
            paint.textAlign = android.graphics.Paint.Align.LEFT
            canvas.drawText("Invoice: $receiptId", 20f, y, paint)
            y += 13f
            val dateStr = java.text.SimpleDateFormat("yyyy-MM-dd HH:mm", java.util.Locale.getDefault()).format(java.util.Date())
            canvas.drawText("Date   : $dateStr", 20f, y, paint)
            y += 13f
            val cashierName = if (cashier.contains("@")) cashier.split("@")[0] else cashier
            canvas.drawText("Cashier: $cashierName", 20f, y, paint)
            y += 13f
            canvas.drawText("Payment: ${paymentMethod.uppercase()}", 20f, y, paint)
            y += 10f
            
            // Divider
            canvas.drawLine(20f, y, 280f, y, linePaint)
            y += 15f
            
            // Paint Table Headers
            paint.isFakeBoldText = true
            paint.textSize = 8f
            paint.textAlign = android.graphics.Paint.Align.LEFT
            canvas.drawText("Item", 20f, y, paint)
            canvas.drawText("Qty x Price", 160f, y, paint)
            paint.textAlign = android.graphics.Paint.Align.RIGHT
            canvas.drawText("Total (Rs.)", 280f, y, paint)
            y += 8f
            
            // Divider
            canvas.drawLine(20f, y, 280f, y, linePaint)
            y += 5f
            
            // Paint Items
            for (item in items) {
                val name = item["name"] as? String ?: "Unknown"
                val price = item["price"] as? Double ?: 0.0
                val qty = item["quantity"] as? Int ?: 0
                val disc = item["discount"] as? Double ?: 0.0
                val itemTotal = (price * qty) - disc
                
                val firstLineY = y + 12f
                
                // Draw name lines in Column 1
                paint.isFakeBoldText = true
                paint.textSize = 8f
                paint.textAlign = android.graphics.Paint.Align.LEFT
                val wrapped = wrapText(name, 130f, paint)
                for (line in wrapped) {
                    y += 12f
                    canvas.drawText(line, 20f, y, paint)
                }
                
                // Draw Qty x Price in Column 2 at firstLineY
                paint.isFakeBoldText = false
                paint.textSize = 8f
                val qtyPriceStr = "$qty x ${String.format(java.util.Locale.US, "%.2f", price)}"
                canvas.drawText(qtyPriceStr, 160f, firstLineY, paint)
                
                // Draw total in Column 3 at firstLineY (right-aligned)
                paint.textAlign = android.graphics.Paint.Align.RIGHT
                paint.isFakeBoldText = true
                canvas.drawText(String.format(java.util.Locale.US, "%.2f", itemTotal), 280f, firstLineY, paint)
                
                // Draw discount details below name if any
                if (disc > 0.0) {
                    y += 10f
                    paint.isFakeBoldText = false
                    paint.textSize = 7.5f
                    paint.textAlign = android.graphics.Paint.Align.LEFT
                    canvas.drawText("  (-Rs. ${String.format(java.util.Locale.US, "%.2f", disc)})", 20f, y, paint)
                }
                
                y += 2f
            }
            
            y += 8f
            // Divider
            canvas.drawLine(20f, y, 280f, y, linePaint)
            y += 15f
            
            // Paint Totals
            paint.isFakeBoldText = false
            paint.textSize = 8f
            paint.textAlign = android.graphics.Paint.Align.LEFT
            canvas.drawText("Subtotal:", 20f, y, paint)
            paint.textAlign = android.graphics.Paint.Align.RIGHT
            canvas.drawText(String.format(java.util.Locale.US, "%.2f", subtotal), 280f, y, paint)
            
            if (discount > 0.0) {
                y += 13f
                paint.textAlign = android.graphics.Paint.Align.LEFT
                canvas.drawText("Discount:", 20f, y, paint)
                paint.textAlign = android.graphics.Paint.Align.RIGHT
                canvas.drawText(String.format(java.util.Locale.US, "-%.2f", discount), 280f, y, paint)
            }
            
            // Grand Total highlights box
            y += 18f
            canvas.drawRect(20f, y - 10f, 280f, y + 15f, bgPaint)
            
            paint.textSize = 9f
            paint.isFakeBoldText = true
            paint.textAlign = android.graphics.Paint.Align.LEFT
            canvas.drawText("GRAND TOTAL:", 28f, y + 3f, paint)
            paint.textAlign = android.graphics.Paint.Align.RIGHT
            canvas.drawText(String.format(java.util.Locale.US, "Rs. %.2f", total), 272f, y + 3f, paint)
            
            y += 25f
            // Divider
            canvas.drawLine(20f, y, 280f, y, linePaint)
            y += 18f
            
            // Paint Footer
            paint.textSize = 8f
            paint.isFakeBoldText = false
            paint.textAlign = android.graphics.Paint.Align.CENTER
            canvas.drawText("THANK YOU FOR SHOPPING WITH US!", 150f, y, paint)
            y += 13f
            canvas.drawText("Please come again.", 150f, y, paint)
            y += 13f
            paint.textSize = 7f
            canvas.drawText("Powered by ADK Software Solutions", 150f, y, paint)
            
            pdfDocument.finishPage(page)
            
            // 2. Download/Save PDF locally to the public downloads folder
            val downloadsDir = android.os.Environment.getExternalStoragePublicDirectory(android.os.Environment.DIRECTORY_DOWNLOADS)
            if (!downloadsDir.exists()) downloadsDir.mkdirs()
            val pdfFile = java.io.File(downloadsDir, "Receipt_$receiptId.pdf")
            pdfDocument.writeTo(java.io.FileOutputStream(pdfFile))
            pdfDocument.close()
            
            Toast.makeText(this, "Receipt saved to Downloads", Toast.LENGTH_LONG).show()
            
            // 3. Trigger print spooler immediately via native PrintManager
            val printManager = this.getSystemService(Context.PRINT_SERVICE) as android.print.PrintManager
            val jobName = "ADK Smart POS Document"
            
            val printAdapter = object : android.print.PrintDocumentAdapter() {
                override fun onLayout(
                    oldAttributes: android.print.PrintAttributes?,
                    newAttributes: android.print.PrintAttributes,
                    cancellationSignal: android.os.CancellationSignal?,
                    callback: LayoutResultCallback,
                    extras: Bundle?
                ) {
                    if (cancellationSignal?.isCanceled == true) {
                        callback.onLayoutCancelled()
                        return
                    }
                    val builder = android.print.PrintDocumentInfo.Builder("Receipt_$receiptId.pdf")
                        .setContentType(android.print.PrintDocumentInfo.CONTENT_TYPE_DOCUMENT)
                        .setPageCount(1)
                    callback.onLayoutFinished(builder.build(), true)
                }
 
                override fun onWrite(
                    pages: Array<out android.print.PageRange>?,
                    destination: android.os.ParcelFileDescriptor?,
                    cancellationSignal: android.os.CancellationSignal?,
                    callback: WriteResultCallback
                ) {
                    var input: java.io.InputStream? = null
                    var output: java.io.OutputStream? = null
                    try {
                        input = java.io.FileInputStream(pdfFile)
                        output = java.io.FileOutputStream(destination?.fileDescriptor)
                        val buf = ByteArray(1024)
                        var bytesRead: Int
                        while (input.read(buf).also { bytesRead = it } > 0) {
                            output.write(buf, 0, bytesRead)
                        }
                        callback.onWriteFinished(arrayOf(android.print.PageRange.ALL_PAGES))
                    } catch (ee: Exception) {
                        callback.onWriteFailed(ee.toString())
                    } finally {
                        input?.close()
                        output?.close()
                    }
                }
            }
            
            printManager.print(jobName, printAdapter, null)
            
        } catch (e: Exception) {
            e.printStackTrace()
            Toast.makeText(this, "Print failed: ${e.localizedMessage}", Toast.LENGTH_LONG).show()
        }
    }

    // Expose native PDF Z-Report generation and download interface
    fun downloadZReport(
        filter: String,
        revenue: Double,
        bills: Int,
        itemsSold: Int,
        topSellers: List<Map<String, Any>>
    ) {
        try {
            val pdfDocument = android.graphics.pdf.PdfDocument()
            
            val linePaint = android.graphics.Paint().apply {
                color = android.graphics.Color.LTGRAY
                strokeWidth = 1f
                style = android.graphics.Paint.Style.STROKE
            }

            val paint = android.graphics.Paint().apply {
                textSize = 9f
            }

            fun wrapText(text: String, maxWidth: Float, textPaint: android.graphics.Paint): List<String> {
                val words = text.split(" ")
                val lines = mutableListOf<String>()
                var currentLine = ""
                for (word in words) {
                    val testLine = if (currentLine.isEmpty()) word else "$currentLine $word"
                    if (textPaint.measureText(testLine) <= maxWidth) {
                        currentLine = testLine
                    } else {
                        if (currentLine.isNotEmpty()) {
                            lines.add(currentLine)
                        }
                        currentLine = word
                    }
                }
                if (currentLine.isNotEmpty()) {
                    lines.add(currentLine)
                }
                return lines
            }

            var calculatedHeight = 250f
            for (item in topSellers) {
                val name = item["name"] as? String ?: "Unknown"
                val wrappedLines = wrapText(name, 130f, paint)
                calculatedHeight += (wrappedLines.size * 12f) + 2f
            }
            
            val pageHeight = Math.max(500, calculatedHeight.toInt() + 100)
            val pageInfo = android.graphics.pdf.PdfDocument.PageInfo.Builder(300, pageHeight, 1).create()
            val page = pdfDocument.startPage(pageInfo)
            val canvas = page.canvas
            
            var y = 30f
            
            // Paint Title
            paint.textAlign = android.graphics.Paint.Align.CENTER
            paint.textSize = 12f
            paint.isFakeBoldText = true
            canvas.drawText("Z-REPORT: ${filter.uppercase()}", 150f, y, paint)
            y += 18f
            
            paint.textSize = 8f
            paint.isFakeBoldText = false
            val dateStr = java.text.SimpleDateFormat("yyyy-MM-dd HH:mm", java.util.Locale.getDefault()).format(java.util.Date())
            canvas.drawText("Generated: $dateStr", 150f, y, paint)
            y += 15f
            
            // Divider
            canvas.drawLine(20f, y, 280f, y, linePaint)
            y += 15f
            
            // Paint Metrics
            paint.textAlign = android.graphics.Paint.Align.LEFT
            canvas.drawText("Total Revenue:", 20f, y, paint)
            paint.textAlign = android.graphics.Paint.Align.RIGHT
            canvas.drawText(String.format(java.util.Locale.US, "Rs. %.2f", revenue), 280f, y, paint)
            
            y += 13f
            paint.textAlign = android.graphics.Paint.Align.LEFT
            canvas.drawText("Total Bills:", 20f, y, paint)
            paint.textAlign = android.graphics.Paint.Align.RIGHT
            canvas.drawText(bills.toString(), 280f, y, paint)
            
            y += 13f
            paint.textAlign = android.graphics.Paint.Align.LEFT
            canvas.drawText("Items Sold:", 20f, y, paint)
            paint.textAlign = android.graphics.Paint.Align.RIGHT
            canvas.drawText(itemsSold.toString(), 280f, y, paint)
            y += 15f
            
            // Divider
            canvas.drawLine(20f, y, 280f, y, linePaint)
            y += 15f
            
            // Paint Top Sellers Table Headers
            paint.isFakeBoldText = true
            paint.textSize = 8f
            paint.textAlign = android.graphics.Paint.Align.LEFT
            canvas.drawText("Product", 20f, y, paint)
            canvas.drawText("Qty", 160f, y, paint)
            paint.textAlign = android.graphics.Paint.Align.RIGHT
            canvas.drawText("Revenue (Rs.)", 280f, y, paint)
            y += 8f
            
            // Divider
            canvas.drawLine(20f, y, 280f, y, linePaint)
            y += 5f
            
            // Paint Top Sellers Items
            for (item in topSellers) {
                val name = item["name"] as? String ?: "Unknown"
                val qty = item["quantity"] as? Int ?: 0
                val itemRev = item["revenue"] as? Double ?: 0.0
                
                val firstLineY = y + 12f
                
                // Draw name lines in Column 1
                paint.isFakeBoldText = true
                paint.textSize = 8f
                paint.textAlign = android.graphics.Paint.Align.LEFT
                val wrapped = wrapText(name, 130f, paint)
                for (line in wrapped) {
                    y += 12f
                    canvas.drawText(line, 20f, y, paint)
                }
                
                // Draw qty in Column 2 at firstLineY
                paint.isFakeBoldText = false
                paint.textSize = 8f
                canvas.drawText(qty.toString(), 160f, firstLineY, paint)
                
                // Draw revenue right-aligned at firstLineY
                paint.textAlign = android.graphics.Paint.Align.RIGHT
                paint.isFakeBoldText = true
                canvas.drawText(String.format(java.util.Locale.US, "%.2f", itemRev), 280f, firstLineY, paint)
                
                y = firstLineY + 2f
            }
            
            y += 15f
            // Divider
            canvas.drawLine(20f, y, 280f, y, linePaint)
            y += 18f
            
            // Paint Footer
            paint.textSize = 8f
            paint.isFakeBoldText = false
            paint.textAlign = android.graphics.Paint.Align.CENTER
            canvas.drawText("End of Z-Report", 150f, y, paint)
            y += 13f
            paint.textSize = 7f
            canvas.drawText("Powered by ADK Software Solutions", 150f, y, paint)
            
            pdfDocument.finishPage(page)
            
            val downloadsDir = android.os.Environment.getExternalStoragePublicDirectory(android.os.Environment.DIRECTORY_DOWNLOADS)
            if (!downloadsDir.exists()) downloadsDir.mkdirs()
            val pdfFile = java.io.File(downloadsDir, "Z-Report_${filter.replace(" ", "_")}_${System.currentTimeMillis()}.pdf")
            pdfDocument.writeTo(java.io.FileOutputStream(pdfFile))
            pdfDocument.close()
            
            Toast.makeText(this, "Z-Report saved to Downloads folder", Toast.LENGTH_LONG).show()
        } catch (e: Exception) {
            e.printStackTrace()
            Toast.makeText(this, "Failed to download Z-Report: ${e.localizedMessage}", Toast.LENGTH_LONG).show()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        try {
            FirebaseApp.initializeApp(this)
        } catch (e: Exception) {
            e.printStackTrace()
        }
        
        // Native window decorators to align system bars with the premium theme
        window.statusBarColor = android.graphics.Color.parseColor("#070A13")
        window.navigationBarColor = android.graphics.Color.parseColor("#0D111D")
        
        sharedPreferences = getSharedPreferences("ADK_POS_PREFS", Context.MODE_PRIVATE)
        val firestore = FirebaseFirestore.getInstance()

        val db = Room.databaseBuilder(
            applicationContext,
            PosDatabase::class.java,
            "adk_pos_db"
        ).fallbackToDestructiveMigration().build()

        val productDao = db.productDao()
        val attendanceLogDao = db.attendanceLogDao()
        val syncManager = SyncManager(firestore, productDao, attendanceLogDao)

        val viewModelFactory = object : ViewModelProvider.Factory {
            override fun <T : ViewModel> create(modelClass: Class<T>): T {
                if (modelClass.isAssignableFrom(PosViewModel::class.java)) {
                    @Suppress("UNCHECKED_CAST")
                    return PosViewModel(productDao, syncManager, attendanceLogDao) as T
                }
                throw IllegalArgumentException("Unknown ViewModel class")
            }
        }

        val viewModel = ViewModelProvider(this, viewModelFactory)[PosViewModel::class.java]

        setContent {
            MaterialTheme(
                colorScheme = darkColorScheme(
                    primary = Color(0xFF6366F1),
                    secondary = Color(0xFF10B981),
                    background = Color(0xFF070A13),
                    surface = Color(0xFF0D111D),
                    onPrimary = Color.White,
                    onSecondary = Color.White,
                    onBackground = Color(0xFFF8FAFC),
                    onSurface = Color(0xFFF8FAFC)
                )
            ) {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    AppNavigation(this, viewModel, sharedPreferences)
                }
            }
        }
    }
}

@Composable
fun AppNavigation(activity: MainActivity, viewModel: PosViewModel, prefs: SharedPreferences) {
    var isLoggedIn by remember { mutableStateOf(prefs.getBoolean("is_logged_in", false)) }
    var currentScreen by remember { mutableStateOf("dashboard") } 
    
    var currentOrgId by remember { mutableStateOf(prefs.getString("org_id", "") ?: "") }
    var currentBranchId by remember { mutableStateOf(prefs.getString("branch_id", "Main") ?: "Main") }

    LaunchedEffect(isLoggedIn, currentOrgId, currentBranchId) {
        if (isLoggedIn) {
            val currentUser = FirebaseAuth.getInstance().currentUser
            if (currentUser != null) {
                FirebaseFirestore.getInstance().collection("Users").document(currentUser.uid).get()
                    .addOnSuccessListener { doc ->
                        if (doc.exists()) {
                            val orgId = doc.getString("organizationId") ?: ""
                            val branchId = doc.getString("branchId") ?: "Main"
                            if (orgId.isNotEmpty() && orgId != currentOrgId) {
                                viewModel.clearLocalData()
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
            if (currentOrgId.isNotEmpty()) {
                viewModel.startRealtimeSync(currentOrgId, currentBranchId)
            }
        }
    }

    if (!isLoggedIn) {
        LoginScreen(
            onLoginSuccess = { orgId ->
                prefs.edit()
                    .putBoolean("is_logged_in", true)
                    .putString("org_id", orgId)
                    .apply()
                currentOrgId = orgId
                isLoggedIn = true
            },
            onBiometricAuthClick = {
                activity.promptBiometricAuth {
                    // Bypass with dummy on biometric success for demo
                    prefs.edit().putBoolean("is_logged_in", true).apply()
                    isLoggedIn = true
                }
            }
        )
    } else {
        when (currentScreen) {
            "dashboard" -> DashboardScreen(
                viewModel = viewModel,
                orgId = currentOrgId,
                branchId = currentBranchId,
                onLogout = {
                    viewModel.clearLocalData()
                    FirebaseAuth.getInstance().signOut()
                    prefs.edit().putBoolean("is_logged_in", false).apply()
                    currentOrgId = ""
                    isLoggedIn = false
                },
                onGoToPos = { currentScreen = "pos" },
                onDownloadZReport = { filter, revenue, bills, itemsSold, topSellers ->
                    activity.downloadZReport(filter, revenue, bills, itemsSold, topSellers)
                }
            )
            "pos" -> PosScreen(
                viewModel = viewModel,
                orgId = currentOrgId,
                branchId = currentBranchId,
                onMenuClick = { currentScreen = "dashboard" },
                onPrintReceipt = { receiptId, shopName, address, phone, items, subtotal, discount, total, cashier, paymentMethod ->
                    activity.printAndDownloadReceipt(receiptId, shopName, address, phone, items, subtotal, discount, total, cashier, paymentMethod)
                }
            )
        }
    }
}
