import { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function HrScreen() {
  const logs = useLiveQuery(() => db.attendance_logs.toArray(), []);
  const [now] = useState(() => Date.now());

  const chartData = useMemo(() => {
    if (!logs) return [];
    const hoursMap = {};
    logs.forEach(log => {
      const diffMs = log.clockOut ? (log.clockOut - log.clockIn) : (now - log.clockIn);
      const hours = diffMs / (1000 * 60 * 60);
      const shortEmail = log.employeeId.split('@')[0];
      
      if (!hoursMap[shortEmail]) hoursMap[shortEmail] = 0;
      hoursMap[shortEmail] += hours;
    });

    return Object.keys(hoursMap).map(key => ({
      name: key,
      hours: parseFloat(hoursMap[key].toFixed(2))
    }));
  }, [logs, now]);

  return (
    <div className="analytics-layout animate-fade-in" style={{ padding: '1rem', height: '100%', overflowY: 'auto' }}>
      <h2 style={{ marginBottom: '1.5rem', fontSize: '1.8rem' }}>
        HR Staff Timesheets & Shift Reconciliation
      </h2>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', marginBottom: '1.5rem' }}>
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <h3 style={{ marginBottom: '1rem' }}>Employee Work Hours Log</h3>
          <div style={{ height: '260px', width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" />
                <XAxis dataKey="name" stroke="var(--text-secondary)" />
                <YAxis stroke="var(--text-secondary)" />
                <Tooltip contentStyle={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px' }} />
                <Bar dataKey="hours" fill="var(--accent-cyan)" radius={[4, 4, 0, 0]} barSize={36} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="glass-panel" style={{ padding: '1.5rem' }}>
        <h3 style={{ marginBottom: '1rem' }}>Shift Cash Drawer Float Audit (Z-Report Audit)</h3>
        <div className="table-responsive">
          <table className="premium-table">
            <thead>
              <tr>
                <th>Cashier</th>
                <th>Shift Window</th>
                <th>Starting Float</th>
                <th>Cash Sales</th>
                <th>Expected Cash</th>
                <th>Actual Drawer</th>
                <th>Discrepancy</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {logs?.map(log => {
                const inDate = new Date(log.clockIn).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
                const outDate = log.clockOut ? new Date(log.clockOut).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : 'Active Shift';
                
                const startFloat = log.startingFloat !== undefined ? log.startingFloat : 0;
                const cashSales = log.cashSales !== undefined ? log.cashSales : 0;
                const expected = log.expectedEndingCash !== undefined ? log.expectedEndingCash : 0;
                const actual = log.endingFloat !== undefined ? log.endingFloat : 0;
                const discrepancy = log.discrepancy !== undefined ? log.discrepancy : 0;

                let statusText = 'Working...';
                let statusBg = 'rgba(251, 191, 36, 0.15)';
                let statusColor = 'var(--accent-warning)';

                if (log.clockOut) {
                  if (discrepancy === 0) {
                    statusText = 'Balanced';
                    statusBg = 'rgba(16, 185, 129, 0.15)';
                    statusColor = 'var(--accent-success)';
                  } else if (discrepancy < 0) {
                    statusText = 'Shortage';
                    statusBg = 'rgba(244, 63, 94, 0.15)';
                    statusColor = 'var(--accent-danger)';
                  } else {
                    statusText = 'Overage';
                    statusBg = 'rgba(251, 191, 36, 0.15)';
                    statusColor = 'var(--accent-warning)';
                  }
                }

                return (
                  <tr key={log.id}>
                    <td style={{ fontWeight: '600' }}>
                      {log.employeeId.split('@')[0]}
                    </td>
                    <td style={{ fontSize: '0.82rem' }}>
                      {inDate} to {outDate}
                    </td>
                    <td className="price-mono">Rs. {startFloat.toFixed(2)}</td>
                    <td className="price-mono">Rs. {cashSales.toFixed(2)}</td>
                    <td className="price-mono">Rs. {expected.toFixed(2)}</td>
                    <td className="price-mono">{log.clockOut ? `Rs. ${actual.toFixed(2)}` : '—'}</td>
                    <td className="price-mono" style={{ color: discrepancy < 0 ? 'var(--accent-danger)' : (discrepancy > 0 ? 'var(--accent-warning)' : 'var(--accent-success)') }}>
                      {log.clockOut ? `Rs. ${discrepancy.toFixed(2)}` : '—'}
                    </td>
                    <td>
                      <span style={{ padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.78rem', fontWeight: 'bold', background: statusBg, color: statusColor }}>
                        {statusText}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {(!logs || logs.length === 0) && (
                <tr><td colSpan="8" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No shift records found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
