import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { v4 as uuidv4 } from 'uuid';
import { Trash2, Edit, Camera, Plus, Download, AlertTriangle } from 'lucide-react';
import Papa from 'papaparse';
import BarcodeCameraScanner from './BarcodeCameraScanner';
import { dbCloud } from '../config/firebase';
import { collection, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { sound } from '../services/soundService';
import './InventoryScreen.css';

export default function InventoryScreen() {
  const products = useLiveQuery(() => db.products.orderBy('name').toArray(), []);
  const [editingId, setEditingId] = useState(null);
  const [statusMsg, setStatusMsg] = useState({ text: '', type: '' });
  const [filterLowStock, setFilterLowStock] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    price: '',
    quantity: '',
    barcode: '',
    category: 'General'
  });
  const [showScanner, setShowScanner] = useState(false);

  const showStatus = (text, type = 'success') => {
    setStatusMsg({ text, type });
    setTimeout(() => {
      setStatusMsg({ text: '', type: '' });
    }, 3000);
  };

  useEffect(() => {
    const syncProductsFromCloud = async () => {
      if (!navigator.onLine) return;
      
      const orgId = localStorage.getItem("adk_orgId");
      const branchId = localStorage.getItem("adk_branchId");
      if (!orgId || !branchId) return;

      try {
        const productsRef = collection(dbCloud, `Organizations/${orgId}/Branches/${branchId}/Products`);
        const snapshot = await getDocs(productsRef);

        const cloudProducts = [];
        snapshot.forEach((doc) => {
          cloudProducts.push({ id: doc.id, ...doc.data() });
        });

        const cloudProductIds = new Set(cloudProducts.map(p => p.id));
        const localProducts = await db.products.toArray();
        for (const localProd of localProducts) {
          if (!cloudProductIds.has(localProd.id) && localProd.synced === true) {
            await db.products.delete(localProd.id);
          }
        }

        const toPut = [];
        for (const cp of cloudProducts) {
          const lp = localProducts.find(p => p.id === cp.id);
          if (!lp || lp.synced === true) {
            toPut.push({ ...cp, synced: true });
          }
        }
        if (toPut.length > 0) {
          await db.products.bulkPut(toPut);
        }
      } catch (error) {
        console.error("Failed to sync from cloud", error);
      }
    };
    syncProductsFromCloud();
  }, []);

  const handleInputChange = async (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });

    if (name === 'name' && !editingId) {
      // Input handler
    }
  };

  const handleStartEdit = (prod) => {
    setEditingId(prod.id);
    setFormData({
      name: prod.name,
      price: prod.price.toString(),
      quantity: prod.quantity.toString(),
      barcode: prod.barcode || '',
      category: prod.category || 'General'
    });
    showStatus(`Editing Mode: Loaded "${prod.name}"`, 'info');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setFormData({ name: '', price: '', quantity: '', barcode: '', category: 'General' });
  };

  const handleAddProduct = async (e) => {
    e.preventDefault();
    
    const orgId = localStorage.getItem("adk_orgId");
    const branchId = localStorage.getItem("adk_branchId");

    if (editingId) {
      const updatedProd = {
        id: editingId,
        name: formData.name,
        price: parseFloat(formData.price),
        quantity: parseInt(formData.quantity),
        barcode: formData.barcode,
        category: formData.category,
        synced: false
      };

      await db.products.update(editingId, updatedProd);

      if (navigator.onLine && orgId && branchId) {
        try {
          const docRef = doc(dbCloud, `Organizations/${orgId}/Branches/${branchId}/Products`, editingId);
          await setDoc(docRef, updatedProd, { merge: true });
        } catch (err) {
          console.error("Cloud update failed:", err);
        }
      }

      setEditingId(null);
      setFormData({ name: '', price: '', quantity: '', barcode: '', category: 'General' });
      sound.playSuccessChime();
      showStatus("Product updated successfully!");
      return;
    }

    const newProd = {
      id: uuidv4(),
      name: formData.name,
      price: parseFloat(formData.price),
      quantity: parseInt(formData.quantity),
      barcode: formData.barcode,
      category: formData.category,
      synced: false
    };

    await db.products.add(newProd);

    if (navigator.onLine && orgId && branchId) {
      try {
        const docRef = doc(dbCloud, `Organizations/${orgId}/Branches/${branchId}/Products`, newProd.id);
        await setDoc(docRef, newProd);
      } catch (err) {
        console.error("Cloud push failed:", err);
      }
    }

    setFormData({ name: '', price: '', quantity: '', barcode: '', category: 'General' });
    sound.playSuccessChime();
    showStatus("Product added successfully!");
  };

  const handleExportCSV = () => {
    if (!products || products.length === 0) return;
    const csv = Papa.unparse(products.map(p => ({
      ID: p.id,
      Name: p.name,
      Price: p.price,
      Quantity: p.quantity,
      Barcode: p.barcode,
      Category: p.category
    })));
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Inventory_Export_${Date.now()}.csv`;
    link.click();
    sound.playSuccessChime();
  };

  const handleImportCSV = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim(),
      complete: async (results) => {
        try {
          const existingProducts = await db.products.toArray();
          const parsedProducts = [];
          const orgId = localStorage.getItem("adk_orgId");
          const branchId = localStorage.getItem("adk_branchId");
          let updatedCount = 0;
          let addedCount = 0;

          for (const row of results.data) {
            const name = row.Name || row.name;
            if (!name) continue; 
            
            const rowId = row.ID || row.id;
            const rowQty = parseInt(row.Quantity || row.quantity) || 0;
            const rowPrice = parseFloat(row.Price || row.price);
            
            // Check if product already exists by ID or exact Name
            const existing = existingProducts.find(p => (rowId && p.id === rowId) || p.name.toLowerCase() === name.trim().toLowerCase());

            if (existing) {
              // Increase stock count
              existing.quantity += rowQty;
              // Update other fields if provided in CSV
              if (rowPrice > 0) existing.price = rowPrice;
              if (row.Barcode || row.barcode) existing.barcode = row.Barcode || row.barcode;
              if (row.Category || row.category) existing.category = row.Category || row.category;
              existing.updatedAt = new Date().toISOString();
              
              parsedProducts.push(existing);
              updatedCount++;
            } else {
              // Create new product
              const newProd = {
                id: rowId || uuidv4(),
                name: name.trim(),
                price: rowPrice || 0,
                quantity: rowQty,
                barcode: row.Barcode || row.barcode || '',
                category: row.Category || row.category || 'General',
                updatedAt: new Date().toISOString()
              };
              parsedProducts.push(newProd);
              addedCount++;
            }
          }

          if (parsedProducts.length > 0) {
            await db.products.bulkPut(parsedProducts);
            if (navigator.onLine && orgId && branchId) {
              for (const prod of parsedProducts) {
                const docRef = doc(dbCloud, `Organizations/${orgId}/Branches/${branchId}/Products`, prod.id);
                setDoc(docRef, prod).catch(e => console.warn('Cloud sync delayed', e));
              }
            }
            showStatus(`Imported! Added ${addedCount} new, Updated ${updatedCount} existing items.`);
            sound.playSuccessChime();
          } else {
            showStatus("No valid products found in CSV.", "error");
          }
        } catch (err) {
          console.error(err);
          showStatus("Import failed: " + err.message, "error");
        }
      },
      error: (error) => {
        showStatus("CSV parsing failed: " + error.message, "error");
        sound.playErrorSound();
      }
    });
    e.target.value = null;
  };

  const handleDelete = async (id) => {
    try {
      const prod = await db.products.get(id);
      const confirmDelete = window.confirm(`Permanently delete "${prod?.name || 'this item'}"?`);
      if (!confirmDelete) return;

      await db.products.delete(id);

      const orgId = localStorage.getItem("adk_orgId");
      const branchId = localStorage.getItem("adk_branchId");
      if (navigator.onLine && orgId && branchId) {
        const docRef = doc(dbCloud, `Organizations/${orgId}/Branches/${branchId}/Products`, id);
        await deleteDoc(docRef);
      }
      sound.playErrorSound();
      showStatus("Product deleted.");
    } catch (err) {
      console.error(err);
    }
  };

  const displayedProducts = filterLowStock 
    ? (products || []).filter(p => p.quantity < 5)
    : (products || []);

  return (
    <div className="inventory-layout animate-fade-in">
      <div className="inventory-content">
        
        {/* Form Column */}
        <div className={`add-product-form ${editingId ? 'editing-active' : ''}`}>
          <h2 style={{ marginBottom: '1rem', fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {editingId ? <Edit size={18} color="var(--accent-cyan)" /> : <Plus size={18} color="var(--accent-primary)" />}
            {editingId ? 'Edit Product' : 'Add New Inventory Item'}
          </h2>

          {statusMsg.text && (
            <div style={{
              padding: '0.6rem', borderRadius: 'var(--radius-md)', marginBottom: '0.85rem',
              fontSize: '0.82rem', fontWeight: 'bold', textAlign: 'center',
              background: statusMsg.type === 'error' ? 'rgba(244,63,94,0.15)' : 'rgba(16,185,129,0.15)',
              color: statusMsg.type === 'error' ? 'var(--accent-danger)' : 'var(--accent-success)'
            }}>
              {statusMsg.text}
            </div>
          )}

          <form onSubmit={handleAddProduct} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: '600' }}>Product Name</label>
              <input type="text" name="name" placeholder="e.g. Basmati Rice 5kg" value={formData.name} onChange={handleInputChange} autoComplete="off" required />
            </div>

            <div style={{ display: 'flex', gap: '0.65rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', flex: 1 }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: '600' }}>Price (Rs.)</label>
                <input type="number" name="price" placeholder="1250.00" step="0.01" value={formData.price} onChange={handleInputChange} required />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', flex: 1 }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: '600' }}>Stock Qty</label>
                <input type="number" name="quantity" placeholder="100" value={formData.quantity} onChange={handleInputChange} required />
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: '600' }}>Barcode / SKU</label>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <input type="text" name="barcode" placeholder="Scan or type barcode" value={formData.barcode} onChange={handleInputChange} style={{ flex: 1 }} />
                <button 
                  type="button" 
                  onClick={() => setShowScanner(true)} 
                  title="Scan with Camera" 
                  style={{ 
                    padding: '0.4rem 0.65rem', 
                    borderRadius: '4px', 
                    background: '#ffffff', 
                    color: '#0f172a', 
                    border: '1px solid #cbd5e1', 
                    cursor: 'pointer', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center' 
                  }}
                >
                  <Camera size={15} />
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: '600' }}>Category</label>
              <input type="text" name="category" placeholder="Groceries, Beverages, Dairy..." value={formData.category} onChange={handleInputChange} />
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
              <button type="submit" className="btn btn-cyan" style={{ flex: 1, padding: '0.7rem' }}>
                {editingId ? 'Update Product' : 'Save to Inventory'}
              </button>
              {editingId && (
                <button type="button" className="btn btn-secondary" onClick={handleCancelEdit} style={{ padding: '0.7rem' }}>Cancel</button>
              )}
            </div>
          </form>
        </div>

        {/* Product Catalog Table */}
        <div className="glass-panel" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>Inventory Catalog ({displayedProducts.length} Items)</h2>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <button 
                onClick={() => setFilterLowStock(!filterLowStock)}
                style={{ 
                  fontSize: '0.78rem', 
                  fontWeight: '600',
                  padding: '0.35rem 0.75rem', 
                  borderRadius: '4px', 
                  display: 'inline-flex', 
                  alignItems: 'center', 
                  gap: '0.35rem',
                  background: filterLowStock ? '#dc2626' : '#ffffff',
                  color: filterLowStock ? '#ffffff' : '#0f172a',
                  border: filterLowStock ? '1px solid #dc2626' : '1px solid #cbd5e1',
                  cursor: 'pointer'
                }}
              >
                <AlertTriangle size={14} /> {filterLowStock ? 'Show All Items' : 'Low Stock Alert (<5)'}
              </button>
              <button 
                onClick={handleExportCSV} 
                style={{ 
                  fontSize: '0.78rem', 
                  fontWeight: '600',
                  padding: '0.35rem 0.75rem', 
                  borderRadius: '4px', 
                  display: 'inline-flex', 
                  alignItems: 'center', 
                  gap: '0.35rem',
                  background: '#ffffff',
                  color: '#0f172a',
                  border: '1px solid #cbd5e1',
                  cursor: 'pointer'
                }}
              >
                <Download size={14} /> Export CSV
              </button>
              
              <label 
                style={{ 
                  fontSize: '0.78rem', 
                  fontWeight: '600',
                  padding: '0.35rem 0.75rem', 
                  borderRadius: '4px', 
                  display: 'inline-flex', 
                  alignItems: 'center', 
                  gap: '0.35rem',
                  background: '#0f172a',
                  color: '#ffffff',
                  border: '1px solid #0f172a',
                  cursor: 'pointer'
                }}
              >
                <Plus size={14} /> Import CSV
                <input 
                  type="file" 
                  accept=".csv" 
                  onChange={handleImportCSV} 
                  style={{ display: 'none' }} 
                />
              </label>
            </div>
          </div>

          <div className="table-responsive" style={{ flex: 1 }}>
            <table className="inventory-table">
              <thead>
                <tr>
                  <th>Item Name</th>
                  <th>Price</th>
                  <th>Stock Qty</th>
                  <th>Barcode</th>
                  <th>Category</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {displayedProducts.map(p => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: '700', color: 'var(--text-primary)' }}>{p.name}</td>
                    <td className="price-mono" style={{ whiteSpace: 'nowrap', fontWeight: '700', color: 'var(--text-primary)' }}>
                      Rs. {p.price.toFixed(2)}
                    </td>
                    <td>
                      <span className="price-mono" style={{
                        padding: '0.15rem 0.5rem', borderRadius: '4px', fontSize: '0.78rem', fontWeight: '700',
                        background: p.quantity < 5 ? 'rgba(239, 68, 68, 0.12)' : 'rgba(22, 163, 74, 0.12)',
                        color: p.quantity < 5 ? '#dc2626' : '#16a34a',
                        border: p.quantity < 5 ? '1px solid rgba(239, 68, 68, 0.25)' : '1px solid rgba(22, 163, 74, 0.25)'
                      }}>
                        {p.quantity}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{p.barcode || '—'}</td>
                    <td>
                      <span style={{ fontSize: '0.72rem', padding: '0.15rem 0.45rem', borderRadius: '4px', background: 'var(--bg-primary)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)', fontWeight: '600' }}>
                        {p.category || 'General'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '0.35rem' }}>
                        <button className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem', borderRadius: '4px' }} onClick={() => handleStartEdit(p)} title="Edit">
                          <Edit size={13} />
                        </button>
                        <button className="btn btn-danger" style={{ padding: '0.25rem 0.5rem', borderRadius: '4px' }} onClick={() => handleDelete(p.id)} title="Delete">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showScanner && (
        <BarcodeCameraScanner 
          onScan={(code) => {
            setFormData(prev => ({ ...prev, barcode: code }));
            setShowScanner(false);
          }}
          onClose={() => setShowScanner(false)}
        />
      )}
    </div>
  );
}
