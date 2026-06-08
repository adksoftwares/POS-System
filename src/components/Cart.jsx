import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trash2, Plus, Minus, Camera, ShoppingCart, ExternalLink } from 'lucide-react';
import { dbCloud } from '../config/firebase';
import { collection, getDocs } from 'firebase/firestore';
import BarcodeCameraScanner from './BarcodeCameraScanner';
import './Cart.css';

export default function Cart({ cartItems, onRemove, onHoldBill, onCheckout, onUpdateQuantity, onUpdateDiscount, onScanBarcode, tier, billPrintCount, isSuperAdmin }) {
  const totalAmount = cartItems.reduce((sum, item) => sum + (item.product.price * item.quantity) - (((item.discount || 0) / 100) * (item.product.price * item.quantity)), 0);

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
      <div className="cart-header">
        <h2>Current Order</h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button 
            type="button" 
            className="btn btn-secondary" 
            onClick={handleOpenStandaloneCart}
            title="Open Cart in New Window"
            style={{ padding: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50px' }}
          >
            <ExternalLink size={18} />
          </button>
          <button 
            type="button" 
            className="btn btn-secondary" 
            onClick={() => setShowScanner(true)}
            title="Scan Barcode with Camera"
            style={{ padding: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50px' }}
          >
            <Camera size={18} />
          </button>
        </div>
      </div>

      {/* Usage Limit Warning / Super Admin Indicator */}
      {tier === 'Free' && !isSuperAdmin && (
        <div className="bill-limit-warning" style={{
          background: 'rgba(99, 102, 241, 0.08)',
          border: '1px solid rgba(99, 102, 241, 0.15)',
          padding: '0.85rem 1rem',
          borderRadius: 'var(--radius-md)',
          margin: '0 1rem 1rem 1rem',
          fontSize: '0.85rem'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: '0.4rem' }}>
            <span>Usage Limit (Free Package)</span>
            <span style={{ color: billPrintCount >= 45 ? 'var(--tertiary-crimson)' : 'var(--accent-primary)' }}>
              {billPrintCount}/50 Bills
            </span>
          </div>
          <div style={{ height: '6px', background: 'var(--border-light)', borderRadius: '3px', overflow: 'hidden' }}>
            <div style={{
              width: `${Math.min(100, (billPrintCount / 50) * 100)}%`,
              height: '100%',
              background: billPrintCount >= 45 ? 'var(--tertiary-crimson)' : 'linear-gradient(90deg, var(--accent-primary), var(--accent-purple))',
              transition: 'width 0.3s ease'
            }} />
          </div>
          {billPrintCount >= 50 && (
            <div style={{ color: 'var(--tertiary-crimson)', fontWeight: 'bold', marginTop: '0.4rem', fontSize: '0.8rem' }}>
              Billing Limit Reached! Upgrade to Premium in Settings to continue.
            </div>
          )}
        </div>
      )}

      {isSuperAdmin && (
        <div className="bill-limit-warning" style={{
          background: 'rgba(16, 185, 129, 0.08)',
          border: '1px solid rgba(16, 185, 129, 0.15)',
          padding: '0.85rem 1rem',
          borderRadius: 'var(--radius-md)',
          margin: '0 1rem 1rem 1rem',
          fontSize: '0.85rem'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 'bold', color: 'var(--text-primary)' }}>
            <span style={{ color: 'var(--secondary-emerald)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>🛡️ Super Admin Terminal</span>
            <span style={{ color: 'var(--secondary-emerald)', textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: '800', padding: '0.1rem 0.5rem', background: 'rgba(16, 185, 129, 0.15)', borderRadius: '4px' }}>
              Unlimited Access
            </span>
          </div>
        </div>
      )}

      <div className="cart-items" style={{ paddingTop: 0 }}>
        <AnimatePresence mode="popLayout">
          {cartItems.map((item) => (
            <motion.div 
              key={item.product.id} 
              className="cart-item"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              layout
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
            >
              <div className="item-details">
                <span className="item-name">{item.product.name}</span>
                
                {/* Quantity Adjustment Row */}
                <div className="qty-controls">
                  <button 
                    type="button"
                    className="qty-btn"
                    onClick={() => onUpdateQuantity(item.product.id, item.quantity - 1)}
                  >
                    <Minus size={12} />
                  </button>
                  <input 
                    type="number" 
                    className="qty-input"
                    value={item.quantity} 
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 1;
                      onUpdateQuantity(item.product.id, val);
                    }}
                    min="1"
                  />
                  <button 
                    type="button"
                    className="qty-btn"
                    onClick={() => onUpdateQuantity(item.product.id, item.quantity + 1)}
                  >
                    <Plus size={12} />
                  </button>
                  <span className="unit-price">
                    @ Rs. {item.product.price.toFixed(2)}
                  </span>
                </div>

                {/* Discount input row */}
                <div className="discount-controls">
                  <span className="disc-label">Disc (%):</span>
                  <input 
                    type="number" 
                    className="disc-input"
                    value={item.discount || ''} 
                    placeholder="0"
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      onUpdateDiscount(item.product.id, val);
                    }}
                    min="0"
                    max="100"
                  />
                  {item.discount > 0 && (
                    <span className="disc-badge">
                      -Rs. {(((item.discount || 0) / 100) * (item.product.price * item.quantity)).toFixed(2)}
                    </span>
                  )}
                </div>
              </div>

              <div className="item-actions">
                <span className="item-total">Rs. {((item.product.price * item.quantity) - (((item.discount || 0) / 100) * (item.product.price * item.quantity))).toFixed(2)}</span>
                <button className="btn-icon delete-icon" onClick={() => onRemove(item.product.id)} title="Remove Item">
                  <Trash2 size={16} />
                </button>
              </div>
            </motion.div>
          ))}
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
            className="btn btn-secondary" 
            style={{ flex: 1, padding: '0.75rem' }} 
            onClick={onHoldBill}
          >
            Hold Bill
          </button>
          <button 
            className="btn btn-success" 
            style={{ flex: 1, padding: '0.75rem', opacity: (tier === 'Free' && !isSuperAdmin && billPrintCount >= 50) ? 0.5 : 1 }} 
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
