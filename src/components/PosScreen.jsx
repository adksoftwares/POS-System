import React, { useState, useCallback, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import ProductGrid from './ProductGrid';
import Cart from './Cart';
import { Search } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { useBarcodeScanner } from '../hooks/useBarcodeScanner';
import jsPDF from 'jspdf';
import { dbCloud } from '../config/firebase';
import { doc, getDoc, updateDoc, setDoc } from 'firebase/firestore';
import { motion, AnimatePresence } from 'framer-motion';


export default function PosScreen() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchSuggestions, setSearchSuggestions] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [cart, setCart] = useState([]);

  // BroadcastChannel for cross-window cart state synchronization
  useEffect(() => {
    const channel = new BroadcastChannel('adk_cart_sync');
    const handleMessage = (event) => {
      if (event.data && event.data.type === 'SYNC_CART') {
        const newCartJson = JSON.stringify(event.data.cart);
        setCart((prevCart) => {
          if (JSON.stringify(prevCart) !== newCartJson) {
            return event.data.cart;
          }
          return prevCart;
        });
      }
    };
    channel.addEventListener('message', handleMessage);
    return () => {
      channel.removeEventListener('message', handleMessage);
      channel.close();
    };
  }, []);

  useEffect(() => {
    const channel = new BroadcastChannel('adk_cart_sync');
    channel.postMessage({ type: 'SYNC_CART', cart });
    channel.close();
  }, [cart]);

  const [clockedIn, setClockedIn] = useState(false);
  const [activeLogId, setActiveLogId] = useState(null);

  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickAddBarcode, setQuickAddBarcode] = useState('');
  const [quickAddName, setQuickAddName] = useState('');
  const [quickAddPrice, setQuickAddPrice] = useState('');
  const [quickAddQty, setQuickAddQty] = useState('');
  const [quickAddCategory, setQuickAddCategory] = useState('General');

  const [tier, setTier] = useState('Free');
  const [billPrintCount, setBillPrintCount] = useState(0);
  const [shopDetails, setShopDetails] = useState({
    shopName: 'ADK SUPERMART',
    address: 'No. 45, Galle Road, Colombo, Sri Lanka',
    phone: '+94 11 234 5678'
  });
  const orgId = localStorage.getItem('adk_orgId') || '';
  const branchId = localStorage.getItem('adk_branchId') || 'Main';

  React.useEffect(() => {
    async function fetchOrgDetails() {
      if (!orgId) return;
      try {
        const snap = await getDoc(doc(dbCloud, "Organizations", orgId));
        if (snap.exists()) {
          const data = snap.data();
          setTier(data.subscriptionTier || 'Free');
          setBillPrintCount(data.billPrintCount || 0);
          setShopDetails({
            shopName: data.shopName || 'ADK SUPERMART',
            address: data.address || 'No. 45, Galle Road, Colombo, Sri Lanka',
            phone: data.phone || '+94 11 234 5678'
          });
        }
      } catch (err) {
        console.error("Failed to fetch organization details:", err);
      }
    }
    fetchOrgDetails();
  }, [orgId]);

  const userEmail = localStorage.getItem('adk_userEmail') || '';
  const isSuperAdmin = userEmail.trim().toLowerCase() === 'arikarran14@gmail.com';
  const hasPremium = isSuperAdmin || tier === 'Premium';

  // Base products for the grid, ordered alphabetically by name
  const products = useLiveQuery(() => db.products.orderBy('name').toArray(), []);

  const handleAddToCart = useCallback((product) => {
    setCart((prevCart) => {
      const existing = prevCart.find((item) => item.product.id === product.id);
      if (existing) {
        if (existing.quantity >= product.quantity) return prevCart;
        return prevCart.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      if (product.quantity > 0) {
        return [...prevCart, { product, quantity: 1, discount: 0 }];
      }
      return prevCart;
    });
  }, []);

  const handleSearchChange = async (e) => {
    const val = e.target.value;
    setSearchQuery(val);
    setSelectedIndex(-1);
    if (val.length > 0) {
      const results = await db.products.where('name').startsWithIgnoreCase(val).limit(10).toArray();
      setSearchSuggestions(results);
    } else {
      setSearchSuggestions([]);
    }
  };

  const handleKeyDown = (e) => {
    if (searchSuggestions.length === 0) return;
    
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev < searchSuggestions.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0) {
        handleAddToCart(searchSuggestions[selectedIndex]);
      } else {
        handleAddToCart(searchSuggestions[0]);
      }
      setSearchQuery('');
      setSearchSuggestions([]);
      setSelectedIndex(-1);
    }
  };

  const handlePunchClock = async () => {
    const userEmail = localStorage.getItem('adk_userEmail') || 'Unknown';
    
    if (!clockedIn) {
      const startFloatVal = prompt("Enter Starting Cash Drawer Float (Rs.):", "5000.00");
      if (startFloatVal === null) return; // User cancelled
      const startingFloat = parseFloat(startFloatVal) || 0.0;

      const newLog = {
        id: uuidv4(),
        employeeId: userEmail,
        clockIn: Date.now(),
        clockOut: null,
        startingFloat,
        endingFloat: 0,
        expectedEndingCash: 0,
        discrepancy: 0,
        cashSales: 0,
        cardSales: 0,
        bankSales: 0
      };

      await db.attendance_logs.add(newLog);
      setActiveLogId(newLog.id);
      setClockedIn(true);
      
      // Auto push to Firestore if online
      if (navigator.onLine && orgId) {
        try {
          const docRef = doc(dbCloud, `Organizations/${orgId}/Branches/${branchId}/Shifts`, newLog.id);
          await setDoc(docRef, newLog);
        } catch (err) {
          console.error("Firestore shift log failed:", err);
        }
      }

      alert(`Clocked In successfully with drawer float: Rs. ${startingFloat.toFixed(2)}`);
    } else {
      if (!activeLogId) return;

      const log = await db.attendance_logs.get(activeLogId);
      if (!log) return;

      const endFloatVal = prompt("Enter Actual Ending Cash in Drawer (Rs.):", "5000.00");
      if (endFloatVal === null) return; // User cancelled
      const endingFloat = parseFloat(endFloatVal) || 0.0;

      // Query Dexie transactions completed during this shift
      const shiftTx = await db.transactions.where('timestamp').between(log.clockIn, Date.now(), true, true).toArray();
      
      let cashSales = 0;
      let cardSales = 0;
      let bankSales = 0;

      shiftTx.forEach(t => {
        const method = (t.paymentMethod || '').toLowerCase();
        if (method === 'cash') {
          cashSales += t.totalAmount;
        } else if (method === 'card') {
          cardSales += t.totalAmount;
        } else {
          bankSales += t.totalAmount;
        }
      });

      const startingFloat = log.startingFloat || 0.0;
      const expectedEndingCash = startingFloat + cashSales;
      const discrepancy = endingFloat - expectedEndingCash;

      const updateData = {
        clockOut: Date.now(),
        endingFloat,
        expectedEndingCash,
        discrepancy,
        cashSales,
        cardSales,
        bankSales
      };

      await db.attendance_logs.update(activeLogId, updateData);

      // Auto push updated shift report to Firestore if online
      if (navigator.onLine && orgId) {
        try {
          const docRef = doc(dbCloud, `Organizations/${orgId}/Branches/${branchId}/Shifts`, activeLogId);
          await setDoc(docRef, {
            ...log,
            ...updateData
          }, { merge: true });
        } catch (err) {
          console.error("Firestore shift update failed:", err);
        }
      }

      setActiveLogId(null);
      setClockedIn(false);

      alert(
        `Shift Completed & Logged Successfully!\n\n` +
        `• Starting Float: Rs. ${startingFloat.toFixed(2)}\n` +
        `• Cash Sales: Rs. ${cashSales.toFixed(2)}\n` +
        `• Expected Ending Cash: Rs. ${expectedEndingCash.toFixed(2)}\n` +
        `• Actual Ending Drawer: Rs. ${endingFloat.toFixed(2)}\n` +
        `• Shift Discrepancy: Rs. ${discrepancy.toFixed(2)}`
      );
    }
  };

  const handleBarcodeNotFound = useCallback((barcode) => {
    const confirmAdd = window.confirm(`Barcode "${barcode}" not found in inventory. Would you like to quickly add this product?`);
    if (confirmAdd) {
      setQuickAddBarcode(barcode);
      setShowQuickAdd(true);
    }
  }, []);

  useBarcodeScanner(useCallback(async (scannedBarcode) => {
    if (!hasPremium) {
      alert("Barcode Scanning is a Premium-Only Feature! Please upgrade your organization's subscription package in the Settings tab to unlock barcode scanner integration.");
      return;
    }
    const matchedProduct = await db.products.where('barcode').equals(scannedBarcode).first();
    if (matchedProduct) {
      handleAddToCart(matchedProduct);
    } else {
      handleBarcodeNotFound(scannedBarcode);
    }
  }, [handleAddToCart, hasPremium, handleBarcodeNotFound]));

  const handleRemoveFromCart = (productId) => {
    setCart((prev) => prev.filter((item) => item.product.id !== productId));
  };

  const handleHoldBill = () => {
    setCart([]);
  };

  const generatePDFReceipt = (receiptId, paymentMethod, totalAmount, cartItems) => {
    const subtotal = cartItems.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
    const totalDiscount = cartItems.reduce((sum, item) => sum + (((item.discount || 0) / 100) * (item.product.price * item.quantity)), 0);
    
    const docForHeight = new jsPDF({ unit: 'mm', format: [80, 500] });
    docForHeight.setFont('Helvetica', 'bold');
    docForHeight.setFontSize(8);
    
    let totalItemLinesHeight = 0;
    cartItems.forEach(item => {
      const nameLines = docForHeight.splitTextToSize(item.product.name, 36);
      const dVal = ((item.discount || 0) / 100) * (item.product.price * item.quantity);
      totalItemLinesHeight += (nameLines.length * 4.5) + (dVal > 0 ? 3.5 : 0) + 1.5; 
    });

    const receiptHeight = 75 + totalItemLinesHeight;
    const doc = new jsPDF({
      unit: 'mm',
      format: [80, Math.max(140, receiptHeight)]
    });

    const cashierEmail = localStorage.getItem('adk_userEmail') || 'cashier@adk.com';

    // 1. Header (Store info)
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(shopDetails.shopName.toUpperCase(), 40, 10, { align: 'center' });
    
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(shopDetails.address, 40, 14, { align: 'center' });
    doc.text(`Tel: ${shopDetails.phone}`, 40, 18, { align: 'center' });
    
    doc.setDrawColor(204, 204, 204); // LTGRAY
    doc.setLineWidth(0.3);
    doc.line(5, 21, 75, 21);
    
    // 2. Metadata
    doc.setFontSize(8);
    doc.text(`Invoice: ${receiptId}`, 5, 26);
    doc.text(`Date   : ${new Date().toLocaleString()}`, 5, 30);
    doc.text(`Cashier: ${cashierEmail.split('@')[0]}`, 5, 34);
    doc.text(`Payment: ${paymentMethod.toUpperCase()}`, 5, 38);
    
    doc.line(5, 41, 75, 41);
    
    // 3. Table Headers
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(8);
    doc.text("Item", 5, 46);
    doc.text("Qty x Price", 43, 46);
    doc.text("Total (Rs.)", 75, 46, { align: 'right' });
    
    doc.line(5, 49, 75, 49);
    
    // 4. Items List
    let y = 49;
    cartItems.forEach(item => {
      const sub = item.product.price * item.quantity;
      const dVal = ((item.discount || 0) / 100) * sub;
      const finalVal = sub - dVal;
      
      const firstLineY = y + 4.5;
      
      // Draw name
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(8);
      const nameLines = doc.splitTextToSize(item.product.name, 36);
      nameLines.forEach(line => {
        y += 4.5;
        doc.text(line, 5, y);
      });
      
      // Draw Qty x Price column at firstLineY
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(8);
      const qtyPriceStr = `${item.quantity} x ${item.product.price.toFixed(2)}`;
      doc.text(qtyPriceStr, 43, firstLineY);
      
      // Draw Total column at firstLineY
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(8);
      doc.text(`${finalVal.toFixed(2)}`, 75, firstLineY, { align: 'right' });
      
      // Draw discount underneath if any
      if (item.discount > 0) {
        y += 3.5;
        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.text(`  (-Rs. ${dVal.toFixed(2)})`, 5, y);
      }
      y += 1.5;
    });
    
    y += 4;
    doc.line(5, y, 75, y);
    y += 5;
    
    // 5. Totals
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(8);
    doc.text("Subtotal:", 5, y);
    doc.text(subtotal.toFixed(2), 75, y, { align: 'right' });
    
    if (totalDiscount > 0) {
      y += 4;
      doc.text("Discount:", 5, y);
      doc.text(`-${totalDiscount.toFixed(2)}`, 75, y, { align: 'right' });
    }
    
    // Grand Total highlights box
    y += 6;
    doc.setFillColor(245, 245, 245);
    doc.rect(5, y - 4, 70, 7, 'F');
    
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(9);
    doc.text("GRAND TOTAL:", 7, y + 1);
    doc.text(`Rs. ${totalAmount.toFixed(2)}`, 73, y + 1, { align: 'right' });
    
    y += 8;
    doc.line(5, y, 75, y);
    y += 6;
    
    // Footer
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(8);
    doc.text('THANK YOU FOR SHOPPING WITH US!', 40, y, { align: 'center' });
    y += 4.5;
    doc.text('Please come again.', 40, y, { align: 'center' });
    y += 4.5;
    doc.setFontSize(7);
    doc.text('Powered by ADK Software Solutions', 40, y, { align: 'center' });

    doc.save(`Receipt_${receiptId}.pdf`);

    // Auto-Print receipt logic supporting both web browser (via offscreen iframe print preview) and Electron (via OS default viewer)
    try {
      const isElectron = typeof window !== 'undefined' && window.process && window.process.type;

      if (isElectron) {
        // Save PDF to temp folder and open in system default viewer inside Electron
        const fs = window.require('fs');
        const path = window.require('path');
        const os = window.require('os');
        const { ipcRenderer } = window.require('electron');

        const arrayBuffer = doc.output('arraybuffer');
        const buffer = new Uint8Array(arrayBuffer);
        const tempPath = path.join(os.tmpdir(), `Receipt_${receiptId}.pdf`);
        
        fs.writeFileSync(tempPath, buffer);
        ipcRenderer.invoke('open-pdf', tempPath);
      } else {
        // Trigger standard browser print preview using a sized offscreen iframe
        const blob = doc.output('blob');
        const blobURL = URL.createObjectURL(blob);
        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.left = '-9999px';
        iframe.style.width = '800px';
        iframe.style.height = '1000px';
        iframe.style.border = 'none';
        iframe.src = blobURL;
        document.body.appendChild(iframe);
        iframe.onload = () => {
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
          setTimeout(() => {
            try {
              document.body.removeChild(iframe);
              URL.revokeObjectURL(blobURL);
            } catch (err) {
              console.error("Direct print iframe cleanup error:", err);
            }
          }, 60000);
        };
      }
    } catch (printErr) {
      console.error("Direct print failed, using standard fallback download.", printErr);
    }
  };

  const handleBarcodeScannedInCart = async (barcode) => {
    const matchedProduct = await db.products.where('barcode').equals(barcode).first();
    if (matchedProduct) {
      handleAddToCart(matchedProduct);
    } else {
      handleBarcodeNotFound(barcode);
    }
  };

  const handleCheckout = async (paymentMethod, selectedBankId = null) => {
    if (cart.length === 0) return;

    let orgData = null;
    if (orgId) {
      try {
        const orgRef = doc(dbCloud, "Organizations", orgId);
        const snap = await getDoc(orgRef);
        if (snap.exists()) {
          orgData = snap.data();
        }
      } catch (err) {
        console.warn("Could not check live bill limit offline.", err);
      }
    }

    const currentCount = orgData?.billPrintCount || 0;
    const currentTier = orgData?.subscriptionTier || 'Free';

    if (!isSuperAdmin && currentTier !== 'Premium' && currentCount >= 50) {
      alert("Billing Limit Reached! You have printed the maximum allowed limit of 50 bills on the Free Package. Please upgrade to the Premium Package in the Settings tab to unlock unlimited billing.");
      return;
    }

    const totalAmount = cart.reduce((sum, item) => sum + (item.product.price * item.quantity) - (((item.discount || 0) / 100) * (item.product.price * item.quantity)), 0);
    const receiptId = `ADK-${Date.now()}`;
    const itemsJson = JSON.stringify(cart.map(item => ({
      productId: item.product.id,
      quantity: item.quantity,
      price: item.product.price,
      discount: ((item.discount || 0) / 100) * (item.product.price * item.quantity)
    })));

    try {
      // 1. Generate PDF immediately while we still have the user gesture context!
      generatePDFReceipt(receiptId, paymentMethod, totalAmount, cart);

      // 2. Perform local database operations
      await db.transaction('rw', db.transactions, db.products, async () => {
        await db.transactions.add({
          receiptId,
          totalAmount,
          paymentMethod,
          selectedBankId,
          timestamp: Date.now(),
          itemsJson
        });

        for (const item of cart) {
          const newQty = item.product.quantity - item.quantity;
          await db.products.update(item.product.id, { quantity: newQty, synced: false });
        }
      });
      
      // 3. Increment print count in Firebase
      if (navigator.onLine && orgId) {
        try {
          const orgRef = doc(dbCloud, "Organizations", orgId);
          await updateDoc(orgRef, {
            billPrintCount: (currentCount + 1)
          });
          setBillPrintCount(currentCount + 1);
          setTier(currentTier); // trigger re-eval
        } catch (err) {
          console.error("Failed to increment print count:", err);
        }
      }
      
      setCart([]);
      alert(`Checkout successful! PDF Receipt generated.`);
    } catch (error) {
      console.error("Checkout failed:", error);
      alert("Checkout failed. Check console.");
    }
  };

  const handleUpdateQuantity = (productId, newQty) => {
    setCart((prevCart) => {
      return prevCart.map((item) => {
        if (item.product.id === productId) {
          if (newQty > item.product.quantity) {
            alert(`Only ${item.product.quantity} items available in stock.`);
            return item;
          }
          const cleanQty = Math.max(1, newQty);
          return { ...item, quantity: cleanQty };
        }
        return item;
      });
    });
  };

  const handleUpdateDiscount = (productId, discount) => {
    setCart((prevCart) => {
      return prevCart.map((item) => {
        if (item.product.id === productId) {
          const cleanDiscountPercent = Math.min(Math.max(0, discount), 100);
          return { ...item, discount: cleanDiscountPercent };
        }
        return item;
      });
    });
  };

  const seedData = async () => {
    await db.products.bulkPut([
      { id: uuidv4(), name: "Coffee", price: 350.00, quantity: 50, barcode: "123", category: "Beverage" },
      { id: uuidv4(), name: "Sandwich", price: 800.00, quantity: 20, barcode: "124", category: "Food" },
      { id: uuidv4(), name: "Muffin", price: 400.00, quantity: 4, barcode: "125", category: "Food" },
    ]);
  };

  const handleQuickAddSubmit = async (e) => {
    e.preventDefault();
    if (!quickAddName || !quickAddPrice || !quickAddQty) return;

    const newProd = {
      id: uuidv4(),
      name: quickAddName,
      price: parseFloat(quickAddPrice),
      quantity: parseInt(quickAddQty),
      barcode: quickAddBarcode,
      category: quickAddCategory || 'General',
      synced: false
    };

    try {
      await db.products.add(newProd);

      const orgId = localStorage.getItem("adk_orgId");
      const branchId = localStorage.getItem("adk_branchId") || 'Main';
      if (navigator.onLine && orgId) {
        try {
          const docRef = doc(dbCloud, `Organizations/${orgId}/Branches/${branchId}/Products`, newProd.id);
          await setDoc(docRef, newProd);
        } catch (err) {
          console.error("Cloud push failed:", err);
        }
      }

      alert(`Product "${quickAddName}" successfully added!`);
      
      handleAddToCart(newProd);

      setQuickAddName('');
      setQuickAddPrice('');
      setQuickAddQty('');
      setQuickAddBarcode('');
      setQuickAddCategory('General');
      setShowQuickAdd(false);
    } catch (err) {
      console.error(err);
      alert("Failed to add product: " + err.message);
    }
  };

  return (
    <div className="pos-layout animate-fade-in" style={{ height: '100%' }}>
      <div className="product-area">
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem', gap: '1rem' }}>
          <button className={`btn ${clockedIn ? 'btn-danger' : 'btn-primary'}`} onClick={handlePunchClock}>
            {clockedIn ? 'Clock Out' : 'Clock In'}
          </button>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button className="btn btn-secondary" onClick={() => setShowQuickAdd(true)}>+ Quick Add Product</button>
            <button className="btn btn-success" onClick={seedData}>Seed Demo Products</button>
          </div>
        </div>
        
        <div className="glass-panel" style={{ position: 'relative', marginBottom: '1.5rem', padding: '0.25rem' }}>
          <div className="search-bar" style={{ display: 'flex', alignItems: 'center', background: 'transparent', padding: '0.5rem 1rem', borderRadius: 'var(--radius-md)' }}>
            <Search size={20} color="var(--text-muted)" style={{ marginRight: '0.75rem' }} />
            <input 
              type="text" 
              placeholder="Search products... (Scanners will work automatically anywhere)" 
              value={searchQuery}
              onChange={handleSearchChange}
              onKeyDown={handleKeyDown}
              autoComplete="off"
              style={{ border: 'none', outline: 'none', flex: 1, fontSize: '1rem', background: 'transparent', color: 'var(--text-primary)' }}
            />
          </div>
          {searchSuggestions.length > 0 && (
            <ul className="suggestions-dropdown" style={{ width: '100%' }}>
              {searchSuggestions.map((s, idx) => (
                <li 
                  key={s.id} 
                  className={idx === selectedIndex ? 'selected' : ''}
                  onClick={() => {
                    handleAddToCart(s);
                    setSearchQuery('');
                    setSearchSuggestions([]);
                  }}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 'bold', textTransform: 'uppercase', padding: '0.2rem 0.5rem', borderRadius: '4px', background: 'var(--border-light)', color: 'var(--text-secondary)' }}>{s.category || 'General'}</span>
                    <span style={{ fontWeight: '600' }}>{s.name}</span>
                  </div>
                  <span style={{ color: 'var(--accent-primary)', fontWeight: '700' }}>Rs. {s.price.toFixed(2)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {products === undefined ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '1rem' }}>
             {[...Array(12)].map((_, i) => (
               <div key={i} className="skeleton" style={{ height: '150px', width: '100%' }}></div>
             ))}
          </div>
        ) : (
          <ProductGrid products={products || []} onAddToCart={handleAddToCart} />
        )}
      </div>

      <div className="cart-area">
        <Cart 
          cartItems={cart} 
          onRemove={handleRemoveFromCart} 
          onHoldBill={handleHoldBill}
          onCheckout={handleCheckout}
          onUpdateQuantity={handleUpdateQuantity}
          onUpdateDiscount={handleUpdateDiscount}
          onScanBarcode={handleBarcodeScannedInCart}
          tier={tier}
          billPrintCount={billPrintCount}
          isSuperAdmin={isSuperAdmin}
        />
      </div>

      <AnimatePresence>
        {showQuickAdd && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(0, 0, 0, 0.65)', backdropFilter: 'blur(10px)',
              display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 99999
            }}
          >
            <motion.div 
              className="payment-modal glass-panel"
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 350 }}
              style={{ padding: '2.25rem', width: '420px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}
            >
              <h3 style={{ margin: '0 0 1.5rem 0', fontSize: '1.4rem', fontWeight: '800', background: 'linear-gradient(90deg, var(--accent-primary), var(--accent-purple))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Quick Add Product</h3>
              <form onSubmit={handleQuickAddSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Product Name</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Filter Coffee" 
                    value={quickAddName} 
                    onChange={e => setQuickAddName(e.target.value)} 
                    required 
                  />
                </div>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', flex: 1 }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Price (Rs.)</label>
                    <input 
                      type="number" 
                      placeholder="350.00" 
                      step="0.01"
                      value={quickAddPrice} 
                      onChange={e => setQuickAddPrice(e.target.value)} 
                      required 
                    />
                  </div>
                  <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', flex: 1 }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Quantity</label>
                    <input 
                      type="number" 
                      placeholder="50" 
                      value={quickAddQty} 
                      onChange={e => setQuickAddQty(e.target.value)} 
                      required 
                    />
                  </div>
                </div>
                <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Barcode</label>
                  <input 
                    type="text" 
                    placeholder="e.g. 880104..." 
                    value={quickAddBarcode} 
                    onChange={e => setQuickAddBarcode(e.target.value)} 
                  />
                </div>
                <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Category</label>
                  <input 
                    type="text" 
                    placeholder="Beverage, Food, General..." 
                    value={quickAddCategory} 
                    onChange={e => setQuickAddCategory(e.target.value)} 
                  />
                </div>
                <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
                  <button type="button" className="btn btn-secondary" style={{ flex: 1, padding: '0.75rem' }} onClick={() => setShowQuickAdd(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" style={{ flex: 1, padding: '0.75rem' }}>
                    Save & Add
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
