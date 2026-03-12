import { Injectable } from '@angular/core';
import jsPDF from 'jspdf';
import { InvoiceRecord } from '../../services/fetchXR-api.service';

export type InvoicePdfOptions = {
  companyName?: string;
  companyCountry?: string;
  companyAddressLines?: string[];
  /** Path to logo image served from the Angular app root (e.g. '/logoDigital.png'). Defaults to '/logoDigital.png'. */
  logoPath?: string | null;
  outputFileName?: string;
  receiptNumber?: string | null;
};

// Brand palette (matches CSS custom properties in the app)
const ACCENT      = { r: 99,  g: 102, b: 241 } as const;  // #6366f1
const GREEN       = { r: 34,  g: 183, b: 27  } as const;  // #22b71b  (--success)
const GREEN_BG    = { r: 240, g: 253, b: 240 } as const;  // very light green
const TEXT_DARK   = { r: 15,  g: 23,  b: 42  } as const;  // #0f172a
const TEXT_MID    = { r: 71,  g: 85,  b: 105 } as const;  // #475569
const TEXT_MUTED  = { r: 148, g: 163, b: 184 } as const;  // #94a3b8
const BORDER_CLR  = { r: 226, g: 232, b: 240 } as const;  // #e2e8f0
const BG_LIGHT    = { r: 248, g: 250, b: 252 } as const;  // #f8fafc

@Injectable({ providedIn: 'root' })
export class InvoiceGeneratorService {

  async download(record: InvoiceRecord, options: InvoicePdfOptions = {}): Promise<void> {
    const companyName         = options.companyName         ?? 'Fintomate Pty Ltd';
    const companyCountry      = options.companyCountry      ?? 'Australia';
    const companyAddressLines = options.companyAddressLines ?? [];
    const receiptNumber       = options.receiptNumber       ?? record.id;
    const outputFileName      = options.outputFileName
      ?? `${record.invoiceNumber || 'receipt'}.pdf`;
    // Default logo to the app's own public asset
    const logoPath = options.logoPath !== undefined ? options.logoPath : '/titleLogo.png';

    const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });

    const pageW   = doc.internal.pageSize.getWidth();
    const pageH   = doc.internal.pageSize.getHeight();
    const left    = 44;
    const right   = pageW - 44;
    const cw      = right - left;   // content width

    const paidDate   = this.formatDate(record.created);
    const periodText = this.formatPeriod(record.periodStart, record.periodEnd);
    const amountText = this.formatMoney(record.amountPaid, record.currency);

    // ── 1. Top accent strip ───────────────────────────────────────────────
    this.setFill(doc, GREEN);
    doc.rect(0, 0, pageW, 7, 'F');

    // ── 2. Header band (logo left | company right, "Tax Invoice" below logo) ─
    const LOGO_H = 36;
    const LOGO_W = 130;
    const logoY  = 20;

    // Try to load logo
    let logoLoaded = false;
    if (logoPath) {
      try {
        const logoData = await this.loadImageAsDataUrl(logoPath);
        doc.addImage(logoData, 'PNG', left, logoY, LOGO_W, LOGO_H);
        logoLoaded = true;
      } catch { /* non-fatal */ }
    }

    // "Tax Invoice" label — sits below the logo
    const titleY = logoY + LOGO_H + 18;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(18);
    this.setTextColor(doc, TEXT_DARK);
    doc.text('Tax Invoice', left, titleY);

    // Company name + country (right-aligned, vertically centred with logo)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    this.setTextColor(doc, TEXT_MID);
    doc.text(companyName, right, logoY + 20, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    this.setTextColor(doc, TEXT_MUTED);
    doc.text(companyCountry, right, logoY + 36, { align: 'right' });
    let headerBottom = titleY + 14;
    for (let i = 0; i < companyAddressLines.length; i++) {
      doc.text(companyAddressLines[i], right, logoY + 52 + i * 14, { align: 'right' });
      headerBottom = Math.max(headerBottom, logoY + 62 + i * 14);
    }

    // ── 3. Thin green divider ─────────────────────────────────────────────
    let y = headerBottom + 10;
    this.setDraw(doc, GREEN);
    doc.setLineWidth(1.2);
    doc.line(left, y, right, y);
    y += 24;

    // ── 4. Invoice meta (3 rows) ──────────────────────────────────────────
    const labelX = left;
    const valueX = left + 148;

    const metaRows = [
      { label: 'Invoice number', value: record.invoiceNumber || '-', valueBold: true  },
      { label: 'Date paid',      value: paidDate,                    valueBold: false },
    ];

    for (const row of metaRows) {
      // Green left accent bar per row
      this.setFill(doc, GREEN);
      doc.rect(labelX, y - 10, 3, 14, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      this.setTextColor(doc, TEXT_MID);
      doc.text(row.label, labelX + 10, y);

      doc.setFont('helvetica', row.valueBold ? 'bold' : 'normal');
      doc.setFontSize(11);
      this.setTextColor(doc, TEXT_DARK);
      doc.text(row.value, valueX, y);
      y += 24;
    }

    y += 20;

    // ── 5. From / Bill-to cards ───────────────────────────────────────────
    const col2X       = left + cw * 0.42;
    const cardPad     = 12;
    const cardTopY    = y;
    const cardH       = 82;

    // Left card background — green-tinted border
    this.setFill(doc, BG_LIGHT);
    this.setDraw(doc, GREEN);
    doc.setLineWidth(0.8);
    doc.roundedRect(left, cardTopY, cw * 0.38, cardH, 5, 5, 'FD');
    // Green top accent line on left card
    this.setFill(doc, GREEN);
    doc.roundedRect(left, cardTopY, cw * 0.38, 4, 5, 5, 'F');
    doc.rect(left, cardTopY + 2, cw * 0.38, 2, 'F'); // flush bottom of pill

    // Right card background — green-tinted border
    this.setFill(doc, BG_LIGHT);
    this.setDraw(doc, GREEN);
    doc.roundedRect(col2X, cardTopY, right - col2X, cardH, 5, 5, 'FD');
    // Green top accent line on right card
    this.setFill(doc, GREEN);
    doc.roundedRect(col2X, cardTopY, right - col2X, 4, 5, 5, 'F');
    doc.rect(col2X, cardTopY + 2, right - col2X, 2, 'F');

    // Left card content
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    this.setTextColor(doc, GREEN);
    doc.text('FROM', left + cardPad, cardTopY + 18);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    this.setTextColor(doc, TEXT_DARK);
    doc.text(companyName, left + cardPad, cardTopY + 35);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    this.setTextColor(doc, TEXT_MID);
    doc.text(companyCountry, left + cardPad, cardTopY + 51);
    for (let i = 0; i < companyAddressLines.length; i++) {
      doc.text(companyAddressLines[i], left + cardPad, cardTopY + 65 + i * 14);
    }

    // Right card content
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    this.setTextColor(doc, GREEN);
    doc.text('BILL TO', col2X + cardPad, cardTopY + 18);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    this.setTextColor(doc, TEXT_DARK);
    let billY = cardTopY + 35;
    if (record.customerName) {
      doc.text(record.customerName, col2X + cardPad, billY);
      billY += 16;
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    this.setTextColor(doc, TEXT_MID);
    doc.text(companyCountry, col2X + cardPad, billY);
    billY += 15;
    if (record.customerEmail) {
      doc.text(record.customerEmail, col2X + cardPad, billY);
    }

    y = cardTopY + cardH + 32;

    // ── 6. Payment headline ───────────────────────────────────────────────
    // Light green pill background
    this.setFill(doc, GREEN_BG);
    this.setDraw(doc, GREEN);
    doc.setLineWidth(0.6);
    doc.roundedRect(left, y - 18, cw, 34, 6, 6, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    this.setTextColor(doc, TEXT_DARK);
    doc.text(`${amountText} paid on ${paidDate}`, left + 14, y + 4);

    y += 34;

    // ── 7. Line-item table header ─────────────────────────────────────────
    y += 16;
    const descX      = left;
    const qtyX       = right - 248;
    const unitPX     = right - 124;
    const amtX       = right;
    const tableRowH  = 36;

    // Table header band — green
    this.setFill(doc, GREEN);
    doc.roundedRect(left, y, cw, 28, 4, 4, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    const thY = y + 18;
    doc.text('Description', descX + 8, thY);
    doc.text('Qty',        qtyX,  thY, { align: 'right' });
    doc.text('Unit price', unitPX, thY, { align: 'right' });
    doc.text('Amount',     amtX,   thY, { align: 'right' });

    y += 28;

    // ── 8. Line item row ──────────────────────────────────────────────────
    // Zebra row background
    this.setFill(doc, BG_LIGHT);
    this.setDraw(doc, BORDER_CLR);
    doc.setLineWidth(0.5);
    doc.rect(left, y, cw, tableRowH + 8, 'FD');

    const descLines  = this.buildDescriptionLines(record.description, periodText);
    const lineH      = 16;
    const rowTextY   = y + 16;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    this.setTextColor(doc, TEXT_DARK);
    descLines.forEach((line, i) => doc.text(line, descX + 8, rowTextY + i * lineH));

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    this.setTextColor(doc, TEXT_MID);
    doc.text('1',        qtyX,  rowTextY, { align: 'right' });
    this.setTextColor(doc, TEXT_DARK);
    doc.text(amountText, unitPX, rowTextY, { align: 'right' });
    doc.text(amountText, amtX,   rowTextY, { align: 'right' });

    y += tableRowH + 8 + 24;

    // ── 9. Summary block ──────────────────────────────────────────────────
    const sumLeft = right - 260;
    const sumRowH = 28;

    const summaryRows: Array<{ label: string; bold: boolean; accent?: boolean }> = [
      { label: 'Subtotal',    bold: false },
      { label: 'Total',       bold: false },
      { label: 'Amount paid', bold: true,  accent: true },
    ];

    summaryRows.forEach((row, i) => {
      const ry = y + i * sumRowH;

      if (row.accent) {
        // Highlight row — light green
        this.setFill(doc, GREEN_BG);
        doc.roundedRect(sumLeft - 8, ry - 4, right - sumLeft + 16, sumRowH, 4, 4, 'F');
      }

      // Top divider for every row
      this.setDraw(doc, BORDER_CLR);
      doc.setLineWidth(0.5);
      doc.line(sumLeft - 8, ry - 4, right + 8, ry - 4);

      doc.setFont('helvetica', row.bold ? 'bold' : 'normal');
      doc.setFontSize(row.bold ? 12 : 11);
      this.setTextColor(doc, row.accent ? GREEN : TEXT_MID);
      doc.text(row.label, sumLeft, ry + 16);
      doc.text(amountText, right, ry + 16, { align: 'right' });
    });

    // ── 10. Footer ────────────────────────────────────────────────────────
    this.setFill(doc, GREEN);
    doc.rect(0, pageH - 6, pageW, 6, 'F');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    this.setTextColor(doc, TEXT_MUTED);
    doc.text('Thank you for your business.', pageW / 2, pageH - 16, { align: 'center' });

    doc.save(outputFileName);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private setFill(doc: jsPDF, c: { r: number; g: number; b: number }): void {
    doc.setFillColor(c.r, c.g, c.b);
  }

  private setDraw(doc: jsPDF, c: { r: number; g: number; b: number }): void {
    doc.setDrawColor(c.r, c.g, c.b);
  }

  private setTextColor(doc: jsPDF, c: { r: number; g: number; b: number }): void {
    doc.setTextColor(c.r, c.g, c.b);
  }

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
