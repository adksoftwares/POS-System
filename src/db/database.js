import Dexie from 'dexie';

export const db = new Dexie('ADK_SmartPOS');

// We use string IDs (UUIDs) instead of ++id to prevent multi-device sync collisions
db.version(2).stores({
  products: 'id, name, barcode, category', 
  transactions: 'receiptId, timestamp, paymentMethod',
  attendance_logs: 'id, employeeId, clockIn',
  suppliers: 'id, name, email',
  purchase_orders: 'id, supplierId, timestamp, status'
});
