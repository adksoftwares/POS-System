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
    <div className="analytics-layout animate-fade-in" style={{ padding: '2rem', height: '100%', overflowY: 'auto' }}>
      <h2 style={{ marginBottom: '2rem', background: 'linear-gradient(90deg, var(--accent-primary), var(--accent-hover))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', margin: '0 0 2rem 0', fontSize: '2rem' }}>
        HR Analytics & Timesheets
      </h2>
      
      <div className="charts-grid" style={{ display: 'grid', gridTemplateColumns: '1fr', marginBottom: '2rem' }}>
        <div className="chart-container glass-panel">
          <h3 style={{ margin: '0 0 1rem 0', color: 'var(--text-primary)' }}>Total Hours Worked by Employee</h3>
          <div style={{ height: '300px', width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" vertical={false} />
                <XAxis dataKey="name" stroke="var(--text-muted)" />
                <YAxis stroke="var(--text-muted)" />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-light)', borderRadius: '8px' }}
                  cursor={{ fill: 'var(--border-light)' }}
                  formatter={(value) => [`${value} hrs`, 'Hours Worked']}
                />
                <Bar dataKey="hours" fill="var(--accent-primary)" radius={[4, 4, 0, 0]} barSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="glass-panel" style={{ padding: '1.5rem', marginTop: '1.5rem' }}>
        <h3 style={{ margin: '0 0 1.25rem 0', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          Timesheet & Cash Drawer Reconciliation Log
        </h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', color: 'var(--text-primary)', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                <th style={{ padding: '1rem' }}>Employee</th>
                <th style={{ padding: '1rem' }}>Shift Start / End</th>
                <th style={{ padding: '1rem' }}>Starting Float</th>
                <th style={{ padding: '1rem' }}>Cash Sales</th>
                <th style={{ padding: '1rem' }}>Expected Ending</th>
                <th style={{ padding: '1rem' }}>Actual Drawer</th>
                <th style={{ padding: '1rem' }}>Discrepancy</th>
                <th style={{ padding: '1rem' }}>Status</th>
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

                // Color code the discrepancy badge
                let discrepancyColor = 'var(--text-primary)';
                let discrepancyBg = 'transparent';
                let statusText = 'Working...';
                let statusStyle = { background: 'rgba(245, 158, 11, 0.15)', color: 'var(--accent-warning)', padding: '0.25rem 0.5rem', borderRadius: '4px', fontWeight: 'bold' };

                if (log.clockOut) {
                  if (discrepancy === 0) {
                    discrepancyColor = 'var(--accent-success)';
                    discrepancyBg = 'rgba(16, 185, 129, 0.1)';
                    statusText = 'Balanced';
                    statusStyle = { background: 'rgba(16, 185, 129, 0.15)', color: 'var(--accent-success)', padding: '0.25rem 0.5rem', borderRadius: '4px', fontWeight: 'bold' };
                  } else if (discrepancy < 0) {
                    discrepancyColor = 'var(--accent-danger)';
                    discrepancyBg = 'rgba(244, 63, 94, 0.1)';
                    statusText = 'Shortage';
                    statusStyle = { background: 'rgba(244, 63, 94, 0.15)', color: 'var(--accent-danger)', padding: '0.25rem 0.5rem', borderRadius: '4px', fontWeight: 'bold' };
                  } else {
                    discrepancyColor = 'var(--accent-warning)';
                    discrepancyBg = 'rgba(251, 191, 36, 0.1)';
                    statusText = 'Overage';
                    statusStyle = { background: 'rgba(251, 191, 36, 0.15)', color: 'var(--accent-warning)', padding: '0.25rem 0.5rem', borderRadius: '4px', fontWeight: 'bold' };
                  }
                }

                return (
                  <tr key={log.id} style={{ borderBottom: '1px solid var(--border-light)', transition: 'background-color var(--transition-fast)' }} className="table-row-hover">
                    <td style={{ padding: '1rem', fontWeight: '600' }}>
                      {log.employeeId.split('@')[0]}
                      <span style={{ display: 'block', fontSize: '0.75rem', fontWeight: 'normal', color: 'var(--text-secondary)' }}>{log.employeeId}</span>
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <span style={{ fontWeight: '500' }}>{inDate}</span>
                      <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>to {outDate}</span>
                    </td>
                    <td style={{ padding: '1rem' }}>Rs. {startFloat.toFixed(2)}</td>
                    <td style={{ padding: '1rem' }}>Rs. {cashSales.toFixed(2)}</td>
                    <td style={{ padding: '1rem' }}>Rs. {expected.toFixed(2)}</td>
                    <td style={{ padding: '1rem', fontWeight: log.clockOut ? '600' : 'normal' }}>
                      {log.clockOut ? `Rs. ${actual.toFixed(2)}` : '—'}
                    </td>
                    <td style={{ padding: '1rem' }}>
                      {log.clockOut ? (
                        <span style={{ color: discrepancyColor, background: discrepancyBg, padding: '0.25rem 0.5rem', borderRadius: '4px', fontWeight: 'bold' }}>
                          Rs. {discrepancy.toFixed(2)}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <span style={statusStyle}>{statusText}</span>
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
