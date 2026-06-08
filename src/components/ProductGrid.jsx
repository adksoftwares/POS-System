import { useState } from 'react';
import { motion } from 'framer-motion';
import './ProductGrid.css';

export default function ProductGrid({ products, onAddToCart }) {
  const [selectedCategory, setSelectedCategory] = useState('All');
  
  // Dynamically group categories based on the loaded database catalog
  const categories = ['All', ...new Set(products.map(p => p.category || 'General'))];

  const filteredProducts = selectedCategory === 'All' 
    ? products 
    : products.filter(p => (p.category || 'General') === selectedCategory);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', height: '100%' }}>
      {/* Category Pill Filters */}
      <div className="category-tabs">
        {categories.map((cat) => (
          <button
            key={cat}
            className={`btn ${selectedCategory === cat ? 'btn-primary' : 'btn-secondary'}`}
            style={{ 
              borderRadius: '50px', 
              padding: '0.5rem 1.25rem', 
              fontSize: '0.85rem',
              whiteSpace: 'nowrap'
            }}
            onClick={() => setSelectedCategory(cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Product Cards Grid */}
      <div className="product-grid">
        {filteredProducts.map((product) => (
          <motion.div 
            key={product.id} 
            className="product-card glass-card"
            whileHover={{ scale: 1.03, translateY: -4 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onAddToCart(product)}
            style={{
              borderColor: product.quantity === 0 ? 'rgba(244, 63, 94, 0.2)' : 'var(--border-color)',
              opacity: product.quantity === 0 ? 0.7 : 1,
              pointerEvents: product.quantity === 0 ? 'none' : 'auto'
            }}
          >
            {product.quantity < 5 && (
              <div className="low-stock-badge" style={{
                background: product.quantity === 0 ? 'var(--accent-danger)' : 'var(--accent-warning)',
                boxShadow: product.quantity === 0 ? '0 2px 8px rgba(244, 63, 94, 0.4)' : '0 2px 8px rgba(251, 191, 36, 0.4)'
              }}>
                {product.quantity === 0 ? 'Out of Stock' : `Low Stock: ${product.quantity}`}
              </div>
            )}
            <span className="product-card-category">{product.category || 'General'}</span>
            <div className="product-info">
              <span className="product-name">{product.name}</span>
              <span className="product-price">Rs. {product.price.toFixed(2)}</span>
            </div>
            {product.quantity > 0 && <div className="product-card-hover-hint">Click to Add</div>}
          </motion.div>
        ))}
      </div>
      
      {filteredProducts.length === 0 && (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)', fontStyle: 'italic' }}>
          No products found under this category.
        </div>
      )}
    </div>
  );
}
