import Dexie from 'dexie';

export const db = new Dexie('ADK_SmartPOS');

// Offline-first IndexedDB schema setup with Dexie 4.x
db.version(3).stores({
  products: 'id, name, barcode, category, price, stock, batchNo', 
  transactions: 'receiptId, timestamp, paymentMethod, total, customerId, cashierId, syncStatus',
  attendance_logs: 'id, employeeId, clockIn',
  suppliers: 'id, name, email, phone',
  purchase_orders: 'id, supplierId, timestamp, status',
  customers: 'id, name, phone, email, loyaltyPoints',
  held_carts: 'id, label, timestamp',
  cash_drawers: 'id, cashierId, openTimestamp, closeTimestamp, status',
  sync_queue: 'id, action, entity, timestamp'
});
