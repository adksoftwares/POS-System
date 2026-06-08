import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { v4 as uuidv4 } from 'uuid';
import { Trash2, Edit, Camera, Plus, Check, X } from 'lucide-react';
import Papa from 'papaparse';
import BarcodeCameraScanner from './BarcodeCameraScanner';
import { dbCloud } from '../config/firebase';
import { collection, getDocs, doc, setDoc, writeBatch, deleteDoc } from 'firebase/firestore';
import './InventoryScreen.css';

export default function InventoryScreen() {
  // Sort products alphabetically by name
  const products = useLiveQuery(() => db.products.orderBy('name').toArray(), []);
  const [suggestions, setSuggestions] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [statusMsg, setStatusMsg] = useState({ text: '', type: '' });

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
          console.log("✅ Offline database updated with latest Firebase data!");
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
      if (value.length > 1) {
        const matches = await db.products.where('name').startsWithIgnoreCase(value).toArray();
        setSuggestions(matches);
      } else {
        setSuggestions([]);
      }
    }
  };

  const selectSuggestion = (prod) => {
    setFormData({
      name: prod.name,
      price: prod.price,
      quantity: prod.quantity,
      barcode: prod.barcode,
      category: prod.category
    });
    setSuggestions([]);
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
    showStatus(`Editing Mode: Loaded details for "${prod.name}"`, 'info');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setFormData({ name: '', price: '', quantity: '', barcode: '', category: 'General' });
    setSuggestions([]);
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
      setSuggestions([]);
      showStatus("Product updated successfully!");
      return;
    }
    
    const existing = await db.products.where('name').equalsIgnoreCase(formData.name).first();
    if (existing) {
      const newQty = parseInt(existing.quantity) + parseInt(formData.quantity);
      await db.products.update(existing.id, {
        quantity: newQty,
        synced: false
      });
      
      if (navigator.onLine && orgId && branchId) {
        try {
          const docRef = doc(dbCloud, `Organizations/${orgId}/Branches/${branchId}/Products`, existing.id);
          await setDoc(docRef, { quantity: newQty }, { merge: true });
        } catch (err) {
          console.error("Cloud update failed:", err);
        }
      }

      setFormData({ name: '', price: '', quantity: '', barcode: '', category: 'General' });
      setSuggestions([]);
      showStatus(`Existing product "${existing.name}" found. Quantity merged successfully!`, 'info');
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

    // Push to cloud instantly if online
    if (navigator.onLine && orgId && branchId) {
      try {
        const docRef = doc(dbCloud, `Organizations/${orgId}/Branches/${branchId}/Products`, newProd.id);
        await setDoc(docRef, newProd);
      } catch (err) {
        console.error("Cloud push failed:", err);
      }
    }

    setFormData({ name: '', price: '', quantity: '', barcode: '', category: 'General' });
    setSuggestions([]);
    showStatus("Product added successfully!");
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const parsedData = results.data;
        let count = 0;
        
        const orgId = localStorage.getItem("adk_orgId");
        const branchId = localStorage.getItem("adk_branchId");
        
        let batch = writeBatch(dbCloud);
        let batchCount = 0;

        // Normalization helper for case-insensitive headers & aliases
        const normalizeRow = (row) => {
          const clean = {};
          for (const key of Object.keys(row)) {
            clean[key.toLowerCase().trim()] = row[key];
          }

          const getValue = (keys) => {
            for (const k of keys) {
              if (clean[k] !== undefined) return clean[k];
            }
            for (const key of Object.keys(clean)) {
              for (const k of keys) {
                if (key.includes(k)) return clean[key];
              }
            }
            return undefined;
          };

          const nameVal = getValue(['name', 'product name', 'product_name', 'product', 'item name', 'item_name', 'item', 'title']);
          const priceVal = getValue(['price', 'rate', 'cost', 'amount', 'amout', 'selling price', 'sell price', 'mrp']);
          const qtyVal = getValue(['quantity', 'stock', 'qty', 'count', 'units']);
          const barcodeVal = getValue(['barcode', 'code', 'bar code', 'upc', 'ean', 'sku']);
          const categoryVal = getValue(['category', 'type', 'group', 'department', 'dept']);

          return {
            name: nameVal || Object.values(clean)[0] || '', // Fallback to first column
            price: parseFloat(priceVal || 0),
            quantity: parseInt(qtyVal || 0),
            barcode: barcodeVal || '',
            category: categoryVal || 'General'
          };
        };

        for (const rawRow of parsedData) {
          const row = normalizeRow(rawRow);
          if (!row.name) continue;
          
          let existing = await db.products.where('name').equalsIgnoreCase(row.name).first();
          
          let prodData;
          if (existing) {
            prodData = {
              ...existing,
              quantity: parseInt(existing.quantity) + row.quantity,
              price: row.price || existing.price,
              barcode: row.barcode || existing.barcode,
              category: row.category || existing.category,
              synced: false
            };
            await db.products.update(existing.id, prodData);
          } else {
            prodData = {
              id: uuidv4(),
              name: row.name,
              price: row.price,
              quantity: row.quantity,
              barcode: row.barcode,
              category: row.category,
              synced: false
            };
            await db.products.add(prodData);
          }
          
          if (navigator.onLine && orgId && branchId) {
             const docRef = doc(dbCloud, `Organizations/${orgId}/Branches/${branchId}/Products`, prodData.id);
             batch.set(docRef, prodData, { merge: true });
             batchCount++;

             // Chunk Firestore batch writes in groups of 400 (limit is 500)
             if (batchCount >= 400) {
               await batch.commit();
               batch = writeBatch(dbCloud);
               batchCount = 0;
             }
          }

          count++;
        }
        
        // Commit any remaining writes
        if (navigator.onLine && orgId && branchId && batchCount > 0) {
           await batch.commit();
        }

        alert(`✅ ${count} Products Successfully Imported & Synced!`);
        // Reset file input
        document.getElementById('csvInput').value = '';
      },
      error: (error) => {
        console.error("Error parsing CSV:", error);
        alert("Failed to parse CSV file.");
      }
    });
  };

  const handleDelete = async (id) => {
    try {
      const prod = await db.products.get(id);
      const productName = prod ? prod.name : 'this product';
      const confirmDelete = window.confirm(`Are you sure you want to delete "${productName}"? This will permanently delete it from this system and sync to all other devices.`);
      if (!confirmDelete) return;

      await db.products.delete(id);

      const orgId = localStorage.getItem("adk_orgId");
      const branchId = localStorage.getItem("adk_branchId");
      if (navigator.onLine && orgId && branchId) {
        const docRef = doc(dbCloud, `Organizations/${orgId}/Branches/${branchId}/Products`, id);
        await deleteDoc(docRef);
      }
      showStatus("Product successfully deleted and synced!");
    } catch (err) {
      console.error("Failed to delete product:", err);
      showStatus("Failed to delete product.", "error");
    }
  };

  return (
    <div className="inventory-layout" style={{ height: '100%' }}>
      <div className="inventory-content">
        <div className={`add-product-form ${editingId ? 'editing-active' : ''}`}>
          {editingId && (
            <div className="edit-active-banner">
              <span className="pulsing-dot" style={{
                display: 'inline-block', width: '8px', height: '8px',
                borderRadius: '50%', backgroundColor: '#fff',
                animation: 'pulse-dot 1.5s infinite'
              }}></span>
              Editing Mode Active
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ margin: 0, color: editingId ? 'var(--primary-indigo, #6366f1)' : 'inherit' }}>
              {editingId ? 'Edit Product Details' : 'Add New Product'}
            </h2>
            {!editingId && (
              <div>
                <input 
                  type="file" 
                  accept=".csv" 
                  id="csvInput" 
                  style={{ display: 'none' }} 
                  onChange={handleFileUpload} 
                />
                <button 
                  className="btn btn-secondary" 
                  onClick={() => document.getElementById('csvInput').click()}
                >
                  Import CSV
                </button>
              </div>
            )}
          </div>
          {statusMsg.text && (
            <div style={{
              color: statusMsg.type === 'error' ? 'var(--tertiary-crimson)' : (statusMsg.type === 'info' ? 'var(--primary-navy)' : 'var(--secondary-emerald)'),
              backgroundColor: statusMsg.type === 'error' ? '#fce8e6' : (statusMsg.type === 'info' ? '#ebf3fc' : '#e6f4ea'),
              padding: '0.75rem',
              borderRadius: '6px',
              marginBottom: '1rem',
              textAlign: 'center',
              fontSize: '0.9rem',
              fontWeight: 'bold',
              border: '1px solid ' + (statusMsg.type === 'error' ? '#f5c2c2' : (statusMsg.type === 'info' ? '#c2dbf5' : '#c2f5d3'))
            }}>
              {statusMsg.text}
            </div>
          )}
          <form onSubmit={handleAddProduct} style={{ position: 'relative' }}>
            <input 
              type="text" 
              name="name" 
              placeholder="Product Name" 
              value={formData.name} 
              onChange={handleInputChange} 
              autoComplete="off"
              required 
            />
            {suggestions.length > 0 && (
              <ul className="suggestions-dropdown">
                {suggestions.map(s => (
                  <li key={s.id} onClick={() => selectSuggestion(s)}>{s.name}</li>
                ))}
              </ul>
            )}

            <input type="number" name="price" placeholder="Price (Rs.)" step="0.01" value={formData.price} onChange={handleInputChange} required />
            <input type="number" name="quantity" placeholder="Quantity" value={formData.quantity} onChange={handleInputChange} required />
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', alignItems: 'center' }}>
              <input 
                type="text" 
                name="barcode" 
                placeholder="Barcode" 
                value={formData.barcode} 
                onChange={handleInputChange} 
                style={{ flex: 1, marginBottom: 0 }}
              />
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={() => setShowScanner(true)}
                title="Scan Barcode with Camera"
                style={{ padding: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <Camera size={20} />
              </button>
            </div>
            <input type="text" name="category" placeholder="Category" value={formData.category} onChange={handleInputChange} />
            
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
              <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                {editingId ? <Check size={18} /> : <Plus size={18} />}
                {editingId ? 'Update Product' : 'Add Product'}
              </button>
              {editingId && (
                <button type="button" className="btn btn-secondary" onClick={handleCancelEdit}>
                  <X size={18} /> Cancel
                </button>
              )}
            </div>
          </form>
        </div>

        <div className="product-list">
          <h2>Current Catalog</h2>
          <table className="inventory-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Price (Rs.)</th>
                <th>Stock</th>
                <th>Barcode</th>
                <th>Category</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {products?.map(p => {
                const isEditing = editingId === p.id;
                return (
                  <tr key={p.id} className={isEditing ? 'row-editing-active' : ''}>
                    <td style={{ fontWeight: isEditing ? 'bold' : 'normal' }}>
                      {p.name} {isEditing && <span style={{ color: '#6366f1', fontSize: '0.8rem', fontWeight: 'bold', marginLeft: '0.4rem' }}>(editing)</span>}
                    </td>
                    <td style={{ fontWeight: isEditing ? 'bold' : 'normal' }}>{p.price.toFixed(2)}</td>
                    <td>
                      <span className={p.quantity < 5 ? "stock-low" : "stock-ok"}>{p.quantity}</span>
                    </td>
                    <td style={{ fontWeight: isEditing ? 'bold' : 'normal' }}>{p.barcode}</td>
                    <td style={{ fontWeight: isEditing ? 'bold' : 'normal' }}>{p.category}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button className="btn-icon" onClick={() => handleStartEdit(p)} title="Edit">
                        <Edit size={18} color="var(--primary-navy)" />
                      </button>
                      <button className="btn-icon" onClick={() => handleDelete(p.id)} title="Delete">
                        <Trash2 size={18} color="var(--tertiary-crimson)" />
                      </button>
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
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
