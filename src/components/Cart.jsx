import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { motion, AnimatePresence } from 'framer-motion';
import { Trash2, Plus, Minus, Camera, ShoppingCart, ExternalLink, Clock, RotateCcw, X } from 'lucide-react';
import { dbCloud } from '../config/firebase';
import { collection, getDocs } from 'firebase/firestore';
import BarcodeCameraScanner from './BarcodeCameraScanner';
import './Cart.css';

export default function Cart({ cartItems, onRemove, onHoldBill, onRestoreCart, onCheckout, onUpdateQuantity, onUpdateDiscount, onScanBarcode, tier, billPrintCount, isSuperAdmin }) {
  const totalAmount = cartItems.reduce((sum, item) => sum + (item.product.price * item.quantity) - (((item.discount || 0) / 100) * (item.product.price * item.quantity)), 0);

  const heldCarts = useLiveQuery(() => db.held_carts.orderBy('timestamp').reverse().toArray(), []);
  const [showHeldModal, setShowHeldModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [bankAccounts, setBankAccounts] = useState([]);
  const [selectedBankId, setSelectedBankId] = useState('');
  const [fetchingBanks, setFetchingBanks] = useState(false);
  const [showScanner, setShowScanner] = useState(false);

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
        console.error("Could not fetch bank accounts for dropdown", err);
      } finally {
        setFetchingBanks(false);
      }
    }
    fetchBanks();
  }, [showPaymentModal]);

  const handleCheckoutClick = () => {
    if (cartItems.length === 0) return;
    setShowPaymentModal(true);
  };

  const handleConfirmPayment = () => {
    onCheckout(paymentMethod, paymentMethod === 'Bank Transfer' ? selectedBankId : null);
    setShowPaymentModal(false);
    setPaymentMethod('Cash');
  };

  const handleOpenStandaloneCart = () => {
    const width = 800;
    const height = 750;
    const left = window.screen.width / 2 - width / 2;
    const top = window.screen.height / 2 - height / 2;
    window.open(
      '#/cart-view',
      'ADKStandaloneCart',
      `width=${width},height=${height},left=${left},top=${top},menubar=no,status=no,toolbar=no,location=no,resizable=yes`
    );
  };

  return (
    <div className="cart-container">
      <div className="cart-header" style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
        <h2 style={{ fontSize: '1.15rem', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>Current Order</h2>
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
          <button 
            type="button" 
            className="btn btn-secondary"
            onClick={() => setShowHeldModal(true)}
            title="View Saved Held Bills"
            style={{ 
              padding: '0.4rem 0.75rem', 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.35rem', 
              borderRadius: '6px', 
              fontSize: '0.8rem',
              fontWeight: '600',
              background: heldCarts?.length > 0 ? '#d97706' : 'var(--bg-primary)',
              color: heldCarts?.length > 0 ? '#ffffff' : 'var(--text-primary)',
              border: '1px solid var(--border-color)'
            }}
          >
            <Clock size={14} />
            <span>Held ({heldCarts?.length || 0})</span>
          </button>
          <button 
            type="button" 
            className="btn btn-secondary" 
            onClick={handleOpenStandaloneCart}
            title="Open Cart in New Window"
            style={{ 
              padding: '0.4rem 0.6rem', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              borderRadius: '6px',
              background: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-color)'
            }}
          >
            <ExternalLink size={15} />
          </button>
          <button 
            type="button" 
            className="btn btn-secondary" 
            onClick={() => setShowScanner(true)}
            title="Scan Barcode with Camera"
            style={{ 
              padding: '0.4rem 0.6rem', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              borderRadius: '6px',
              background: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-color)'
            }}
          >
            <Camera size={15} />
          </button>
        </div>
      </div>

      {/* Usage Limit Warning / Super Admin Indicator */}
      {tier === 'Free' && !isSuperAdmin && (
        <div className="bill-limit-warning" style={{
          background: 'var(--bg-primary)',
          border: '1px solid var(--border-color)',
          padding: '0.75rem 1rem',
          borderRadius: 'var(--radius-md)',
          margin: '0.75rem 1rem 0.5rem 1rem',
          fontSize: '0.8rem'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: '0.4rem' }}>
            <span>Usage Limit (Free Package)</span>
            <span style={{ color: billPrintCount >= 45 ? 'var(--accent-danger)' : 'var(--accent-primary)' }}>
              {billPrintCount}/50 Bills
            </span>
          </div>
          <div style={{ height: '5px', background: 'var(--border-light)', borderRadius: '3px', overflow: 'hidden' }}>
            <div style={{
              width: `${Math.min(100, (billPrintCount / 50) * 100)}%`,
              height: '100%',
              background: billPrintCount >= 45 ? 'var(--accent-danger)' : 'var(--accent-primary)',
              transition: 'width 0.3s ease'
            }} />
          </div>
          {billPrintCount >= 50 && (
            <div style={{ color: 'var(--accent-danger)', fontWeight: 'bold', marginTop: '0.4rem', fontSize: '0.78rem' }}>
              Billing Limit Reached! Upgrade to Premium in Settings to continue.
            </div>
          )}
        </div>
      )}

      {isSuperAdmin && (
        <div className="bill-limit-warning" style={{
          background: 'var(--bg-primary)',
          border: '1px solid var(--border-color)',
          padding: '0.6rem 0.85rem',
          borderRadius: 'var(--radius-md)',
          margin: '0.75rem 1rem 0.5rem 1rem',
          fontSize: '0.8rem'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: '600', color: 'var(--text-primary)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>🛡️ Super Admin Terminal</span>
            <span style={{ fontSize: '0.7rem', fontWeight: '700', padding: '0.1rem 0.45rem', background: '#e2e8f0', color: '#334155', borderRadius: '4px' }}>
              UNLIMITED
            </span>
          </div>
        </div>
      )}

      <div className="cart-items" style={{ paddingTop: 0 }}>
        <AnimatePresence mode="popLayout">
          {cartItems.map((item) => {
            const itemSub = item.product.price * item.quantity;
            const itemDisc = ((item.discount || 0) / 100) * itemSub;
            const itemTotal = itemSub - itemDisc;

            return (
              <motion.div 
                key={item.product.id} 
                className="cart-item glass-card"
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -20 }}
                layout
                style={{ 
                  display: 'flex', 
                  justify: 'space-between', 
                  alignItems: 'center', 
                  padding: '0.45rem 0.75rem', 
                  marginBottom: '0.35rem', 
                  gap: '0.5rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-secondary)'
                }}
              >
                {/* Product Name & Unit Price */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h4 style={{ margin: 0, fontSize: '0.88rem', fontWeight: '700', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text-primary)' }}>
                    {item.product.name}
                  </h4>
                  <span className="price-mono" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    @ Rs. {item.product.price.toFixed(2)}
                  </span>
                </div>

                {/* Quantity Controls */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                  <button className="qty-btn" style={{ width: '22px', height: '22px' }} onClick={() => onUpdateQuantity(item.product.id, item.quantity - 1)}>
                    <Minus size={11} />
                  </button>
                  <input 
                    type="number" 
                    className="qty-input"
                    value={item.quantity} 
                    onChange={(e) => onUpdateQuantity(item.product.id, parseInt(e.target.value) || 1)}
                    min="1"
                  />
                  <button className="qty-btn" style={{ width: '22px', height: '22px' }} onClick={() => onUpdateQuantity(item.product.id, item.quantity + 1)}>
                    <Plus size={11} />
                  </button>
                </div>

                {/* Discount % Input */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Disc%:</span>
                  <input 
                    type="number" 
                    className="disc-input"
                    value={item.discount || ''} 
                    placeholder="0"
                    onChange={(e) => onUpdateDiscount(item.product.id, parseFloat(e.target.value) || 0)}
                    min="0"
                    max="100"
                  />
                </div>

                {/* Total Price */}
                <div style={{ textAlign: 'right', minWidth: '65px' }}>
                  <span className="price-mono" style={{ fontSize: '0.9rem', fontWeight: '700', color: 'var(--text-primary)' }}>
                    Rs. {itemTotal.toFixed(2)}
                  </span>
                  {item.discount > 0 && <span style={{ display: 'block', fontSize: '0.68rem', color: 'var(--accent-danger)', fontWeight: 'bold' }}>-Rs. {itemDisc.toFixed(2)}</span>}
                </div>

                {/* Delete Button */}
                <button className="btn-icon delete-icon" style={{ padding: '0.25rem' }} onClick={() => onRemove(item.product.id)} title="Remove Item">
                  <Trash2 size={14} />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
        
        {cartItems.length === 0 && (
          <div className="empty-cart">
            <ShoppingCart size={48} style={{ opacity: 0.2, marginBottom: '1rem' }} />
            <p>Your shopping cart is empty.</p>
          </div>
        )}
      </div>

      <div className="cart-footer">
        <div className="cart-total-row">
          <span>Grand Total</span>
          <span className="total-amount">Rs. {totalAmount.toFixed(2)}</span>
        </div>
        <div className="cart-actions">
          <button 
            className="btn btn-warning" 
            style={{ flex: 1, padding: '0.55rem 0.85rem', fontSize: '0.88rem' }} 
            onClick={onHoldBill}
          >
            Hold Bill
          </button>
          <button 
            className="btn btn-success" 
            style={{ flex: 1.5, padding: '0.55rem 0.85rem', fontSize: '0.88rem', opacity: (tier === 'Free' && !isSuperAdmin && billPrintCount >= 50) ? 0.5 : 1 }} 
            onClick={handleCheckoutClick}
            disabled={tier === 'Free' && !isSuperAdmin && billPrintCount >= 50}
          >
            Checkout
          </button>
        </div>
      </div>

      {/* Modern Payment Selector Modal */}
      {showPaymentModal && (
        <div className="payment-modal-overlay">
          <motion.div 
            className="payment-modal glass-panel"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: "spring", duration: 0.3 }}
          >
            <h3 style={{ margin: '0 0 1.5rem 0', fontSize: '1.4rem', fontWeight: '800' }}>Select Invoice Payment Method</h3>
            
            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.9rem' }}>Payment Option</label>
              <select 
                value={paymentMethod} 
                onChange={e => setPaymentMethod(e.target.value)}
                style={{
                  width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-color)', background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)', outline: 'none'
                }}
              >
                <option value="Cash">💵 Cash Settlement</option>
                <option value="Bank Transfer">🏛️ Direct Bank Transfer</option>
              </select>
            </div>

            {paymentMethod === 'Bank Transfer' && (
              <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.9rem' }}>Select Bank Account</label>
                {fetchingBanks ? (
                  <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Retrieving active accounts...</span>
                ) : bankAccounts.length === 0 ? (
                  <span style={{ fontSize: '0.9rem', color: 'var(--accent-danger)', fontWeight: 'bold' }}>No bank accounts configured by administrator.</span>
                ) : (
                  <select 
                    value={selectedBankId} 
                    onChange={e => setSelectedBankId(e.target.value)}
                    style={{
                      width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-color)', background: 'var(--bg-secondary)',
                      color: 'var(--text-primary)', outline: 'none'
                    }}
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

            <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
              <button 
                type="button"
                className="btn btn-secondary" 
                onClick={() => setShowPaymentModal(false)}
                style={{ flex: 1, padding: '0.75rem' }}
              >
                Cancel
              </button>
              <button 
                type="button"
                className="btn btn-success" 
                onClick={handleConfirmPayment}
                style={{ flex: 1, padding: '0.75rem' }}
                disabled={paymentMethod === 'Bank Transfer' && bankAccounts.length === 0}
              >
                Complete Payment
              </button>
            </div>
          </motion.div>
        </div>
      )}
      
      {/* Held Bills Modal */}
      {showHeldModal && (
        <div className="payment-modal-overlay">
          <motion.div 
            className="payment-modal glass-panel"
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            style={{ width: '480px', maxHeight: '85vh', overflowY: 'auto', padding: '1.5rem' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '800', color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Clock size={20} /> Held Bills ({heldCarts?.length || 0})
              </h3>
              <button className="btn-icon" onClick={() => setShowHeldModal(false)}>
                <X size={20} />
              </button>
            </div>

            {(!heldCarts || heldCarts.length === 0) ? (
              <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
                <Clock size={40} style={{ opacity: 0.3, marginBottom: '0.75rem' }} />
                <p style={{ margin: 0, fontWeight: '600' }}>No held bills found.</p>
                <span style={{ fontSize: '0.8rem' }}>Click "Hold Bill" (F8) to save a cart for later.</span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {heldCarts.map((held) => (
                  <div key={held.id} className="glass-card" style={{ padding: '1rem', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <div>
                        <span style={{ fontWeight: '700', color: 'var(--accent-cyan)', fontSize: '0.95rem' }}>{held.label}</span>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{new Date(held.timestamp).toLocaleString()}</div>
                      </div>
                      <span className="price-mono" style={{ fontSize: '1.15rem', fontWeight: '800', color: 'var(--accent-success)' }}>
                        Rs. {(held.total || 0).toFixed(2)}
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: '0.35rem', margin: '0.5rem 0', flexWrap: 'wrap' }}>
                      {(held.items || []).map((i, idx) => (
                        <span key={idx} style={{ fontSize: '0.75rem', background: 'rgba(99,102,241,0.12)', color: 'var(--text-primary)', padding: '0.15rem 0.45rem', borderRadius: '4px' }}>
                          {i.product?.name || i.name} x {i.quantity}
                        </span>
                      ))}
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                      <button 
                        type="button"
                        className="btn btn-cyan" 
                        style={{ flex: 1, padding: '0.45rem', fontSize: '0.82rem' }}
                        onClick={async () => {
                          await db.held_carts.delete(held.id);
                          if (onRestoreCart) onRestoreCart(held.items || []);
                          setShowHeldModal(false);
                        }}
                      >
                        <RotateCcw size={14} /> Restore Bill
                      </button>
                      <button 
                        type="button"
                        className="btn btn-danger" 
                        style={{ padding: '0.45rem 0.75rem', fontSize: '0.82rem' }}
                        onClick={async () => {
                          await db.held_carts.delete(held.id);
                        }}
                      >
                        <Trash2 size={14} /> Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        </div>
      )}

      {showScanner && (
        <BarcodeCameraScanner 
          onScan={(code) => {
            if (onScanBarcode) onScanBarcode(code);
            setShowScanner(false);
          }}
          onClose={() => setShowScanner(false)}
        />
      )}
    </div>
  );
}
