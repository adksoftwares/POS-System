import re

with open('src/components/StandaloneCart.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

main_start = content.find('<main className="standalone-cart-main">')
main_end = content.find('</main>') + len('</main>')

if main_start != -1 and main_end != -1:
    new_main = '''        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ display: 'flex', height: '100%', gap: '1.5rem', background: '#f4f6f8', padding: '1.5rem' }}>
            
            {/* Left panel: Tabs & Items List */}
            <div style={{ flex: '1 1 65%', background: '#ffffff', borderRadius: '12px', display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
              
              {/* Custom Tabs */}
              <div style={{ display: 'flex', padding: '1rem', background: '#ffffff', borderBottom: '1px solid #e2e8f0', gap: '0.5rem' }}>
                <button style={{ flex: 1, padding: '0.75rem', background: '#1e293b', color: '#ffffff', border: 'none', borderRadius: '6px', fontWeight: '700', fontSize: '0.95rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <ShoppingCart size={16} /> Active Order ({cart.length})
                </button>
                <button style={{ flex: 1, padding: '0.75rem', background: '#f8fafc', color: '#64748b', border: 'none', borderRadius: '6px', fontWeight: '600', fontSize: '0.95rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <Clock size={16} /> Held Bills (0)
                </button>
                <button style={{ flex: 1, padding: '0.75rem', background: '#f8fafc', color: '#64748b', border: 'none', borderRadius: '6px', fontWeight: '600', fontSize: '0.95rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <Package size={16} /> + Add Products
                </button>
              </div>

              <div className="cart-scroll-container" style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
                {cart.map((item) => {
                  const itemSub = item.product.price * item.quantity;
                  const itemDisc = ((item.discount || 0) / 100) * itemSub;
                  const itemTotal = itemSub - itemDisc;

                  return (
                    <div key={item.product.id} className="cart-item-card" style={{ display: 'grid', gridTemplateColumns: '1.5fr 1.5fr 1fr', alignItems: 'center', gap: '1.5rem', padding: '1rem', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', marginBottom: '0.5rem' }}>
                      <div className="item-meta">
                        <h3 className="item-name" style={{ margin: 0, fontSize: '1.05rem', fontWeight: '700', color: '#0f172a' }}>{item.product.name}</h3>
                        <span className="item-unit-price" style={{ fontSize: '0.9rem', color: '#64748b' }}>Rs. {item.product.price.toFixed(2)}</span>
                      </div>

                      <div className="item-adjusters" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {/* Quantity Controls */}
                        <div className="qty-row" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <button className="qty-btn" onClick={() => handleUpdateQuantity(item.product.id, item.quantity - 1)} style={{ padding: '0.3rem', borderRadius: '4px', border: '1px solid #cbd5e1', background: '#f8fafc', cursor: 'pointer' }}>
                            <Minus size={14} color="#334155" />
                          </button>
                          <input 
                            type="number" 
                            className="qty-input" 
                            value={item.quantity}
                            min="1"
                            onChange={(e) => handleUpdateQuantity(item.product.id, parseInt(e.target.value) || 1)}
                            style={{ width: '45px', textAlign: 'center', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0.2rem', color: '#0f172a', fontWeight: '600' }}
                          />
                          <button className="qty-btn" onClick={() => handleUpdateQuantity(item.product.id, item.quantity + 1)} style={{ padding: '0.3rem', borderRadius: '4px', border: '1px solid #cbd5e1', background: '#f8fafc', cursor: 'pointer' }}>
                            <Plus size={14} color="#334155" />
                          </button>
                        </div>

                        {/* Discount Controls */}
                        <div className="discount-row" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span className="disc-label" style={{ fontSize: '0.8rem', color: '#64748b' }}>Disc (%):</span>
                          <input 
                            type="number" 
                            className="disc-input" 
                            value={item.discount || ''}
                            placeholder="0"
                            min="0"
                            max="100"
                            onChange={(e) => handleUpdateDiscount(item.product.id, parseFloat(e.target.value) || 0)}
                            style={{ width: '45px', textAlign: 'center', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0.2rem', color: '#0f172a' }}
                          />
                        </div>
                      </div>

                      <div className="item-summary" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className="item-final-price" style={{ fontWeight: '700', color: '#0f172a', fontSize: '1.1rem' }}>Rs. {itemTotal.toFixed(2)}</span>
                        <button className="delete-btn" onClick={() => handleRemoveFromCart(item.product.id)} title="Remove Item" style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  );
                })}

                {cart.length === 0 && (
                  <div className="empty-cart-state" style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem 2rem', color: '#64748b' }}>
                    <ShoppingCart size={54} style={{ opacity: 0.15, marginBottom: '1.5rem', color: '#334155' }} />
                    <h3 style={{ fontSize: '1.5rem', fontWeight: '700', color: '#334155', marginBottom: '0.5rem', margin: 0 }}>Welcome to ADK Supermart</h3>
                    <p style={{ fontSize: '0.95rem', textAlign: 'center', marginTop: '0.5rem' }}>Your scanned items will display here in real-time.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Right panel: Summary & Checkout */}
            <div className="cart-summary-section" style={{ flex: '1 1 35%', background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '2rem', display: 'flex', flexDirection: 'column', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
              <h2 className="section-title" style={{ margin: '0 0 2rem 0', fontSize: '1.5rem', fontWeight: '800', color: '#0f172a' }}>Summary Total</h2>
              
              <div className="summary-details" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div className="summary-row" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.1rem', color: '#334155' }}>
                  <span>Subtotal</span>
                  <span style={{ fontWeight: '600', color: '#0f172a' }}>Rs. {subtotal.toFixed(2)}</span>
                </div>
                <div className="summary-row discount" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.1rem', color: '#10b981', fontWeight: '600' }}>
                  <span>Discount</span>
                  <span>-Rs. {totalDiscount.toFixed(2)}</span>
                </div>
                
                <div className="summary-divider" style={{ borderBottom: '1px solid #f1f5f9', margin: '1.5rem 0' }}></div>
                
                <div className="summary-row total" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', marginBottom: '2rem' }}>
                  <span style={{ fontSize: '1.25rem', fontWeight: '800', color: '#0f172a' }}>Grand Total</span>
                  <span className="grand-total-amount" style={{ fontSize: '2.5rem', fontWeight: '800', color: '#10b981', letterSpacing: '-0.5px' }}>Rs. {totalAmount.toFixed(2)}</span>
                </div>
              </div>

              <div className="summary-actions" style={{ display: 'flex', gap: '1rem' }}>
                <button 
                  onClick={handleHoldBill}
                  disabled={cart.length === 0}
                  style={{ flex: 1, padding: '1rem', background: '#fcd34d', color: '#ffffff', border: 'none', borderRadius: '8px', fontWeight: '700', fontSize: '1.05rem', cursor: cart.length === 0 ? 'not-allowed' : 'pointer', opacity: cart.length === 0 ? 0.6 : 1, transition: 'background 0.2s' }}
                >
                  Hold
                </button>
                <button 
                  onClick={() => setShowPaymentModal(true)}
                  disabled={cart.length === 0 || (tier === 'Free' && !isSuperAdmin && billPrintCount >= 50)}
                  style={{ flex: 1.5, padding: '1rem', background: '#86efac', color: '#ffffff', border: 'none', borderRadius: '8px', fontWeight: '700', fontSize: '1.05rem', cursor: cart.length === 0 ? 'not-allowed' : 'pointer', opacity: cart.length === 0 ? 0.6 : 1, transition: 'background 0.2s' }}
                >
                  Complete Payment
                </button>
              </div>
            </div>
          </div>
        </main>'''
    
    new_content = content[:main_start] + new_main + content[main_end:]
    with open('src/components/StandaloneCart.jsx', 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("Replaced main block.")
else:
    print("Could not find main block.")
