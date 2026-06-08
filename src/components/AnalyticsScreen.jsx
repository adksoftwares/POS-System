import { useState, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { dbCloud, auth } from '../config/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import './AnalyticsScreen.css';

export default function AnalyticsScreen() {
  const [filter, setFilter] = useState('This Month');
  const [tier, setTier] = useState('Free');
  const [loadingTier, setLoadingTier] = useState(true);
  const [licenseKey, setLicenseKey] = useState('');
  const [upgrading, setUpgrading] = useState(false);
  const [statusMsg, setStatusMsg] = useState({ text: '', type: '' });
  const orgId = localStorage.getItem('adk_orgId') || '';

  const userEmail = localStorage.getItem('adk_userEmail') || '';
  const isSuperAdmin = userEmail.trim().toLowerCase() === 'arikarran14@gmail.com';

  useEffect(() => {
    async function checkTier() {
      if (!orgId) {
        setLoadingTier(false);
        return;
      }
      try {
        const snap = await getDoc(doc(dbCloud, "Organizations", orgId));
        if (snap.exists()) {
          setTier(snap.data().subscriptionTier || 'Free');
        }
      } catch (e) {
        console.log("Could not check tier", e);
      } finally {
        setLoadingTier(false);
      }
    }
    checkTier();
  }, [orgId]);


  
  const getStartTime = () => {
    const now = new Date();
    if (filter === 'Today') {
      now.setHours(0,0,0,0);
      return now.getTime();
    } else if (filter === 'This Week') {
      now.setDate(now.getDate() - now.getDay());
      now.setHours(0,0,0,0);
      return now.getTime();
    } else if (filter === 'This Month') {
      now.setDate(1);
      now.setHours(0,0,0,0);
      return now.getTime();
    }
    return 0; // All time
  };

  const transactions = useLiveQuery(
    () => db.transactions.where('timestamp').aboveOrEqual(getStartTime()).toArray(),
    [filter]
  );

  const products = useLiveQuery(() => db.products.toArray(), []);

  const { metrics, topSellers, chartData } = useMemo(() => {
    const fallback = {
      metrics: { revenue: 0, bills: 0, itemsSold: 0 },
      topSellers: [],
      chartData: []
    };
    if (!transactions) return fallback;

    let rev = 0;
    let itemsCount = 0;
    const itemMap = {};
    const timeMap = {};

    transactions.forEach(t => {
      rev += t.totalAmount;
      
      const tDate = new Date(t.timestamp);
      const timeKey = filter === 'Today' ? `${tDate.getHours()}:00` : tDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      
      if (!timeMap[timeKey]) timeMap[timeKey] = 0;
      timeMap[timeKey] += t.totalAmount;

      let parsedItems = [];
      try {
        parsedItems = JSON.parse(t.itemsJson);
      } catch (err) {
        console.warn("Failed to parse transaction items JSON:", err);
      }
      
      parsedItems.forEach(i => {
        itemsCount += i.quantity;
        if (!itemMap[i.productId]) {
          itemMap[i.productId] = { id: i.productId, quantity: 0, revenue: 0 };
        }
        itemMap[i.productId].quantity += i.quantity;
        itemMap[i.productId].revenue += (i.price * i.quantity);
      });
    });

    const sorted = Object.values(itemMap)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    const mappedSellers = sorted.map(s => {
      const prod = products?.find(p => p.id === s.id);
      return {
        ...s,
        name: prod ? prod.name : 'Unknown Product'
      };
    });

    const formattedChartData = Object.keys(timeMap).map(key => ({
      time: key,
      revenue: timeMap[key]
    }));

    return {
      metrics: { revenue: rev, bills: transactions.length, itemsSold: itemsCount },
      topSellers: mappedSellers,
      chartData: formattedChartData
    };
  }, [transactions, filter, products]);

  const generateZReport = () => {
    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.text(`Z-Report: ${filter}`, 14, 20);
    
    doc.setFontSize(12);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 30);
    doc.text(`Total Revenue: Rs. ${metrics.revenue.toFixed(2)}`, 14, 40);
    doc.text(`Total Bills: ${metrics.bills}`, 14, 50);
    doc.text(`Items Sold: ${metrics.itemsSold}`, 14, 60);

    autoTable(doc, {
      startY: 70,
      head: [['Product Name', 'Qty Sold', 'Revenue (Rs.)']],
      body: topSellers.map(s => [s.name, s.quantity, s.revenue.toFixed(2)]),
      theme: 'grid'
    });

    doc.save(`Z-Report_${Date.now()}.pdf`);
  };

  if (loadingTier) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-primary)', fontFamily: 'var(--font-sans)' }}>Validating secure business analytics tier...</div>;
  }

  const hasPremium = isSuperAdmin || tier === 'Premium';

  if (!hasPremium) {
    const handleApplyLicense = async (e) => {
      e.preventDefault();
      if (!orgId) {
        setStatusMsg({ text: 'No active organization context found.', type: 'error' });
        return;
      }
      setUpgrading(true);
      setStatusMsg({ text: '', type: '' });
      try {
        const cleanKey = licenseKey.trim().toUpperCase();
        if (cleanKey === 'ADK_PREMIUM' || cleanKey === 'PREMIUM_KEY' || cleanKey === 'ARIKARRAN14') {
          await updateDoc(doc(dbCloud, "Organizations", orgId), {
            subscriptionTier: "Premium"
          });
          
          const currentUser = auth.currentUser;
          if (currentUser) {
            await updateDoc(doc(dbCloud, "Users", currentUser.uid), {
              role: "premium"
            });
          }
          
          setTier("Premium");
          setStatusMsg({ text: "Successfully upgraded to Premium Tier! Enjoy Business Analytics.", type: "success" });
        } else {
          setStatusMsg({ text: "Invalid ADK License Key. Try using 'ADK_PREMIUM'.", type: "error" });
        }
        setLicenseKey('');
      } catch (err) {
        console.error(err);
        setStatusMsg({ text: "Failed to apply license: " + err.message, type: "error" });
      } finally {
        setUpgrading(false);
      }
    };

    return (
      <div className="premium-only-container" style={{
        display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
        height: '80vh', fontFamily: 'var(--font-sans)', textAlign: 'center', padding: '2rem'
      }}>
        <div className="glass-panel" style={{
          padding: '3rem', borderRadius: 'var(--radius-lg)', maxWidth: '500px',
          border: '1px solid var(--border-light)', background: 'var(--bg-glass)', backdropFilter: 'blur(12px)'
        }}>
          <h2 style={{
            background: 'linear-gradient(90deg, var(--accent-primary), var(--accent-hover))',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            fontSize: '2rem', marginBottom: '1rem', fontWeight: 'bold'
          }}>
            Premium Feature
          </h2>
          <p style={{ color: 'var(--text-primary)', fontSize: '1.1rem', marginBottom: '1.5rem', lineHeight: '1.6' }}>
            The **Business Analytics Dashboard** is a Premium-Only feature. Unlock advanced revenue trends, top-selling product metrics, and instant Z-Report generation.
          </p>
          
          <hr style={{ border: 'none', borderTop: '1px solid var(--border-light)', margin: '2rem 0' }} />
          
          <form onSubmit={handleApplyLicense} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', textAlign: 'left' }}>
            <label style={{ color: 'var(--text-primary)', fontWeight: 'bold', fontSize: '1rem' }}>Instant Activation</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input 
                type="text" 
                placeholder="Enter ADK License Key" 
                value={licenseKey} 
                onChange={e => setLicenseKey(e.target.value)} 
                required 
                style={{
                  flex: 1,
                  padding: '0.75rem 1rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-light)',
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  outline: 'none'
                }}
              />
              <button type="submit" className="btn btn-success" disabled={upgrading} style={{ padding: '0.75rem 1.5rem', fontWeight: 'bold' }}>
                {upgrading ? 'Upgrading...' : 'Apply Key'}
              </button>
            </div>
          </form>

          {statusMsg.text && (
            <div style={{
              marginTop: '1.5rem',
              padding: '1rem',
              borderRadius: 'var(--radius-md)',
              background: statusMsg.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
              color: statusMsg.type === 'success' ? '#10b981' : '#ef4444',
              fontWeight: 'bold',
              fontSize: '0.95rem'
            }}>
              {statusMsg.text}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="analytics-layout animate-fade-in">
      <div className="analytics-header">
        <h2 style={{ background: 'linear-gradient(90deg, var(--accent-primary), var(--accent-hover))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', margin: 0, fontSize: '2rem' }}>
          Business Analytics 3D
        </h2>
        <div className="filter-controls">
          <select value={filter} onChange={e => setFilter(e.target.value)} className="date-select glass-card" style={{ padding: '0.75rem 1rem', border: 'none', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
            <option>Today</option>
            <option>This Week</option>
            <option>This Month</option>
            <option>All Time</option>
          </select>
          <button className="btn btn-primary" onClick={generateZReport}>Download Z-Report</button>
        </div>
      </div>

      <div className="metrics-grid">
        <div className="metric-card glass-panel perspective-card">
          <h4>Total Revenue</h4>
          <span className="metric-value">Rs. {metrics.revenue.toFixed(2)}</span>
          <div className="metric-glow"></div>
        </div>
        <div className="metric-card glass-panel perspective-card">
          <h4>Bills Generated</h4>
          <span className="metric-value">{metrics.bills}</span>
          <div className="metric-glow" style={{ background: 'var(--accent-success)' }}></div>
        </div>
        <div className="metric-card glass-panel perspective-card">
          <h4>Items Sold</h4>
          <span className="metric-value">{metrics.itemsSold}</span>
          <div className="metric-glow" style={{ background: 'var(--accent-warning)' }}></div>
        </div>
      </div>

      <div className="charts-grid">
        <div className="chart-container glass-panel">
          <h3>Revenue Trend</h3>
          <div style={{ height: '300px', width: '100%', marginTop: '1rem' }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--accent-primary)" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="var(--accent-primary)" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" vertical={false} />
                <XAxis dataKey="time" stroke="var(--text-muted)" />
                <YAxis stroke="var(--text-muted)" />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-light)', borderRadius: '8px' }}
                  itemStyle={{ color: 'var(--accent-primary)', fontWeight: 'bold' }}
                />
                <Area type="monotone" dataKey="revenue" stroke="var(--accent-primary)" strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="top-sellers-section glass-panel">
          <h3>Top Sellers</h3>
          <div style={{ height: '300px', width: '100%', marginTop: '1rem' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topSellers} margin={{ top: 10, right: 10, left: -20, bottom: 0 }} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" horizontal={false} />
                <XAxis type="number" stroke="var(--text-muted)" />
                <YAxis dataKey="name" type="category" stroke="var(--text-muted)" width={100} tick={{ fontSize: 12 }} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-light)', borderRadius: '8px' }}
                  cursor={{ fill: 'var(--border-light)' }}
                />
                <Bar dataKey="quantity" fill="var(--accent-success)" radius={[0, 4, 4, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
      </div>
    </div>


      {/* Recent Transactions List */}
      <div className="recent-transactions-section glass-panel" style={{ marginTop: '2rem', padding: '2rem' }}>
        <h3 style={{ marginBottom: '1.5rem', background: 'linear-gradient(90deg, var(--accent-primary), var(--accent-hover))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', width: 'fit-content' }}>
          Recent Transactions
        </h3>
        <div className="table-responsive">
          <table className="premium-table">
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Receipt ID</th>
                <th style={{ textAlign: 'left' }}>Date & Time</th>
                <th style={{ textAlign: 'left' }}>Payment Method</th>
                <th style={{ textAlign: 'right' }}>Total Amount (Rs.)</th>
              </tr>
            </thead>
            <tbody>
              {!transactions || transactions.length === 0 ? (
                <tr>
                  <td colSpan="4" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                    No transactions found for this period.
                  </td>
                </tr>
              ) : (
                [...transactions]
                  .sort((a, b) => b.timestamp - a.timestamp) // Sort by most recent first
                  .slice(0, 10) // Top 10 most recent
                  .map(tx => (
                    <tr key={tx.receiptId}>
                      <td style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>{tx.receiptId}</td>
                      <td>{new Date(tx.timestamp).toLocaleString()}</td>
                      <td>
                        <span className={`payment-badge ${tx.paymentMethod.toLowerCase()}`} style={{
                          padding: '0.25rem 0.6rem', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold',
                          display: 'inline-block',
                          backgroundColor: tx.paymentMethod.toLowerCase() === 'cash' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(99, 102, 241, 0.15)',
                          color: tx.paymentMethod.toLowerCase() === 'cash' ? '#10b981' : '#6366f1'
                        }}>
                          {tx.paymentMethod}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 'bold', color: 'var(--accent-primary)' }}>
                        Rs. {tx.totalAmount.toFixed(2)}
                      </td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
