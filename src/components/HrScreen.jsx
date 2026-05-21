import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';

export default function HrScreen() {
  const logs = useLiveQuery(() => db.attendance_logs.toArray(), []);

  return (
    <div style={{ padding: '2rem', overflowY: 'auto', height: '100%' }}>
      <h2 style={{ marginBottom: '2rem', color: 'var(--primary-navy)' }}>HR Timesheets</h2>
      <table className="inventory-table" style={{ background: 'white', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
        <thead>
          <tr>
            <th>Employee Email</th>
            <th>Clock In Time</th>
            <th>Clock Out Time</th>
            <th>Total Hours</th>
          </tr>
        </thead>
        <tbody>
          {logs?.map(log => {
            const inDate = new Date(log.clockIn).toLocaleString();
            const outDate = log.clockOut ? new Date(log.clockOut).toLocaleString() : 'Active Shift';
            let hours = '-';
            if (log.clockOut) {
              const diffMs = log.clockOut - log.clockIn;
              hours = (diffMs / (1000 * 60 * 60)).toFixed(2);
            }
            return (
              <tr key={log.id}>
                <td>{log.employeeId}</td>
                <td>{inDate}</td>
                <td>{outDate}</td>
                <td>{hours}</td>
              </tr>
            );
          })}
          {(!logs || logs.length === 0) && (
            <tr><td colSpan="4">No attendance records found.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
