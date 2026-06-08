package com.adk.smartposlanka.ui.screens

import android.widget.Toast
import androidx.compose.ui.res.painterResource
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.clickable
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Build
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.adk.smartposlanka.ui.PosViewModel
import com.adk.smartposlanka.data.local.ProductEntity
import java.util.UUID
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import android.net.Uri
import android.content.Context
import kotlinx.coroutines.launch
import java.io.BufferedReader
import java.io.InputStreamReader
import androidx.compose.material.icons.filled.Search

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun InventoryScreen(
    viewModel: PosViewModel,
    orgId: String,
    branchId: String,
    paddingValues: PaddingValues
) {
    val products by viewModel.products.collectAsState()
    var showAddDialog by remember { mutableStateOf(false) }
    var isScannerOpen by remember { mutableStateOf(false) }
    var searchQuery by remember { mutableStateOf("") }

    val filteredProducts = remember(products, searchQuery) {
        if (searchQuery.isEmpty()) products else {
            products.filter { 
                it.name.contains(searchQuery, ignoreCase = true) || 
                it.barcode.contains(searchQuery, ignoreCase = true) ||
                it.category.contains(searchQuery, ignoreCase = true)
            }
        }
    }

    // Hoist Dialog form state variables to retain values when scanner overlay triggers
    var prodName by remember { mutableStateOf("") }
    var prodPrice by remember { mutableStateOf("") }
    var prodQty by remember { mutableStateOf("") }
    var prodBarcode by remember { mutableStateOf("") }
    var prodCategory by remember { mutableStateOf("General") }

    var editingProduct by remember { mutableStateOf<ProductEntity?>(null) }
    var productToDelete by remember { mutableStateOf<ProductEntity?>(null) }
    val coroutineScope = rememberCoroutineScope()

    LaunchedEffect(editingProduct) {
        editingProduct?.let {
            prodName = it.name
            prodPrice = it.price.toString()
            prodQty = it.quantity.toString()
            prodBarcode = it.barcode
            prodCategory = it.category
        }
    }

    val context = LocalContext.current

    val filePickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent()
    ) { uri: Uri? ->
        uri?.let {
            coroutineScope.launch {
                try {
                    val imported = importCsvProducts(context, it)
                    if (imported.isNotEmpty()) {
                        for (prod in imported) {
                            viewModel.addProduct(orgId, branchId, prod)
                        }
                        Toast.makeText(context, "${imported.size} Products Imported & Synced!", Toast.LENGTH_SHORT).show()
                    } else {
                        Toast.makeText(context, "No valid products found in CSV.", Toast.LENGTH_SHORT).show()
                    }
                } catch (e: Exception) {
                    Toast.makeText(context, "Error importing CSV: ${e.localizedMessage}", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    if (productToDelete != null) {
        AlertDialog(
            onDismissRequest = { productToDelete = null },
            title = { Text("Delete Product", fontWeight = FontWeight.Bold) },
            text = { Text("Are you sure you want to delete \"${productToDelete?.name}\"? This will permanently delete it from this device, the cloud, and all synced PCs.") },
            confirmButton = {
                Button(
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error),
                    onClick = {
                        productToDelete?.let { prod ->
                            viewModel.deleteProduct(orgId, branchId, prod.id)
                            Toast.makeText(context, "Product \"${prod.name}\" deleted successfully.", Toast.LENGTH_SHORT).show()
                        }
                        productToDelete = null
                    }
                ) {
                    Text("Delete")
                }
            },
            dismissButton = {
                OutlinedButton(onClick = { productToDelete = null }) {
                    Text("Cancel")
                }
            }
        )
    }

    if (isScannerOpen) {
        BarcodeScannerScreen(
            onBarcodeScanned = { code ->
                isScannerOpen = false
                prodBarcode = code
            },
            onClose = { isScannerOpen = false }
        )
        return
    }

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
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Inventory Hub",
                    fontSize = 24.sp,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onBackground
                )
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    OutlinedButton(
                        onClick = { filePickerLauncher.launch("text/*") },
                        modifier = Modifier.height(36.dp),
                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 0.dp)
                    ) {
                        Text("Import CSV", fontSize = 13.sp)
                    }
                    FilledTonalButton(
                        onClick = { showAddDialog = true },
                        modifier = Modifier.height(36.dp),
                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 0.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Add,
                            contentDescription = "Add",
                            modifier = Modifier.size(16.dp)
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Text("New Product", fontSize = 13.sp)
                    }
                }
            }
            
            Spacer(modifier = Modifier.height(16.dp))

            // Glassmorphic Search Bar
            OutlinedTextField(
                value = searchQuery,
                onValueChange = { searchQuery = it },
                placeholder = { Text("Search products by name, category or barcode...", color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f)) },
                modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp),
                shape = RoundedCornerShape(12.dp),
                singleLine = true,
                leadingIcon = {
                    Icon(Icons.Default.Search, contentDescription = "Search", tint = MaterialTheme.colorScheme.primary)
                },
                colors = OutlinedTextFieldDefaults.colors(
                    focusedContainerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.5f),
                    unfocusedContainerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.5f),
                    focusedBorderColor = MaterialTheme.colorScheme.primary,
                    unfocusedBorderColor = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.1f)
                )
            )

            // Premium Stock List
            androidx.compose.foundation.lazy.LazyColumn(
                verticalArrangement = Arrangement.spacedBy(12.dp),
                modifier = Modifier.fillMaxSize()
            ) {
                items(filteredProducts) { product ->
                    val indicatorColor = when {
                        product.quantity <= 0 -> Color(0xFFEF4444) // Out of stock: Red
                        product.quantity < 10 -> Color(0xFFF59E0B) // Low stock: Amber
                        else -> Color(0xFF6366F1) // Good stock: Indigo
                    }

                    Card(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable {
                                editingProduct = product
                                showAddDialog = true
                            },
                        colors = CardDefaults.cardColors(
                            containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.9f)
                        ),
                        elevation = CardDefaults.cardElevation(defaultElevation = 4.dp),
                        shape = RoundedCornerShape(16.dp)
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(IntrinsicSize.Min)
                        ) {
                            // Left vertical colored status indicator line
                            Box(
                                modifier = Modifier
                                    .width(6.dp)
                                    .fillMaxHeight()
                                    .background(indicatorColor)
                            )
                            
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(16.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                // Product details (Name, price, category tag, barcode)
                                Column(modifier = Modifier.weight(1f)) {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Text(
                                            text = product.name,
                                            fontSize = 18.sp,
                                            fontWeight = FontWeight.Bold,
                                            color = MaterialTheme.colorScheme.onSurface
                                        )
                                        Spacer(modifier = Modifier.width(8.dp))
                                        // Category Tag Badge
                                        Box(
                                            modifier = Modifier
                                                .clip(RoundedCornerShape(6.dp))
                                                .background(MaterialTheme.colorScheme.surfaceVariant)
                                                .padding(horizontal = 6.dp, vertical = 2.dp)
                                        ) {
                                            Text(
                                                text = product.category,
                                                fontSize = 10.sp,
                                                fontWeight = FontWeight.Bold,
                                                color = MaterialTheme.colorScheme.onSurfaceVariant
                                            )
                                        }
                                    }
                                    Spacer(modifier = Modifier.height(4.dp))
                                    if (product.barcode.isNotEmpty()) {
                                        Text(
                                            text = "Barcode: ${product.barcode}",
                                            fontSize = 12.sp,
                                            fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace,
                                            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f)
                                        )
                                    }
                                    Spacer(modifier = Modifier.height(6.dp))
                                    Text(
                                        text = "Rs. ${product.price}",
                                        fontSize = 16.sp,
                                        fontWeight = FontWeight.ExtraBold,
                                        color = MaterialTheme.colorScheme.primary
                                    )
                                }
                                
                                // Stock Status Badge & Actions
                                Column(
                                    horizontalAlignment = Alignment.End,
                                    verticalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    val badgeBgColor = when {
                                        product.quantity <= 0 -> Color(0xFFFFEBEE)
                                        product.quantity < 10 -> Color(0xFFFFF3E0)
                                        else -> Color(0xFFE8EAF6)
                                    }
                                    val badgeTextColor = when {
                                        product.quantity <= 0 -> Color(0xFFC62828)
                                        product.quantity < 10 -> Color(0xFFEF6C00)
                                        else -> Color(0xFF283593)
                                    }
                                    val badgeText = when {
                                        product.quantity <= 0 -> "Out of Stock"
                                        product.quantity < 10 -> "Low: ${product.quantity}"
                                        else -> "In Stock: ${product.quantity}"
                                    }
                                    
                                    Box(
                                        modifier = Modifier
                                            .clip(RoundedCornerShape(8.dp))
                                            .background(badgeBgColor)
                                            .padding(horizontal = 10.dp, vertical = 4.dp)
                                    ) {
                                        Text(
                                            text = badgeText,
                                            fontSize = 11.sp,
                                            fontWeight = FontWeight.Bold,
                                            color = badgeTextColor
                                        )
                                    }
                                    
                                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                        IconButton(
                                            onClick = {
                                                editingProduct = product
                                                showAddDialog = true
                                            },
                                            modifier = Modifier.size(36.dp)
                                        ) {
                                            Icon(
                                                imageVector = Icons.Default.Edit,
                                                contentDescription = "Edit",
                                                tint = MaterialTheme.colorScheme.primary,
                                                modifier = Modifier.size(20.dp)
                                            )
                                        }
                                        IconButton(
                                            onClick = {
                                                productToDelete = product
                                            },
                                            modifier = Modifier.size(36.dp)
                                        ) {
                                            Icon(
                                                imageVector = Icons.Default.Delete,
                                                contentDescription = "Delete",
                                                tint = MaterialTheme.colorScheme.error,
                                                modifier = Modifier.size(20.dp)
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

        if (showAddDialog) {
            AlertDialog(
                onDismissRequest = { 
                    showAddDialog = false
                    editingProduct = null
                    prodName = ""
                    prodPrice = ""
                    prodQty = ""
                    prodBarcode = ""
                    prodCategory = "General"
                },
                title = { Text(if (editingProduct != null) "Edit Product" else "Add New Product", fontWeight = FontWeight.Bold) },
                text = {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 8.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        OutlinedTextField(
                            value = prodName,
                            onValueChange = { prodName = it },
                            label = { Text("Product Name") },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth()
                        )
                        OutlinedTextField(
                            value = prodPrice,
                            onValueChange = { prodPrice = it },
                            label = { Text("Price (Rs.)") },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth()
                        )
                        OutlinedTextField(
                            value = prodQty,
                            onValueChange = { prodQty = it },
                            label = { Text("Quantity") },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth()
                        )
                        OutlinedTextField(
                            value = prodBarcode,
                            onValueChange = { prodBarcode = it },
                            label = { Text("Barcode (Optional)") },
                            singleLine = true,
                            trailingIcon = {
                                IconButton(onClick = { isScannerOpen = true }) {
                                    Icon(
                                        painter = painterResource(id = com.adk.smartposlanka.R.drawable.ic_camera),
                                        contentDescription = "Scan Barcode",
                                        tint = MaterialTheme.colorScheme.primary
                                    )
                                }
                            },
                            modifier = Modifier.fillMaxWidth()
                        )
                        OutlinedTextField(
                            value = prodCategory,
                            onValueChange = { prodCategory = it },
                            label = { Text("Category") },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth()
                        )
                    }
                },
                confirmButton = {
                    Button(
                        onClick = {
                            val priceParsed = prodPrice.toDoubleOrNull()
                            val qtyParsed = prodQty.toIntOrNull()

                            if (prodName.isEmpty() || priceParsed == null || qtyParsed == null) {
                                Toast.makeText(context, "Please enter valid fields.", Toast.LENGTH_SHORT).show()
                                return@Button
                            }

                            if (editingProduct != null) {
                                val updatedProduct = editingProduct!!.copy(
                                    name = prodName,
                                    price = priceParsed,
                                    quantity = qtyParsed,
                                    barcode = prodBarcode,
                                    category = prodCategory
                                )
                                viewModel.updateProduct(
                                    orgId = orgId,
                                    branchId = branchId,
                                    product = updatedProduct
                                )
                                Toast.makeText(context, "Product updated successfully!", Toast.LENGTH_SHORT).show()
                            } else {
                                val newProduct = ProductEntity(
                                    id = UUID.randomUUID().toString(),
                                    name = prodName,
                                    price = priceParsed,
                                    quantity = qtyParsed,
                                    barcode = prodBarcode,
                                    category = prodCategory
                                )
                                viewModel.addProduct(
                                    orgId = orgId,
                                    branchId = branchId,
                                    product = newProduct
                                )
                                Toast.makeText(context, "Product saved successfully!", Toast.LENGTH_SHORT).show()
                            }

                            showAddDialog = false
                            editingProduct = null
                            prodName = ""
                            prodPrice = ""
                            prodQty = ""
                            prodBarcode = ""
                            prodCategory = "General"
                        }
                    ) {
                        Text("Save")
                    }
                },
                dismissButton = {
                    OutlinedButton(onClick = { 
                        showAddDialog = false
                        editingProduct = null
                        prodName = ""
                        prodPrice = ""
                        prodQty = ""
                        prodBarcode = ""
                        prodCategory = "General"
                    }) {
                        Text("Cancel")
                    }
                }
            )
        }
    }
}

fun importCsvProducts(context: Context, uri: Uri): List<ProductEntity> {
    val products = mutableListOf<ProductEntity>()
    try {
        context.contentResolver.openInputStream(uri)?.use { inputStream: java.io.InputStream ->
            BufferedReader(InputStreamReader(inputStream)).use { reader: java.io.BufferedReader ->
                val headerLine = reader.readLine() ?: return@importCsvProducts emptyList()
                val headers = headerLine.split(",").map { it.trim().lowercase().removeSurrounding("\"") }
                
                val nameIndex = headers.indexOfFirst { 
                    it == "name" || it == "product" || it == "product name" || it == "product_name" || 
                    it == "productname" || it == "item" || it == "item name" || it == "item_name" || 
                    it == "itemname" || it == "title" || it.contains("name") || it.contains("product")
                }.let { if (it != -1) it else 0 } // Fallback to column 0
                
                val priceIndex = headers.indexOfFirst { 
                    it == "price" || it == "rate" || it == "cost" || it == "amount" || 
                    it == "amout" || it.contains("price") || it.contains("rate") || 
                    it.contains("amount") || it.contains("amout") || it.contains("cost")
                }
                val qtyIndex = headers.indexOfFirst { 
                    it == "quantity" || it == "stock" || it == "qty" || it.contains("qty") || 
                    it.contains("quantity") || it.contains("stock")
                }
                val barcodeIndex = headers.indexOfFirst { 
                    it == "barcode" || it == "code" || it == "bar code" || it == "upc" || 
                    it == "ean" || it == "sku" || it.contains("code") || it.contains("barcode")
                }
                val categoryIndex = headers.indexOfFirst { 
                    it == "category" || it == "type" || it == "group" || it == "department" || 
                    it == "dept" || it.contains("category") || it.contains("type")
                }
                
                var line = reader.readLine()
                while (line != null) {
                    val tokens = splitCsvLine(line)
                    if (tokens.size > nameIndex) {
                        val name = tokens[nameIndex].trim().removeSurrounding("\"")
                        if (name.isNotEmpty()) {
                            val price = if (priceIndex != -1 && tokens.size > priceIndex) {
                                tokens[priceIndex].toDoubleOrNull() ?: 0.0
                            } else 0.0
                            val quantity = if (qtyIndex != -1 && tokens.size > qtyIndex) {
                                tokens[qtyIndex].toIntOrNull() ?: 0
                            } else 0
                            val barcode = if (barcodeIndex != -1 && tokens.size > barcodeIndex) {
                                tokens[barcodeIndex].trim().removeSurrounding("\"")
                            } else ""
                            val category = if (categoryIndex != -1 && tokens.size > categoryIndex) {
                                tokens[categoryIndex].trim().removeSurrounding("\"")
                            } else "General"
                            
                            products.add(
                                ProductEntity(
                                    id = UUID.randomUUID().toString(),
                                    name = name,
                                    price = price,
                                    quantity = quantity,
                                    barcode = barcode,
                                    category = category
                                )
                            )
                        }
                    }
                    line = reader.readLine()
                }
            }
        }
    } catch (e: Exception) {
        e.printStackTrace()
    }
    return products
}

fun splitCsvLine(line: String): List<String> {
    val result = mutableListOf<String>()
    val curVal = StringBuilder()
    var inQuotes = false
    for (ch in line.toCharArray()) {
        if (ch == '\"') {
            inQuotes = !inQuotes
        } else if (ch == ',') {
            if (inQuotes) {
                curVal.append(ch)
            } else {
                result.add(curVal.toString())
                curVal.setLength(0)
            }
        } else {
            curVal.append(ch)
        }
    }
    result.add(curVal.toString())
    return result
}
