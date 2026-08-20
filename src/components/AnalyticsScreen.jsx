import { useState, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { dbCloud, auth } from '../config/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { sound } from '../services/soundService';
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
    return 0;
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
      const amount = t.totalAmount || t.total || 0;
      rev += amount;
      
      const tDate = new Date(t.timestamp);
      const timeKey = filter === 'Today' ? `${tDate.getHours()}:00` : tDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      
      if (!timeMap[timeKey]) timeMap[timeKey] = 0;
      timeMap[timeKey] += amount;

      let parsedItems = [];
      if (Array.isArray(t.items)) {
        parsedItems = t.items;
      } else if (t.itemsJson) {
        try {
          parsedItems = JSON.parse(t.itemsJson);
        } catch (err) {
          console.warn("Failed to parse itemsJson", err);
        }
      }
      
      parsedItems.forEach(i => {
        const q = i.quantity || 1;
        const p = i.price || 0;
        const id = i.productId || i.id || i.name;
        itemsCount += q;
        if (!itemMap[id]) {
          itemMap[id] = { id, name: i.name || 'Unknown', quantity: 0, revenue: 0 };
        }
        itemMap[id].quantity += q;
        itemMap[id].revenue += (p * q);
      });
    });

    const sorted = Object.values(itemMap)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    const mappedSellers = sorted.map(s => {
      const prod = products?.find(p => p.id === s.id);
      return {
        ...s,
        name: prod ? prod.name : s.name
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
    doc.text(`ADK Smart POS Z-Report: ${filter}`, 14, 20);
    
    doc.setFontSize(11);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 28);
    doc.text(`Total Sales Revenue: Rs. ${metrics.revenue.toFixed(2)}`, 14, 36);
    doc.text(`Total Invoices: ${metrics.bills}`, 14, 44);
    doc.text(`Total Quantity Sold: ${metrics.itemsSold}`, 14, 52);

    autoTable(doc, {
      startY: 60,
      head: [['Product Name', 'Qty Sold', 'Revenue (Rs.)']],
      body: topSellers.map(s => [s.name, s.quantity, s.revenue.toFixed(2)]),
      theme: 'grid'
    });

    doc.save(`ADK_Z_Report_${Date.now()}.pdf`);
    sound.playSuccessChime();
  };

  if (loadingTier) {
    return <div style={{ padding: '3rem', textAlign: 'center' }}>Loading Business Intelligence Analytics...</div>;
  }

  const hasPremium = isSuperAdmin || tier === 'Premium';

  if (!hasPremium) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh', padding: '2rem' }}>
        <div className="glass-panel" style={{ padding: '3rem', maxWidth: '480px', textAlign: 'center' }}>
          <h2 style={{ fontSize: '1.8rem', marginBottom: '1rem', color: 'var(--accent-cyan)' }}>Unlock Analytics Dashboard</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
            Gain real-time revenue intelligence, top selling item metrics, and instant PDF Z-Report generation.
          </p>
          <div style={{ padding: '1rem', border: '1px solid var(--border-light)', borderRadius: '8px', background: 'var(--bg-secondary)' }}>
            <strong>To upgrade to Premium, please contact your Super Admin.</strong>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="analytics-layout animate-fade-in" style={{ padding: '1rem' }}>
      <div className="analytics-header mobile-wrap" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <h2 style={{ fontSize: '1.8rem', margin: 0 }}>Business Intelligence & Analytics</h2>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={filter} onChange={e => setFilter(e.target.value)} style={{ padding: '0.6rem 1rem', width: 'auto' }}>
            <option>Today</option>
            <option>This Week</option>
            <option>This Month</option>
            <option>All Time</option>
          </select>
          <button className="btn btn-cyan" onClick={generateZReport}>Export Z-Report PDF</button>
        </div>
      </div>

      <div className="metrics-grid" style={{ gap: '1.25rem', marginBottom: '1.5rem' }}>
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <h4 style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', textTransform: 'uppercase' }}>Gross Revenue</h4>
          <span className="price-mono" style={{ fontSize: '1.8rem', color: 'var(--accent-cyan)', fontWeight: '800' }}>Rs. {metrics.revenue.toFixed(2)}</span>
        </div>
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <h4 style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', textTransform: 'uppercase' }}>Invoices Processed</h4>
          <span className="price-mono" style={{ fontSize: '1.8rem', color: 'var(--accent-success)', fontWeight: '800' }}>{metrics.bills}</span>
        </div>
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <h4 style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', textTransform: 'uppercase' }}>Items Sold</h4>
          <span className="price-mono" style={{ fontSize: '1.8rem', color: 'var(--accent-warning)', fontWeight: '800' }}>{metrics.itemsSold}</span>
        </div>
      </div>

      <div className="charts-grid" style={{ gap: '1.5rem', marginBottom: '1.5rem' }}>
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <h3 style={{ marginBottom: '1rem' }}>Revenue Performance Trend</h3>
          <div style={{ height: '280px', width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.7}/>
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" />
                <XAxis dataKey="time" stroke="var(--text-secondary)" />
                <YAxis stroke="var(--text-secondary)" />
                <Tooltip contentStyle={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px' }} />
                <Area type="monotone" dataKey="revenue" stroke="#06b6d4" strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <h3 style={{ marginBottom: '1rem' }}>Top Selling Products</h3>
          <div style={{ height: '280px', width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topSellers} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" />
                <XAxis type="number" stroke="var(--text-secondary)" />
                <YAxis dataKey="name" type="category" stroke="var(--text-secondary)" width={90} tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px' }} />
                <Bar dataKey="quantity" fill="#10b981" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="glass-panel" style={{ padding: '1.5rem' }}>
        <h3 style={{ marginBottom: '1rem' }}>Recent Invoices Log</h3>
        <div className="table-responsive">
          <table className="premium-table">
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Date & Time</th>
                <th>Cashier</th>
                <th>Payment Mode</th>
                <th style={{ textAlign: 'right' }}>Total (Rs.)</th>
              </tr>
            </thead>
            <tbody>
              {(!transactions || transactions.length === 0) ? (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                    No transactions recorded for this selected time window.
                  </td>
                </tr>
              ) : (
                [...transactions].sort((a,b) => b.timestamp - a.timestamp).slice(0, 10).map(t => (
                  <tr key={t.receiptId}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 'bold' }}>{t.receiptId}</td>
                    <td>{new Date(t.timestamp).toLocaleString()}</td>
                    <td>{t.cashierName || 'Cashier 1'}</td>
                    <td>
                      <span style={{
                        padding: '0.2rem 0.6rem', borderRadius: '4px', fontSize: '0.78rem', fontWeight: 'bold',
                        background: 'rgba(6, 182, 212, 0.15)', color: 'var(--accent-cyan)'
                      }}>
                        {(t.paymentMethod || 'Cash').toUpperCase()}
                      </span>
                    </td>
                    <td className="price-mono" style={{ textAlign: 'right', color: 'var(--accent-cyan)', fontWeight: '700' }}>
                      Rs. {(t.totalAmount || t.total || 0).toFixed(2)}
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
