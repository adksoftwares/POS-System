import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Share } from '@capacitor/share';
import { Filesystem, Directory } from '@capacitor/filesystem';

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
        
        <div style="font-size: 11px;">
          <div><b>Receipt #:</b> ${transaction.receiptId}</div>
          <div><b>Date:</b> ${dateStr}</div>
          <div><b>Cashier:</b> ${transaction.cashierName || 'Admin'}</div>
          <div><b>Pay Method:</b> ${transaction.paymentMethod}</div>
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

  // Generates PDF and opens native share dialog on Android
  static async generateAndSharePDF(transaction, storeConfig = {}) {
    try {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: [80, 200]
      });

      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text(storeConfig.shopName || 'ADK SUPERMART', 40, 10, { align: 'center' });
      
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text(storeConfig.address || 'Colombo, Sri Lanka', 40, 15, { align: 'center' });
      if (storeConfig.phone) {
        doc.text(storeConfig.phone, 40, 19, { align: 'center' });
      }
      
      doc.setLineDashPattern([1, 1], 0);
      doc.line(5, 23, 75, 23);
      doc.setLineDashPattern([], 0);

      doc.text(`Receipt #: ${transaction.receiptId}`, 5, 28);
      doc.text(`Date: ${new Date(transaction.timestamp || Date.now()).toLocaleString()}`, 5, 32);
      doc.text(`Cashier: ${transaction.cashierName || 'Admin'}`, 5, 36);
      doc.text(`Pay Method: ${transaction.paymentMethod || 'Cash'}`, 5, 40);

      const tableData = (transaction.items || []).map(item => [
        `${item.name}\nx ${item.quantity}`,
        this.formatCurrency(item.price * item.quantity, storeConfig.currency || 'Rs.')
      ]);

      autoTable(doc, {
        startY: 44,
        head: [['Item', 'Amount']],
        body: tableData,
        theme: 'plain',
        styles: { fontSize: 9, cellPadding: 1, font: 'helvetica' },
        columnStyles: {
          0: { cellWidth: 45 },
          1: { cellWidth: 25, halign: 'right' }
        },
        margin: { left: 5, right: 5 }
      });

      let finalY = doc.lastAutoTable.finalY + 5;
      
      doc.line(5, finalY, 75, finalY);
      finalY += 5;

      if (transaction.subtotal && transaction.discount) {
        doc.text("Subtotal:", 5, finalY);
        doc.text(this.formatCurrency(transaction.subtotal, storeConfig.currency || 'Rs.'), 75, finalY, { align: 'right' });
        finalY += 5;
        doc.text("Discount:", 5, finalY);
        doc.text(`-${this.formatCurrency(transaction.discount, storeConfig.currency || 'Rs.')}`, 75, finalY, { align: 'right' });
        finalY += 5;
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text("TOTAL:", 5, finalY);
      doc.text(this.formatCurrency(transaction.totalAmount || transaction.total, storeConfig.currency || 'Rs.'), 75, finalY, { align: 'right' });

      if (transaction.cashReceived) {
        finalY += 6;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.text("Cash Paid:", 5, finalY);
        doc.text(this.formatCurrency(transaction.cashReceived, storeConfig.currency || 'Rs.'), 75, finalY, { align: 'right' });
        
        finalY += 5;
        doc.text("Change:", 5, finalY);
        doc.text(this.formatCurrency(transaction.changeDue || 0, storeConfig.currency || 'Rs.'), 75, finalY, { align: 'right' });
      }

      finalY += 10;
      doc.setFontSize(8);
      const footerMsg = storeConfig.receiptFooter || "Thank you for shopping!";
      const splitFooter = doc.splitTextToSize(footerMsg, 70);
      doc.text(splitFooter, 40, finalY, { align: 'center' });

      const pdfBase64 = doc.output('datauristring').split(',')[1];
      const fileName = `${transaction.receiptId}.pdf`;

      const savedFile = await Filesystem.writeFile({
        path: fileName,
        data: pdfBase64,
        directory: Directory.Cache
      });

      await Share.share({
        title: 'Share Receipt',
        text: `Receipt from ${storeConfig.shopName || 'ADK Supermart'}`,
        url: savedFile.uri,
        dialogTitle: 'Share Receipt PDF'
      });
    } catch (err) {
      console.error("PDF Generation/Sharing failed:", err);
      alert("Failed to generate PDF: " + err.message);
    }
  }

  // Execute direct window print of receipt or Native PDF Share on Android
  static async printReceipt(transaction, storeConfig = {}) {
    const isAndroid = /android/i.test(navigator.userAgent);
    
    if (isAndroid) {
      await this.generateAndSharePDF(transaction, storeConfig);
      return;
    }

    // Fallback to desktop window print
    const printWindow = window.open('', '_blank', 'width=400,height=600');
    if (printWindow) {
      printWindow.document.write(this.generateReceiptHTML(transaction, storeConfig));
      printWindow.document.close();
    } else {
      console.error('Failed to open receipt print window. Check popup blocker settings.');
    }
  }
}
