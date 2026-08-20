// Hardware Thermal Printer & ESC/POS Receipt Printing Service

export class PrinterService {
  static formatCurrency(amount, currency = 'LKR') {
    return `${currency} ${Number(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  // Generates styled thermal receipt HTML for window printing
  static generateReceiptHTML(transaction, storeConfig = {}) {
    const {
      shopName = 'ADK SMART SUPERMART',
      address = '123 Commercial High St, Store #4',
      phone = '+94 77 123 4567',
      taxNumber = 'VAT-987654321',
      receiptFooter = 'Thank you for shopping with us! Returns valid for 7 days with original receipt.',
      currency = 'Rs.'
    } = storeConfig;

    const dateStr = transaction.timestamp 
      ? new Date(transaction.timestamp).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
      : new Date().toLocaleString();

    const itemsHTML = (transaction.items || []).map(item => `
      <tr>
        <td style="text-align: left; padding: 3px 0;">${item.name} x ${item.quantity}</td>
        <td style="text-align: right; padding: 3px 0;">${this.formatCurrency(item.price * item.quantity, currency)}</td>
      </tr>
    `).join('');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Receipt ${transaction.receiptId || ''}</title>
        <style>
          @page { size: 80mm auto; margin: 0; }
          body {
            font-family: 'Courier New', Courier, monospace;
            width: 78mm;
            margin: 0 auto;
            padding: 10px;
            font-size: 12px;
            line-height: 1.3;
            color: #000;
            background: #fff;
          }
          .header { text-align: center; margin-bottom: 10px; }
          .shop-title { font-size: 16px; font-weight: bold; text-transform: uppercase; }
          .sub-text { font-size: 10px; color: #333; }
          .divider { border-top: 1px dashed #000; margin: 8px 0; }
          .double-divider { border-top: 2px solid #000; margin: 8px 0; }
          table { width: 100%; border-collapse: collapse; margin: 5px 0; }
          .total-row { font-weight: bold; font-size: 14px; }
          .footer { text-align: center; font-size: 10px; margin-top: 15px; }
          .qr-placeholder { margin: 10px auto; text-align: center; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="shop-title">${shopName}</div>
          <div class="sub-text">${address}</div>
          <div class="sub-text">Tel: ${phone} | Tax ID: ${taxNumber}</div>
        </div>

        <div class="divider"></div>

        <div>
          <div><strong>Receipt #:</strong> ${transaction.receiptId || 'REC-0000'}</div>
          <div><strong>Date:</strong> ${dateStr}</div>
          <div><strong>Cashier:</strong> ${transaction.cashierName || 'Cashier 1'}</div>
          ${transaction.customerName ? `<div><strong>Customer:</strong> ${transaction.customerName}</div>` : ''}
          <div><strong>Pay Method:</strong> ${(transaction.paymentMethod || 'CASH').toUpperCase()}</div>
        </div>

        <div class="divider"></div>

        <table>
          <thead>
            <tr style="border-bottom: 1px solid #000;">
              <th style="text-align: left;">Item</th>
              <th style="text-align: right;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHTML}
          </tbody>
        </table>

        <div class="divider"></div>

        <table>
          <tr>
            <td>Subtotal:</td>
            <td style="text-align: right;">${this.formatCurrency(transaction.subtotal || transaction.total, currency)}</td>
          </tr>
          ${transaction.discount > 0 ? `
          <tr>
            <td>Discount:</td>
            <td style="text-align: right;">-${this.formatCurrency(transaction.discount, currency)}</td>
          </tr>` : ''}
          ${transaction.tax > 0 ? `
          <tr>
            <td>Tax / VAT:</td>
            <td style="text-align: right;">+${this.formatCurrency(transaction.tax, currency)}</td>
          </tr>` : ''}
          <tr class="total-row">
            <td style="padding-top: 5px;">TOTAL:</td>
            <td style="text-align: right; padding-top: 5px;">${this.formatCurrency(transaction.total, currency)}</td>
          </tr>
          ${transaction.cashReceived ? `
          <tr>
            <td>Cash Paid:</td>
            <td style="text-align: right;">${this.formatCurrency(transaction.cashReceived, currency)}</td>
          </tr>
          <tr>
            <td>Change:</td>
            <td style="text-align: right;">${this.formatCurrency(transaction.changeDue || 0, currency)}</td>
          </tr>` : ''}
        </table>

        <div class="double-divider"></div>

        <div class="footer">
          <div>${receiptFooter}</div>
          <div style="margin-top: 6px; font-weight: bold;">ADK SMART POS v2.0</div>
        </div>

        <script>
          window.onload = function() {
            window.print();
            setTimeout(function() { window.close(); }, 500);
          }
        </script>
      </body>
      </html>
    `;
  }

  // Execute direct window print of receipt
  static printReceipt(transaction, storeConfig = {}) {
    const printWindow = window.open('', '_blank', 'width=400,height=600');
    if (printWindow) {
      printWindow.document.write(this.generateReceiptHTML(transaction, storeConfig));
      printWindow.document.close();
    } else {
      console.error('Failed to open receipt print window. Check popup blocker settings.');
    }
  }
}
