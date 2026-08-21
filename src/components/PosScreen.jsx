import { useState, useCallback, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import ProductGrid from './ProductGrid';
import Cart from './Cart';
import { Search, Zap, UserPlus, Clock, ShoppingCart } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { useBarcodeScanner } from '../hooks/useBarcodeScanner';
import { dbCloud } from '../config/firebase';
import { doc, getDoc, updateDoc, setDoc } from 'firebase/firestore';
import { motion, AnimatePresence } from 'framer-motion';
import { sound } from '../services/soundService';
import { PrinterService } from '../services/printerService';

export default function PosScreen() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchSuggestions, setSearchSuggestions] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [cart, setCart] = useState([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const searchInputRef = useRef(null);

  const openCart = async () => {
    setIsCartOpen(true);
    try {
      const { App: CapApp } = await import('@capacitor/app');
      window.posCartBackListener = await CapApp.addListener('backButton', () => {
        closeCart();
      });
    } catch (e) {
      window.history.pushState({ cartOpen: true }, '', window.location.href);
    }
  };

  const closeCart = () => {
    setIsCartOpen(false);
    if (window.posCartBackListener) {
      window.posCartBackListener.remove();
      window.posCartBackListener = null;
    }
    // Only pop if we used history fallback and it matches
    if (window.history.state && window.history.state.cartOpen) {
      window.history.back();
    }
  };

  useEffect(() => {
    const handlePopState = () => {
      setIsCartOpen(false);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  
  const cartTotal = cart.reduce((sum, item) => sum + (item.product.price * item.quantity) - (((item.discount || 0) / 100) * (item.product.price * item.quantity)), 0);
  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  // BroadcastChannel for cross-window customer display synchronization
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
      } else if (event.data && event.data.type === 'REQUEST_CART') {
        channel.postMessage({ type: 'SYNC_CART', cart });
      }
    };
    channel.addEventListener('message', handleMessage);
    return () => {
      channel.removeEventListener('message', handleMessage);
      channel.close();
    };
  }, [cart]);

  useEffect(() => {
    try {
      localStorage.setItem('adk_active_cart', JSON.stringify(cart));
    } catch (e) {
      console.warn("Could not save cart to localStorage", e);
    }
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
    phone: '+94 11 234 5678',
    receiptFooter: 'Thank you for shopping! Returns valid within 7 days.',
    currency: 'Rs.'
  });
  const orgId = localStorage.getItem('adk_orgId') || '';
  const branchId = localStorage.getItem('adk_branchId') || 'Main';

  useEffect(() => {
    async function fetchOrgDetails() {
      if (!orgId) return;
      try {
        const snap = await getDoc(doc(dbCloud, "Organizations", orgId));
        if (snap.exists()) {
          const data = snap.data();
          let effectiveTier = data.subscriptionTier || 'Free';
          if (data.premium_expiry_date) {
            const expiryDate = new Date(data.premium_expiry_date);
            if (new Date() > expiryDate) {
              effectiveTier = 'Free';
            } else {
              effectiveTier = 'Premium';
            }
          }
          setTier(effectiveTier);
          setBillPrintCount(data.billPrintCount || 0);
          setShopDetails({
            shopName: data.shopName || 'ADK SUPERMART',
            address: data.address || 'No. 45, Galle Road, Colombo, Sri Lanka',
            phone: data.phone || '+94 11 234 5678',
            receiptFooter: data.receiptFooter || 'Thank you for shopping! Returns valid within 7 days.',
            currency: data.currency || 'Rs.'
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

  const products = useLiveQuery(() => db.products.orderBy('name').toArray(), []);

  const handleAddToCart = useCallback((product) => {
    setCart((prevCart) => {
      const existing = prevCart.find((item) => item.product.id === product.id);
      sound.playScanBeep();
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

  // Global Ergonomic POS Keyboard Hotkeys
  useEffect(() => {
    const handleGlobalHotkeys = (e) => {
      if (e.key === 'F1') {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === 'F8') {
        e.preventDefault();
        setCart([]);
        sound.playErrorSound();
      } else if (e.key === 'Escape') {
        setSearchQuery('');
        setSearchSuggestions([]);
        setShowQuickAdd(false);
      }
    };
    window.addEventListener('keydown', handleGlobalHotkeys);
    return () => window.removeEventListener('keydown', handleGlobalHotkeys);
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
      } else if (searchSuggestions.length > 0) {
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
      if (startFloatVal === null) return;
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
      
      if (navigator.onLine && orgId) {
        try {
          const docRef = doc(dbCloud, `Organizations/${orgId}/Branches/${branchId}/Shifts`, newLog.id);
          await setDoc(docRef, newLog);
        } catch (err) {
          console.error("Firestore shift log failed:", err);
        }
      }

      sound.playSuccessChime();
      alert(`Clocked In successfully with drawer float: Rs. ${startingFloat.toFixed(2)}`);
    } else {
      if (!activeLogId) return;

      const log = await db.attendance_logs.get(activeLogId);
      if (!log) return;

      const endFloatVal = prompt("Enter Actual Ending Cash in Drawer (Rs.):", "5000.00");
      if (endFloatVal === null) return;
      const endingFloat = parseFloat(endFloatVal) || 0.0;

      const shiftTx = await db.transactions.where('timestamp').between(log.clockIn, Date.now(), true, true).toArray();
      
      let cashSales = 0;
      let cardSales = 0;
      let bankSales = 0;

      shiftTx.forEach(t => {
        const method = (t.paymentMethod || '').toLowerCase();
        if (method === 'cash') {
          cashSales += (t.totalAmount || t.total || 0);
        } else if (method === 'card') {
          cardSales += (t.totalAmount || t.total || 0);
        } else {
          bankSales += (t.totalAmount || t.total || 0);
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

      if (navigator.onLine && orgId) {
        try {
          const docRef = doc(dbCloud, `Organizations/${orgId}/Branches/${branchId}/Shifts`, activeLogId);
          await setDoc(docRef, { ...log, ...updateData }, { merge: true });
        } catch (err) {
          console.error("Firestore shift update failed:", err);
        }
      }

      setActiveLogId(null);
      setClockedIn(false);
      sound.playSuccessChime();

      alert(
        `Shift Completed & Z-Report Generated!\n\n` +
        `• Starting Float: Rs. ${startingFloat.toFixed(2)}\n` +
        `• Cash Sales: Rs. ${cashSales.toFixed(2)}\n` +
        `• Expected Cash: Rs. ${expectedEndingCash.toFixed(2)}\n` +
        `• Actual Cash: Rs. ${endingFloat.toFixed(2)}\n` +
        `• Discrepancy: Rs. ${discrepancy.toFixed(2)}`
      );
    }
  };

  const handleBarcodeNotFound = useCallback((barcode) => {
    sound.playErrorSound();
    const confirmAdd = window.confirm(`Barcode "${barcode}" not found in inventory. Add product now?`);
    if (confirmAdd) {
      setQuickAddBarcode(barcode);
      setShowQuickAdd(true);
    }
  }, []);

  useBarcodeScanner(useCallback(async (scannedBarcode) => {
    const matchedProduct = await db.products.where('barcode').equals(scannedBarcode).first();
    if (matchedProduct) {
      handleAddToCart(matchedProduct);
    } else {
      handleBarcodeNotFound(scannedBarcode);
    }
  }, [handleAddToCart, handleBarcodeNotFound]));

  const handleRemoveFromCart = (productId) => {
    setCart((prev) => prev.filter((item) => item.product.id !== productId));
  };

  const handleHoldBill = async () => {
    if (cart.length === 0) return;
    const holdId = uuidv4();
    const totalAmount = cart.reduce((sum, item) => sum + (item.product.price * item.quantity) - (((item.discount || 0) / 100) * (item.product.price * item.quantity)), 0);
    const label = `Hold #${Date.now().toString().slice(-4)} (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`;

    try {
      await db.held_carts.add({
        id: holdId,
        label,
        items: cart,
        total: totalAmount,
        timestamp: Date.now()
      });
      sound.playSuccessChime();
      setCart([]);
      const channel = new BroadcastChannel('adk_cart_sync');
      channel.postMessage({ type: 'HELD_CARTS_UPDATED' });
      channel.close();
    } catch (err) {
      console.error("Failed to hold bill:", err);
    }
  };

  const handleCheckout = async (paymentMethod, selectedBankId = null, cashTendered = '') => {
    if (cart.length === 0) return;

    let orgData = null;
    if (orgId) {
      try {
        const snap = await getDoc(doc(dbCloud, "Organizations", orgId));
        if (snap.exists()) orgData = snap.data();
      } catch (err) {
        console.warn("Could not fetch org online data", err);
      }
    }

    const currentCount = orgData?.billPrintCount || 0;
    const currentTier = orgData?.subscriptionTier || 'Free';

    if (!isSuperAdmin && currentTier !== 'Premium' && currentCount >= 50) {
      sound.playErrorSound();
      alert("Billing Limit Reached! Upgrade to Premium in Settings.");
      return;
    }

    const totalAmount = cart.reduce((sum, item) => sum + (item.product.price * item.quantity) - (((item.discount || 0) / 100) * (item.product.price * item.quantity)), 0);
    const receiptId = `ADK-${Date.now()}`;
    const cashierEmail = localStorage.getItem('adk_userEmail') || 'Cashier';

    const transactionData = {
      receiptId,
      total: totalAmount,
      totalAmount,
      subtotal: cart.reduce((sum, i) => sum + (i.product.price * i.quantity), 0),
      discount: cart.reduce((sum, i) => sum + (((i.discount || 0) / 100) * (i.product.price * i.quantity)), 0),
      paymentMethod,
      selectedBankId,
      cashReceived: cashTendered ? parseFloat(cashTendered) : null,
      changeDue: cashTendered ? parseFloat(cashTendered) - totalAmount : 0,
      timestamp: Date.now(),
      cashierName: cashierEmail.split('@')[0],
      items: cart.map(item => ({
        id: item.product.id,
        name: item.product.name,
        quantity: item.quantity,
        price: item.product.price,
        discount: item.discount || 0
      }))
    };

    try {
      // 1. Print receipt using thermal hardware service
      PrinterService.printReceipt(transactionData, shopDetails);

      // 2. Local IndexedDB store update
      await db.transaction('rw', db.transactions, db.products, async () => {
        await db.transactions.add({
          ...transactionData,
          itemsJson: JSON.stringify(transactionData.items),
          syncStatus: 'pending'
        });

        for (const item of cart) {
          const newQty = item.product.quantity - item.quantity;
          await db.products.update(item.product.id, { quantity: newQty });
        }
      });

      // 3. Update sync count
      if (navigator.onLine && orgId) {
        try {
          const orgRef = doc(dbCloud, "Organizations", orgId);
          await updateDoc(orgRef, { billPrintCount: currentCount + 1 });
          setBillPrintCount(currentCount + 1);
        } catch (err) {
          console.error("Print count sync failed:", err);
        }
      }

      sound.playSuccessChime();
      setCart([]);
    } catch (error) {
      console.error("Checkout failed:", error);
      sound.playErrorSound();
      alert("Checkout error: " + error.message);
    }
  };

  const handleUpdateQuantity = (productId, newQty) => {
    setCart((prevCart) => {
      return prevCart.map((item) => {
        if (item.product.id === productId) {
          if (newQty > item.product.quantity) {
            sound.playErrorSound();
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
      { id: uuidv4(), name: "Espresso Coffee", price: 350.00, quantity: 50, barcode: "123", category: "Beverages" },
      { id: uuidv4(), name: "Club Sandwich", price: 850.00, quantity: 20, barcode: "124", category: "Food" },
      { id: uuidv4(), name: "Chocolate Muffin", price: 420.00, quantity: 15, barcode: "125", category: "Bakery" },
      { id: uuidv4(), name: "Fresh Orange Juice", price: 500.00, quantity: 30, barcode: "126", category: "Beverages" },
    ]);
    sound.playSuccessChime();
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
      category: quickAddCategory || 'General'
    };

    try {
      await db.products.add(newProd);
      sound.playSuccessChime();
      handleAddToCart(newProd);

      setQuickAddName('');
      setQuickAddPrice('');
      setQuickAddQty('');
      setQuickAddBarcode('');
      setQuickAddCategory('General');
      setShowQuickAdd(false);
    } catch (err) {
      console.error(err);
      sound.playErrorSound();
      alert("Failed to add product: " + err.message);
    }
  };

  const handleRestoreCart = (heldItems) => {
    setCart(heldItems);
    sound.playSuccessChime();
  };

  return (
    <div className="pos-layout animate-fade-in" style={{ height: '100%', padding: '1rem' }}>
      <div className="product-area">
        {/* Cashier Action Bar - 1 Single Line */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'nowrap', marginBottom: '0.75rem', overflowX: 'auto' }}>
          <button 
            className={`btn ${clockedIn ? 'btn-danger' : 'btn-primary'}`} 
            onClick={handlePunchClock}
            style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem', whiteSpace: 'nowrap', borderRadius: '4px', height: '32px' }}
          >
            <Clock size={14} />
            {clockedIn ? 'Shift Z-Report & Clock Out' : 'Start Shift Float & Clock In'}
          </button>
          <button 
            className="btn btn-secondary" 
            onClick={() => setShowQuickAdd(true)}
            style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem', whiteSpace: 'nowrap', borderRadius: '4px', height: '32px', background: '#ffffff', color: '#0f172a', border: '1px solid #cbd5e1' }}
          >
            <UserPlus size={14} /> + Quick Add Product
          </button>
          <button 
            className="btn btn-primary" 
            onClick={seedData}
            style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem', whiteSpace: 'nowrap', borderRadius: '4px', height: '32px' }}
          >
            <Zap size={14} /> Seed Demo Items
          </button>
        </div>
        
        {/* Instant Search Bar with Hotkey F1 badge */}
        <div className="glass-panel" style={{ position: 'relative', marginBottom: '1.25rem', padding: '0.25rem' }}>
          <div className="search-bar" style={{ display: 'flex', alignItems: 'center', background: 'transparent', padding: '0.5rem 1rem', borderRadius: 'var(--radius-md)' }}>
            <Search size={20} color="var(--text-muted)" style={{ marginRight: '0.75rem' }} />
            <input 
              ref={searchInputRef}
              type="text" 
              placeholder="Search products by name or scan barcode... (HotKey: F1)" 
              value={searchQuery}
              onChange={handleSearchChange}
              onKeyDown={handleKeyDown}
              autoComplete="off"
              style={{ border: 'none', outline: 'none', flex: 1, fontSize: '1rem', background: 'transparent', color: 'var(--text-primary)' }}
            />
            <span className="hotkey-badge">F1</span>
          </div>
          {searchSuggestions.length > 0 && (
            <ul className="suggestions-dropdown" style={{ width: '100%', zIndex: 100 }}>
              {searchSuggestions.map((s, idx) => (
                <li 
                  key={s.id} 
                  className={idx === selectedIndex ? 'selected' : ''}
                  onClick={() => {
                    handleAddToCart(s);
                    setSearchQuery('');
                    setSearchSuggestions([]);
                  }}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', cursor: 'pointer' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 'bold', textTransform: 'uppercase', padding: '0.2rem 0.5rem', borderRadius: '4px', background: 'rgba(99, 102, 241, 0.15)', color: 'var(--accent-cyan)' }}>{s.category || 'General'}</span>
                    <span style={{ fontWeight: '600' }}>{s.name}</span>
                  </div>
                  <span className="price-mono" style={{ color: 'var(--accent-cyan)', fontWeight: '700' }}>{shopDetails.currency} {s.price.toFixed(2)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {products === undefined ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '1rem' }}>
             {[...Array(12)].map((_, i) => (
               <div key={i} className="skeleton" style={{ height: '140px', width: '100%' }}></div>
             ))}
          </div>
        ) : (
          <ProductGrid products={products || []} onAddToCart={handleAddToCart} />
        )}
      </div>

      <div className={`cart-area ${isCartOpen ? 'open' : ''}`}>
        <div className="cart-header-mobile" style={{ display: 'none', padding: '1rem', borderBottom: '1px solid var(--border-color)', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>Current Order</h3>
          <button className="btn btn-secondary" onClick={closeCart} style={{ padding: '0.4rem 0.8rem' }}>Close</button>
        </div>
        <Cart 
          cartItems={cart} 
          onRemove={handleRemoveFromCart} 
          onHoldBill={handleHoldBill}
          onRestoreCart={handleRestoreCart}
          onCheckout={handleCheckout}
          onUpdateQuantity={handleUpdateQuantity}
          onUpdateDiscount={handleUpdateDiscount}
          onScanBarcode={handleAddToCart}
          tier={tier}
          billPrintCount={billPrintCount}
          isSuperAdmin={isSuperAdmin}
          onCloseMobile={closeCart}
        />
      </div>

      {/* Mobile Floating Cart Button */}
      <div className="mobile-fab" onClick={openCart}>
         <div className="fab-left">
           <ShoppingCart size={20} />
           <span>View Order</span>
           <span className="fab-badge">{cartItemCount}</span>
         </div>
         <span className="fab-total">{shopDetails.currency} {cartTotal.toFixed(2)}</span>
      </div>

      {/* Cart Overlay */}
      <div className={`mobile-cart-overlay ${isCartOpen ? 'open' : ''}`} onClick={closeCart}></div>

      {/* Quick Product Modal */}
      <AnimatePresence>
        {showQuickAdd && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(12px)',
              display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 99999,
              padding: '1rem', overflowY: 'auto'
            }}
          >
            <motion.div 
              className="payment-modal glass-panel"
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              style={{
                padding: '1.5rem 1.75rem',
                width: '440px',
                maxWidth: '95vw',
                maxHeight: '88vh',
                overflowY: 'auto',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-lg)'
              }}
            >
              <h3 style={{ margin: '0 0 1.25rem 0', fontSize: '1.3rem', fontWeight: '800', color: 'var(--accent-cyan)' }}>Quick Add Product</h3>
              <form onSubmit={handleQuickAddSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <label style={{ fontSize: '0.82rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Product Name</label>
                  <input type="text" placeholder="e.g. Cold Brew Coffee" value={quickAddName} onChange={e => setQuickAddName(e.target.value)} required />
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', flex: 1 }}>
                    <label style={{ fontSize: '0.82rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Price ({shopDetails.currency})</label>
                    <input type="number" placeholder="450.00" step="0.01" value={quickAddPrice} onChange={e => setQuickAddPrice(e.target.value)} required />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', flex: 1 }}>
                    <label style={{ fontSize: '0.82rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Stock Qty</label>
                    <input type="number" placeholder="50" value={quickAddQty} onChange={e => setQuickAddQty(e.target.value)} required />
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <label style={{ fontSize: '0.82rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Barcode</label>
                  <input type="text" placeholder="e.g. 880104..." value={quickAddBarcode} onChange={e => setQuickAddBarcode(e.target.value)} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <label style={{ fontSize: '0.82rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Category</label>
                  <input type="text" placeholder="Beverages, Bakery, Food..." value={quickAddCategory} onChange={e => setQuickAddCategory(e.target.value)} />
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                  <button type="button" className="btn btn-secondary" style={{ flex: 1, padding: '0.7rem' }} onClick={() => setShowQuickAdd(false)}>Cancel</button>
                  <button type="submit" className="btn btn-cyan" style={{ flex: 1, padding: '0.7rem' }}>Save & Add Product</button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
