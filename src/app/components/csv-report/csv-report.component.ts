import { Component, Input } from '@angular/core';

type CsvPrimitive = string | number | boolean | Date | null | undefined;
type CsvFormulaValue = { formula: string; result?: CsvPrimitive };
type CsvCellValue = CsvPrimitive | CsvFormulaValue;

export interface GenericCsvSheet {
  metadataHeader?: string[][];
  header: string[];
  data: Array<Record<string, CsvCellValue> | CsvCellValue[]>;
}

export interface GenericCsvWorkbook {
  [sheetName: string]: GenericCsvSheet;
}

@Component({
  selector: 'app-csv-report',
  standalone: true,
  template: ''
})
export class CsvReportComponent {
  @Input() workbookData: GenericCsvWorkbook = {};
  @Input() reportName = 'report';

  generateCsvFiles(): void {
    Object.entries(this.workbookData).forEach(([sheetName, sheet]) => {
      if (!sheet?.header?.length) return;

      const rows: string[][] = [];

      if (sheet.metadataHeader?.length) {
        sheet.metadataHeader.forEach(line => {
          rows.push((line ?? []).map(value => this.stringifyCell(value)));
        });
        rows.push([]);
      }

      rows.push(sheet.header.map(value => this.escapeCsv(value)));

      (sheet.data ?? []).forEach(entry => {
        const normalized = this.normalizeRow(entry, sheet.header);
        rows.push(normalized.map(value => this.stringifyCell(value)));
      });

      const csvContent = rows.map(row => row.join(',')).join('\r\n');
      this.downloadCsv(csvContent, `${this.reportName}-${this.sanitizeFileName(sheetName)}.csv`);
    });
  }

  private normalizeRow(
    entry: Record<string, CsvCellValue> | CsvCellValue[],
    header: string[]
  ): CsvCellValue[] {
    if (Array.isArray(entry)) {
      return header.map((_, index) => entry[index]);
    }

    return header.map(col => entry[col]);
  }

  private stringifyCell(value: CsvCellValue): string {
    if (this.isFormulaValue(value)) {
      return this.escapeCsv(value.result ?? '');
    }

    if (value instanceof Date) {
      return this.escapeCsv(value.toISOString());
    }

    return this.escapeCsv(value ?? '');
  }

  private isFormulaValue(value: CsvCellValue): value is CsvFormulaValue {
    return !!value && typeof value === 'object' && 'formula' in value;
  }

  private escapeCsv(value: CsvPrimitive): string {
    const str = value == null ? '' : String(value);
    const escaped = str.replace(/"/g, '""');
    return /[",\r\n]/.test(escaped) ? `"${escaped}"` : escaped;
  }

  private sanitizeFileName(name: string): string {
    return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '-').trim();
  }

  private downloadCsv(content: string, fileName: string): void {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    window.URL.revokeObjectURL(url);
  }
}