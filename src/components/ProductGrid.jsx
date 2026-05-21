import React from 'react';
import './ProductGrid.css';

export default function ProductGrid({ products, onAddToCart }) {
  return (
    <div className="product-grid">
      {products.map((product) => (
        <div 
          key={product.id} 
          className="product-card"
          onClick={() => onAddToCart(product)}
        >
          {product.quantity < 5 && (
            <div className="low-stock-badge">Low</div>
          )}
          <div className="product-info">
            <span className="product-name">{product.name}</span>
            <span className="product-price">LKR {product.price.toFixed(2)}</span>
          </div>
        </div>
      ))}
      {products.length === 0 && (
        <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>No products found.</div>
      )}
    </div>
  );
}
