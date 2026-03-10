import { Component, Input } from '@angular/core';
import * as ExcelJS from 'exceljs';
import { BorderStyle } from 'exceljs';

type ExcelPrimitive = string | number | boolean | Date | null | undefined;
type ExcelFormulaValue = { formula: string; result?: ExcelPrimitive };
type ExcelCellValue = ExcelPrimitive | ExcelFormulaValue;

// ─── Captured-style interfaces (populated when reading an uploaded Excel file) ──

export interface CellStyleCapture {
  font?:      Partial<ExcelJS.Font>;
  fill?:      ExcelJS.Fill;
  border?:    Partial<ExcelJS.Borders>;
  alignment?: Partial<ExcelJS.Alignment>;
  numFmt?:    string;
}

export interface RowStyleCapture {
  height?: number;
  cells:   (CellStyleCapture | null)[]; // 0-based column index
}

export interface SheetStyleCapture {
  rows:      RowStyleCapture[];           // 0-based row index (Excel row 1 = index 0)
  colWidths: (number | undefined)[];      // 0-based column index
  merges:    Array<{ s: { r: number; c: number }; e: { r: number; c: number } }>; // 0-based
}

// ────────────────────────────────────────────────────────────────────────────

export interface GenericExcelSheet {
  metadataHeader?: any[][];
  header: string[];
  data: Array<Record<string, ExcelCellValue> | ExcelCellValue[]>;
}

export interface GenericExcelWorkbook {
  [sheetName: string]: GenericExcelSheet;
}

@Component({
  selector: 'app-excel-report',
  templateUrl: './excel-report.component.html',
  styleUrls: ['./excel-report.component.scss'],
  standalone: true
})
export class ExcelReportComponent {
  @Input() workbookData: GenericExcelWorkbook = {};
  @Input() reportName = 'report';
  /** When provided, each sheet is written using the original file's captured styles
   *  instead of the generic Calibri / thin-border fallback styling. */
  @Input() sheetStyles?: Record<string, SheetStyleCapture>;

  private readonly borderStyle: Partial<ExcelJS.Borders> = {
    top: { style: 'thin' as BorderStyle },
    left: { style: 'thin' as BorderStyle },
    bottom: { style: 'thin' as BorderStyle },
    right: { style: 'thin' as BorderStyle }
  };

  generateExcel(): void {
    const workbook = new ExcelJS.Workbook();

    Object.entries(this.workbookData).forEach(([sheetName, sheet]) => {
      const worksheet  = workbook.addWorksheet(sheetName);
      const sheetStyle = this.sheetStyles?.[sheetName];
      if (sheetStyle) {
        this.writeSheetWithStyles(worksheet, sheet, sheetStyle);
      } else {
        this.writeGenericSheet(worksheet, sheet);
      }
    });

    this.saveWorkbook(workbook);
  }

  // ─── Styled path: preserves original file's formatting ──────────────────────

  private writeSheetWithStyles(
    worksheet:  ExcelJS.Worksheet,
    sheet:      GenericExcelSheet,
    sheetStyle: SheetStyleCapture
  ): void {
    const metadataRows = sheet.metadataHeader ?? [];
    const header       = sheet.header         ?? [];
    const data         = sheet.data           ?? [];
    const numCols      = header.length;

    if (!numCols) return;

    // ── 1. Column widths ──────────────────────────────────────────────────
    for (let c = 0; c < numCols; c++) {
      const col = worksheet.getColumn(c + 1);
      col.key   = header[c];
      const w   = sheetStyle.colWidths[c];
      col.width = w != null ? w : 15;
    }

    // ── 2. Rows ───────────────────────────────────────────────────────────
    //    Original 0-based row r  ↔  output 1-based row r+1.
    //    No extra blank-row gap is inserted so merge cell addresses stay valid.
    let currentRow = 1;

    // Metadata rows
    for (let k = 0; k < metadataRows.length; k++) {
      const exRow    = worksheet.getRow(currentRow);
      const styleRow = sheetStyle.rows[k];
      metadataRows[k].forEach((value, ci) => {
        const cell = exRow.getCell(ci + 1);
        cell.value = value ?? '';
        const cs   = styleRow?.cells[ci];
        if (cs) this.applyCellStyle(cell, cs);
      });
      if (styleRow?.height) exRow.height = styleRow.height;
      currentRow++;
    }

    // Header row
    const headerOrigIdx  = metadataRows.length; // 0-based position in original file
    const headerStyleRow = sheetStyle.rows[headerOrigIdx];
    const exHeaderRow    = worksheet.getRow(currentRow);
    header.forEach((col, ci) => {
      const cell = exHeaderRow.getCell(ci + 1);
      cell.value = col;
      const cs   = headerStyleRow?.cells[ci];
      if (cs) this.applyCellStyle(cell, cs);
    });
    if (headerStyleRow?.height) exHeaderRow.height = headerStyleRow.height;
    currentRow++;

    // Data rows
    data.forEach((entry, k) => {
      const exRow      = worksheet.getRow(currentRow);
      // Blank rows were filtered during import so indices may drift slightly for
      // large files, but data-area styles are typically uniform row-to-row.
      const origRowIdx = headerOrigIdx + 1 + k;
      const styleRow   = sheetStyle.rows[origRowIdx];
      const rowValues  = this.normalizeRow(entry, header);

      header.forEach((_col, ci) => {
        const cell  = exRow.getCell(ci + 1);
        const value = rowValues[ci];
        if (this.isFormulaValue(value)) {
          const result = value.result === null ? undefined : value.result as (string | number | boolean | Date | undefined);
          cell.value   = { formula: value.formula, result };
        } else {
          cell.value = value ?? '';
        }
        const cs = styleRow?.cells[ci];
        if (cs) this.applyCellStyle(cell, cs);
      });

      if (styleRow?.height) exRow.height = styleRow.height;
      currentRow++;
    });

    // ── 3. Merged cells ───────────────────────────────────────────────────
    const totalOutputRows = currentRow - 1;
    for (const merge of sheetStyle.merges) {
      const startRow = merge.s.r + 1; // 0-based → 1-based
      const endRow   = merge.e.r + 1;
      const startCol = merge.s.c + 1;
      const endCol   = merge.e.c + 1;
      if (startRow === endRow && startCol === endCol) continue; // single-cell, skip
      if (endRow > totalOutputRows || endCol > numCols) continue;
      try { worksheet.mergeCells(startRow, startCol, endRow, endCol); } catch { /* ignore overlapping merges */ }
    }
  }

  private applyCellStyle(cell: ExcelJS.Cell, style: CellStyleCapture): void {
    if (style.font) cell.font = style.font as ExcelJS.Font;

    // Only apply fill when it carries an explicit ARGB color.
    // ExcelJS reads fills from the workbook xf table which can include theme-relative
    // color references (e.g. fgColor: { theme: 6 }) that render as green/yellow in Excel
    // but are NOT visible in Numbers. Writing them to a new file makes them visible.
    if (style.fill) {
      const f = style.fill as any;
      if (f.type === 'gradient') {
        cell.fill = style.fill;
      } else if (f.type === 'pattern' && f.pattern === 'solid') {
        const argb: string | undefined = f.fgColor?.argb;
        const isTheme = f.fgColor?.theme !== undefined;
        // Skip theme-relative fills; skip fills with no explicit argb color
        if (argb && !isTheme) {
          cell.fill = style.fill;
        }
      }
      // 'none' pattern and theme-relative fills are intentionally skipped
    }

    // Only apply border when at least one side has an explicit style string.
    // Strip theme-relative colors from border sides (keep only the line style).
    if (style.border) {
      const b = style.border as any;
      const sides = ['top', 'left', 'bottom', 'right', 'diagonal'] as const;
      const cleanBorder: Partial<ExcelJS.Borders> = {};
      let hasSide = false;
      for (const side of sides) {
        const sv = b[side];
        if (sv?.style) {
          hasSide = true;
          const color = sv.color;
          // Keep explicit ARGB colors; drop theme-relative color references
          (cleanBorder as any)[side] = {
            style: sv.style,
            ...(color?.argb && !color.theme ? { color } : {})
          };
        }
      }
      if (hasSide) cell.border = cleanBorder as ExcelJS.Borders;
    }

    if (style.alignment) cell.alignment = style.alignment as ExcelJS.Alignment;
    if (style.numFmt)    cell.numFmt    = style.numFmt;
  }

  // ─── Generic path: Calibri / thin-border fallback styling ───────────────────

  private writeGenericSheet(worksheet: ExcelJS.Worksheet, sheet: GenericExcelSheet): void {
    const metadataRows = sheet.metadataHeader ?? [];
    const header = sheet.header ?? [];
    const data = sheet.data ?? [];

    if (!header.length) {
      return;
    }

    worksheet.columns = header.map((colName, index) => ({
      header: colName,
      key: colName,
      width: this.getColumnWidth(colName, index)
    }));

    let currentRow = 1;

    if (metadataRows.length) {
      metadataRows.forEach(line => {
        const row = worksheet.getRow(currentRow);
        line.forEach((value, index) => {
          const cell = row.getCell(index + 1);
          cell.value = value ?? '';
          cell.font = { bold: true, name: 'Calibri', size: 11 };
          cell.alignment = { vertical: 'middle', horizontal: index === 0 ? 'left' : 'left' };
        });
        row.height = 20;
        currentRow++;
      });

      currentRow++;
    }

    const headerRow = worksheet.getRow(currentRow);
    header.forEach((col, index) => {
      const cell = headerRow.getCell(index + 1);
      cell.value = col;
      cell.font = { bold: true, name: 'Calibri', size: 12 };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'DCE6F1' } };
      cell.border = this.borderStyle;
    });
    headerRow.height = 25;

    currentRow++;

    data.forEach(entry => {
      const row = worksheet.getRow(currentRow);
      const rowValues = this.normalizeRow(entry, header);

      header.forEach((col, index) => {
        const cell = row.getCell(index + 1);
        const value = rowValues[index];

        if (this.isFormulaValue(value)) {
          // ExcelJS formula result cannot be null; coerce to undefined
          const result = value.result === null ? undefined : value.result as (string | number | boolean | Date | undefined);
          cell.value = { formula: value.formula, result };
        } else {
          cell.value = value ?? '';
        }

        cell.font = { name: 'Calibri', size: 11 };
        cell.alignment = {
          vertical: 'middle',
          horizontal: index === 0 ? 'left' : this.getCellAlignment(value)
        };
        cell.border = this.borderStyle;
      });

      row.height = 22;
      currentRow++;
    });
  }

  private normalizeRow(
    entry: Record<string, ExcelCellValue> | ExcelCellValue[],
    header: string[]
  ): ExcelCellValue[] {
    if (Array.isArray(entry)) {
      return header.map((_, index) => entry[index]);
    }

    return header.map(col => entry[col]);
  }

  private isFormulaValue(value: ExcelCellValue): value is ExcelFormulaValue {
    return !!value && typeof value === 'object' && 'formula' in value;
  }

  private getCellAlignment(value: ExcelCellValue): 'left' | 'right' | 'center' {
    if (this.isFormulaValue(value)) {
      return typeof value.result === 'number' ? 'right' : 'left';
    }

    if (typeof value === 'number') {
      return 'right';
    }

    if (typeof value === 'boolean') {
      return 'center';
    }

    if (value instanceof Date) {
      return 'left';
    }

    return 'left';
  }

  private getColumnWidth(colName: string, index: number): number {
    if (index === 0) return 35;
    if (/date/i.test(colName)) return 18;
    if (/description|particular|remarks|notes|currency pair/i.test(colName)) return 28;
    return 15;
  }

  private saveWorkbook(workbook: ExcelJS.Workbook): void {
    workbook.xlsx.writeBuffer().then((buffer: ArrayBuffer) => {
      const blob = new Blob(
        [buffer],
        { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
      );
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${this.reportName}.xlsx`;
      anchor.click();
      window.URL.revokeObjectURL(url);
    });
  }
}