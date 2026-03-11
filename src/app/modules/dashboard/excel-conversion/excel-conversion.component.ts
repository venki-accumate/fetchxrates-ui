import { Component, ViewChild, DoCheck, OnInit, OnDestroy, NgZone } from '@angular/core';
import { forkJoin } from 'rxjs';
import { FetchXRApiService, ExcelConversionRatesPayload } from '../../../services/fetchXR-api.service';
import { PageHelpService } from '../../../services/page-help.service';
import { CurrencyService } from '../../../services/currency.service';
import helpContent from './excel-conversion.help.json';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatTableModule } from '@angular/material/table';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CommonModule } from '@angular/common';
import { ButtonBarComponent } from '../../../components/button-bar/button-bar.component';
import { DataTableComponent } from '../../../components/data-table/data-table.component';
import { ExcelReportComponent, GenericExcelWorkbook } from '../../../components/excel-report/excel-report.component';
import { FormsModule } from '@angular/forms';
import * as ExcelJS from 'exceljs';
import * as fflate from 'fflate';
import {
  CellStyleCapture, RowStyleCapture, SheetStyleCapture
} from '../../../components/excel-report/excel-report.component';

interface ColumnAnalysis {
  columnIndex: number;
  columnName: string;
  dataType: 'number' | 'date' | 'text' | 'currency' | 'mixed';
  isAmountField: boolean;
  isDateField: boolean;
  samples: any[];
  currencySymbol?: string;
}

interface SheetData {
  sheetName: string;
  metadata: any[][];
  headerRowIndex: number;
  headers: string[];
  data: any[][];
  columnAnalysis: ColumnAnalysis[];
  /** 0-based original worksheet column index for each entry in headers[]. Used to
   *  map back to the right cell when writing converted values into the original workbook. */
  originalColumnIndices: number[];
}

interface ColumnMapping {
  columnName: string;
  type: 'none' | 'amount' | 'date';
  fromCurrency: string;
  toCurrency: string;
  dateRateType: 'monthly' | 'daily';
  exchangeRateOf: string;
}

@Component({
  selector: 'app-excel-conversion',
  standalone: true,
  templateUrl: './excel-conversion.component.html',
  styleUrl: './excel-conversion.component.scss',
  imports: [
    MatIconModule, MatButtonModule, MatTooltipModule,
    MatExpansionModule, MatTableModule, MatSelectModule,
    MatCheckboxModule, MatFormFieldModule, CommonModule, FormsModule,
    ButtonBarComponent, DataTableComponent, ExcelReportComponent
  ]
})
export class ExcelConversionComponent implements DoCheck, OnInit, OnDestroy {

  @ViewChild('excelReport') excelReport!: ExcelReportComponent;

  uploadFilesLength = 0;
  convertedData: SheetData[] = [];
  uploadError = false;
  buttonConfig = {
    left:  { label: 'Reset' },
    right: { label: 'Confirm & Convert', disabled: true }
  };

  private _canConvert = false;

  /** Rates returned by the API, keyed as "sheetName||from||to" */
  conversionRates: Record<string, Record<string, number>> = {};
  isConverting = false;
  /** Converted sheets produced after applying exchange rates to the original data */
  convertedSheets: SheetData[] = [];

  /** Raw per-cell styles captured from the uploaded Excel file, keyed by sheet name.
   *  Retained for potential generic export; not used by the download-original path. */
  uploadedFileStyles: Record<string, SheetStyleCapture> = {};
  /** Original file ArrayBuffer keyed by sheet name (all sheets in one workbook share the same buffer).
   *  Used by downloadConvertedExcel to load the original file and patch only the converted cells. */
  private originalFileBufferBySheet: Record<string, ArrayBuffer> = {};

  /** Unique target currencies across all converted amount columns, e.g. "HKD" or "HKD, USD" */
  get convertedToCurrencies(): string {
    const currencies = new Set<string>();
    for (const sheet of this.convertedData) {
      for (const m of (this.columnMappings[sheet.sheetName] ?? [])) {
        if (m.type === 'amount' && m.toCurrency) currencies.add(m.toCurrency);
      }
    }
    return [...currencies].join(', ');
  }

  constructor(
    private fetchXRApiService: FetchXRApiService,
    private ngZone: NgZone,
    private pageHelpService: PageHelpService,
    readonly currencyService: CurrencyService
  ) {}

  ngOnInit(): void {
    this.pageHelpService.registerHelp(helpContent as any);
  }

  ngOnDestroy(): void {
    this.pageHelpService.clearHelp();
  }

  ngDoCheck(): void {
    const next = this.computeCanConvert();
    if (next !== this._canConvert) {
      this._canConvert = next;
      // Replace object reference so OnPush ButtonBarComponent picks up the change
      this.buttonConfig = {
        left:  { label: 'Reset' },
        right: { label: 'Confirm & Convert', disabled: !next }
      };
    }
  }

  /** true = correct, false = incorrect (show selector), undefined = not yet decided */
  headerConfirmations: Record<string, boolean | null> = {};
  /** Selected candidate row index when user picks a different header row */
  pendingHeaderIndex: Record<string, number> = {};

  // ─── Column mapping state ───────────────────────────────────────────────
  /**
   * Per-sheet column mapping: sheetName → array of ColumnMapping (one per header column)
   */
  columnMappings: Record<string, ColumnMapping[]> = {};
  /** Single global "I confirm" checkbox — covers all sheets at once */
  allMappingsConfirmed = false;
  /** Memoised month-year periods extracted from sheet headers and metadata */
  private periodsCache: Record<string, string[]> = {};

  readonly MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  readonly TODAY  = new Date();

  /** Column name patterns that indicate an aggregate/summary row — not individually convertible */
  private readonly AGGREGATE_NAMES = /^(grand\s*total|sub\s*total|subtotal|total|sum|net\s*total|overall\s*total)$/i;

  /** Returns true if the column name looks like an aggregate (Total, Grand Total, etc.) */
  private isAggregateColumn(name: string): boolean {
    return this.AGGREGATE_NAMES.test(name.trim());
  }

  /** Build (or return cached) column mapping rows for a sheet */
  getColumnMappings(sheet: SheetData): ColumnMapping[] {
    if (!this.columnMappings[sheet.sheetName]) {
      const periods  = this.detectPeriods(sheet);
      const metaYear = this.extractYearFromMetadata(sheet);

      // First pass: build raw types
      const raw = sheet.columnAnalysis.map(col => ({
        col,
        isAmount: col.isAmountField,
        isDate:   col.isDateField,
        isAgg:    this.isAggregateColumn(col.columnName)
      }));

      // Count non-aggregate amount columns
      const nonAggAmountCount = raw.filter(r => r.isAmount && !r.isAgg).length;
      // If there are other real amount columns, treat aggregate columns as No Action
      const suppressAggregates = nonAggAmountCount > 0;

      this.columnMappings[sheet.sheetName] = raw.map(({ col, isAmount, isDate, isAgg }) => {
        // Try full "Mon YYYY" parse first, then plain month name + metadata year
        let headerPeriod = this.parseMonthYear(col.columnName);
        if (!headerPeriod) {
          const mo = this.parseMonthName(col.columnName);
          if (mo && metaYear) headerPeriod = `${mo} ${metaYear}`;
        }

        // Aggregate columns become "No Action" only when other amount columns exist
        const effectiveType: 'none' | 'amount' | 'date' =
          isDate  ? 'date'   :
          isAmount && !(isAgg && suppressAggregates) ? 'amount' :
          'none';

        return {
          columnName:     col.columnName,
          type:           effectiveType,
          fromCurrency:   '',
          toCurrency:     '',
          dateRateType:   'daily',
          exchangeRateOf: headerPeriod ?? (periods[0] ?? '')
        };
      });
    }
    return this.columnMappings[sheet.sheetName];
  }

  /** Called when type select changes — reset input fields */
  onMappingTypeChange(mapping: ColumnMapping): void {
    mapping.fromCurrency   = '';
    mapping.toCurrency     = '';
    mapping.dateRateType   = 'daily';
    mapping.exchangeRateOf = '';
  }

  /** Propagate a currency change to other amount columns — only on first selection,
   *  and only to rows that are still empty (never overwrite an existing choice). */
  onCurrencyChange(sheet: SheetData, m: ColumnMapping, field: 'from' | 'to', value: string): void {
    const wasEmpty = field === 'from' ? !m.fromCurrency : !m.toCurrency;

    // Update this row
    if (field === 'from') m.fromCurrency = value;
    else                  m.toCurrency   = value;

    // Propagate only if this was the first pick on this row
    if (wasEmpty) {
      this.getColumnMappings(sheet).forEach(row => {
        if (row === m || row.type !== 'amount') return;
        if (field === 'from' && !row.fromCurrency) row.fromCurrency = value;
        if (field === 'to'   && !row.toCurrency)   row.toCurrency   = value;
      });
    }
  }

  /** Returns true when every sheet is ready to convert */
  private computeCanConvert(): boolean {
    if (!this.convertedData.length) return false;
    if (!this.allMappingsConfirmed) return false;
    return this.convertedData.every(sheet => {
      // No-amount sheets need no header confirmation or mapping — always pass
      if (!this.hasAmountFields(sheet)) return true;
      if (this.headerConfirmations[sheet.sheetName] !== true) return false;
      const mappings = this.columnMappings[sheet.sheetName];
      if (!mappings) return false;
      const hasDateCol = !!this.getDateValueColumn(sheet);
      return mappings.filter(m => m.type === 'amount').every(m => {
        if (!m.fromCurrency || !m.toCurrency) return false;
        if (!hasDateCol && !(this.getPeriodMonth(m) && this.getPeriodYear(m))) return false;
        return true;
      });
    });
  }

  // ─── Period (month/year) picker helpers ───────────────────────────────────────────

  getPeriodMonth(m: ColumnMapping): string {
    return m.exchangeRateOf?.split(' ')[0] ?? '';
  }

  getPeriodYear(m: ColumnMapping): number | '' {
    const y = parseInt(m.exchangeRateOf?.split(' ')[1]);
    return isNaN(y) ? '' : y;
  }

  onPeriodChange(m: ColumnMapping, field: 'month' | 'year', value: string): void {
    const parts   = (m.exchangeRateOf ?? '').split(' ');
    const month   = field === 'month' ? value       : (parts[0] ?? '');
    const year    = field === 'year'  ? value.trim() : (parts[1] ?? '');
    m.exchangeRateOf = `${month} ${year}`.trim();
  }

  /** True when monthIdx (0-based) is in the future relative to the current month/year */
  isMonthDisabled(monthIdx: number, year: number | ''): boolean {
    if (!year) return false;
    return +year === this.TODAY.getFullYear() && monthIdx > this.TODAY.getMonth();
  }

  /** Convert display period "Jan 2024" → API period "01-2024" */
  private periodToMonthYear(period: string): string {
    if (!period) return '';
    const shorts = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const m = period.match(/^(\w{3})\s+(\d{4})$/);
    if (m) {
      const idx = shorts.indexOf(m[1]);
      if (idx !== -1) return `${String(idx + 1).padStart(2, '0')}-${m[2]}`;
    }
    return period;
  }

  // ─── Date column & period detection ─────────────────────────────────────────────

  /** Returns true when the sheet has at least one column flagged as an amount field */
  hasAmountFields(sheet: SheetData): boolean {
    return sheet.columnAnalysis.some(col => col.isAmountField);
  }

  /** Returns the name of the first date-value column (dataType === 'date'), or null */
  getDateValueColumn(sheet: SheetData): string | null {
    const col = sheet.columnAnalysis.find(c => c.isDateField && c.dataType === 'date');
    return col ? col.columnName : null;
  }

  /** Returns all month-year period strings detectable from column headers and metadata */
  detectPeriods(sheet: SheetData): string[] {
    if (this.periodsCache[sheet.sheetName]) return this.periodsCache[sheet.sheetName];
    const periods: string[] = [];
    const seen = new Set<string>();
    const add = (s: string) => {
      const n = s.trim(); if (n && !seen.has(n)) { seen.add(n); periods.push(n); }
    };

    // Year extracted from metadata (uses getMonthsInRange internally)
    const metaYear = this.extractYearFromMetadata(sheet);

    // Scan column headers
    for (const header of sheet.headers) {
      const p = this.parseMonthYear(header);
      if (p) {
        add(p);
      } else if (metaYear) {
        // Plain month name with year from metadata (e.g. header "January" + year 2024 → "Jan 2024")
        const mo = this.parseMonthName(header);
        if (mo) add(`${mo} ${metaYear}`);
      }
    }

    // Scan metadata rows — join each row and use getMonthsInRange.
    // Handles: "DD Mon YYYY - DD Mon YYYY", "01-05-2024 to 31-05-2024", "From ... To ..."
    for (const row of sheet.metadata) {
      const rowStr = row.filter(Boolean).map(String).join(' ');
      for (const p of this.getMonthsInRange(rowStr)) add(p);
    }

    this.periodsCache[sheet.sheetName] = periods;
    return periods;
  }

  /** Extracts the year from metadata by finding the first date range period via getMonthsInRange */
  private extractYearFromMetadata(sheet: SheetData): number | null {
    for (const row of sheet.metadata) {
      const rowStr = row.filter(Boolean).map(String).join(' ');
      const periods = this.getMonthsInRange(rowStr);
      if (periods.length) {
        const m = periods[0].match(/(\d{4})$/);
        if (m) return parseInt(m[1]);
      }
    }
    return null;
  }

  // ─── Ported from fintomate import.component.ts ─────────────────────────────────────────

  /**
   * Adapted from fintomate getMonthsAndYear — scans metadata rows for text date ranges.
   * Matches "DD Mon YYYY - DD Mon YYYY" in each cell value.
   * Returns [monthAbbreviations[], firstYear | null].
   */
  getMonthsAndYear(rows: any[][]): [string[], number | null] {
    const months: string[] = [];
    let year: number | null = null;
    for (const row of rows) {
      for (const cell of row) {
        try {
          const val = cell == null ? '' : String(cell);
          const match = val.match(/(\d{2})\s+(\w{3})\s+(\d{4})\s*[-–]\s*(\d{2})\s+(\w{3})\s+(\d{4})/);
          if (match) {
            const [, , startMonth, startYear] = match;
            if (!months.includes(startMonth)) months.push(startMonth);
            if (!year) year = parseInt(startYear);
          }
        } catch (e) {}
      }
    }
    return [months, year];
  }

  /**
   * Port of fintomate getMonthsInRange — finds every month-year period covered by a date range string.
   * Handles all of:
   *   "01-05-2024 to 31-05-2024"          (numeric DD-MM-YYYY)
   *   "01 Jan 2024 - 31 Jan 2024"         (text DD Mon YYYY)
   *   "From 01-01-2024 To 30-06-2024"     (numeric, multi-month)
   * Returns unique "Mon YYYY" strings for every month in the range.
   */
  getMonthsInRange(input: string): string[] {
    if (!input?.trim()) return [];
    const dateRegex = /(?:From\s+)?(\d{1,4}[\/\- ](?:\d{1,2}|[A-Za-z]{3,9})[\/\- ]\d{2,4})\s*(?:to|[-–])\s*(\d{1,4}[\/\- ](?:\d{1,2}|[A-Za-z]{3,9})[\/\- ]\d{2,4})/gi;
    const results: string[] = [];
    const seen = new Set<string>();
    let match: RegExpExecArray | null;
    while ((match = dateRegex.exec(input)) !== null) {
      const startDate = this.parseFlexibleDate(match[1]);
      const endDate   = this.parseFlexibleDate(match[2]);
      if (!startDate || !endDate) continue;
      const current = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
      const end     = new Date(endDate.getFullYear(),   endDate.getMonth(),   1);
      while (current <= end) {
        const label = `${current.toLocaleString('en', { month: 'short' })} ${current.getFullYear()}`;
        if (!seen.has(label)) { seen.add(label); results.push(label); }
        current.setMonth(current.getMonth() + 1);
      }
    }
    return results;
  }

  /**
   * Port of fintomate parseFlexibleDate.
   * Handles DD-MM-YYYY / DD/MM/YYYY (day-first, non-US), YYYY-MM-DD (ISO), DD MMM YYYY (text).
   */
  private parseFlexibleDate(dateStr: string): Date | null {
    const s = dateStr.trim();
    let m: RegExpMatchArray | null;
    // DD-MM-YYYY or DD/MM/YYYY — day-first interpretation
    m = s.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/);
    if (m) { const d = new Date(+m[3], +m[2] - 1, +m[1]); if (!isNaN(d.getTime())) return d; }
    // YYYY-MM-DD or YYYY/MM/DD (ISO)
    m = s.match(/^(\d{4})[\/\-](\d{2})[\/\-](\d{2})$/);
    if (m) { const d = new Date(+m[1], +m[2] - 1, +m[3]); if (!isNaN(d.getTime())) return d; }
    // DD MMM YYYY (e.g. "01 Jan 2024")
    m = s.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$/);
    if (m) { const d = new Date(`${m[2]} ${m[1]}, ${m[3]}`); if (!isNaN(d.getTime())) return d; }
    return null;
  }
  private parseMonthName(str: string): string | null {
    if (!str) return null;
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const shorts  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const s = str.trim().toLowerCase();
    for (let i = 0; i < months.length; i++) {
      if (s === months[i].toLowerCase() || s === shorts[i].toLowerCase()) return shorts[i];
    }
    return null;
  }

  private parseMonthYear(str: string): string | null {
    if (!str) return null;
    const s = str.trim();
    const M = 'Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?';

    // "Jan 2024", "January 2024", "Jan-2024", "Jan/2024"
    let m = s.match(new RegExp(`^(${M})[\\s\\-/]+(\\d{4})$`, 'i'));
    if (m) return `${this.shortMonth(m[1])} ${m[2]}`;

    // "Jan 24", "Jan-24", "Jan/24"
    m = s.match(new RegExp(`^(${M})[\\s\\-/]+(\\d{2})$`, 'i'));
    if (m) { const yr = parseInt(m[2]); return `${this.shortMonth(m[1])} ${yr < 50 ? 2000 + yr : 1900 + yr}`; }

    // "2024-01", "2024/01"
    m = s.match(/^(\d{4})[\-\/](\d{1,2})$/);
    if (m) {
      const yr = parseInt(m[1]), mo = parseInt(m[2]);
      if (mo >= 1 && mo <= 12) return `${new Date(yr, mo - 1, 1).toLocaleString('en', { month: 'short' })} ${yr}`;
    }

    // "01/2024", "01-2024"
    m = s.match(/^(\d{1,2})[\-\/](\d{4})$/);
    if (m) {
      const mo = parseInt(m[1]), yr = parseInt(m[2]);
      if (mo >= 1 && mo <= 12) return `${new Date(yr, mo - 1, 1).toLocaleString('en', { month: 'short' })} ${yr}`;
    }

    return null;
  }

  private shortMonth(m: string): string {
    const cap = m.charAt(0).toUpperCase() + m.slice(1).toLowerCase();
    const d = new Date(`${cap} 1, 2000`);
    return isNaN(d.getTime()) ? m.slice(0, 3) : d.toLocaleString('en', { month: 'short' });
  }

  /**
   * This method is called whenever a file is uploaded.
   */
  onFileChange(event: any, drag = false): void {
    const files: any = drag ? event.dataTransfer.files : event.target.files;
    
    // Validate file types
    const validFiles = Array.from(files).filter((file: any) => {
      const extension = file.name.split('.').pop()?.toLowerCase();
      return extension === 'xlsx' || extension === 'xls' || extension === 'csv';
    });

    if (validFiles.length !== files.length) {
      this.uploadError = true;
      setTimeout(() => this.uploadError = false, 3000);
      return;
    }

    this.uploadFilesLength += validFiles.length;
    validFiles.forEach((file: any) => this.fileDataToJSON(file));
  }

  getObjectKeys(obj: any): string[] {
    return Object.keys(obj);
  }

  /**
   * Process Excel/CSV file and extract all sheets with intelligent header detection
   */
  fileDataToJSON(file: any): void {
    const extension = file.name.split('.').pop()?.toLowerCase();
    
    if (extension === 'csv') {
      this.processCSVFile(file);
    } else {
      this.processExcelFile(file);
    }
  }

  /**
   * Process CSV file
   */
  private processCSVFile(file: any): void {
    const reader = new FileReader();

    reader.onload = (e: ProgressEvent<FileReader>) => {
      const text = e.target?.result as string;
      if (!text) return;

      const rows = this.parseCSV(text);
      if (rows.length === 0) return;

      const sheetData = this.processSheet(file.name.replace('.csv', ''), null, rows);
      this.convertedData.push(sheetData);
    };

    reader.readAsText(file);
  }

  /**
   * Process Excel file and extract all sheets using ExcelJS.
   * Also captures per-cell styles into this.uploadedFileStyles for later use.
   */
  private processExcelFile(file: File): void {
    const reader = new FileReader();

    reader.onload = async (e: ProgressEvent<FileReader>) => {
      const data = e.target?.result;
      if (!data) return;

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(data as ArrayBuffer);

      // After await, we're running outside Angular's zone (async/await continuation
      // is a microtask that Zone.js doesn't re-enter). Collect results in local
      // variables and commit them via ngZone.run() so change detection fires immediately.
      const processedSheets:  SheetData[]                       = [];
      const processedStyles:  Record<string, SheetStyleCapture> = {};
      const processedBuffers: Record<string, ArrayBuffer>        = {};

      for (const worksheet of workbook.worksheets) {
        const sheetName = worksheet.name;
        const lastRow   = worksheet.lastRow?.number ?? 0;
        const lastCol   = worksheet.columnCount   ?? 0;

        if (lastRow === 0 || lastCol === 0) continue;

        // ── 1. Capture column widths ───────────────────────────────────────
        const colWidths: (number | undefined)[] = [];
        for (let c = 1; c <= lastCol; c++) {
          colWidths[c - 1] = worksheet.getColumn(c).width;
        }

        // ── 2. Capture per-cell styles (all rows, before any filtering) ────
        const styleRows: RowStyleCapture[] = [];
        for (let r = 1; r <= lastRow; r++) {
          const exRow = worksheet.getRow(r);
          const cells: (CellStyleCapture | null)[] = [];

          for (let c = 1; c <= lastCol; c++) {
            const cell = exRow.getCell(c);
            const s    = cell.style;
            cells[c - 1] = (s && (s.font || s.fill || s.border || s.alignment || s.numFmt))
              ? {
                  font:      s.font      ? { ...s.font }      : undefined,
                  fill:      s.fill      ? { ...s.fill }      : undefined,
                  border:    s.border    ? { ...s.border }    : undefined,
                  alignment: s.alignment ? { ...s.alignment } : undefined,
                  numFmt:    s.numFmt    || undefined,
                }
              : null;
          }

          styleRows[r - 1] = { height: exRow.height, cells };
        }

        // ── 3. Parse merged-cell ranges ───────────────────────────────────
        //       Used by detectHeaderRow (title-row rejection) and stored in
        //       processedStyles so merged cells can be faithfully reproduced on export.
        const colLetterToIndex = (col: string): number =>
          col.split('').reduce((acc, ch) => acc * 26 + ch.charCodeAt(0) - 64, 0) - 1;

        const merges: Array<{ s: { r: number; c: number }; e: { r: number; c: number } }> = [];
        const worksheetMerges: string[] = (worksheet as any).model?.merges ?? [];
        for (const mergeStr of worksheetMerges) {
          const m = mergeStr.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
          if (m) {
            merges.push({
              s: { r: parseInt(m[2]) - 1, c: colLetterToIndex(m[1]) },
              e: { r: parseInt(m[4]) - 1, c: colLetterToIndex(m[3]) },
            });
          }
        }

        // Now that merges are known we can capture the complete style snapshot.
        processedStyles[sheetName] = { rows: styleRows, colWidths, merges };

        // ── 4. Build slave-cell index (0-based r,c) from merge ranges ─────────
        //       ExcelJS echoes the master cell's value for every cell in a merged
        //       range, so a title row like "PROFIT & LOSS REPORT" merged across all
        //       columns would appear full of identical strings and fool isStrictHeaderRow.
        //       We null out every slave position so merged rows look like a single
        //       populated cell followed by nulls — which the header detector correctly
        //       rejects (span < 3, or has gaps).
        const slaveCells = new Set<string>();
        for (const merge of merges) {
          for (let sr = merge.s.r; sr <= merge.e.r; sr++) {
            for (let sc = merge.s.c; sc <= merge.e.c; sc++) {
              if (sr !== merge.s.r || sc !== merge.s.c) {
                slaveCells.add(`${sr},${sc}`); // 0-based
              }
            }
          }
        }

        // ── 5. Extract row data (skip blank rows) ──────────────────────────
        const rows: any[][] = [];
        for (let r = 1; r <= lastRow; r++) {
          const exRow  = worksheet.getRow(r);
          const rowData: any[] = new Array(lastCol).fill(null);
          let hasValue = false;

          for (let c = 1; c <= lastCol; c++) {
            // Slave cells in merged ranges — treat as null so merged title rows
            // (e.g. report name spanning all columns) aren't mistaken for header rows.
            if (slaveCells.has(`${r - 1},${c - 1}`)) continue;

            const cell = exRow.getCell(c);
            let value: any = cell.value;

            // Unwrap formula → use cached result
            if (value !== null && typeof value === 'object' && 'result' in value) {
              value = (value as ExcelJS.CellFormulaValue).result ?? null;
            }
            // Unwrap rich-text → plain string
            if (value !== null && typeof value === 'object' && 'richText' in value) {
              value = (value as ExcelJS.CellRichTextValue).richText.map((rt: any) => rt.text).join('');
            }
            // Unwrap hyperlink → display text
            if (value !== null && typeof value === 'object' && 'text' in value && !('richText' in value)) {
              value = (value as any).text ?? null;
            }
            // Nullify error values
            if (value !== null && typeof value === 'object' && 'error' in value) {
              value = null;
            }

            rowData[c - 1] = value ?? null;
            if (value !== null && value !== undefined && value !== '') hasValue = true;
          }

          // Always push every row — including blank rows — so that row indices in
          // `rows` stay aligned with `styleRows` (both are 0-based from the sheet start).
          // Blank rows are preserved in sheet.data for faithful round-trip export, and
          // detectHeaderRow / analyzeColumns already skip/ignore all-null rows.
          rows.push(rowData);
        }

        // Trim trailing blank rows (they add no value and inflate the sheet).
        while (rows.length && rows[rows.length - 1].every((v: any) => v === null || v === undefined || v === '')) {
          rows.pop();
        }

        if (!rows.some(r => r.some((v: any) => v !== null && v !== undefined && v !== ''))) continue;

        const sheetData = this.processSheet(sheetName, merges, rows);
        processedSheets.push(sheetData);
        // All sheets in the same workbook share the same ArrayBuffer reference.
        processedBuffers[sheetName] = data as ArrayBuffer;
      }

      // Commit inside Angular's zone so change detection fires immediately.
      this.ngZone.run(() => {
        this.convertedData             = processedSheets;
        this.uploadedFileStyles         = processedStyles;
        // Merge rather than replace so multi-file uploads accumulate correctly.
        this.originalFileBufferBySheet = { ...this.originalFileBufferBySheet, ...processedBuffers };
      });
    };

    reader.readAsArrayBuffer(file);
  }


  /**
   * Parse CSV text into 2D array
   */
  private parseCSV(text: string): any[][] {
    const rows: any[][] = [];
    const lines = text.split(/\r?\n/);

    for (const line of lines) {
      if (line.trim() === '') continue;

      const row: any[] = [];
      let currentCell = '';
      let inQuotes = false;

      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const nextChar = line[i + 1];

        if (char === '"') {
          if (inQuotes && nextChar === '"') {
            currentCell += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (char === ',' && !inQuotes) {
          row.push(this.parseCSVCell(currentCell));
          currentCell = '';
        } else {
          currentCell += char;
        }
      }
      row.push(this.parseCSVCell(currentCell));
      rows.push(row);
    }

    return rows;
  }

  /**
   * Parse individual CSV cell value (detect numbers, dates, etc.)
   */
  private parseCSVCell(value: string): any {
    const trimmed = value.trim();
    
    if (trimmed === '') return null;

    // Try to parse as number
    const num = parseFloat(trimmed);
    if (!isNaN(num) && isFinite(num) && trimmed === num.toString()) {
      return num;
    }

    // Try to parse as date
    if (this.isDateString(trimmed)) {
      const date = new Date(trimmed);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }

    return trimmed;
  }

  /**
   * Process a single sheet: detect header, extract metadata, analyze columns.
   * @param merges Optional merged-cell ranges (from Excel) used for header detection.
   */
  private processSheet(
    sheetName: string,
    merges:    Array<{ s: { r: number; c: number }; e: { r: number; c: number } }> | null,
    rows:      any[][]
  ): SheetData {
    const headerRowIndex = this.detectHeaderRow(rows, merges ?? undefined);
    const metadata = rows.slice(0, headerRowIndex);
    const headers = this.extractHeaders(rows[headerRowIndex] || []);
    const data = rows.slice(headerRowIndex + 1);
    const columnAnalysis = this.analyzeColumns(headers, data);

    // Drop phantom columns: auto-named (Column_N) with zero data values.
    // Real named columns (e.g. "Ledger Code") are always kept even if all values happen to be empty.
    const phantomRe = /^Column_\d+$/;
    const keep = columnAnalysis
      .map((col, i) => ({ col, i }))
      .filter(({ col }) => !(phantomRe.test(col.columnName) && col.samples.length === 0))
      .map(({ i }) => i);

    return {
      sheetName,
      metadata,
      headerRowIndex,
      headers:               keep.map(i => headers[i]),
      data:                  data.map(row => keep.map(i => row[i] ?? null)),
      columnAnalysis:        keep.map(i => columnAnalysis[i]),
      // keep[j] is the 0-based column index in the original worksheet row for headers[j].
      originalColumnIndices: keep
    };
  }


  /**
   * Intelligently detect the header row
   * Logic: Find first row where all non-empty cells are text AND next row has data
   */
  private detectHeaderRow(
    rows:   any[][],
    merges?: Array<{ s: { r: number; c: number }; e: { r: number; c: number } }>
  ): number {
    const isBlank = (v: any) =>
      v == null || v === '' || (typeof v === 'string' && v.trim() === '');

    const isHeaderCell = (v: any) =>
      typeof v === 'string' && v.trim() !== ''; // strict: header cells must be strings

    const mergeList = merges ?? [];

    const maxMergeWidthForRow = (r: number) =>
      mergeList
        .filter(m => m.s.r === r)
        .reduce((max, m) => Math.max(max, m.e.c - m.s.c + 1), 1);

    const span = (row: any[]) => {
      const idx = row
        .map((v, i) => (isBlank(v) ? -1 : i))
        .filter(i => i !== -1);

      if (!idx.length) return null;
      return { start: idx[0], end: idx[idx.length - 1], width: idx[idx.length - 1] - idx[0] + 1 };
    };

    const isStrictHeaderRow = (row: any[]) => {
      const s = span(row);
      if (!s || s.width < 3) return null;

      const cells = row.slice(s.start, s.end + 1);
      if (cells.some(isBlank)) return null;                 // no gaps allowed
      if (!cells.every(isHeaderCell)) return null;          // all must be non-empty strings

      // Reject if 3+ cells share the same value.
      // Real header rows have unique column names; echoed merged-title rows (e.g. ExcelJS
      // duplicating a master cell across all slave columns) or repeated-value rows fail this.
      const valueCounts = new Map<string, number>();
      for (const cell of cells) {
        const key = String(cell).trim().toLowerCase();
        valueCounts.set(key, (valueCounts.get(key) ?? 0) + 1);
      }
      if ([...valueCounts.values()].some(count => count >= 3)) return null;

      return s;
    };

    // Primary check: rows immediately after candidate have numeric/Date/date-string values.
    // Also accepts "Mon-YYYY" / "Mon YYYY" style text dates (e.g. "Jan-1989") which ExcelJS
    // returns as plain strings rather than Date instances.
    // Look up to 3 rows ahead so a single blank separator row between header and data
    // (common in RBA / central-bank files) doesn't cause the primary scan to fail.
    const hasNumericOrDateSoon = (i: number) =>
      [1, 2, 3]
        .map(k => rows[i + k])
        .filter(Boolean)
        .some(r => r.some((v: any) =>
          typeof v === 'number' ||
          v instanceof Date ||
          (typeof v === 'string' && (this.isDateString(v) || !!this.parseMonthYear(v)))
        ));

    for (let i = 0; i < rows.length - 1; i++) {
      const s = isStrictHeaderRow(rows[i]);
      if (!s) continue;

      // reject merged/title row (big merge + tiny width)
      const mergeWidth = maxMergeWidthForRow(i);
      if (mergeWidth >= 3 && s.width <= 2) continue;

      if (!hasNumericOrDateSoon(i)) continue;

      return i;
    }

    // Secondary scan — no numeric/date-soon requirement.
    // Handles all-text datasets (lookup tables, reference sheets, etc.) where the data rows
    // contain only strings but the header row still has ≥3 unique string column names.
    // A candidate is accepted when ≥1 of the next 3 rows has at least ½ as many
    // filled cells as the header span (confirming structured data follows, not a prose block).
    for (let i = 0; i < rows.length - 1; i++) {
      const s = isStrictHeaderRow(rows[i]);
      if (!s) continue;

      const mergeWidth = maxMergeWidthForRow(i);
      if (mergeWidth >= 3 && s.width <= 2) continue;

      const threshold    = Math.max(2, Math.floor(s.width / 2));
      // Look up to 5 rows ahead so blank separator rows (now preserved) don't block detection.
      const nextRows     = [rows[i+1], rows[i+2], rows[i+3], rows[i+4], rows[i+5]].filter(Boolean);
      const qualifiedNext = nextRows.filter((r: any[]) =>
        r.filter((v: any) => !isBlank(v)).length >= threshold
      );

      if (qualifiedNext.length >= 1) return i;
    }

    return 0;
  }


  /**
   * Extract and clean header names
   */
  private extractHeaders(headerRow: any[]): string[] {
    return headerRow.map((cell, index) => {
      if (cell === null || cell === undefined || cell === '') {
        return `Column_${index + 1}`;
      }
      return String(cell).trim();
    });
  }

  /**
   * Analyze each column to determine data type and identify amount/date fields
   */
  private analyzeColumns(headers: string[], data: any[][]): ColumnAnalysis[] {
    const analyses: ColumnAnalysis[] = [];

    for (let colIndex = 0; colIndex < headers.length; colIndex++) {
      const columnValues = data
        .map(row => row[colIndex])
        .filter(val => val !== null && val !== undefined && val !== '');

      if (columnValues.length === 0) {
        analyses.push({
          columnIndex: colIndex,
          columnName: headers[colIndex],
          dataType: 'text',
          isAmountField: false,
          isDateField: false,
          samples: []
        });
        continue;
      }

      const samples = columnValues.slice(0, 5);
      const analysis = this.detectColumnType(columnValues, headers[colIndex]);

      analyses.push({
        columnIndex: colIndex,
        columnName: headers[colIndex],
        dataType: analysis.dataType,
        isAmountField: analysis.isAmountField,
        isDateField: analysis.isDateField,
        samples,
        currencySymbol: analysis.currencySymbol
      });
    }

    return analyses;
  }

  /**
   * Detect column data type and identify amount/date fields.
   * Amount: flagged when values contain currency symbols, comma-formatted numbers
   *         (e.g. 1,234.56), or decimal numbers — regardless of column name.
   * Date:   flagged when values parse as dates OR column name itself is a valid date.
   */
  private detectColumnType(values: any[], columnName: string): {
    dataType: 'number' | 'date' | 'text' | 'currency' | 'mixed';
    isAmountField: boolean;
    isDateField: boolean;
    currencySymbol?: string;
  } {
    let numberCount = 0;
    let dateCount = 0;
    let textCount = 0;
    let currencyCount = 0;
    let commaNumberCount = 0;  // strings like "1,234" or "1,234.56"
    let decimalNumberCount = 0; // JS numbers that are not integers
    let detectedCurrency: string | undefined;

    // Matches a cell that IS a standalone currency amount: "$3,200,000", "£1,234.56", "€100"
    // Does NOT match prose that merely mentions a price: "approximately $0.7 billion"
    const standaloneAmountRe = /^\s*[$\u20ac\u00a3\u00a5\u20b9\u20bd]\s*[\d,]+(\.[\d]+)?\s*$|^\s*[\d,]+(\.[\d]+)?\s*[$\u20ac\u00a3\u00a5\u20b9\u20bd]\s*$/;
    const currencySymbolRe   = /[$\u20ac\u00a3\u00a5\u20b9\u20bd]/;
    const amountKeywords = /amount|price|cost|value|total|sum|balance|payment|revenue|expense|salary|fee|charge/i;
    const dateKeywords   = /date|time|day|month|year|period|timestamp/i;
    // Comma-formatted number: 1,234 | 1,234.56 | 12,34,567 (Indian style)
    const commaNumberRe  = /^\s*(\d{1,3})(,\d{2,3})*(\.\d+)?\s*$/;

    values.forEach(val => {
      if (val instanceof Date) {
        dateCount++;
      } else if (typeof val === 'number') {
        numberCount++;
        if (!Number.isInteger(val)) decimalNumberCount++;
      } else if (typeof val === 'string') {
        // Currency symbol check — only count as currency if the cell IS a standalone
        // amount (e.g. "$3,200,000"), not prose text that mentions a price in passing.
        if (standaloneAmountRe.test(val)) {
          currencyCount++;
          const sym = val.match(currencySymbolRe);
          detectedCurrency = detectedCurrency || (sym ? sym[0] : undefined);
        }
        // Comma-formatted number check (before stripping commas)
        if (commaNumberRe.test(val)) commaNumberCount++;
        // Numeric check after stripping currency symbols and commas
        const cleaned = val.replace(/[$\u20ac\u00a3\u00a5\u20b9\u20bd,]/g, '').trim();
        if (!isNaN(parseFloat(cleaned)) && isFinite(parseFloat(cleaned))) {
          numberCount++;
        } else if (this.isDateString(val)) {
          dateCount++;
        } else {
          textCount++;
        }
      }
    });

    const total = values.length;
    const dateRatio   = dateCount / total;
    const numberRatio = (numberCount + currencyCount) / total;
    const currencyRatio = currencyCount / total;
    // Looks like monetary amount purely from value structure
    const looksLikeAmountByValue =
      (commaNumberCount + decimalNumberCount) / total >= 0.4 || currencyRatio >= 0.2;

    let dataType: 'number' | 'date' | 'text' | 'currency' | 'mixed' = 'text';
    let isDateField   = false;
    let isAmountField = false;

    if (dateRatio >= 0.6) {
      dataType    = 'date';
      isDateField = true;
    } else if (currencyRatio >= 0.3 ||
               (numberRatio >= 0.7 && (amountKeywords.test(columnName) || looksLikeAmountByValue))) {
      dataType      = 'currency';
      isAmountField = true;
    } else if (numberRatio >= 0.7) {
      dataType      = 'number';
      // Flag as amount if value structure suggests it — no name match required
      isAmountField = looksLikeAmountByValue;
    } else if (textCount > total * 0.5) {
      dataType = 'text';
    } else {
      dataType = 'mixed';
    }

    // Date: keyword in name OR the column name itself parses as a valid date
    if (!isDateField && (dateKeywords.test(columnName) || this.isDateString(columnName))) {
      isDateField = true;
    }

    return { dataType, isAmountField, isDateField, currencySymbol: detectedCurrency };
  }

  /**
   * Check if a string represents a date.
   * Handles: DD/MM/YYYY, YYYY-MM-DD, DD Mon YYYY, Month DD YYYY,
   *          Mon-YYYY, Month YYYY, YYYY-Mon, and ISO 8601 variants.
   */
  private isDateString(str: string): boolean {
    const s = str.trim();
    if (!s) return false;

    const M = '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';
    const datePatterns = [
      /^\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}$/,                         // DD/MM/YYYY, MM-DD-YY
      /^\d{4}[\/\-.]\d{1,2}[\/\-.]\d{1,2}$/,                           // YYYY-MM-DD
      new RegExp(`^\\d{1,2}[\\s\\-]*${M}[\\s\\-,]*\\d{2,4}$`, 'i'), // DD Mon YYYY, DD-Mon-YYYY
      new RegExp(`^${M}[\\s\\-]+\\d{1,2}[,\\s]+\\d{2,4}$`, 'i'),    // Mon DD, YYYY
      new RegExp(`^${M}[\\s\\-]+\\d{2,4}$`, 'i'),                    // Mon-YYYY, Month YYYY
      new RegExp(`^\\d{2,4}[\\s\\-]+${M}$`, 'i'),                    // YYYY-Mon, YYYY Month
    ];

    if (datePatterns.some(p => p.test(s))) {
      const parsed = new Date(s);
      return !isNaN(parsed.getTime());
    }
    return false;
  }

  /**
   * Get summary of identified fields for user confirmation
   */
  getIdentifiedFieldsSummary(): { sheetName: string; amountFields: string[]; dateFields: string[] }[] {
    return this.convertedData.map(sheet => ({
      sheetName: sheet.sheetName,
      amountFields: sheet.columnAnalysis.filter(col => col.isAmountField).map(col => col.columnName),
      dateFields: sheet.columnAnalysis.filter(col => col.isDateField).map(col => col.columnName)
    }));
  }

  /**
   * Filter helper methods for template
   */
  getAmountFields(columnAnalysis: ColumnAnalysis[]): ColumnAnalysis[] {
    return columnAnalysis.filter(c => c.isAmountField);
  }

  getDateFields(columnAnalysis: ColumnAnalysis[]): ColumnAnalysis[] {
    return columnAnalysis.filter(c => c.isDateField);
  }

  /**
   * Converts a sheet's 2D data array into an array of row objects keyed by header name.
   * Memoized via WeakMap to avoid repeated computation on each change-detection cycle.
   */
  private sheetTableCache = new WeakMap<SheetData, any[]>();

  getSheetTableData(sheet: SheetData): any[] {
    if (!this.sheetTableCache.has(sheet)) {
      const rows = sheet.data.map(row => {
        const obj: any = {};
        sheet.headers.forEach((header, i) => { obj[header] = this.formatCellForDisplay(row[i] ?? null); });
        return obj;
      });
      this.sheetTableCache.set(sheet, rows);
    }
    return this.sheetTableCache.get(sheet)!;
  }

  // ─── Header Row Confirmation ─────────────────────────────────────────────

  confirmHeaderRow(sheetName: string): void {
    this.headerConfirmations[sheetName] = true;
  }

  rejectHeaderRow(sheetName: string, sheet: SheetData): void {
    this.headerConfirmations[sheetName] = false;
    if (!(sheetName in this.pendingHeaderIndex)) {
      // Default selection = the currently detected header row
      this.pendingHeaderIndex[sheetName] = sheet.metadata.length;
    }
  }

  getCandidateRows(sheet: SheetData): any[][] {
    const base  = [...sheet.metadata, sheet.headers as any[]];
    // Include up to 4 non-empty data rows so the user can pick a header that
    // lies further down the sheet when the auto-detected header is too early.
    const extra = sheet.data
      .filter(row => row.some(v => v !== null && v !== undefined && v !== ''))
      .slice(0, 4);
    return [...base, ...extra];
  }

  applyHeaderChange(sheetIndex: number): void {
    const sheet = this.convertedData[sheetIndex];
    const selectedIdx = this.pendingHeaderIndex[sheet.sheetName] ?? sheet.metadata.length;
    const candidates = this.getCandidateRows(sheet);

    // candidates layout:
    //   [0 .. metadata.length-1]  = metadata rows (before original header)
    //   [metadata.length]         = original header row
    //   [metadata.length+1 ..]    = first N non-empty rows from sheet.data (T+4 extension)
    const originalCandidateCount = sheet.metadata.length + 1;

    const newHeaders  = this.extractHeaders(candidates[selectedIdx] || []);
    const newMetadata = candidates.slice(0, selectedIdx) as any[][];

    // Rows that sit between the selection and the start of sheet.data in candidates.
    // Only slice up to originalCandidateCount so we don't pull data rows twice.
    const between = candidates.slice(selectedIdx + 1, originalCandidateCount) as any[][];

    let newData: any[][];
    if (selectedIdx < originalCandidateCount) {
      // Selected row is within original metadata / header area — dataRowsSkipped is always 0
      // here, so just concatenate between-rows with the full data array (blank rows included).
      newData = [...between, ...sheet.data];
    } else {
      // Selected row is one of the extra non-blank data rows surfaced by getCandidateRows.
      // sheet.data may now contain blank rows, so we can't rely on a positional count.
      // Use reference equality to find where the selected row actually sits in sheet.data.
      const selectedRow = candidates[selectedIdx];
      const dataIdx = sheet.data.indexOf(selectedRow);
      newData = dataIdx !== -1 ? sheet.data.slice(dataIdx + 1) : [];
    }

    const newColumnAnalysis = this.analyzeColumns(newHeaders, newData);

    this.convertedData[sheetIndex] = {
      sheetName:             sheet.sheetName,
      metadata:              newMetadata,
      headerRowIndex:        selectedIdx,
      headers:               newHeaders,
      data:                  newData,
      columnAnalysis:        newColumnAnalysis,
      // No phantom filtering in applyHeaderChange — each position j maps directly to
      // worksheet column j (0-based), so originalColumnIndices is just [0, 1, 2, ...].
      originalColumnIndices: newHeaders.map((_, j) => j)
    };

    delete this.headerConfirmations[sheet.sheetName];
    delete this.pendingHeaderIndex[sheet.sheetName];
    delete this.columnMappings[sheet.sheetName];
    delete this.periodsCache[sheet.sheetName];

    this.headerConfirmations[sheet.sheetName] = true;
    this.sheetTableCache = new WeakMap();
  }

  /**
   * Builds the conversion payload and triggers the backend call.
   * Payload = parsed sheet data + a settings block per sheet.
   */
  confirmAndProceed(): void {
    if (!this.computeCanConvert() || this.isConverting) return;
    this.isConverting = true;

    // Build one API call per unique (from, to) pair per sheet
    const callDescriptors: { sheetName: string; from: string; to: string; payload: ExcelConversionRatesPayload }[] = [];

    for (const sheet of this.convertedData) {
      const mappings       = this.getColumnMappings(sheet);
      const dateCol        = this.getDateValueColumn(sheet);
      const amountMappings = mappings.filter(m => m.type === 'amount' && m.fromCurrency && m.toCurrency);

      // Group amount columns by (from, to) pair and collect their dates
      const pairMap = new Map<string, { from: string; to: string; dates: Set<string> }>();
      for (const m of amountMappings) {
        const key = `${m.fromCurrency}__${m.toCurrency}`;
        if (!pairMap.has(key)) pairMap.set(key, { from: m.fromCurrency, to: m.toCurrency, dates: new Set() });
        if (!dateCol) {
          const d = this.periodToApiDate(m.exchangeRateOf);
          if (d) pairMap.get(key)!.dates.add(d);
        }
      }

      // When a date column exists, use the actual data values as dates for every pair
      if (dateCol && pairMap.size > 0) {
        const dateColIndex = sheet.headers.indexOf(dateCol);
        const uniqueDates = Array.from(
          new Set(
            sheet.data
              .map(row => this.toIsoDateString(row[dateColIndex]))
              .filter((d): d is string => !!d)
          )
        );
        for (const entry of pairMap.values()) {
          uniqueDates.forEach(d => entry.dates.add(d));
        }
      }

      for (const { from, to, dates } of pairMap.values()) {
        if (!dates.size) continue;
        callDescriptors.push({
          sheetName: sheet.sheetName,
          from,
          to,
          payload: {
            dates:        Array.from(dates).sort(),
            baseCurrency: 'AUD',
            currencyFrom: from,
            currencyTo:   to
          }
        });
      }
    }

    if (!callDescriptors.length) {
      this.isConverting = false;
      return;
    }

    forkJoin(
      callDescriptors.map(d => this.fetchXRApiService.getExcelConversionRates(d.payload))
    ).subscribe({
      next: (results) => {
        results.forEach((rates, i) => {
          const { sheetName, from, to } = callDescriptors[i];
          this.conversionRates[`${sheetName}||${from}||${to}`] = rates;
        });
        this.applyConversions();
        this.isConverting = false;
      },
      error: (err) => {
        console.error('Failed to fetch conversion rates:', err);
        this.isConverting = false;
      }
    });
  }

  /**
   * Applies fetched exchange rates to produce converted copies of each sheet.
   *
   * Type 1 — date column present: each row's amount is multiplied by the rate
   *   looked up by the row's own date value.
   *
   * Type 2 — no date column (columns are periods): each amount column carries a
   *   fixed rate derived from its exchangeRateOf period, applied to every row.
   */
  private applyConversions(): void {
    this.convertedSheets = this.convertedData.map(sheet => {
      const mappings   = this.getColumnMappings(sheet);
      const dateCol    = this.getDateValueColumn(sheet);
      const dateColIdx = dateCol ? sheet.headers.indexOf(dateCol) : -1;

      // Map colIndex → its ColumnMapping for every amount column
      const amountColMap = new Map<number, ColumnMapping>();
      for (const m of mappings) {
        if (m.type !== 'amount') continue;
        const idx = sheet.headers.indexOf(m.columnName);
        if (idx !== -1) amountColMap.set(idx, m);
      }

      // Aggregate columns (Total, Grand Total, etc.) are suppressed during mapping.
      // Collect their indices so we can recompute them after each row is converted.
      const aggregateColIndices: number[] = [];
      for (const m of mappings) {
        if (m.type === 'none' && this.isAggregateColumn(m.columnName)) {
          const idx = sheet.headers.indexOf(m.columnName);
          if (idx !== -1) aggregateColIndices.push(idx);
        }
      }

      // Pre-resolve fixed rates for Type 2 (period columns) to avoid repeating per row
      const fixedRateByCol = new Map<number, number>();
      if (dateColIdx === -1) {
        for (const [colIdx, m] of amountColMap) {
          const rateKey   = `${sheet.sheetName}||${m.fromCurrency}||${m.toCurrency}`;
          const rates     = this.conversionRates[rateKey];
          const periodDate = this.periodToApiDate(m.exchangeRateOf);
          if (rates && periodDate && rates[periodDate] !== undefined) {
            fixedRateByCol.set(colIdx, rates[periodDate]);
          }
        }
      }

      const newData = sheet.data.map(row => {
        const newRow = [...row];

        for (const [colIdx, m] of amountColMap) {
          const rawVal = newRow[colIdx];
          if (rawVal == null || rawVal === '') continue;

          // Parse the cell value to a plain number
          const num = typeof rawVal === 'number'
            ? rawVal
            : parseFloat(String(rawVal).replace(/[^0-9.\-]/g, ''));
          if (isNaN(num)) continue;

          let rate: number | undefined;

          if (dateColIdx !== -1) {
            // ── Type 1: row-based — look up rate by the row's date value ──────
            const rateKey = `${sheet.sheetName}||${m.fromCurrency}||${m.toCurrency}`;
            const rates   = this.conversionRates[rateKey];
            if (rates) {
              const dateStr = this.toIsoDateString(row[dateColIdx]);
              if (dateStr) rate = rates[dateStr];
            }
          } else {
            // ── Type 2: column-based — fixed rate pre-resolved above ──────────
            rate = fixedRateByCol.get(colIdx);
          }

          if (rate !== undefined && !isNaN(rate)) {
            newRow[colIdx] = parseFloat((num * rate).toFixed(2));
          }
        }

        // Recompute suppressed aggregate columns (Total / Grand Total / etc.) as the
        // sum of all converted amount columns in this row.
        // NOTE: must run before Phase 3 formatting so we can still read numeric values.
        if (aggregateColIndices.length > 0 && amountColMap.size > 0) {
          const convertedSum = Array.from(amountColMap.keys()).reduce((acc, colIdx) => {
            const val = newRow[colIdx];
            return acc + (typeof val === 'number' && !isNaN(val) ? val : 0);
          }, 0);
          for (const aggIdx of aggregateColIndices) {
            newRow[aggIdx] = parseFloat(convertedSum.toFixed(2));
          }
        }

        // Phase 3 — format all converted amount + aggregate columns as comma-separated
        // values (equivalent to Angular CurrencyPipe without the symbol, e.g. 1,234.56)
        for (const colIdx of amountColMap.keys()) {
          const v = newRow[colIdx];
          if (typeof v === 'number' && !isNaN(v)) newRow[colIdx] = this.formatAmount(v);
        }
        for (const aggIdx of aggregateColIndices) {
          const v = newRow[aggIdx];
          if (typeof v === 'number' && !isNaN(v)) newRow[aggIdx] = this.formatAmount(v);
        }

        return newRow;
      });

      return { ...sheet, data: newData };
    });
  }

  /** Formats a number as a comma-separated decimal string (CurrencyPipe without symbol). e.g. 1234567.8 → "1,234,567.80" */
  private formatAmount(value: number): string {
    return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  /** Converts "Jan 2024" → "2024-01-31" (last day of month) for the API date format */
  private periodToApiDate(period: string): string | null {
    if (!period?.trim()) return null;
    const shorts = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const m = period.match(/^(\w{3})\s+(\d{4})$/);
    if (m) {
      const idx = shorts.indexOf(m[1]);
      if (idx === -1) return null;
      const yr = parseInt(m[2]);
      const lastDay = new Date(yr, idx + 1, 0).getDate(); // day 0 of next month = last day of this month
      return `${m[2]}-${String(idx + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    }
    return null;
  }

  /**
   * Formats a cell value for display in the data table.
   * Date objects are converted to M/D/YY (e.g. "1/31/13") to match the
   * original spreadsheet display rather than showing the full Date.toString().
   */
  private formatCellForDisplay(val: any): any {
    if (val instanceof Date) {
      if (isNaN(val.getTime())) return '';
      const m = val.getMonth() + 1;
      const d = val.getDate();
      const y = String(val.getFullYear()).slice(-2);
      return `${m}/${d}/${y}`;
    }
    return val;
  }

  /** Normalises a Date object or date string to "YYYY-MM-DD", or null if unparseable */
  private toIsoDateString(val: any): string | null {
    if (!val) return null;
    if (val instanceof Date) {
      return isNaN(val.getTime()) ? null : val.toISOString().substring(0, 10);
    }
    const s = String(val).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d.toISOString().substring(0, 10);
  }

  /**
   * Reset and allow user to upload a different file
   */
  resetUpload(): void {
    this.convertedData       = [];
    this.convertedSheets     = [];
    this.conversionRates     = {};
    this.uploadedFileStyles  = {};
    this.sheetTableCache     = new WeakMap();
    this.headerConfirmations = {};
    this.pendingHeaderIndex  = {};
    this.columnMappings      = {};
    this.allMappingsConfirmed = false;
    this.periodsCache              = {};
    this.originalFileBufferBySheet = {};
    this.uploadFilesLength         = 0;
    this.uploadError               = false;
  }

  handleAction(side: 'left' | 'right'): void {
    if (side === 'left') {
      this.resetUpload();
    }

    if (side === 'right') {
      this.confirmAndProceed();
    }
  }

  getCurrencyColumns(sheet: SheetData): ColumnMapping[] {
    return this.getColumnMappings(sheet).filter(m => m.type === 'amount' || m.columnName.toLowerCase().includes('total'));
  }

  /**
   * Downloads the converted workbook by patching ONLY the changed cell values
   * directly inside the original xlsx zip — no ExcelJS parse/serialize round-trip.
   *
   * An xlsx file is a zip containing XML files.  We unzip the original buffer,
   * locate each worksheet XML, surgically replace only the <v> (value) elements
   * of the converted cells, then re-zip.  Every other byte — styles, themes,
   * merges, charts, print settings — is left completely untouched.
   */
  downloadConvertedExcel(): void {
    if (!this.convertedSheets.length) return;

    // Group converted sheets by source buffer (one output file per uploaded workbook).
    const bufferToSheetNames = new Map<ArrayBuffer, string[]>();
    for (const sheet of this.convertedSheets) {
      const buf = this.originalFileBufferBySheet[sheet.sheetName];
      if (!buf) continue;
      if (!bufferToSheetNames.has(buf)) bufferToSheetNames.set(buf, []);
      bufferToSheetNames.get(buf)!.push(sheet.sheetName);
    }

    const fileName = `Converted_${new Date().toISOString().slice(0, 10)}`;

    for (const [buf, sheetNamesForBuf] of bufferToSheetNames) {
      // ── 1. Unzip the original xlsx ───────────────────────────────────────
      const unzipped = fflate.unzipSync(new Uint8Array(buf));

      // ── 2. Parse workbook.xml to get the sheetName → rId → file-path mapping ─
      const wbXml    = new TextDecoder().decode(unzipped['xl/workbook.xml']);
      const wbRelsXml = new TextDecoder().decode(
        unzipped['xl/_rels/workbook.xml.rels'] ?? new Uint8Array()
      );

      // sheet name → xl-relative file path (e.g. "worksheets/sheet1.xml")
      const sheetPathMap = this.buildSheetPathMap(wbXml, wbRelsXml);

      // ── 3. For each sheet, build the cell-patch map and rewrite the XML ──
      for (const sheetName of sheetNamesForBuf) {
        const convertedSheet = this.convertedSheets.find(s => s.sheetName === sheetName);
        const originalSheet  = this.convertedData.find(s => s.sheetName === sheetName);
        if (!convertedSheet || !originalSheet) continue;

        const relPath  = sheetPathMap.get(sheetName);
        const fullPath = relPath ? `xl/${relPath}` : null;
        if (!fullPath || !unzipped[fullPath]) continue;

        const mappings = this.getColumnMappings(originalSheet);

        // Build map: "A1" cell address → new numeric value
        const patches = new Map<string, number>();

        const modifiedColIndices: number[] = [];
        for (let j = 0; j < originalSheet.headers.length; j++) {
          const m = mappings.find(mp => mp.columnName === originalSheet.headers[j]);
          if (!m) continue;
          if (m.type === 'amount' ||
             (m.type === 'none' && this.isAggregateColumn(m.columnName))) {
            modifiedColIndices.push(j);
          }
        }
        if (!modifiedColIndices.length) continue;

        for (let k = 0; k < convertedSheet.data.length; k++) {
          const rowValues = convertedSheet.data[k];
          if (!rowValues || rowValues.every((v: any) => v === null || v === undefined || v === '')) continue;

          // 1-based worksheet row number (headerRowIndex is 0-based in rows[])
          const wsRowNum = originalSheet.headerRowIndex + k + 2;

          for (const j of modifiedColIndices) {
            const wsColNum = (originalSheet.originalColumnIndices[j] ?? j) + 1;
            const val      = rowValues[j];
            if (val === null || val === undefined || val === '') continue;

            const num = typeof val === 'number'
              ? val
              : parseFloat(String(val).replace(/,/g, ''));
            if (isNaN(num)) continue;

            const cellRef = this.colNumToLetter(wsColNum) + wsRowNum;
            patches.set(cellRef, num);
          }
        }

        if (!patches.size) continue;

        // Patch the worksheet XML
        const originalXml = new TextDecoder().decode(unzipped[fullPath]);
        const patchedXml  = this.patchWorksheetXml(originalXml, patches);
        unzipped[fullPath] = new TextEncoder().encode(patchedXml);
      }

      // ── 4. Re-zip and trigger download ────────────────────────────────────
      const zipped = fflate.zipSync(unzipped, { level: 6 });
      // Materialise into a guaranteed plain ArrayBuffer (no SharedArrayBuffer) for Blob.
      const zippedBuffer = new Uint8Array(zipped).buffer as ArrayBuffer;
      const blob   = new Blob(
        [zippedBuffer],
        { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
      );
      const url    = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href     = url;
      anchor.download  = `${fileName}.xlsx`;
      anchor.click();
      window.URL.revokeObjectURL(url);
    }
  }

  /**
   * Parses workbook.xml + workbook.xml.rels to build a map of
   * sheet display-name → xl-relative file path (e.g. "worksheets/sheet1.xml").
   */
  private buildSheetPathMap(wbXml: string, wbRelsXml: string): Map<string, string> {
    // Extract rId → target path from .rels
    const ridToPath = new Map<string, string>();
    const relsRe = /<Relationship[^>]+Id="([^"]+)"[^>]+Target="([^"]+)"/g;
    let rm: RegExpExecArray | null;
    while ((rm = relsRe.exec(wbRelsXml)) !== null) {
      ridToPath.set(rm[1], rm[2]);
    }

    // Extract sheet name → rId from workbook.xml
    const result = new Map<string, string>();
    const sheetRe = /<sheet[^>]+name="([^"]+)"[^>]+r:id="([^"]+)"/g;
    let sm: RegExpExecArray | null;
    while ((sm = sheetRe.exec(wbXml)) !== null) {
      const name = sm[1];
      const rid  = sm[2];
      const path = ridToPath.get(rid);
      if (path) result.set(name, path);
    }
    return result;
  }

  /**
   * Converts a 1-based column number to an Excel column letter (1 → "A", 26 → "Z", 27 → "AA").
   */
  private colNumToLetter(col: number): string {
    let letter = '';
    while (col > 0) {
      const rem = (col - 1) % 26;
      letter = String.fromCharCode(65 + rem) + letter;
      col = Math.floor((col - 1) / 26);
    }
    return letter;
  }

  /**
   * Surgically replaces <v> element values for the given cell addresses in
   * worksheet XML.  Only touches <c r="ADDRESS"> nodes — everything else is
   * returned byte-for-byte identical to the input.
   *
   * Strategy: split on <row ...> boundaries, then within each matching row
   * replace only the targeted <c> nodes using a simple regex on the value tag.
   */
  private patchWorksheetXml(xml: string, patches: Map<string, number>): string {
    if (!patches.size) return xml;

    // Group patches by row number for fast row-level lookup
    const byRow = new Map<number, Map<string, number>>();
    for (const [ref, val] of patches) {
      const m = ref.match(/^([A-Z]+)(\d+)$/);
      if (!m) continue;
      const rowNum = parseInt(m[2]);
      if (!byRow.has(rowNum)) byRow.set(rowNum, new Map());
      byRow.get(rowNum)!.set(ref, val);
    }

    // Replace row by row using a regex split on <row ...> ... </row> blocks
    return xml.replace(
      /(<row\b[^>]*>)(.*?)(<\/row>)/gs,
      (fullMatch: string, openTag: string, rowBody: string, closeTag: string) => {
        // Extract the row number from the <row r="N"> attribute
        const rAttr = openTag.match(/\br="(\d+)"/);
        if (!rAttr) return fullMatch;
        const rowNum = parseInt(rAttr[1]);
        const cellPatches = byRow.get(rowNum);
        if (!cellPatches) return fullMatch;

        // For each <c r="REF" ...> block in this row, patch the <v> if needed
        const patchedBody = rowBody.replace(
          /(<c\b[^>]*\br="([A-Z]+\d+)"[^>]*>)(.*?)(<\/c>)/gs,
          (cm: string, cellOpen: string, cellRef: string, cellContent: string, cellClose: string) => {
            const newVal = cellPatches.get(cellRef);
            if (newVal === undefined) return cm;

            // Remove existing <v>...</v> and <f>...</f> (formula), then insert new <v>
            const stripped = cellContent
              .replace(/<f\b[^>]*>.*?<\/f>/gs, '')
              .replace(/<v>.*?<\/v>/gs, '');

            // Ensure the cell type attribute is numeric (remove t="s"/t="str"/t="b" etc.)
            const cleanOpen = cellOpen.replace(/\s+t="[^"]*"/, '');

            return `${cleanOpen}${stripped}<v>${newVal}</v>${cellClose}`;
          }
        );

        return `${openTag}${patchedBody}${closeTag}`;
      }
    );
  }

}
