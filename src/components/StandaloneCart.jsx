import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database';
import { dbCloud } from '../config/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { motion } from 'framer-motion';
import { ShoppingCart, Sun, Moon, Monitor, Clock, Trash2, RotateCcw, Plus, Minus, Package, Search, Check } from 'lucide-react';
import { sound } from '../services/soundService';
import { PrinterService } from '../services/printerService';
import { useNavigate } from 'react-router-dom';
import './StandaloneCart.css';

export default function StandaloneCart() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('active');
  const heldCarts = useLiveQuery(() => db.held_carts.orderBy('timestamp').reverse().toArray(), []);
  const allProducts = useLiveQuery(() => db.products.toArray(), []);

  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogCategory, setCatalogCategory] = useState('All');

  const [cart, setCart] = useState(() => {
    try {
      const saved = localStorage.getItem('adk_active_cart');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('adk_theme') === 'dark' || 
           (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  });

  const [shopDetails, setShopDetails] = useState({
    shopName: 'ADK SUPERMART',
    address: 'No. 45, Galle Road, Colombo, Sri Lanka',
    phone: '+94 11 234 5678',
    receiptFooter: 'Thank you for shopping! Returns valid within 7 days.',
    currency: 'Rs.'
  });

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [cashTendered, setCashTendered] = useState('');

  const orgId = localStorage.getItem('adk_orgId') || '';
  const userEmail = localStorage.getItem('adk_userEmail') || '';
  const isSuperAdmin = userEmail.trim().toLowerCase() === 'arikarran14@gmail.com';

  useEffect(() => {
    async function fetchOrgDetails() {
      if (!orgId) return;
      try {
        const snap = await getDoc(doc(dbCloud, "Organizations", orgId));
        if (snap.exists()) {
          const data = snap.data();
          setShopDetails({
            shopName: data.shopName || 'ADK SUPERMART',
            address: data.address || 'No. 45, Galle Road, Colombo, Sri Lanka',
            phone: data.phone || '+94 11 234 5678',
            receiptFooter: data.receiptFooter || 'Thank you for shopping! Returns valid within 7 days.',
            currency: data.currency || 'Rs.'
          });
        }
      } catch (err) {
        console.warn("Could not fetch org details offline", err);
      }
    }
    fetchOrgDetails();

    const settingsChannel = new BroadcastChannel('adk_settings_sync');
    const handleSettingsMessage = (event) => {
      if (event.data && event.data.type === 'SHOP_DETAILS_UPDATED') {
        setShopDetails(prev => ({ ...prev, shopName: event.data.shopName }));
      }
    };
    settingsChannel.addEventListener('message', handleSettingsMessage);

    return () => {
      settingsChannel.removeEventListener('message', handleSettingsMessage);
      settingsChannel.close();
    };
  }, [orgId]);

  useEffect(() => {
    const channel = new BroadcastChannel('adk_cart_sync');
    const handleMessage = (event) => {
      if (event.data && event.data.type === 'SYNC_CART') {
        const newCartJson = JSON.stringify(event.data.cart);
        setCart((prevCart) => {
          if (JSON.stringify(prevCart) !== newCartJson) {
            sound.playScanBeep();
            return event.data.cart;
          }
          return prevCart;
        });
      }
    };
    channel.addEventListener('message', handleMessage);
    channel.postMessage({ type: 'REQUEST_CART' });

    return () => {
      channel.removeEventListener('message', handleMessage);
      channel.close();
    };
  }, []);

  useEffect(() => {
    let backButtonListener = null;

    const setupBackButton = async () => {
      try {
        const { App: CapApp } = await import('@capacitor/app');
        backButtonListener = await CapApp.addListener('backButton', () => {
          navigate('/', { replace: true });
        });
      } catch (err) {
        // Not running in Capacitor, fallback to history
        window.history.pushState({ standaloneCart: true }, '', window.location.href);
        window.addEventListener('popstate', handlePopState);
      }
    };

    const handlePopState = () => {
      navigate('/', { replace: true });
    };

    setupBackButton();

    return () => {
      if (backButtonListener) {
        backButtonListener.remove();
      }
      window.removeEventListener('popstate', handlePopState);
    };
  }, [navigate]);

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
    try {
      localStorage.setItem('adk_active_cart', JSON.stringify(newCart));
    } catch (e) {
      console.warn("Could not save active cart to localStorage", e);
    }
    const channel = new BroadcastChannel('adk_cart_sync');
    channel.postMessage({ type: 'SYNC_CART', cart: newCart });
    channel.close();
  };

  const handleUpdateQuantity = (productId, newQty) => {
    if (newQty <= 0) {
      handleRemoveItem(productId);
      return;
    }
    const updated = cart.map(item => item.product.id === productId ? { ...item, quantity: newQty } : item);
    updateCartStateAndBroadcast(updated);
  };

  const handleUpdateDiscount = (productId, newDisc) => {
    const updated = cart.map(item => item.product.id === productId ? { ...item, discount: newDisc } : item);
    updateCartStateAndBroadcast(updated);
  };

  const handleRemoveItem = (productId) => {
    const updated = cart.filter(item => item.product.id !== productId);
    updateCartStateAndBroadcast(updated);
  };

  const [selectedCatalogProd, setSelectedCatalogProd] = useState(null);
  const [catalogCountInput, setCatalogCountInput] = useState(1);

  const handleAddToCartFromCatalog = (product) => {
    setSelectedCatalogProd(product);
    setCatalogCountInput(1);
  };

  const handleConfirmAddQuantity = () => {
    if (!selectedCatalogProd) return;
    const count = Math.max(1, parseInt(catalogCountInput) || 1);
    sound.playScanBeep();

    const existingIndex = cart.findIndex((item) => item.product.id === selectedCatalogProd.id);
    let newCart;
    if (existingIndex > -1) {
      newCart = cart.map((item, idx) => 
        idx === existingIndex ? { ...item, quantity: item.quantity + count } : item
      );
    } else {
      newCart = [...cart, { product: selectedCatalogProd, quantity: count, discount: 0 }];
    }
    updateCartStateAndBroadcast(newCart);
    setSelectedCatalogProd(null);
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
      updateCartStateAndBroadcast([]);
    } catch (err) {
      console.error("Failed to hold bill in standalone cart:", err);
    }
  };

  const handleCheckout = async () => {
    if (cart.length === 0) return;

    let orgData = null;
    if (orgId) {
      try {
        const snap = await getDoc(doc(dbCloud, "Organizations", orgId));
        if (snap.exists()) orgData = snap.data();
      } catch (err) {
        console.warn("Could not check bill limit offline.", err);
      }
    }

    const currentCount = orgData?.billPrintCount || 0;
    let currentTier = orgData?.subscriptionTier || 'Free';
    if (orgData?.premium_expiry_date) {
      const expiryDate = new Date(orgData.premium_expiry_date);
      if (new Date() > expiryDate) {
        currentTier = 'Free';
      } else {
        currentTier = 'Premium';
      }
    }

    if (!isSuperAdmin && currentTier !== 'Premium' && currentCount >= 50) {
      sound.playErrorSound();
      alert("Billing Limit Reached!");
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
      selectedBankId: null,
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
      PrinterService.printReceipt(transactionData, shopDetails);

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
      
      if (navigator.onLine && orgId) {
        try {
          const orgRef = doc(dbCloud, "Organizations", orgId);
          await updateDoc(orgRef, { billPrintCount: (currentCount + 1) });
        } catch (err) {
          console.error("Firebase update failed:", err);
        }
      }
      
      sound.playSuccessChime();
      updateCartStateAndBroadcast([]);
      setShowPaymentModal(false);
      setCashTendered('');
    } catch (error) {
      console.error("Checkout failed:", error);
      sound.playErrorSound();
    }
  };

  const totalAmount = cart.reduce((sum, item) => sum + (item.product.price * item.quantity) - (((item.discount || 0) / 100) * (item.product.price * item.quantity)), 0);
  const totalDiscount = cart.reduce((sum, item) => sum + (((item.discount || 0) / 100) * (item.product.price * item.quantity)), 0);
  const subtotal = cart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);

  return (
    <div className="standalone-cart-layout animate-fade-in" style={{ padding: '1rem' }}>
      <header className="standalone-cart-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Monitor size={28} color="var(--accent-cyan)" />
          <div>
            <h1 className="shop-name" style={{ fontSize: '1.4rem', margin: 0 }}>{shopDetails.shopName}</h1>
            <p className="branch-badge" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Customer Facing Display | Dual Screen Live Sync</p>
          </div>
        </div>
        <button 
          onClick={() => setDarkMode(!darkMode)} 
          title="Toggle Dark Mode"
          style={{ 
            padding: '0.35rem 0.6rem', 
            borderRadius: '6px', 
            background: 'rgba(255, 255, 255, 0.1)', 
            border: '1px solid rgba(255, 255, 255, 0.15)', 
            color: '#ffffff', 
            cursor: 'pointer', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center' 
          }}
        >
          {darkMode ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </header>

      <main className="standalone-cart-main">
        <div className="standalone-cart-grid">
          
          {/* Left Main View (Active Cart or Held Bills Tab) */}
          <div className="cart-items-section glass-panel" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column' }}>
            {/* Tab Navigation Header - Commercial Cashier Segmented Control */}
            <div style={{ display: 'flex', gap: '4px', background: '#e2e8f0', padding: '4px', borderRadius: '6px', border: '1px solid #cbd5e1', marginBottom: '1.25rem', flexWrap: 'nowrap', overflowX: 'auto' }}>
              <button 
                style={{ 
                  flex: 1, 
                  padding: '0.45rem 0.85rem', 
                  borderRadius: '4px', 
                  border: 'none', 
                  fontSize: '0.82rem', 
                  whiteSpace: 'nowrap', 
                  flexShrink: 0,
                  background: activeTab === 'active' ? '#0f172a' : 'transparent',
                  color: activeTab === 'active' ? '#ffffff' : '#475569',
                  fontWeight: activeTab === 'active' ? '700' : '600',
                  boxShadow: activeTab === 'active' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
                onClick={() => setActiveTab('active')}
              >
                <ShoppingCart size={14} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} /> Active Order ({cart.length})
              </button>
              <button 
                style={{ 
                  flex: 1, 
                  padding: '0.45rem 0.85rem', 
                  borderRadius: '4px', 
                  border: 'none', 
                  fontSize: '0.82rem', 
                  whiteSpace: 'nowrap', 
                  flexShrink: 0,
                  background: activeTab === 'held' ? '#0f172a' : 'transparent',
                  color: activeTab === 'held' ? '#ffffff' : '#475569',
                  fontWeight: activeTab === 'held' ? '700' : '600',
                  boxShadow: activeTab === 'held' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
                onClick={() => setActiveTab('held')}
              >
                <Clock size={14} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} /> Held Bills ({(heldCarts || []).length})
              </button>
              <button 
                style={{ 
                  flex: 1, 
                  padding: '0.45rem 0.85rem', 
                  borderRadius: '4px', 
                  border: 'none', 
                  fontSize: '0.82rem', 
                  whiteSpace: 'nowrap', 
                  flexShrink: 0,
                  background: activeTab === 'catalog' ? '#0f172a' : 'transparent',
                  color: activeTab === 'catalog' ? '#ffffff' : '#475569',
                  fontWeight: activeTab === 'catalog' ? '700' : '600',
                  boxShadow: activeTab === 'catalog' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
                onClick={() => setActiveTab('catalog')}
              >
                <Package size={14} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} /> + Add Products
              </button>
            </div>
            
            {activeTab === 'active' && (
              <div className="cart-scroll-container">
                {cart.map((item) => {
                  const itemSub = item.product.price * item.quantity;
                  const itemDisc = ((item.discount || 0) / 100) * itemSub;
                  const itemTotal = itemSub - itemDisc;

                  return (
                    <div key={item.product.id} className="cart-item-card glass-card" style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0.75rem', marginBottom: '0.45rem', gap: '0.75rem' }}>
                      <div style={{ flex: '1 1 200px', minWidth: '150px' }}>
                        <span className="item-category" style={{ fontSize: '0.68rem', color: 'var(--accent-cyan)', padding: '0.1rem 0.35rem' }}>{item.product.category || 'General'}</span>
                        <h3 className="item-name" style={{ fontSize: '0.92rem', margin: '0.2rem 0' }}>{item.product.name}</h3>
                        <span className="price-mono" style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>@ Rs. {item.product.price.toFixed(2)}</span>
                      </div>

                      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.85rem', flex: '1 1 auto', justifyContent: 'flex-end' }}>
                        {/* Quantity Adjusters */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          <button className="qty-btn" onClick={() => handleUpdateQuantity(item.product.id, item.quantity - 1)}>
                            <Minus size={11} />
                          </button>
                          <input 
                            type="number" 
                            className="qty-input"
                            value={item.quantity} 
                            onChange={(e) => handleUpdateQuantity(item.product.id, parseInt(e.target.value) || 1)}
                            min="1"
                          />
                          <button className="qty-btn" onClick={() => handleUpdateQuantity(item.product.id, item.quantity + 1)}>
                            <Plus size={11} />
                          </button>
                        </div>

                        {/* Discount % Input */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Disc%:</span>
                          <input 
                            type="number" 
                            className="disc-input"
                            value={item.discount || ''} 
                            placeholder="0"
                            onChange={(e) => handleUpdateDiscount(item.product.id, parseFloat(e.target.value) || 0)}
                            min="0"
                            max="100"
                          />
                        </div>

                        {/* Final Price */}
                        <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.1rem', minWidth: '75px' }}>
                          <span className="price-mono" style={{ fontSize: '0.95rem', fontWeight: 'bold', color: 'var(--accent-cyan)' }}>Rs. {itemTotal.toFixed(2)}</span>
                          {item.discount > 0 && <span style={{ fontSize: '0.68rem', color: 'var(--accent-success)', fontWeight: 'bold' }}>-Rs. {itemDisc.toFixed(2)}</span>}
                        </div>

                        <button className="delete-btn" style={{ padding: '0.3rem' }} onClick={() => handleRemoveItem(item.product.id)} title="Remove Item">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}

                {cart.length === 0 && (
                  <div className="empty-cart-state" style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <ShoppingCart size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
                    <h3>Welcome to {shopDetails.shopName}</h3>
                    <p>Your scanned items will display here in real-time.</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'held' && (
              <div className="cart-scroll-container">
                {(!heldCarts || heldCarts.length === 0) ? (
                  <div className="empty-cart-state" style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <Clock size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
                    <h3>No Held Bills</h3>
                    <p>When cashier holds a bill (F8), it will appear here.</p>
                  </div>
                ) : (
                  heldCarts.map((held) => (
                    <div key={held.id} className="glass-card" style={{ padding: '1.1rem', marginBottom: '1rem', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <div>
                          <h3 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--accent-cyan)', fontWeight: '700' }}>{held.label}</h3>
                          <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{new Date(held.timestamp).toLocaleString()}</span>
                        </div>
                        <span className="price-mono" style={{ fontSize: '1.2rem', fontWeight: '800', color: 'var(--accent-success)' }}>
                          Rs. {(held.total || 0).toFixed(2)}
                        </span>
                      </div>

                      <div style={{ display: 'flex', gap: '0.4rem', margin: '0.6rem 0', flexWrap: 'wrap' }}>
                        {(held.items || []).map((i, idx) => (
                          <span key={idx} style={{ fontSize: '0.75rem', background: 'rgba(99,102,241,0.15)', color: 'var(--text-primary)', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
                            {i.product?.name || i.name} x {i.quantity}
                          </span>
                        ))}
                      </div>

                      <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.75rem' }}>
                        <button 
                          className="btn btn-cyan" 
                          style={{ flex: 1, padding: '0.45rem 0.8rem', fontSize: '0.82rem' }}
                          onClick={async () => {
                            await db.held_carts.delete(held.id);
                            updateCartStateAndBroadcast(held.items || []);
                            setActiveTab('active');
                            sound.playSuccessChime();
                          }}
                        >
                          <RotateCcw size={14} /> Restore Order
                        </button>
                        <button 
                          className="btn btn-danger" 
                          style={{ padding: '0.45rem 0.8rem', fontSize: '0.82rem' }}
                          onClick={async () => {
                            await db.held_carts.delete(held.id);
                            sound.playErrorSound();
                          }}
                        >
                          <Trash2 size={14} /> Delete
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === 'catalog' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', flex: 1 }}>
                {/* Search & Category Filters */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', padding: '0.4rem 0.8rem', borderRadius: 'var(--radius-md)' }}>
                    <Search size={16} color="var(--text-muted)" style={{ marginRight: '0.5rem' }} />
                    <input 
                      type="text"
                      placeholder="Search products by name or barcode..."
                      value={catalogSearch}
                      onChange={(e) => setCatalogSearch(e.target.value)}
                      style={{ border: 'none', background: 'transparent', outline: 'none', flex: 1, color: 'var(--text-primary)', fontSize: '0.88rem' }}
                    />
                  </div>

                  {/* Category Pills - Commercial Cashier Segmented Control */}
                  <div style={{ display: 'flex', gap: '4px', background: '#e2e8f0', padding: '4px', borderRadius: '6px', border: '1px solid #cbd5e1', overflowX: 'auto' }}>
                    {['All', ...new Set((allProducts || []).map(p => p.category || 'General'))].map((cat) => (
                      <button 
                        key={cat}
                        style={{ 
                          borderRadius: '4px', 
                          padding: '0.35rem 0.85rem', 
                          fontSize: '0.8rem', 
                          whiteSpace: 'nowrap',
                          flexShrink: 0,
                          border: 'none',
                          background: catalogCategory === cat ? '#0f172a' : 'transparent',
                          color: catalogCategory === cat ? '#ffffff' : '#475569',
                          fontWeight: catalogCategory === cat ? '700' : '600',
                          boxShadow: catalogCategory === cat ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                        onClick={() => setCatalogCategory(cat)}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Product Folder / List Details View */}
                <div className="cart-scroll-container" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {(allProducts || [])
                    .filter(p => {
                      const matchesCategory = catalogCategory === 'All' || (p.category || 'General') === catalogCategory;
                      const matchesSearch = p.name?.toLowerCase().includes(catalogSearch.toLowerCase()) || 
                                            p.barcode?.toLowerCase().includes(catalogSearch.toLowerCase());
                      return matchesCategory && matchesSearch;
                    })
                    .map((prod) => {
                      const existingItem = cart.find(item => item.product.id === prod.id);
                      return (
                        <div 
                          key={prod.id} 
                          className="glass-card" 
                          style={{ 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'center', 
                            padding: '0.55rem 0.85rem', 
                            borderRadius: 'var(--radius-md)', 
                            border: '1px solid var(--border-color)', 
                            cursor: 'pointer',
                            transition: 'all 0.15s ease'
                          }}
                          onClick={() => handleAddToCartFromCatalog(prod)}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <span style={{ fontSize: '0.68rem', fontWeight: 'bold', textTransform: 'uppercase', padding: '0.15rem 0.45rem', borderRadius: '4px', background: 'rgba(99,102,241,0.15)', color: 'var(--accent-cyan)' }}>
                              {prod.category || 'General'}
                            </span>
                            <span style={{ fontWeight: '600', fontSize: '0.9rem' }}>{prod.name}</span>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                            <span className="price-mono" style={{ color: 'var(--accent-cyan)', fontWeight: 'bold', fontSize: '0.9rem' }}>
                              Rs. {prod.price.toFixed(2)}
                            </span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                              Stock: {prod.quantity}
                            </span>
                            {existingItem ? (
                              <span style={{ fontSize: '0.75rem', background: 'rgba(16, 185, 129, 0.2)', color: 'var(--accent-success)', fontWeight: 'bold', padding: '0.2rem 0.55rem', borderRadius: '50px', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                                <Check size={12} /> {existingItem.quantity}
                              </span>
                            ) : (
                              <span style={{ fontSize: '0.75rem', background: 'rgba(99, 102, 241, 0.2)', color: 'var(--accent-primary)', fontWeight: 'bold', padding: '0.2rem 0.55rem', borderRadius: '50px', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                                <Plus size={12} /> Add
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}

                  {(allProducts || []).filter(p => {
                    const matchesCategory = catalogCategory === 'All' || (p.category || 'General') === catalogCategory;
                    const matchesSearch = p.name?.toLowerCase().includes(catalogSearch.toLowerCase()) || 
                                          p.barcode?.toLowerCase().includes(catalogSearch.toLowerCase());
                    return matchesCategory && matchesSearch;
                  }).length === 0 && (
                    <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
                      <Package size={40} style={{ opacity: 0.3, marginBottom: '0.75rem' }} />
                      <p style={{ margin: 0, fontWeight: '600' }}>No products found matching "{catalogSearch}"</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Customer Facing Total Display */}
          <div className="cart-summary-section glass-panel" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', overflowY: 'auto' }}>
            <div>
              <h2 className="section-title" style={{ fontSize: '1.25rem', marginBottom: '1.25rem' }}>Summary Total</h2>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Subtotal</span>
                  <span className="price-mono">Rs. {subtotal.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--accent-success)' }}>
                  <span>Discount</span>
                  <span className="price-mono">-Rs. {totalDiscount.toFixed(2)}</span>
                </div>
                
                <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '0.5rem 0' }} />
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.25rem' }}>
                  <span style={{ fontSize: '1.15rem', fontWeight: 'bold' }}>Grand Total</span>
                  <span className="price-mono grand-total-amount" style={{ color: '#10b981', fontWeight: '800' }}>
                    Rs. {totalAmount.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', flexShrink: 0 }}>
              <button 
                className="btn" 
                onClick={handleHoldBill} 
                disabled={cart.length === 0} 
                style={{ 
                  flex: 1, 
                  padding: '0.75rem', 
                  background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', 
                  color: '#ffffff', 
                  border: 'none', 
                  borderRadius: 'var(--radius-md)',
                  boxShadow: '0 4px 14px rgba(245, 158, 11, 0.35)',
                  fontWeight: '700',
                  opacity: cart.length === 0 ? 0.4 : 1,
                  cursor: cart.length === 0 ? 'not-allowed' : 'pointer'
                }}
              >
                Hold
              </button>
              <button 
                className="btn" 
                onClick={() => { setCashTendered(''); setShowPaymentModal(true); }} 
                disabled={cart.length === 0} 
                style={{ 
                  flex: 2, 
                  padding: '0.75rem', 
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', 
                  color: '#ffffff', 
                  border: 'none', 
                  borderRadius: 'var(--radius-md)',
                  boxShadow: '0 4px 18px rgba(16, 185, 129, 0.4)',
                  fontWeight: '700',
                  opacity: cart.length === 0 ? 0.4 : 1,
                  cursor: cart.length === 0 ? 'not-allowed' : 'pointer'
                }}
              >
                Complete Payment
              </button>
            </div>
          </div>

        </div>
      </main>

      {showPaymentModal && (
        <div className="payment-modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(10px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 99999 }}>
          <motion.div className="payment-modal glass-panel" initial={{ scale: 0.9 }} animate={{ scale: 1 }} style={{ padding: '2rem', width: '400px' }}>
            <h3 style={{ marginBottom: '1.5rem', fontSize: '1.3rem' }}>Confirm Customer Payment</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
              <label>Select Payment Method</label>
              <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} style={{ padding: '0.75rem', borderRadius: 'var(--radius-md)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', outline: 'none' }}>
                <option value="Cash">💵 Cash</option>
                <option value="Card">💳 Card Payment</option>
                <option value="QR / UPI">📱 QR Settlement</option>
              </select>
            </div>
            
            {paymentMethod === 'Cash' && (
              <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>Cash Tendered</label>
                  <input 
                    type="number" 
                    value={cashTendered} 
                    onChange={e => setCashTendered(e.target.value)} 
                    placeholder="0.00"
                    style={{ padding: '0.75rem', borderRadius: 'var(--radius-md)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', outline: 'none', fontSize: '1.1rem', fontWeight: 'bold' }} 
                  />
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-secondary)' }}>Balance</label>
                  <div style={{ padding: '0.75rem', borderRadius: 'var(--radius-md)', background: 'var(--bg-primary)', color: (parseFloat(cashTendered || 0) - totalAmount) >= 0 ? 'var(--accent-success)' : 'var(--accent-danger)', border: '1px solid var(--border-light)', fontSize: '1.1rem', fontWeight: 'bold' }}>
                    Rs. {cashTendered ? (parseFloat(cashTendered) - totalAmount).toFixed(2) : '0.00'}
                  </div>
                </div>
              </div>
            )}
            
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowPaymentModal(false)}>Cancel</button>
              <button className="btn btn-success" style={{ flex: 1 }} onClick={handleCheckout}>Print Receipt</button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Quantity Prompt Modal Dialog */}
      {selectedCatalogProd && (
        <div className="payment-modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 99999 }}>
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} style={{ padding: '1.5rem', width: '380px', background: '#ffffff', borderRadius: '8px', border: '1px solid #cbd5e1', boxShadow: '0 10px 25px rgba(0,0,0,0.25)' }}>
            <h3 style={{ margin: '0 0 0.4rem 0', fontSize: '1.15rem', color: '#0f172a', fontWeight: '700' }}>Add Product Quantity</h3>
            <p style={{ margin: '0 0 1rem 0', fontSize: '0.85rem', color: '#475569' }}>
              <strong>{selectedCatalogProd.name}</strong> (@ Rs. {selectedCatalogProd.price.toFixed(2)})
            </p>
            
            {/* Count Input Box */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.85rem' }}>
              <label style={{ fontSize: '0.78rem', fontWeight: '700', color: '#334155' }}>Enter Count / Quantity:</label>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <button 
                  type="button"
                  style={{ width: '36px', height: '36px', borderRadius: '4px', border: '1px solid #cbd5e1', background: '#f1f5f9', fontSize: '1.2rem', fontWeight: 'bold', cursor: 'pointer', color: '#0f172a' }}
                  onClick={() => setCatalogCountInput(prev => Math.max(1, (parseInt(prev) || 1) - 1))}
                >
                  -
                </button>
                <input 
                  type="number"
                  min="1"
                  max={selectedCatalogProd.quantity || 999}
                  value={catalogCountInput}
                  onChange={(e) => setCatalogCountInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleConfirmAddQuantity();
                  }}
                  style={{ flex: 1, height: '36px', textAlign: 'center', fontSize: '1.1rem', fontWeight: 'bold', border: '1px solid #cbd5e1', borderRadius: '4px', background: '#ffffff', color: '#0f172a', outline: 'none' }}
                  autoFocus
                />
                <button 
                  type="button"
                  style={{ width: '36px', height: '36px', borderRadius: '4px', border: '1px solid #cbd5e1', background: '#f1f5f9', fontSize: '1.2rem', fontWeight: 'bold', cursor: 'pointer', color: '#0f172a' }}
                  onClick={() => setCatalogCountInput(prev => (parseInt(prev) || 1) + 1)}
                >
                  +
                </button>
              </div>
            </div>

            {/* Quick Presets */}
            <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1.25rem' }}>
              {[1, 2, 5, 10, 20].map(num => (
                <button 
                  key={num}
                  type="button"
                  style={{ flex: 1, padding: '0.3rem', borderRadius: '4px', border: '1px solid #cbd5e1', background: catalogCountInput == num ? '#0f172a' : '#f8fafc', color: catalogCountInput == num ? '#ffffff' : '#334155', fontWeight: '700', fontSize: '0.78rem', cursor: 'pointer' }}
                  onClick={() => setCatalogCountInput(num)}
                >
                  +{num}
                </button>
              ))}
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button 
                type="button"
                style={{ flex: 1, padding: '0.55rem', borderRadius: '4px', border: '1px solid #cbd5e1', background: '#ffffff', color: '#0f172a', fontWeight: '600', fontSize: '0.85rem', cursor: 'pointer' }}
                onClick={() => setSelectedCatalogProd(null)}
              >
                Cancel
              </button>
              <button 
                type="button"
                style={{ flex: 1.5, padding: '0.55rem', borderRadius: '4px', border: 'none', background: '#16a34a', color: '#ffffff', fontWeight: '700', fontSize: '0.85rem', cursor: 'pointer' }}
                onClick={handleConfirmAddQuantity}
              >
                Add to Cart
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
