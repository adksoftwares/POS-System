import React from 'react';
import './Cart.css';
import { Trash2, Plus, Minus } from 'lucide-react';

export default function Cart({ cartItems, onRemove, onHoldBill, onCheckout, onUpdateQuantity }) {
  const totalAmount = cartItems.reduce((sum, item) => sum + item.product.price * item.quantity, 0);

  return (
    <div className="cart-container">
      <div className="cart-header">
        <h2>Current Order</h2>
      </div>

      <div className="cart-items">
        {cartItems.map((item) => (
          <div key={item.product.id} className="cart-item">
            <div className="item-details" style={{ flex: 1 }}>
              <span className="item-name" style={{ fontWeight: '600' }}>{item.product.name}</span>
              <div className="qty-controls" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.4rem' }}>
                <button 
                  className="btn btn-secondary" 
                  style={{ padding: '2px 8px', fontSize: '0.8rem', minWidth: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  onClick={() => onUpdateQuantity(item.product.id, item.quantity - 1)}
                >
                  <Minus size={10} />
                </button>
                <input 
                  type="number" 
                  value={item.quantity} 
                  onChange={(e) => {
                    const val = parseInt(e.target.value) || 1;
                    onUpdateQuantity(item.product.id, val);
                  }}
                  style={{ width: '45px', textAlign: 'center', padding: '2px', border: '1px solid var(--border-color)', borderRadius: '4px' }}
                  min="1"
                />
                <button 
                  className="btn btn-secondary" 
                  style={{ padding: '2px 8px', fontSize: '0.8rem', minWidth: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  onClick={() => onUpdateQuantity(item.product.id, item.quantity + 1)}
                >
                  <Plus size={10} />
                </button>
                <span className="unit-price" style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginLeft: '0.5rem' }}>
                  @ LKR {item.product.price.toFixed(2)}
                </span>
              </div>
            </div>
            <div className="item-actions" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'space-between' }}>
              <span className="item-total" style={{ fontWeight: '700' }}>LKR {(item.product.price * item.quantity).toFixed(2)}</span>
              <button className="btn-icon" onClick={() => onRemove(item.product.id)} style={{ marginTop: '0.5rem' }}>
                <Trash2 size={16} color="var(--tertiary-crimson)" />
              </button>
            </div>
          </div>
        ))}
        {cartItems.length === 0 && (
          <div className="empty-cart">Cart is empty</div>
        )}
      </div>

      <div className="cart-footer">
        <div className="cart-total-row">
          <span>Total</span>
          <span className="total-amount">LKR {totalAmount.toFixed(2)}</span>
        </div>
        <div className="cart-actions">
          <button className="btn" style={{ backgroundColor: '#95a5a6', color: '#fff', flex: 1 }} onClick={onHoldBill}>
            Hold Bill
          </button>
          <button className="btn btn-success" style={{ flex: 1 }} onClick={() => onCheckout('Cash')}>
            Checkout
          </button>
        </div>
      </div>
    </div>
  );
}
