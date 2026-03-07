import { Component, Input } from '@angular/core';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

type PdfPrimitive = string | number | boolean | Date | null | undefined;
type PdfFormulaValue = { formula: string; result?: PdfPrimitive };
type PdfCellValue = PdfPrimitive | PdfFormulaValue;

export interface GenericPdfSheet {
  metadataHeader?: string[][];
  header: string[];
  data: Array<Record<string, PdfCellValue> | PdfCellValue[]>;
}

export interface GenericPdfWorkbook {
  [sheetName: string]: GenericPdfSheet;
}

@Component({
  selector: 'app-generic-pdf-report',
  standalone: true,
  template: ''
})
export class PdfReportComponent {
  @Input() workbookData: GenericPdfWorkbook = {};
  @Input() reportName = 'report';

  generatePdf(): void {
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'pt',
      format: 'a4'
    });

    const entries = Object.entries(this.workbookData).filter(([, sheet]) => sheet?.header?.length);

    entries.forEach(([sheetName, sheet], index) => {
      if (index > 0) {
        doc.addPage();
      }

      const pageWidth = doc.internal.pageSize.getWidth();
      const marginLeft = 40;
      const marginTop = 36;
      const contentWidth = pageWidth - 80;

      let y = marginTop;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.text(sheetName, marginLeft, y);
      y += 18;

      /*if (sheet.metadataHeader?.length) {
        doc.setFontSize(10);

        sheet.metadataHeader.forEach(line => {
          const lineText = (line ?? [])
            .map(value => this.toDisplayValue(value))
            .filter(Boolean)
            .join('    ');
          if (!lineText) return;

          doc.setFont('helvetica', 'bold');
          const wrapped = doc.splitTextToSize(lineText, contentWidth);
          doc.text(wrapped, marginLeft, y);
          y += wrapped.length * 12;
        });

        y += 8;
      }*/

      const body = (sheet.data ?? []).map(entry =>
        this.normalizeRow(entry, sheet.header).map(value => this.toDisplayValue(value))
      );

      autoTable(doc, {
        startY: y,
        head: [sheet.header],
        body,
        margin: { left: 40, right: 40 },
        styles: {
          font: 'helvetica',
          fontSize: 9,
          cellPadding: 6,
          lineColor: [191, 191, 191],
          lineWidth: 0.5,
          valign: 'middle',
          overflow: 'linebreak'
        },
        headStyles: {
          fillColor: [220, 230, 241],
          textColor: [0, 0, 0],
          fontStyle: 'bold',
          halign: 'center'
        },
        bodyStyles: {
          textColor: [0, 0, 0]
        },
        alternateRowStyles: {
          fillColor: [248, 249, 250]
        },
        columnStyles: this.getColumnStyles(sheet.header),
        didParseCell: data => {
          if (data.section === 'body' && data.column.index === 0) {
            data.cell.styles.halign = 'left';
          }
        }
      });
    });

    doc.save(`${this.reportName}.pdf`);
  }

  private normalizeRow(
    entry: Record<string, PdfCellValue> | PdfCellValue[],
    header: string[]
  ): PdfCellValue[] {
    if (Array.isArray(entry)) {
      return header.map((_, index) => entry[index]);
    }

    return header.map(col => entry[col]);
  }

  private toDisplayValue(value: PdfCellValue): string {
    if (this.isFormulaValue(value)) {
      return this.formatPrimitive(value.result);
    }

    return this.formatPrimitive(value);
  }

  private formatPrimitive(value: PdfPrimitive): string {
    if (value == null) return '';
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
    return String(value);
  }

  private isFormulaValue(value: PdfCellValue): value is PdfFormulaValue {
    return !!value && typeof value === 'object' && 'formula' in value;
  }

  private getColumnStyles(header: string[]): Record<number, { cellWidth?: number; halign?: 'left' | 'right' | 'center' }> {
    const styles: Record<number, { cellWidth?: number; halign?: 'left' | 'right' | 'center' }> = {};

    header.forEach((col, index) => {
      if (index === 0) {
        styles[index] = { cellWidth: 140, halign: 'left' };
        return;
      }

      if (/date/i.test(col)) {
        styles[index] = { cellWidth: 85, halign: 'left' };
        return;
      }

      if (/description|particular|remarks|notes|currency pair/i.test(col)) {
        styles[index] = { cellWidth: 120, halign: 'left' };
        return;
      }

      styles[index] = { cellWidth: 'auto' as never, halign: 'right' };
    });

    return styles;
  }
}