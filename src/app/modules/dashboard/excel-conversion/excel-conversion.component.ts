import { Component, ViewChild, DoCheck } from '@angular/core';
import { forkJoin } from 'rxjs';
import { FetchXRApiService, ExcelConversionRatesPayload } from '../../../services/fetchXR-api.service';
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

declare const XLSX: any;

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
export class ExcelConversionComponent implements DoCheck {

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

  constructor(private fetchXRApiService: FetchXRApiService) {}

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
  /** Per-sheet "I confirm" checkbox state */
  mappingConfirmed: Record<string, boolean> = {};
  /** Memoised month-year periods extracted from sheet headers and metadata */
  private periodsCache: Record<string, string[]> = {};

  readonly COMMON_CURRENCIES = [
    'AUD','BRL','CAD','CHF','CNY','EUR','GBP','HKD','IDR','INR',
    'JPY','KRW','MXN','MYR','NOK','NZD','PHP','PLN','RUB','SAR',
    'SEK','SGD','THB','TRY','TWD','USD','ZAR'
  ];

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
    return this.convertedData.every(sheet => {
      if (this.headerConfirmations[sheet.sheetName] !== true) return false;
      if (!this.mappingConfirmed[sheet.sheetName]) return false;
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
    console.log('File upload event:');
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
    console.log('Files uploaded:', this.uploadFilesLength);
    validFiles.forEach((file: any) => this.fileDataToJSON(file));
  }

  getObjectKeys(obj: any): string[] {
    return Object.keys(obj);
  }

  /**
   * Process Excel/CSV file and extract all sheets with intelligent header detection
   */
  fileDataToJSON(file: any): void {
    console.log('Processing file:', file.name);
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

      console.log('CSV Processed:', this.convertedData);
    };

    reader.readAsText(file);
  }

  /**
   * Process Excel file and extract all sheets
   */
  private processExcelFile(file: File): void {
    const reader = new FileReader();

    reader.onload = (e: ProgressEvent<FileReader>) => {
      const data = e.target?.result;
      if (!data) return;

      const wb = XLSX.read(data, { type: 'array', cellDates: true });

      this.convertedData = wb.SheetNames
        .map((sheetName: any) => {
          const ws = wb.Sheets[sheetName];
          const rows = XLSX.utils.sheet_to_json(ws, {
            header: 1,
            blankrows: false,
            defval: null,
            raw: true
          }) as any[][];

          if (!rows.length) return null;
          return this.processSheet(sheetName, ws, rows);
        })
        .filter(Boolean) as SheetData[];

      console.log('All Sheets Processed:', this.convertedData);
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
   * Process a single sheet: detect header, extract metadata, analyze columns
   */
  private processSheet(sheetName: string, ws: any, rows: any[][]): SheetData {
    const headerRowIndex = this.detectHeaderRow(rows, ws);
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
      headers:        keep.map(i => headers[i]),
      data:           data.map(row => keep.map(i => row[i] ?? null)),
      columnAnalysis: keep.map(i => columnAnalysis[i])
    };
  }


  /**
   * Intelligently detect the header row
   * Logic: Find first row where all non-empty cells are text AND next row has data
   */
  private detectHeaderRow(rows: any[][], ws?: any): number {
    const isBlank = (v: any) =>
      v == null || v === '' || (typeof v === 'string' && v.trim() === '');

    const isHeaderCell = (v: any) =>
      typeof v === 'string' && v.trim() !== ''; // strict: header cells must be strings

    const merges = ((ws as any)?.['!merges'] ?? []) as Array<{ s: { r: number; c: number }; e: { r: number; c: number } }>;

    const maxMergeWidthForRow = (r: number) =>
      merges
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

      return s;
    };

    const hasNumericOrDateSoon = (i: number) =>
      [1, 2]
        .map(k => rows[i + k])
        .filter(Boolean)
        .some(r => r.some(v => typeof v === 'number' || v instanceof Date));

    for (let i = 0; i < rows.length - 1; i++) {
      const s = isStrictHeaderRow(rows[i]);
      if (!s) continue;

      // reject merged/title row (big merge + tiny width)
      const mergeWidth = maxMergeWidthForRow(i);
      if (mergeWidth >= 3 && s.width <= 2) continue;

      if (!hasNumericOrDateSoon(i)) continue;

      return i;
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

    const currencyPatterns = /[$\u20ac\u00a3\u00a5\u20b9\u20bd]/; // $ € £ ¥ ₹ ₽
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
        // Currency symbol check
        const currencyMatch = val.match(currencyPatterns);
        if (currencyMatch) {
          currencyCount++;
          detectedCurrency = detectedCurrency || currencyMatch[0];
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
        sheet.headers.forEach((header, i) => { obj[header] = row[i] ?? null; });
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
    return [...sheet.metadata, sheet.headers as any[]];
  }

  applyHeaderChange(sheetIndex: number): void {
    const sheet = this.convertedData[sheetIndex];
    const selectedIdx = this.pendingHeaderIndex[sheet.sheetName] ?? sheet.metadata.length;
    const candidates = this.getCandidateRows(sheet);

    const newHeaders = this.extractHeaders(candidates[selectedIdx] || []);
    const newMetadata = candidates.slice(0, selectedIdx) as any[][];
    const between = candidates.slice(selectedIdx + 1) as any[][];
    const newData = [...between, ...sheet.data];
    const newColumnAnalysis = this.analyzeColumns(newHeaders, newData);

    this.convertedData[sheetIndex] = {
      sheetName: sheet.sheetName,
      metadata: newMetadata,
      headerRowIndex: selectedIdx,
      headers: newHeaders,
      data: newData,
      columnAnalysis: newColumnAnalysis
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
      console.log(sheet);
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
        console.log('Converted sheets:', this.convertedSheets);
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
    this.convertedData    = [];
    this.convertedSheets  = [];
    this.conversionRates  = {};
    this.sheetTableCache  = new WeakMap();
    this.headerConfirmations = {};
    this.pendingHeaderIndex  = {};
    this.columnMappings      = {};
    this.mappingConfirmed    = {};
    this.periodsCache        = {};
    this.uploadFilesLength   = 0;
    this.uploadError         = false;
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
   * Downloads the converted sheets as a styled .xlsx via ExcelReportComponent.
   */
  downloadConvertedExcel(): void {
    if (!this.convertedSheets.length) return;

    const workbookData: GenericExcelWorkbook = {};

    for (const sheet of this.convertedSheets) {
      workbookData[sheet.sheetName] = {
        metadataHeader: sheet.metadata.map(row => row.map(cell => (cell == null ? '' : String(cell)))),
        header: sheet.headers,
        data: sheet.data.map(row => {
          const obj: Record<string, any> = {};
          sheet.headers.forEach((h, i) => { obj[h] = row[i] ?? null; });
          return obj;
        })
      };
    }

    const fileName = `Converted_${new Date().toISOString().slice(0, 10)}`;
    this.excelReport.workbookData = workbookData;
    this.excelReport.reportName   = fileName;
    this.excelReport.generateExcel();
  }

}
