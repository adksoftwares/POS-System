import codecs

with open('src/components/StandaloneCart.jsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_return = '''  return (
    <div className="standalone-cart-layout animate-fade-in customer-display-mode" style={{ padding: '2rem', height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)' }}>
      {/* Customer Facing Header */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', paddingBottom: '1.5rem', borderBottom: '2px solid var(--border-light)' }}>
        <div>
          <h1 style={{ fontSize: '2.5rem', fontWeight: '800', color: 'var(--text-primary)', margin: '0 0 0.5rem 0' }}>{shopDetails.shopName}</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem', margin: 0 }}>Customer Facing Display | Dual Screen Live Sync</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <Monitor size={36} color="var(--accent-primary)" style={{ opacity: 0.8 }} />
        </div>
      </header>

      {/* Main Content */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {cart.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
            <ShoppingCart size={80} style={{ opacity: 0.2, marginBottom: '2rem' }} />
            <h2 style={{ fontSize: '2.25rem', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '1rem' }}>Welcome to {shopDetails.shopName}</h2>
            <p style={{ fontSize: '1.25rem' }}>Your items will appear here.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', height: '100%', gap: '2rem' }}>
            {/* Left: Transaction Items List */}
            <div style={{ flex: '1 1 65%', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr 1fr 1fr', padding: '1rem 1.5rem', background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border-color)', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '0.9rem' }}>
                <span>Item</span>
                <span style={{ textAlign: 'center' }}>Qty</span>
                <span style={{ textAlign: 'right' }}>Price</span>
                <span style={{ textAlign: 'right' }}>Total</span>
              </div>
              
              <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 0' }}>
                {cart.map((item) => {
                  const itemSub = item.product.price * item.quantity;
                  const itemDisc = ((item.discount || 0) / 100) * itemSub;
                  const itemTotal = itemSub - itemDisc;

                  return (
                    <div key={item.product.id} style={{ display: 'grid', gridTemplateColumns: '3fr 1fr 1fr 1fr', padding: '1rem 1.5rem', alignItems: 'center', borderBottom: '1px solid var(--border-light)' }}>
                      <div>
                        <h3 style={{ margin: '0 0 0.25rem 0', fontSize: '1.15rem', fontWeight: '600', color: 'var(--text-primary)' }}>{item.product.name}</h3>
                        {item.discount > 0 && <span style={{ fontSize: '0.85rem', color: 'var(--accent-success)', fontWeight: '600' }}>{item.discount}% Discount Applied</span>}
                      </div>
                      <span className="price-mono" style={{ textAlign: 'center', fontSize: '1.15rem', fontWeight: '700', color: 'var(--text-primary)' }}>{item.quantity}</span>
                      <span className="price-mono" style={{ textAlign: 'right', fontSize: '1.1rem', color: 'var(--text-secondary)' }}>{item.product.price.toFixed(2)}</span>
                      <span className="price-mono" style={{ textAlign: 'right', fontSize: '1.25rem', fontWeight: '700', color: 'var(--text-primary)' }}>{itemTotal.toFixed(2)}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right: Order Summary Panel */}
            <div style={{ flex: '1 1 35%', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)', padding: '2rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxShadow: 'var(--shadow-sm)' }}>
              <div>
                <h2 style={{ margin: '0 0 2rem 0', fontSize: '1.5rem', fontWeight: '700', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-light)', paddingBottom: '1rem' }}>Order Summary</h2>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', fontSize: '1.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                    <span>Subtotal</span>
                    <span className="price-mono">{shopDetails.currency} {subtotal.toFixed(2)}</span>
                  </div>
                  
                  {totalDiscount > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--accent-success)', fontWeight: '600' }}>
                      <span>Discount</span>
                      <span className="price-mono">-{shopDetails.currency} {totalDiscount.toFixed(2)}</span>
                    </div>
                  )}
                </div>
              </div>

              <div style={{ marginTop: 'auto', paddingTop: '2rem', borderTop: '2px dashed var(--border-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                  <span style={{ fontSize: '1.75rem', fontWeight: '700', color: 'var(--text-primary)' }}>Total Due</span>
                  <span className="price-mono" style={{ fontSize: '3rem', fontWeight: '800', color: 'var(--accent-success)', lineHeight: '1' }}>
                    {shopDetails.currency} {totalAmount.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
'''

with codecs.open('src/components/StandaloneCart.jsx', 'w', encoding='utf-8') as f:
    f.writelines(lines[:317])
    f.write(new_return)
