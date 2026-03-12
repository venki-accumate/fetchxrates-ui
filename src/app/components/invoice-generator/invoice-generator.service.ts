import { Injectable } from '@angular/core';
import jsPDF from 'jspdf';
import { InvoiceRecord } from '../../services/fetchXR-api.service';

export type InvoicePdfOptions = {
  companyName?: string;
  companyCountry?: string;
  companyAddressLines?: string[];
  logoPath?: string | null;
  outputFileName?: string;
  receiptNumber?: string | null;
};

@Injectable({ providedIn: 'root' })
export class InvoiceGeneratorService {

  async download(record: InvoiceRecord, options: InvoicePdfOptions = {}): Promise<void> {
    const companyName        = options.companyName        ?? 'Fintomate Pty Ltd';
    const companyCountry     = options.companyCountry     ?? 'Australia';
    const companyAddressLines = options.companyAddressLines ?? [];
    const receiptNumber      = options.receiptNumber      ?? record.id;
    const outputFileName     = options.outputFileName
      ?? `${record.invoiceNumber || 'receipt'}.pdf`;

    const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });

    const pageWidth    = doc.internal.pageSize.getWidth();
    const left         = 36;
    const right        = pageWidth - 36;
    const contentWidth = right - left;

    const paidDate   = this.formatDate(record.created);
    const periodText = this.formatPeriod(record.periodStart, record.periodEnd);
    const amountText = this.formatMoney(record.amountPaid, record.currency);

    let y = 34;

    // ── Logo + title row ──────────────────────────────────────────────────
    if (options.logoPath) {
      try {
        const logoData = await this.loadImageAsDataUrl(options.logoPath);
        doc.addImage(logoData, 'PNG', left, y - 4, 42, 42);
      } catch { /* logo load failure is non-fatal */ }
    }

    const titleX = left + (options.logoPath ? 54 : 0);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(26);
    doc.setTextColor(0, 0, 0);
    doc.text('Receipt', titleX, y + 10);

    doc.setFontSize(22);
    doc.setTextColor(120, 120, 120);
    doc.text(companyName, right, y + 10, { align: 'right' });

    // ── Invoice meta ──────────────────────────────────────────────────────
    y = 110;
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);

    const labelX = left;
    const valueX = left + 140;

    const metaRows: Array<{ label: string; value: string; bold?: boolean }> = [
      { label: 'Invoice number', value: record.invoiceNumber || '-', bold: true },
      { label: 'Receipt number', value: receiptNumber || '-' },
      { label: 'Date paid',      value: paidDate },
    ];

    for (const row of metaRows) {
      doc.setFont('helvetica', 'bold');
      doc.text(row.label, labelX, y);
      doc.setFont('helvetica', row.bold ? 'bold' : 'normal');
      doc.text(row.value, valueX, y);
      y += 24;
    }

    // ── From / Bill-to columns ────────────────────────────────────────────
    y += 34;
    const col1X = left;
    const col2X = left + contentWidth * 0.40;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(companyName, col1X, y);
    doc.text('Bill to', col2X, y);
    y += 26;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12);

    let leftY = y;
    doc.text(companyCountry, col1X, leftY);
    leftY += 20;
    for (const line of companyAddressLines) {
      doc.text(line, col1X, leftY);
      leftY += 18;
    }

    let rightY = y;
    if (record.customerName) { doc.text(record.customerName,  col2X, rightY); rightY += 20; }
    doc.text(companyCountry, col2X, rightY); rightY += 20;
    if (record.customerEmail) { doc.text(record.customerEmail, col2X, rightY); rightY += 20; }

    // ── Payment headline ──────────────────────────────────────────────────
    y = Math.max(leftY, rightY) + 50;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.text(`${amountText} paid on ${paidDate}`, left, y);

    // ── Line-item table header ────────────────────────────────────────────
    y += 70;
    const descX      = left;
    const qtyX       = right - 260;
    const unitPriceX = right - 130;
    const amountX    = right;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12);
    doc.text('Description', descX, y);
    doc.text('Qty',        qtyX,       y, { align: 'right' });
    doc.text('Unit price', unitPriceX, y, { align: 'right' });
    doc.text('Amount',     amountX,    y, { align: 'right' });

    y += 16;
    doc.setDrawColor(60, 60, 60);
    doc.setLineWidth(0.8);
    doc.line(left, y, right, y);
    y += 28;

    // ── Line item ─────────────────────────────────────────────────────────
    doc.setFontSize(15);
    doc.setFont('helvetica', 'normal');

    const descLines      = this.buildDescriptionLines(record.description, periodText);
    const lineHeight     = 22;

    descLines.forEach((line, i) => doc.text(line, descX, y + i * lineHeight));
    doc.text('1',        qtyX,       y, { align: 'right' });
    doc.text(amountText, unitPriceX, y, { align: 'right' });
    doc.text(amountText, amountX,    y, { align: 'right' });

    y += Math.max(descLines.length * lineHeight, 60) + 36;

    // ── Summary block ─────────────────────────────────────────────────────
    const summaryLeft  = right - 310;
    const rowH         = 26;

    const summaryRows: Array<{ label: string; bold: boolean }> = [
      { label: 'Subtotal',     bold: false },
      { label: 'Total',        bold: false },
      { label: 'Amount paid',  bold: true  },
    ];

    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.8);

    summaryRows.forEach((_, i) => {
      doc.line(summaryLeft, y + i * rowH, right, y + i * rowH);
    });

    summaryRows.forEach((row, i) => {
      const rowY = y + 18 + i * rowH;
      doc.setFont('helvetica', row.bold ? 'bold' : 'normal');
      doc.setFontSize(row.bold ? 15 : 14);
      doc.text(row.label, summaryLeft, rowY);
      doc.text(amountText, right, rowY, { align: 'right' });
    });

    doc.save(outputFileName);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private buildDescriptionLines(description: string | null, period: string | null): string[] {
    const lines: string[] = [description || 'Subscription'];
    if (period) lines.push(period);
    return lines;
  }

  private formatPeriod(start: string | null, end: string | null): string | null {
    if (!start || !end) return null;
    return `${this.formatShortDate(start)} – ${this.formatShortDate(end)}`;
  }

  private formatDate(value: string | null): string {
    if (!value) return '-';
    return new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
      .format(new Date(value));
  }

  private formatShortDate(value: string | null): string {
    if (!value) return '-';
    return new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
      .format(new Date(value));
  }

  private formatMoney(amount: number, currency: string): string {
    const ccy = (currency || 'AUD').toUpperCase();
    const formatted = new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: ccy,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format((amount || 0) / 100);   // Stripe amounts are in cents

    // Ensure AUD renders as A$ not just $
    if (ccy === 'AUD' && !formatted.startsWith('A$')) {
      return formatted.replace('$', 'A$');
    }
    return formatted;
  }

  private loadImageAsDataUrl(path: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width  = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('Canvas context unavailable')); return; }
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = reject;
      img.src = path;
    });
  }
}
