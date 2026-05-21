import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { v4 as uuidv4 } from 'uuid';
import { Trash2, Edit } from 'lucide-react';
import Papa from 'papaparse';
import { dbCloud } from '../config/firebase';
import { collection, getDocs, doc, setDoc, writeBatch } from 'firebase/firestore';
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

        if (cloudProducts.length > 0) {
          await db.products.bulkPut(cloudProducts);
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
        category: formData.category
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
        quantity: newQty
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
      category: formData.category
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
          return {
            name: clean.name || clean.product || clean['product name'] || '',
            price: parseFloat(clean.price || clean.rate || clean.cost || 0),
            quantity: parseInt(clean.quantity || clean.stock || clean.qty || 0),
            barcode: clean.barcode || '',
            category: clean.category || 'General'
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
              category: row.category || existing.category
            };
            await db.products.update(existing.id, prodData);
          } else {
            prodData = {
              id: uuidv4(),
              name: row.name,
              price: row.price,
              quantity: row.quantity,
              barcode: row.barcode,
              category: row.category
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
    await db.products.delete(id);
  };

  return (
    <div className="inventory-layout" style={{ height: '100%' }}>
      <div className="inventory-content">
        <div className="add-product-form">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ margin: 0 }}>{editingId ? 'Edit Product' : 'Add New Product'}</h2>
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

            <input type="number" name="price" placeholder="Price (LKR)" step="0.01" value={formData.price} onChange={handleInputChange} required />
            <input type="number" name="quantity" placeholder="Quantity" value={formData.quantity} onChange={handleInputChange} required />
            <input type="text" name="barcode" placeholder="Barcode" value={formData.barcode} onChange={handleInputChange} />
            <input type="text" name="category" placeholder="Category" value={formData.category} onChange={handleInputChange} />
            
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                {editingId ? 'Update Product' : 'Save Product'}
              </button>
              {editingId && (
                <button type="button" className="btn btn-secondary" onClick={handleCancelEdit}>
                  Cancel
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
                <th>Price (LKR)</th>
                <th>Stock</th>
                <th>Barcode</th>
                <th>Category</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {products?.map(p => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{p.price.toFixed(2)}</td>
                  <td>
                    <span className={p.quantity < 5 ? "stock-low" : "stock-ok"}>{p.quantity}</span>
                  </td>
                  <td>{p.barcode}</td>
                  <td>{p.category}</td>
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
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
