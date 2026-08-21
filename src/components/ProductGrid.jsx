import { useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, List, LayoutGrid } from 'lucide-react';
import './ProductGrid.css';

export default function ProductGrid({ products, onAddToCart }) {
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [viewMode, setViewMode] = useState('list'); // 'list' (default supermarket table) | 'grid'
  
  const categories = ['All', ...new Set(products.map(p => p.category || 'General'))];

  const filteredProducts = selectedCategory === 'All' 
    ? products 
    : products.filter(p => (p.category || 'General') === selectedCategory);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', height: '100%', overflow: 'hidden' }}>
      {/* Top Controls Bar: Category Pills + View Mode Switcher */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
        {/* Category Filter Pills - Commercial Cashier Segmented Control */}
        <div className="category-tabs" style={{ flex: 1, background: '#e2e8f0', padding: '4px', borderRadius: '6px', border: '1px solid #cbd5e1', overflowX: 'auto' }}>
          {categories.map((cat) => (
            <button
              key={cat}
              style={{ 
                borderRadius: '4px', 
                padding: '0.35rem 0.85rem', 
                fontSize: '0.8rem',
                whiteSpace: 'nowrap',
                flexShrink: 0,
                border: 'none',
                background: selectedCategory === cat ? '#0f172a' : 'transparent',
                color: selectedCategory === cat ? '#ffffff' : '#475569',
                fontWeight: selectedCategory === cat ? '700' : '600',
                boxShadow: selectedCategory === cat ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              onClick={() => setSelectedCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* View Mode Toggle Switcher */}
        <div style={{ display: 'flex', background: '#e2e8f0', padding: '3px', borderRadius: '6px', border: '1px solid #cbd5e1', flexShrink: 0 }}>
          <button 
            style={{ padding: '0.35rem 0.6rem', border: 'none', borderRadius: '4px', background: viewMode === 'list' ? '#0f172a' : 'transparent', color: viewMode === 'list' ? '#ffffff' : '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', fontWeight: '600' }}
            onClick={() => setViewMode('list')}
            title="Compact Table List View"
          >
            <List size={14} /> List
          </button>
          <button 
            style={{ padding: '0.35rem 0.6rem', border: 'none', borderRadius: '4px', background: viewMode === 'grid' ? '#0f172a' : 'transparent', color: viewMode === 'grid' ? '#ffffff' : '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', fontWeight: '600' }}
            onClick={() => setViewMode('grid')}
            title="Card Grid View"
          >
            <LayoutGrid size={14} /> Cards
          </button>
        </div>
      </div>

      {/* Main Display: Compact Supermarket Barcode Table List */}
      {viewMode === 'list' ? (
        <div className="glass-panel product-list-container" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px' }}>
          {/* Table Header */}
          <div className="product-list-row product-list-header" style={{ gap: '0.5rem', padding: '0.55rem 0.85rem', background: '#f8fafc', borderBottom: '1px solid #cbd5e1', fontSize: '0.75rem', fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px', position: 'sticky', top: 0, zIndex: 5 }}>
            <span className="col-code">Code</span>
            <span className="col-name">Product Name</span>
            <span className="col-category">Category</span>
            <span className="col-price price-mono" style={{ textAlign: 'center', fontWeight: '700' }}>Price</span>
            <span className="col-stock" style={{ textAlign: 'center' }}>Stock</span>
            <span className="col-action" style={{ textAlign: 'right' }}>Action</span>
          </div>

          {/* Table Rows */}
          {filteredProducts.map((product) => (
            <div 
              key={product.id}
              style={{
                gap: '0.5rem',
                alignItems: 'center',
                padding: '0.55rem 0.85rem',
                borderBottom: '1px solid #f1f5f9',
                fontSize: '0.85rem',
                cursor: product.quantity === 0 ? 'not-allowed' : 'pointer',
                opacity: product.quantity === 0 ? 0.5 : 1,
                background: '#ffffff',
                transition: 'background 0.12s ease'
              }}
              className="product-list-row"
              onClick={() => product.quantity > 0 && onAddToCart(product)}
            >
              <span className="col-code price-mono" style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: '600', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={`#${product.barcode || `P${product.id}`}`}>
                #{product.barcode || `P${product.id}`}
              </span>
              <span className="col-name" style={{ fontWeight: '700', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{product.name}</span>
              <span className="col-category">
                <span style={{ fontSize: '0.7rem', fontWeight: 'bold', textTransform: 'uppercase', padding: '0.25rem 0.5rem', borderRadius: '4px', background: '#f1f5f9', color: '#475569', display: 'inline-block' }}>
                  {product.category || 'General'}
                </span>
              </span>
              <span className="col-price price-mono" style={{ textAlign: 'center', fontWeight: '800', color: '#0f172a', fontSize: '0.95rem' }}>
                Rs. {product.price.toFixed(2)}
              </span>
              <span className="col-stock" style={{ textAlign: 'center', fontWeight: '700', color: product.quantity <= 5 ? '#ef4444' : '#10b981' }}>
                {product.quantity}
              </span>
              <span className="col-action" style={{ textAlign: 'right' }}>
                <button 
                  disabled={product.quantity === 0}
                  style={{
                    padding: '0.25rem 0.6rem',
                    background: '#2563eb',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '4px',
                    fontSize: '0.75rem',
                    fontWeight: '700',
                    cursor: product.quantity === 0 ? 'not-allowed' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.2rem'
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (product.quantity > 0) onAddToCart(product);
                  }}
                >
                  <Plus size={12} /> Add
                </button>
              </span>
            </div>
          ))}

          {filteredProducts.length === 0 && (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8', fontStyle: 'italic' }}>
              No items found in this category.
            </div>
          )}
        </div>
      ) : (
        /* Legacy Grid Cards View */
        <div className="product-grid" style={{ flex: 1, overflowY: 'auto' }}>
          {filteredProducts.map((product) => (
            <motion.div 
              key={product.id} 
              className="product-card glass-card"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onAddToCart(product)}
              style={{
                borderColor: product.quantity === 0 ? 'rgba(244, 63, 94, 0.3)' : 'var(--border-color)',
                opacity: product.quantity === 0 ? 0.65 : 1,
                pointerEvents: product.quantity === 0 ? 'none' : 'auto',
                position: 'relative'
              }}
            >
              {product.quantity < 5 && (
                <div className="low-stock-badge" style={{
                  background: product.quantity === 0 ? 'var(--accent-danger)' : 'var(--accent-warning)',
                  color: '#fff',
                  fontSize: '0.72rem',
                  fontWeight: '700',
                  padding: '0.2rem 0.5rem',
                  borderRadius: '4px'
                }}>
                  {product.quantity === 0 ? 'Out of Stock' : `Stock: ${product.quantity}`}
                </div>
              )}
              <span className="product-card-category">{product.category || 'General'}</span>
              <div className="product-info">
                <span className="product-name" style={{ fontWeight: '700', fontSize: '1.05rem' }}>{product.name}</span>
                <span className="product-price price-mono" style={{ color: 'var(--accent-primary)', fontSize: '1.15rem' }}>Rs. {product.price.toFixed(2)}</span>
              </div>
              {product.quantity > 0 && <div className="product-card-hover-hint">+ Add to Order</div>}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
