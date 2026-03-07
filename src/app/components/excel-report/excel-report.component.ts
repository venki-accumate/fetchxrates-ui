import { Component, Input } from '@angular/core';
import * as ExcelJS from 'exceljs';
import { BorderStyle } from 'exceljs';

type ExcelPrimitive = string | number | boolean | Date | null | undefined;
type ExcelFormulaValue = { formula: string; result?: ExcelPrimitive };
type ExcelCellValue = ExcelPrimitive | ExcelFormulaValue;

export interface GenericExcelSheet {
  metadataHeader?: string[][];
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

  private readonly borderStyle: Partial<ExcelJS.Borders> = {
    top: { style: 'thin' as BorderStyle },
    left: { style: 'thin' as BorderStyle },
    bottom: { style: 'thin' as BorderStyle },
    right: { style: 'thin' as BorderStyle }
  };

  generateExcel(): void {
    const workbook = new ExcelJS.Workbook();

    Object.entries(this.workbookData).forEach(([sheetName, sheet]) => {
      const worksheet = workbook.addWorksheet(sheetName);
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
    });

    this.saveWorkbook(workbook);
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