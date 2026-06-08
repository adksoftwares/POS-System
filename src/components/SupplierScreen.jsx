import { useState, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { v4 as uuidv4 } from 'uuid';
import { Plus, Check, Truck, ShoppingBag, Eye } from 'lucide-react';
import { dbCloud } from '../config/firebase';
import { doc, setDoc } from 'firebase/firestore';

export default function SupplierScreen() {
  const [activeSubTab, setActiveSubTab] = useState('suppliers'); // 'suppliers' or 'po'
  const orgId = localStorage.getItem('adk_orgId') || '';
  const branchId = localStorage.getItem('adk_branchId') || 'Main';

  // Dexie Queries
  const suppliers = useLiveQuery(() => db.suppliers.toArray(), []);
  const products = useLiveQuery(() => db.products.orderBy('name').toArray(), []);
  const purchaseOrders = useLiveQuery(() => db.purchase_orders.toArray(), []);

  // Form states - Suppliers
  const [supName, setSupName] = useState('');
  const [supContact, setSupContact] = useState('');
  const [supEmail, setSupEmail] = useState('');
  const [supPhone, setSupPhone] = useState('');
  const [supAddress, setSupAddress] = useState('');

  // Form states - Purchase Orders
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [poItems, setPoItems] = useState([]); // Array of { productId, name, qtyToOrder }
  const [currentProductId, setCurrentProductId] = useState('');
  const [currentQtyToOrder, setCurrentQtyToOrder] = useState('10');

  // Modal / Detail state
  const [activePoDetails, setActivePoDetails] = useState(null);

  // Sync helpers
  const syncToCloud = useCallback(async (collectionName, id, data) => {
    if (!orgId || !navigator.onLine) return;
    try {
      const docRef = doc(dbCloud, `Organizations/${orgId}/Branches/${branchId}/${collectionName}`, id);
      await setDoc(docRef, data, { merge: true });
    } catch (err) {
      console.warn(`Failed to sync ${collectionName} to cloud:`, err);
    }
  }, [orgId, branchId]);

  // Add Supplier
  const handleAddSupplier = useCallback(async (e) => {
    e.preventDefault();
    if (!supName) return;

    const timestamp = Date.now();
    const newSup = {
      id: uuidv4(),
      name: supName,
      contactPerson: supContact,
      email: supEmail,
      phone: supPhone,
      address: supAddress,
      timestamp
    };

    await db.suppliers.add(newSup);
    await syncToCloud('Suppliers', newSup.id, newSup);

    // Reset Form
    setSupName('');
    setSupContact('');
    setSupEmail('');
    setSupPhone('');
    setSupAddress('');
    alert('Supplier registered successfully!');
  }, [supName, supContact, supEmail, supPhone, supAddress, syncToCloud]);

  // Add item to active PO checklist
  const handleAddItemToPo = () => {
    if (!currentProductId) return;
    const prod = products.find(p => p.id === currentProductId);
    if (!prod) return;

    const qty = parseInt(currentQtyToOrder) || 1;
    setPoItems(prev => {
      const existing = prev.find(item => item.productId === currentProductId);
      if (existing) {
        return prev.map(item =>
          item.productId === currentProductId
            ? { ...item, qtyToOrder: item.qtyToOrder + qty }
            : item
        );
      }
      return [...prev, { productId: currentProductId, name: prod.name, qtyToOrder: qty }];
    });
    setCurrentProductId('');
  };

  // Create Purchase Order
  const handleCreatePo = useCallback(async (e) => {
    e.preventDefault();
    if (!selectedSupplierId || poItems.length === 0) {
      alert('Please select a supplier and add at least one item.');
      return;
    }

    const timestamp = Date.now();
    const supplier = suppliers.find(s => s.id === selectedSupplierId);
    const newPo = {
      id: `PO-${timestamp}`,
      supplierId: selectedSupplierId,
      supplierName: supplier ? supplier.name : 'Unknown',
      timestamp,
      status: 'Pending', // 'Pending' or 'Received'
      itemsJson: JSON.stringify(poItems)
    };

    await db.purchase_orders.add(newPo);
    await syncToCloud('PurchaseOrders', newPo.id, newPo);

    // Reset Form
    setSelectedSupplierId('');
    setPoItems([]);
    alert('Purchase Order issued successfully!');
  }, [selectedSupplierId, poItems, suppliers, syncToCloud]);

  // Mark Purchase Order as Received & auto-increment Stock
  const handleMarkReceived = useCallback(async (po) => {
    if (po.status === 'Received') return;
    if (!window.confirm(`Mark Purchase Order ${po.id} as Received? This will automatically increment stock levels.`)) return;

    const receivedTimestamp = Date.now();
    try {
      const items = JSON.parse(po.itemsJson);

      await db.transaction('rw', db.products, db.purchase_orders, async () => {
        // 1. Update stock levels for each item
        for (const item of items) {
          const prod = await db.products.get(item.productId);
          if (prod) {
            const newQty = (prod.quantity || 0) + item.qtyToOrder;
            await db.products.update(item.productId, { quantity: newQty });

            // Push stock update to Firebase
            if (orgId && navigator.onLine) {
             const docRef = doc(dbCloud, `Organizations/${orgId}/Branches/${branchId}/Products`, item.productId);
             await setDoc(docRef, { quantity: newQty }, { merge: true });
            }
          }
        }

        // 2. Mark PO as Received
        await db.purchase_orders.update(po.id, { status: 'Received', receivedTimestamp });
      });

      // Push updated PO to Firebase
      await syncToCloud('PurchaseOrders', po.id, { status: 'Received', receivedTimestamp });

      alert('Purchase Order successfully received! Stock balances updated.');
      if (activePoDetails?.id === po.id) {
        setActivePoDetails(prev => ({ ...prev, status: 'Received' }));
      }
    } catch (err) {
      console.error(err);
      alert('Failed to mark PO as received: ' + err.message);
    }
  }, [orgId, branchId, activePoDetails, syncToCloud]);

  return (
    <div className="analytics-layout animate-fade-in" style={{ padding: '2rem', height: '100%', overflowY: 'auto' }}>
      {/* Header section with modern tab toggle */}
      <div className="analytics-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h2 style={{ background: 'linear-gradient(90deg, var(--accent-primary), var(--accent-hover))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', margin: 0, fontSize: '2rem' }}>
            Supplier & Stock Order Management
          </h2>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.25rem', fontSize: '0.95rem' }}>
            Maintain dynamic supplier directories and dispatch / track purchase shipments.
          </p>
        </div>
        
        {/* Visual Tab Toggles */}
        <div style={{ display: 'flex', background: 'var(--bg-secondary)', padding: '0.25rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
          <button 
            className="btn" 
            onClick={() => setActiveSubTab('suppliers')} 
            style={{ 
              background: activeSubTab === 'suppliers' ? 'var(--accent-primary)' : 'transparent',
              color: activeSubTab === 'suppliers' ? 'white' : 'var(--text-secondary)',
              padding: '0.5rem 1rem', borderRadius: 'var(--radius-sm)'
            }}
          >
            <Truck size={18} /> Suppliers
          </button>
          <button 
            className="btn" 
            onClick={() => setActiveSubTab('po')} 
            style={{ 
              background: activeSubTab === 'po' ? 'var(--accent-primary)' : 'transparent',
              color: activeSubTab === 'po' ? 'white' : 'var(--text-secondary)',
              padding: '0.5rem 1rem', borderRadius: 'var(--radius-sm)'
            }}
          >
            <ShoppingBag size={18} /> Purchase Orders
          </button>
        </div>
      </div>

      {activeSubTab === 'suppliers' ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '2rem' }}>
          {/* Add Supplier Form */}
          <div className="glass-panel" style={{ padding: '1.5rem', height: 'fit-content' }}>
            <h3 style={{ marginBottom: '1.25rem' }}>Register New Supplier</h3>
            <form onSubmit={handleAddSupplier} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <input type="text" placeholder="Company / Supplier Name" value={supName} onChange={e => setSupName(e.target.value)} required />
              <input type="text" placeholder="Contact Person" value={supContact} onChange={e => setSupContact(e.target.value)} />
              <input type="email" placeholder="Email Address" value={supEmail} onChange={e => setSupEmail(e.target.value)} />
              <input type="tel" placeholder="Phone Number" value={supPhone} onChange={e => setSupPhone(e.target.value)} />
              <input type="text" placeholder="Physical Address" value={supAddress} onChange={e => setSupAddress(e.target.value)} />
              <button type="submit" className="btn btn-primary" style={{ marginTop: '0.5rem' }}>
                <Plus size={18} /> Register Supplier
              </button>
            </form>
          </div>

          {/* Supplier Directory */}
          <div className="glass-panel" style={{ padding: '1.5rem' }}>
            <h3 style={{ marginBottom: '1.25rem' }}>Suppliers Directory</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '0.75rem' }}>Supplier Details</th>
                  <th style={{ padding: '0.75rem' }}>Contact Info</th>
                  <th style={{ padding: '0.75rem' }}>Address</th>
                </tr>
              </thead>
              <tbody>
                {suppliers?.map(s => (
                  <tr key={s.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                    <td style={{ padding: '0.75rem', fontWeight: '600' }}>
                      {s.name}
                      <span style={{ display: 'block', fontSize: '0.75rem', fontWeight: 'normal', color: 'var(--text-secondary)' }}>
                        Person: {s.contactPerson || '—'}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem' }}>
                      {s.phone && <span style={{ display: 'block' }}>📞 {s.phone}</span>}
                      {s.email && <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--accent-primary)' }}>✉️ {s.email}</span>}
                    </td>
                    <td style={{ padding: '0.75rem', color: 'var(--text-secondary)' }}>{s.address || '—'}</td>
                  </tr>
                ))}
                {(!suppliers || suppliers.length === 0) && (
                  <tr><td colSpan="3" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No suppliers registered.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.8fr', gap: '2rem' }}>
          {/* Create Purchase Order */}
          <div className="glass-panel" style={{ padding: '1.5rem', height: 'fit-content' }}>
            <h3 style={{ marginBottom: '1.25rem' }}>Create Purchase Order (PO)</h3>
            <form onSubmit={handleCreatePo} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              
              <label style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Select Supplier</label>
              <select value={selectedSupplierId} onChange={e => setSelectedSupplierId(e.target.value)} required>
                <option value="">-- Choose Supplier --</option>
                {suppliers?.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>

              <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '0.5rem 0' }} />
              
              <label style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Add Catalog Products</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <select value={currentProductId} onChange={e => setCurrentProductId(e.target.value)} style={{ flex: 1.8 }}>
                  <option value="">-- Choose Product --</option>
                  {products?.map(p => (
                    <option key={p.id} value={p.id}>{p.name} (Current: {p.quantity})</option>
                  ))}
                </select>
                <input 
                  type="number" 
                  placeholder="Qty" 
                  value={currentQtyToOrder} 
                  onChange={e => setCurrentQtyToOrder(e.target.value)} 
                  style={{ flex: 0.8 }}
                />
                <button type="button" className="btn btn-secondary" onClick={handleAddItemToPo} style={{ padding: '0.75rem' }}>
                  Add
                </button>
              </div>

              {/* Added PO Items */}
              {poItems.length > 0 && (
                <div style={{ background: 'var(--bg-primary)', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', margin: '0.5rem 0' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Items Checklist:</span>
                  <ul style={{ paddingLeft: '1.25rem', margin: '0.25rem 0', fontSize: '0.85rem' }}>
                    {poItems.map((item, idx) => (
                      <li key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.15rem 0' }}>
                        <span>{item.name}</span>
                        <strong>x{item.qtyToOrder}</strong>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <button type="submit" className="btn btn-primary" style={{ marginTop: '0.5rem' }} disabled={poItems.length === 0}>
                <Plus size={18} /> Issue Purchase Order
              </button>
            </form>
          </div>

          {/* Purchase Order History */}
          <div className="glass-panel" style={{ padding: '1.5rem' }}>
            <h3 style={{ marginBottom: '1.25rem' }}>Purchase Order History</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '0.75rem' }}>Order ID</th>
                  <th style={{ padding: '0.75rem' }}>Supplier</th>
                  <th style={{ padding: '0.75rem' }}>Date Issued</th>
                  <th style={{ padding: '0.75rem' }}>Status</th>
                  <th style={{ padding: '0.75rem' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {purchaseOrders?.map(po => {
                  const date = new Date(po.timestamp).toLocaleDateString();
                  const isReceived = po.status === 'Received';
                  return (
                    <tr key={po.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                      <td style={{ padding: '0.75rem', fontWeight: 'bold' }}>{po.id}</td>
                      <td style={{ padding: '0.75rem' }}>{po.supplierName}</td>
                      <td style={{ padding: '0.75rem' }}>{date}</td>
                      <td style={{ padding: '0.75rem' }}>
                        <span style={{ 
                          padding: '0.2rem 0.5rem', 
                          borderRadius: '4px',
                          fontWeight: 'bold',
                          fontSize: '0.8rem',
                          background: isReceived ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                          color: isReceived ? 'var(--accent-success)' : 'var(--accent-warning)'
                        }}>
                          {po.status}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem', display: 'flex', gap: '0.25rem' }}>
                        <button 
                          className="btn btn-secondary" 
                          onClick={() => setActivePoDetails(po)}
                          style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
                          title="View items"
                        >
                          <Eye size={14} /> View
                        </button>
                        {!isReceived && (
                          <button 
                            className="btn btn-success" 
                            onClick={() => handleMarkReceived(po)}
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
                          >
                            <Check size={14} /> Receive
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {(!purchaseOrders || purchaseOrders.length === 0) && (
                  <tr><td colSpan="5" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No purchase orders recorded.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* PO Detail View Drawer Overlay */}
      {activePoDetails && (
        <div style={{
          position: 'fixed', top: 0, right: 0, bottom: 0, width: '400px',
          background: 'var(--bg-secondary)', borderLeft: '1px solid var(--border-color)',
          boxShadow: 'var(--shadow-lg)', zIndex: 100, padding: '2rem', display: 'flex', flexDirection: 'column'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h3 style={{ margin: 0 }}>PO Details: {activePoDetails.id}</h3>
            <button className="btn btn-secondary" onClick={() => setActivePoDetails(null)} style={{ padding: '0.25rem 0.5rem' }}>Close</button>
          </div>
          
          <div style={{ flex: 1 }}>
            <p style={{ margin: '0.5rem 0' }}><strong>Supplier:</strong> {activePoDetails.supplierName}</p>
            <p style={{ margin: '0.5rem 0' }}><strong>Issued:</strong> {new Date(activePoDetails.timestamp).toLocaleString()}</p>
            <p style={{ margin: '0.5rem 0' }}><strong>Status:</strong> {activePoDetails.status}</p>
            {activePoDetails.receivedTimestamp && (
              <p style={{ margin: '0.5rem 0', color: 'var(--accent-success)' }}><strong>Received:</strong> {new Date(activePoDetails.receivedTimestamp).toLocaleString()}</p>
            )}
            
            <h4 style={{ marginTop: '1.5rem', marginBottom: '0.5rem' }}>Items to Receive</h4>
            <div style={{ background: 'var(--bg-primary)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
              <table style={{ width: '100%', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left', color: 'var(--text-muted)' }}>
                    <th style={{ paddingBottom: '0.5rem' }}>Product</th>
                    <th style={{ paddingBottom: '0.5rem', textAlign: 'right' }}>Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {JSON.parse(activePoDetails.itemsJson).map((item, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--border-light)' }}>
                      <td style={{ padding: '0.5rem 0' }}>{item.name}</td>
                      <td style={{ padding: '0.5rem 0', textAlign: 'right', fontWeight: 'bold' }}>x{item.qtyToOrder}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {activePoDetails.status !== 'Received' && (
            <button 
              className="btn btn-success" 
              onClick={() => handleMarkReceived(activePoDetails)}
              style={{ width: '100%', marginTop: '1.5rem', padding: '1rem', fontWeight: 'bold' }}
            >
              <Check size={18} /> Mark All as Received
            </button>
          )}
        </div>
      )}
    </div>
  );
}
