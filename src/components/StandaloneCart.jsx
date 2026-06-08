import { useState, useEffect, useCallback } from 'react';
import { db } from '../db/database';
import { useBarcodeScanner } from '../hooks/useBarcodeScanner';
import jsPDF from 'jspdf';
import { dbCloud } from '../config/firebase';
import { doc, getDoc, updateDoc, collection, getDocs } from 'firebase/firestore';
import { motion } from 'framer-motion';
import { Trash2, Plus, Minus, ShoppingCart, Sun, Moon, Check, Search, Camera } from 'lucide-react';
import BarcodeCameraScanner from './BarcodeCameraScanner';
import './StandaloneCart.css';

export default function StandaloneCart() {
  const [cart, setCart] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchSuggestions, setSearchSuggestions] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [showScanner, setShowScanner] = useState(false);

  const handleAddProductById = async (product) => {
    const existing = cart.find(item => item.product.id === product.id);
    let nextCart;
    if (existing) {
      if (existing.quantity >= product.quantity) return;
      nextCart = cart.map(item => item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
    } else {
      if (product.quantity > 0) {
        nextCart = [...cart, { product, quantity: 1, discount: 0 }];
      } else return;
    }
    updateCartStateAndBroadcast(nextCart);
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
        handleAddProductById(searchSuggestions[selectedIndex]);
      } else {
        handleAddProductById(searchSuggestions[0]);
      }
      setSearchQuery('');
      setSearchSuggestions([]);
      setSelectedIndex(-1);
    }
  };
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('adk_theme') === 'dark' || 
           (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  });

  const [tier, setTier] = useState('Free');
  const [billPrintCount, setBillPrintCount] = useState(0);
  const [shopDetails, setShopDetails] = useState({
    shopName: 'ADK SUPERMART',
    address: 'No. 45, Galle Road, Colombo, Sri Lanka',
    phone: '+94 11 234 5678'
  });

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [bankAccounts, setBankAccounts] = useState([]);
  const [selectedBankId, setSelectedBankId] = useState('');
  const [fetchingBanks, setFetchingBanks] = useState(false);

  const orgId = localStorage.getItem('adk_orgId') || '';
  const branchId = localStorage.getItem('adk_branchId') || 'Main';
  const userEmail = localStorage.getItem('adk_userEmail') || '';
  const isSuperAdmin = userEmail.trim().toLowerCase() === 'arikarran14@gmail.com';
  const hasPremium = isSuperAdmin || tier === 'Premium';

  // Fetch shop and organization details
  useEffect(() => {
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
        console.error("Failed to fetch organization details in standalone cart:", err);
      }
    }
    fetchOrgDetails();
  }, [orgId]);

  // Fetch bank accounts for Checkout Modal
  useEffect(() => {
    async function fetchBanks() {
      if (!showPaymentModal) return;
      setFetchingBanks(true);
      try {
        const snap = await getDocs(collection(dbCloud, "BankAccounts"));
        const list = [];
        snap.forEach(doc => {
          const data = doc.data();
          if (data.isEnabled !== false) {
            list.push({ id: doc.id, ...data });
          }
        });
        setBankAccounts(list);
        if (list.length > 0) {
          setSelectedBankId(list[0].id);
        }
      } catch (err) {
        console.error("Could not fetch bank accounts in standalone cart:", err);
      } finally {
        setFetchingBanks(false);
      }
    }
    fetchBanks();
  }, [showPaymentModal]);

  // Sync state with parent window using BroadcastChannel
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

    // Initial broadcast request to get cart from POS
    channel.postMessage({ type: 'REQUEST_CART' });

    return () => {
      channel.removeEventListener('message', handleMessage);
      channel.close();
    };
  }, []);

  // Sync theme
  useEffect(() => {
    if (darkMode) {
      document.body.classList.add('dark-theme');
      localStorage.setItem('adk_theme', 'dark');
    } else {
      document.body.classList.remove('dark-theme');
      localStorage.setItem('adk_theme', 'light');
    }
  }, [darkMode]);

  const updateCartStateAndBroadcast = (newCart) => {
    setCart(newCart);
    const channel = new BroadcastChannel('adk_cart_sync');
    channel.postMessage({ type: 'SYNC_CART', cart: newCart });
    channel.close();
  };

  const handleUpdateQuantity = (productId, newQty) => {
    const nextCart = cart.map((item) => {
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
    updateCartStateAndBroadcast(nextCart);
  };

  const handleUpdateDiscount = (productId, discount) => {
    const nextCart = cart.map((item) => {
      if (item.product.id === productId) {
        const cleanDiscountPercent = Math.min(Math.max(0, discount), 100);
        return { ...item, discount: cleanDiscountPercent };
      }
      return item;
    });
    updateCartStateAndBroadcast(nextCart);
  };

  const handleRemoveFromCart = (productId) => {
    const nextCart = cart.filter((item) => item.product.id !== productId);
    updateCartStateAndBroadcast(nextCart);
  };

  const handleHoldBill = () => {
    updateCartStateAndBroadcast([]);
  };

  // Hardware Scanner Integration in Standalone window
  useBarcodeScanner(useCallback(async (scannedBarcode) => {
    if (!hasPremium) {
      alert("Barcode Scanning is a Premium-Only Feature! Please upgrade settings.");
      return;
    }
    const product = await db.products.where('barcode').equals(scannedBarcode).first();
    if (product) {
      const existing = cart.find(item => item.product.id === product.id);
      let nextCart;
      if (existing) {
        if (existing.quantity >= product.quantity) return;
        nextCart = cart.map(item => item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      } else {
        if (product.quantity > 0) {
          nextCart = [...cart, { product, quantity: 1, discount: 0 }];
        } else return;
      }
      updateCartStateAndBroadcast(nextCart);
    } else {
      alert(`Barcode "${scannedBarcode}" not found in inventory.`);
    }
  }, [cart, hasPremium]));

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
              console.error("Iframe cleanup error:", err);
            }
          }, 60000);
        };
      }
    } catch (printErr) {
      console.error("Direct print failed, fallback to download.", printErr);
    }
  };

  const handleCheckout = async () => {
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
        console.warn("Could not check bill limit offline.", err);
      }
    }

    const currentCount = orgData?.billPrintCount || 0;
    const currentTier = orgData?.subscriptionTier || 'Free';

    if (!isSuperAdmin && currentTier !== 'Premium' && currentCount >= 50) {
      alert("Billing Limit Reached! Free accounts are capped at 50 bills. Please upgrade.");
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
      generatePDFReceipt(receiptId, paymentMethod, totalAmount, cart);

      await db.transaction('rw', db.transactions, db.products, async () => {
        await db.transactions.add({
          receiptId,
          totalAmount,
          paymentMethod,
          selectedBankId: paymentMethod === 'Bank Transfer' ? selectedBankId : null,
          timestamp: Date.now(),
          itemsJson
        });

        for (const item of cart) {
          const newQty = item.product.quantity - item.quantity;
          await db.products.update(item.product.id, { quantity: newQty, synced: false });
        }
      });
      
      if (navigator.onLine && orgId) {
        try {
          const orgRef = doc(dbCloud, "Organizations", orgId);
          await updateDoc(orgRef, {
            billPrintCount: (currentCount + 1)
          });
          setBillPrintCount(currentCount + 1);
        } catch (err) {
          console.error("Failed to increment print count in firebase:", err);
        }
      }
      
      updateCartStateAndBroadcast([]);
      setShowPaymentModal(false);
      alert(`Checkout successful! PDF Receipt generated.`);
    } catch (error) {
      console.error("Checkout failed:", error);
      alert("Checkout failed. Check console.");
    }
  };

  const totalAmount = cart.reduce((sum, item) => sum + (item.product.price * item.quantity) - (((item.discount || 0) / 100) * (item.product.price * item.quantity)), 0);
  const totalDiscount = cart.reduce((sum, item) => sum + (((item.discount || 0) / 100) * (item.product.price * item.quantity)), 0);
  const subtotal = cart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);

  return (
    <div className="standalone-cart-layout animate-fade-in">
      <header className="standalone-cart-header">
        <div className="header-left">
          <ShoppingCart className="cart-glow-icon" size={24} />
          <div>
            <h1 className="shop-name">{shopDetails.shopName}</h1>
            <p className="branch-badge">Branch: {branchId} ({tier} Account)</p>
          </div>
        </div>
        <div className="header-right">
          <button 
            onClick={() => setDarkMode(!darkMode)} 
            className="theme-toggle"
            title="Toggle theme"
          >
            {darkMode ? <Sun size={20} /> : <Moon size={20} />}
          </button>
        </div>
      </header>

      <main className="standalone-cart-main">
        <div className="standalone-cart-grid">
          
          {/* Left panel: Cart Items list */}
          <div className="cart-items-section glass-panel">
            <h2 className="section-title">🛒 Active Shopping Cart</h2>
            
            {/* Search bar & camera scanner inside standalone cart */}
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem' }}>
              <div className="standalone-search-wrapper" style={{ position: 'relative', flex: 1, marginBottom: 0 }}>
                <div className="standalone-search-bar" style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-secondary)', padding: '0.6rem 1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                  <Search size={18} color="var(--text-muted)" style={{ marginRight: '0.75rem' }} />
                  <input 
                    type="text" 
                    placeholder="Search and add products to this cart... (by name or barcode)" 
                    value={searchQuery}
                    onChange={async (e) => {
                      const val = e.target.value;
                      setSearchQuery(val);
                      setSelectedIndex(-1);
                      if (val.length > 0) {
                        const nameResults = await db.products.where('name').startsWithIgnoreCase(val).limit(10).toArray();
                        const barcodeResults = await db.products.where('barcode').equals(val).toArray();
                        const combined = [...barcodeResults, ...nameResults];
                        const unique = combined.filter((item, index) => combined.findIndex(x => x.id === item.id) === index).slice(0, 10);
                        setSearchSuggestions(unique);
                      } else {
                        setSearchSuggestions([]);
                      }
                    }}
                    onKeyDown={handleKeyDown}
                    autoComplete="off"
                    style={{ border: 'none', outline: 'none', flex: 1, fontSize: '0.95rem', background: 'transparent', color: 'var(--text-primary)' }}
                  />
                </div>
                {searchSuggestions.length > 0 && (
                  <ul className="suggestions-dropdown" style={{ 
                    position: 'absolute', top: '100%', left: 0, right: 0, 
                    background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', 
                    borderRadius: 'var(--radius-md)', zIndex: 10, listStyle: 'none', padding: 0, margin: '4px 0 0 0',
                    boxShadow: 'var(--shadow-md)', maxHeight: '200px', overflowY: 'auto'
                  }}>
                    {searchSuggestions.map((s, idx) => (
                      <li 
                        key={s.id} 
                        onClick={() => {
                          handleAddProductById(s);
                          setSearchQuery('');
                          setSearchSuggestions([]);
                        }}
                        style={{ 
                          padding: '0.75rem 1rem', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          background: idx === selectedIndex ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
                          borderBottom: '1px solid var(--border-light)'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <span style={{ fontSize: '0.7rem', fontWeight: 'bold', textTransform: 'uppercase', padding: '0.15rem 0.4rem', borderRadius: '4px', background: 'var(--border-light)', color: 'var(--text-secondary)' }}>{s.category || 'General'}</span>
                          <span style={{ fontWeight: '600', fontSize: '0.9rem' }}>{s.name}</span>
                          <span style={{ fontSize: '0.75rem', color: s.quantity <= 5 ? 'var(--accent-danger)' : 'var(--text-muted)' }}>(Qty: {s.quantity})</span>
                        </div>
                        <span style={{ color: 'var(--accent-success)', fontWeight: '700', fontSize: '0.9rem' }}>Rs. {s.price.toFixed(2)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <button 
                type="button" 
                className="qty-btn" 
                onClick={() => setShowScanner(true)}
                title="Scan Barcode with Camera"
                style={{ padding: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-md)', width: '42px', height: '42px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', cursor: 'pointer' }}
              >
                <Camera size={18} />
              </button>
            </div>
            
            <div className="cart-scroll-container">
              {cart.map((item) => {
                const itemSub = item.product.price * item.quantity;
                const itemDisc = ((item.discount || 0) / 100) * itemSub;
                const itemTotal = itemSub - itemDisc;

                return (
                  <div key={item.product.id} className="cart-item-card">
                    <div className="item-meta">
                      <span className="item-category">{item.product.category || 'General'}</span>
                      <h3 className="item-name">{item.product.name}</h3>
                      <span className="item-unit-price">Rs. {item.product.price.toFixed(2)}</span>
                    </div>

                    <div className="item-adjusters">
                      {/* Quantity Controls */}
                      <div className="qty-row">
                        <button className="qty-btn" onClick={() => handleUpdateQuantity(item.product.id, item.quantity - 1)}>
                          <Minus size={14} />
                        </button>
                        <input 
                          type="number" 
                          className="qty-input" 
                          value={item.quantity}
                          min="1"
                          onChange={(e) => handleUpdateQuantity(item.product.id, parseInt(e.target.value) || 1)}
                        />
                        <button className="qty-btn" onClick={() => handleUpdateQuantity(item.product.id, item.quantity + 1)}>
                          <Plus size={14} />
                        </button>
                      </div>

                      {/* Discount Controls */}
                      <div className="discount-row">
                        <span className="disc-label">Disc (%):</span>
                        <input 
                          type="number" 
                          className="disc-input" 
                          value={item.discount || ''}
                          placeholder="0"
                          min="0"
                          max="100"
                          onChange={(e) => handleUpdateDiscount(item.product.id, parseFloat(e.target.value) || 0)}
                        />
                        {item.discount > 0 && (
                          <span className="disc-value">-Rs. {itemDisc.toFixed(2)}</span>
                        )}
                      </div>
                    </div>

                    <div className="item-summary">
                      <span className="item-final-price">Rs. {itemTotal.toFixed(2)}</span>
                      <button className="delete-btn" onClick={() => handleRemoveFromCart(item.product.id)} title="Remove Item">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                );
              })}

              {cart.length === 0 && (
                <div className="empty-cart-state">
                  <ShoppingCart size={64} className="pulse-icon" />
                  <h3>Waiting for cashier...</h3>
                  <p>Items added to the bill will display here in real-time.</p>
                </div>
              )}
            </div>
          </div>

          {/* Right panel: Summary & Checkout */}
          <div className="cart-summary-section glass-panel">
            <h2 className="section-title">📊 Order Summary</h2>
            
            <div className="summary-details">
              <div className="summary-row">
                <span>Subtotal</span>
                <span>Rs. {subtotal.toFixed(2)}</span>
              </div>
              <div className="summary-row discount">
                <span>Discounts Applied</span>
                <span>-Rs. {totalDiscount.toFixed(2)}</span>
              </div>
              
              <div className="summary-divider"></div>
              
              <div className="summary-row total">
                <span>Grand Total</span>
                <span className="grand-total-amount">Rs. {totalAmount.toFixed(2)}</span>
              </div>

              {tier === 'Free' && !isSuperAdmin && (
                <div className="bill-usage-container">
                  <div className="bill-usage-header">
                    <span>Invoice Usage (Free Tier)</span>
                    <span className={billPrintCount >= 45 ? 'warn-usage' : ''}>{billPrintCount}/50 Bills</span>
                  </div>
                  <div className="progress-bar-bg">
                    <div 
                      className={`progress-fill ${billPrintCount >= 45 ? 'warn' : ''}`}
                      style={{ width: `${Math.min(100, (billPrintCount / 50) * 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="summary-actions">
              <button 
                className="btn btn-secondary" 
                onClick={handleHoldBill}
                disabled={cart.length === 0}
                style={{ flex: 1, padding: '1rem' }}
              >
                Hold Bill
              </button>
              <button 
                className="btn btn-primary" 
                onClick={() => setShowPaymentModal(true)}
                disabled={cart.length === 0 || (tier === 'Free' && !isSuperAdmin && billPrintCount >= 50)}
                style={{ flex: 2, padding: '1rem' }}
              >
                Checkout
              </button>
            </div>
          </div>

        </div>
      </main>

      {/* Checkout Payment Dialog overlay */}
      {showPaymentModal && (
        <div className="payment-modal-overlay">
          <motion.div 
            className="payment-modal glass-panel"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: "spring", duration: 0.3 }}
          >
            <h3 className="modal-title">Select Invoice Payment Method</h3>
            
            <div className="payment-options-grid">
              <div 
                className={`payment-option-card ${paymentMethod === 'Cash' ? 'active' : ''}`}
                onClick={() => setPaymentMethod('Cash')}
              >
                <div className="select-indicator">
                  {paymentMethod === 'Cash' && <Check size={14} />}
                </div>
                <span className="option-icon">💵</span>
                <h4>Cash Settlement</h4>
                <p>Process invoice using cash float</p>
              </div>

              <div 
                className={`payment-option-card ${paymentMethod === 'Bank Transfer' ? 'active' : ''}`}
                onClick={() => setPaymentMethod('Bank Transfer')}
              >
                <div className="select-indicator">
                  {paymentMethod === 'Bank Transfer' && <Check size={14} />}
                </div>
                <span className="option-icon">🏛️</span>
                <h4>Bank Transfer</h4>
                <p>Process invoice using active bank ledger</p>
              </div>
            </div>

            {paymentMethod === 'Bank Transfer' && (
              <div className="bank-selector-container">
                <label className="input-label">Select Active Bank Account</label>
                {fetchingBanks ? (
                  <p className="loading-banks">Syncing active ledger accounts...</p>
                ) : bankAccounts.length === 0 ? (
                  <p className="no-banks-configured">No accounts configured by administrators.</p>
                ) : (
                  <select 
                    value={selectedBankId} 
                    onChange={e => setSelectedBankId(e.target.value)}
                    className="bank-select"
                  >
                    {bankAccounts.map(b => (
                      <option key={b.id} value={b.id}>
                        {b.bankName} - {b.accountNumber} ({b.accountHolder})
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowPaymentModal(false)}>
                Cancel
              </button>
              <button 
                className="btn btn-success" 
                onClick={handleCheckout}
                disabled={paymentMethod === 'Bank Transfer' && bankAccounts.length === 0}
              >
                Complete Payment & Print
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {showScanner && (
        <BarcodeCameraScanner 
          onScan={async (code) => {
            if (!hasPremium) {
              alert("Barcode Scanning is a Premium-Only Feature! Please upgrade settings.");
              setShowScanner(false);
              return;
            }
            const product = await db.products.where('barcode').equals(code).first();
            if (product) {
              await handleAddProductById(product);
            } else {
              alert(`Barcode "${code}" not found in inventory.`);
            }
            setShowScanner(false);
          }}
          onClose={() => setShowScanner(false)}
        />
      )}
    </div>
  );
}
