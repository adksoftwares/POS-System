import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import './AnalyticsScreen.css';

export default function AnalyticsScreen() {
  const [filter, setFilter] = useState('Today');
  
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

  const [metrics, setMetrics] = useState({ revenue: 0, bills: 0, itemsSold: 0 });
  const [topSellers, setTopSellers] = useState([]);

  useEffect(() => {
    if (!transactions) return;
    let rev = 0;
    let items = 0;
    const itemMap = {};

    transactions.forEach(t => {
      rev += t.totalAmount;
      let parsedItems = [];
      try {
        parsedItems = JSON.parse(t.itemsJson);
      } catch(e) {}
      
      parsedItems.forEach(i => {
        items += i.quantity;
        if (!itemMap[i.productId]) {
          itemMap[i.productId] = { id: i.productId, quantity: 0, revenue: 0 };
        }
        itemMap[i.productId].quantity += i.quantity;
        itemMap[i.productId].revenue += (i.price * i.quantity);
      });
    });

    setMetrics({ revenue: rev, bills: transactions.length, itemsSold: items });

    const sorted = Object.values(itemMap).sort((a,b) => b.quantity - a.quantity).slice(0, 5);
    
    const fetchNames = async () => {
      const updatedSellers = await Promise.all(sorted.map(async s => {
        const prod = await db.products.get(s.id);
        return { ...s, name: prod ? prod.name : 'Unknown Product' };
      }));
      setTopSellers(updatedSellers);
    };
    fetchNames();

  }, [transactions]);

  const generateZReport = () => {
    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.text(`Z-Report: ${filter}`, 14, 20);
    
    doc.setFontSize(12);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 30);
    doc.text(`Total Revenue: LKR ${metrics.revenue.toFixed(2)}`, 14, 40);
    doc.text(`Total Bills: ${metrics.bills}`, 14, 50);
    doc.text(`Items Sold: ${metrics.itemsSold}`, 14, 60);

    autoTable(doc, {
      startY: 70,
      head: [['Product Name', 'Qty Sold', 'Revenue (LKR)']],
      body: topSellers.map(s => [s.name, s.quantity, s.revenue.toFixed(2)]),
      theme: 'grid'
    });

    doc.save(`Z-Report_${Date.now()}.pdf`);
  };

  return (
    <div className="analytics-layout">
      <div className="analytics-header">
        <h2>Business Analytics</h2>
        <div className="filter-controls">
          <select value={filter} onChange={e => setFilter(e.target.value)} className="date-select">
            <option>Today</option>
            <option>This Week</option>
            <option>This Month</option>
            <option>All Time</option>
          </select>
          <button className="btn btn-primary" onClick={generateZReport}>Download Z-Report</button>
        </div>
      </div>

      <div className="metrics-grid">
        <div className="metric-card">
          <h4>Total Revenue</h4>
          <span className="metric-value">LKR {metrics.revenue.toFixed(2)}</span>
        </div>
        <div className="metric-card">
          <h4>Bills Generated</h4>
          <span className="metric-value">{metrics.bills}</span>
        </div>
        <div className="metric-card">
          <h4>Items Sold</h4>
          <span className="metric-value">{metrics.itemsSold}</span>
        </div>
      </div>

      <div className="top-sellers-section">
        <h3>Top Sellers</h3>
        <table className="inventory-table">
          <thead>
            <tr>
              <th>Product Name</th>
              <th>Quantity Sold</th>
              <th>Revenue Generated</th>
            </tr>
          </thead>
          <tbody>
            {topSellers.map(s => (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td>{s.quantity}</td>
                <td>LKR {s.revenue.toFixed(2)}</td>
              </tr>
            ))}
            {topSellers.length === 0 && (
              <tr><td colSpan="3">No sales data for this period.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
