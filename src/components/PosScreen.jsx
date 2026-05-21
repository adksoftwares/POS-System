import React, { useState, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import ProductGrid from './ProductGrid';
import Cart from './Cart';
import { Search } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { useBarcodeScanner } from '../hooks/useBarcodeScanner';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function PosScreen() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchSuggestions, setSearchSuggestions] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [cart, setCart] = useState([]);
  const [clockedIn, setClockedIn] = useState(false);
  const [activeLogId, setActiveLogId] = useState(null);

  // Base products for the grid, ordered alphabetically by name
  const products = useLiveQuery(() => db.products.orderBy('name').toArray(), []);

  const handleAddToCart = useCallback((product) => {
    setCart((prevCart) => {
      const existing = prevCart.find((item) => item.product.id === product.id);
      if (existing) {
        if (existing.quantity >= product.quantity) return prevCart;
        return prevCart.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      if (product.quantity > 0) {
        return [...prevCart, { product, quantity: 1 }];
      }
      return prevCart;
    });
  }, []);

  const handleSearchChange = async (e) => {
    const val = e.target.value;
    setSearchQuery(val);
    setSelectedIndex(-1);
    if (val.length > 0) {
      const results = await db.products.where('name').startsWithIgnoreCase(val).limit(10).toArray();
      setSearchSuggestions(results);
    } else {
      setSearchSuggestions([]);
    }
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
        handleAddToCart(searchSuggestions[selectedIndex]);
      } else {
        handleAddToCart(searchSuggestions[0]);
      }
      setSearchQuery('');
      setSearchSuggestions([]);
      setSelectedIndex(-1);
    }
  };

  const handlePunchClock = async () => {
    const userEmail = localStorage.getItem('adk_userEmail') || 'Unknown';
    if (!clockedIn) {
      const newLog = {
        id: uuidv4(),
        employeeId: userEmail,
        clockIn: Date.now(),
        clockOut: null
      };
      await db.attendance_logs.add(newLog);
      setActiveLogId(newLog.id);
      setClockedIn(true);
      alert('Clocked In successfully!');
    } else {
      if (activeLogId) {
        await db.attendance_logs.update(activeLogId, {
          clockOut: Date.now()
        });
      }
      setActiveLogId(null);
      setClockedIn(false);
      alert('Clocked Out successfully!');
    }
  };

  useBarcodeScanner(useCallback(async (scannedBarcode) => {
    const matchedProduct = await db.products.where('barcode').equals(scannedBarcode).first();
    if (matchedProduct) {
      handleAddToCart(matchedProduct);
    } else {
      alert(`Barcode ${scannedBarcode} not found in inventory.`);
    }
  }, [handleAddToCart]));

  const handleRemoveFromCart = (productId) => {
    setCart((prev) => prev.filter((item) => item.product.id !== productId));
  };

  const handleHoldBill = () => {
    setCart([]);
  };

  const generatePDFReceipt = (receiptId, paymentMethod, totalAmount, cartItems) => {
    const receiptHeight = 90 + (cartItems.length * 10);
    const doc = new jsPDF({
      unit: 'mm',
      format: [80, Math.max(150, receiptHeight)]
    });

    const userEmail = localStorage.getItem('adk_userEmail') || 'cashier@adk.com';

    // 1. Header (Store info)
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('ADK SUPERMART', 40, 10, { align: 'center' });
    
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(8);
    doc.text('No. 45, Galle Road, Colombo, Sri Lanka', 40, 14, { align: 'center' });
    doc.text('Tel: +94 11 234 5678', 40, 18, { align: 'center' });
    doc.text('------------------------------------------------------------', 40, 22, { align: 'center' });
    
    // 2. Metadata
    doc.setFontSize(8);
    doc.text(`Invoice No : ${receiptId}`, 5, 26);
    doc.text(`Date       : ${new Date().toLocaleString()}`, 5, 30);
    doc.text(`Cashier    : ${userEmail}`, 5, 34);
    doc.text(`Payment    : ${paymentMethod.toUpperCase()}`, 5, 38);
    doc.text('========================================', 40, 42, { align: 'center' });
    
    // 3. Items Table (Standard layout with unit price)
    const tableData = cartItems.map(item => [
      `${item.product.name}\n@ LKR ${item.product.price.toFixed(2)}`,
      `${item.quantity}`,
      `LKR ${(item.product.price * item.quantity).toFixed(2)}`
    ]);

    autoTable(doc, {
      startY: 44,
      head: [['Item / Unit Price', 'Qty', 'Total']],
      body: tableData,
      theme: 'plain',
      styles: { fontSize: 8, cellPadding: 1, overflow: 'linebreak', font: 'Helvetica' },
      headStyles: { fontStyle: 'bold', borderBottom: '1px dashed black' },
      columnStyles: { 
        0: { cellWidth: 40 },
        1: { cellWidth: 10, halign: 'center' },
        2: { cellWidth: 20, halign: 'right' }
      },
      margin: { left: 5, right: 5 }
    });

    const finalY = doc.lastAutoTable.finalY || 55;
    
    // 4. Summary & Footer
    doc.setFontSize(8);
    doc.text('------------------------------------------------------------', 40, finalY + 4, { align: 'center' });
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(`GRAND TOTAL:`, 5, finalY + 9);
    doc.text(`LKR ${totalAmount.toFixed(2)}`, 75, finalY + 9, { align: 'right' });
    
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(8);
    doc.text('========================================', 40, finalY + 14, { align: 'center' });
    doc.setFont('Helvetica', 'bold');
    doc.text('THANK YOU FOR SHOPPING WITH US!', 40, finalY + 18, { align: 'center' });
    doc.setFont('Helvetica', 'normal');
    doc.text('Please come again.', 40, finalY + 22, { align: 'center' });
    doc.setFontSize(7);
    doc.text('Powered by ADK Software Solutions', 40, finalY + 28, { align: 'center' });

    doc.save(`Receipt_${receiptId}.pdf`);
  };

  const handleCheckout = async (paymentMethod) => {
    if (cart.length === 0) return;

    const totalAmount = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
    const receiptId = `ADK-${Date.now()}`;
    const itemsJson = JSON.stringify(cart.map(item => ({
      productId: item.product.id,
      quantity: item.quantity,
      price: item.product.price
    })));

    try {
      // 1. Generate PDF immediately while we still have the user gesture context!
      generatePDFReceipt(receiptId, paymentMethod, totalAmount, cart);

      // 2. Perform local database operations
      await db.transaction('rw', db.transactions, db.products, async () => {
        await db.transactions.add({
          receiptId,
          totalAmount,
          paymentMethod,
          timestamp: Date.now(),
          itemsJson
        });

        for (const item of cart) {
          const newQty = item.product.quantity - item.quantity;
          await db.products.update(item.product.id, { quantity: newQty });
        }
      });
      
      setCart([]);
      alert(`Checkout successful! PDF Receipt generated.`);
    } catch (error) {
      console.error("Checkout failed:", error);
      alert("Checkout failed. Check console.");
    }
  };

  const handleUpdateQuantity = (productId, newQty) => {
    setCart((prevCart) => {
      return prevCart.map((item) => {
        if (item.product.id === productId) {
          // Check stock limit
          if (newQty > item.product.quantity) {
            alert(`Only ${item.product.quantity} items available in stock.`);
            return item;
          }
          return { ...item, quantity: Math.max(1, newQty) };
        }
        return item;
      });
    });
  };

  const seedData = async () => {
    await db.products.bulkPut([
      { id: uuidv4(), name: "Coffee", price: 350.00, quantity: 50, barcode: "123", category: "Beverage" },
      { id: uuidv4(), name: "Sandwich", price: 800.00, quantity: 20, barcode: "124", category: "Food" },
      { id: uuidv4(), name: "Muffin", price: 400.00, quantity: 4, barcode: "125", category: "Food" },
    ]);
  };

  return (
    <div className="pos-layout" style={{ height: '100%' }}>
      <div className="product-area">
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <button className={`btn ${clockedIn ? 'btn-danger' : 'btn-primary'}`} onClick={handlePunchClock}>
            {clockedIn ? 'Clock Out' : 'Clock In'}
          </button>
          <button className="btn btn-success" onClick={seedData}>Seed Demo Products</button>
        </div>
        
        <div style={{ position: 'relative', marginBottom: '1rem' }}>
          <div className="search-bar" style={{ display: 'flex', alignItems: 'center', background: '#fff', padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            <Search size={20} color="var(--text-muted)" style={{ marginRight: '0.5rem' }} />
            <input 
              type="text" 
              placeholder="Search products... (Scanners will work automatically anywhere)" 
              value={searchQuery}
              onChange={handleSearchChange}
              onKeyDown={handleKeyDown}
              autoComplete="off"
              style={{ border: 'none', outline: 'none', flex: 1, fontSize: '1rem' }}
            />
          </div>
          {searchSuggestions.length > 0 && (
            <ul className="suggestions-dropdown" style={{ width: '100%' }}>
              {searchSuggestions.map((s, idx) => (
                <li 
                  key={s.id} 
                  className={idx === selectedIndex ? 'selected' : ''}
                  onClick={() => {
                    handleAddToCart(s);
                    setSearchQuery('');
                    setSearchSuggestions([]);
                  }}
                >
                  <span style={{ fontWeight: 'bold' }}>{s.name}</span>
                  <span style={{ float: 'right', color: 'var(--primary-navy)' }}>LKR {s.price.toFixed(2)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <ProductGrid products={products || []} onAddToCart={handleAddToCart} />
      </div>

      <div className="cart-area" style={{ borderLeft: '1px solid var(--border-color)' }}>
        <Cart 
          cartItems={cart} 
          onRemove={handleRemoveFromCart} 
          onHoldBill={handleHoldBill}
          onCheckout={handleCheckout}
          onUpdateQuantity={handleUpdateQuantity}
        />
      </div>
    </div>
  );
}
