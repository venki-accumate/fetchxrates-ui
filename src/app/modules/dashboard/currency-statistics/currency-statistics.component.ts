import { Component, ViewChild, ElementRef, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatButtonModule } from '@angular/material/button';
import { ButtonBarComponent } from '../../../components/button-bar/button-bar.component';
import { DataTableComponent } from '../../../components/data-table/data-table.component';
import { ExcelReportComponent, GenericExcelWorkbook } from '../../../components/excel-report/excel-report.component';
import { CsvReportComponent, GenericCsvWorkbook } from '../../../components/csv-report/csv-report.component';
import { PdfReportComponent, GenericPdfWorkbook } from '../../../components/pdf-report/pdf-report.component';
import { NgxSpinnerModule, NgxSpinnerService } from 'ngx-spinner';
import { FetchXRApiService, RatesRangePayload } from '../../../services/fetchXR-api.service';

const METRICS = [
  'Average', 'Median', 'Min', 'Max', 'Start', 'End',
  'Change %', 'Volatility', 'Trading Days', 'Range %'
];

@Component({
  selector: 'app-currency-statistics',
  standalone: true,
  templateUrl: './currency-statistics.component.html',
  styleUrl: './currency-statistics.component.scss',
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    MatExpansionModule,
    MatMenuModule,
    MatTooltipModule,
    MatButtonModule,
    ButtonBarComponent,
    NgxSpinnerModule,
    DataTableComponent,
    ExcelReportComponent,
    CsvReportComponent,
    PdfReportComponent
  ]
})
export class CurrencyStatisticsComponent {
  constructor(
    private fetchXRApiService: FetchXRApiService,
    private spinner: NgxSpinnerService
  ) {}

  readonly COMMON_CURRENCIES = [
    'AUD', 'BRL', 'CAD', 'CHF', 'CNY', 'EUR', 'GBP', 'HKD', 'IDR', 'INR',
    'JPY', 'KRW', 'MXN', 'MYR', 'NOK', 'NZD', 'PHP', 'PLN', 'RUB', 'SAR',
    'SEK', 'SGD', 'THB', 'TRY', 'TWD', 'USD', 'ZAR'
  ];
  readonly METRICS = METRICS;

  // ── Filter state ──────────────────────────────────────────────────────────────
  periodType   = signal<'monthly' | 'yearly'>('monthly');
  startPeriod  = '';
  endPeriod    = '';
  fromCurrency = '';
  availableToCurrencies = [...this.COMMON_CURRENCIES];
  selectedToCurrencies: string[] = [];
  groupBy = signal<'currency' | 'statistics'>('currency');

  @ViewChild('availableSelect') availableSelectRef!: ElementRef<HTMLSelectElement>;
  @ViewChild('selectedSelect')  selectedSelectRef!:  ElementRef<HTMLSelectElement>;
  @ViewChild('excelReport') excelReport!: ExcelReportComponent;
  @ViewChild('csvReport')   csvReport!:   CsvReportComponent;
  @ViewChild('pdfReport')   pdfReport!:   PdfReportComponent;

  // ── Result / UI state ─────────────────────────────────────────────────────────
  isLoading   = false;
  hasSearched = signal(false);
  validationError    = signal('');
  tableColumnHeaders = signal<string[]>([]);
  tableData          = signal<any[]>([]);
  resultLength       = signal(0);

  private rawResult: Record<string, any> = {};
  availableCurrenciesInResult: string[] = [];
  selectedCurrency = '';
  selectedMetric   = 'Average';

  buttonConfig = {
    left:  { label: 'Reset' },
    right: { label: 'Fetch Statistics', disabled: false }
  };

  // ── Computed helpers ──────────────────────────────────────────────────────────
  get showGroupBy(): boolean {
    return this.selectedToCurrencies.length !== 1;
  }

  private get effectiveGroupBy(): 'currency' | 'statistics' {
    return this.selectedToCurrencies.length === 1 ? 'currency' : this.groupBy();
  }

  get maxMonthInput(): string {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  get maxEndPeriod(): string {
    if (!this.startPeriod) {
      return this.periodType() === 'monthly'
        ? this.maxMonthInput
        : String(new Date().getFullYear() - 1);
    }
    if (this.periodType() === 'monthly') {
      const [y, m] = this.startPeriod.split('-').map(Number);
      const d = new Date(y, m - 1 + 60); // +5 years
      const maxEnd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      return maxEnd < this.maxMonthInput ? maxEnd : this.maxMonthInput;
    } else {
      const maxEnd = String(parseInt(this.startPeriod, 10) + 4);
      const absMax = String(new Date().getFullYear() - 1);
      return maxEnd < absMax ? maxEnd : absMax;
    }
  }

  get yearOptions(): number[] {
    const current = new Date().getFullYear();
    const years: number[] = [];
    for (let y = current - 1; y >= 2000; y--) years.push(y);
    return years;
  }

  get resultTitle(): string {
    const n  = this.selectedToCurrencies.length;
    const to = n === 0 ? 'All Currencies' : n === 1 ? this.selectedToCurrencies[0] : `${n} Currencies`;
    const pt = this.periodType() === 'monthly' ? 'Monthly' : 'Yearly';
    return `${this.fromCurrency} → ${to} · ${pt} Statistics`;
  }

  get resultSummary(): string {
    const rows = this.tableData();
    if (!rows.length) return '';
    return `${rows[0]['Period']} → ${rows[rows.length - 1]['Period']}  (${rows.length} period${rows.length === 1 ? '' : 's'})`;
  }

  // ── Event handlers ────────────────────────────────────────────────────────────
  setPeriodType(type: 'monthly' | 'yearly'): void {
    this.periodType.set(type);
    this.startPeriod = '';
    this.endPeriod   = '';
    this.validationError.set('');
  }

  onStartPeriodChange(): void {
    if (this.endPeriod && this.endPeriod < this.startPeriod) this.endPeriod = '';
    this.validationError.set('');
  }

  onGroupByChange(value: 'currency' | 'statistics'): void {
    this.groupBy.set(value);
    this.recomputeTable();
  }

  onSubFilterChange(): void {
    this.recomputeTable();
  }

  moveRight(): void {
    const sel    = this.availableSelectRef.nativeElement;
    const toMove = Array.from(sel.selectedOptions).map(o => o.value);
    this.availableToCurrencies = this.availableToCurrencies.filter(c => !toMove.includes(c));
    this.selectedToCurrencies  = [...this.selectedToCurrencies, ...toMove].sort();
    this.validationError.set('');
  }

  moveLeft(): void {
    const sel    = this.selectedSelectRef.nativeElement;
    const toMove = Array.from(sel.selectedOptions).map(o => o.value);
    this.selectedToCurrencies  = this.selectedToCurrencies.filter(c => !toMove.includes(c));
    this.availableToCurrencies = [...this.availableToCurrencies, ...toMove].sort();
    this.validationError.set('');
  }

  // ── Validation ────────────────────────────────────────────────────────────────
  private validate(): string | null {
    if (!this.fromCurrency) return 'Please select a From currency.';
    if (!this.startPeriod)  return 'Please select a start period.';
    if (!this.endPeriod)    return 'Please select an end period.';
    if (this.endPeriod < this.startPeriod) return 'End period must be on or after start period.';
    if (this.periodType() === 'monthly') {
      const [sy, sm] = this.startPeriod.split('-').map(Number);
      const [ey, em] = this.endPeriod.split('-').map(Number);
      if ((ey - sy) * 12 + (em - sm) > 59) return 'Period range cannot exceed 5 years (60 months).';
    } else {
      if (parseInt(this.endPeriod, 10) - parseInt(this.startPeriod, 10) > 4) {
        return 'Period range cannot exceed 5 years.';
      }
    }
    return null;
  }

  // ── Fetch ─────────────────────────────────────────────────────────────────────
  fetchStatistics(): void {
    const err = this.validate();
    if (err) { this.validationError.set(err); return; }

    this.validationError.set('');
    this.isLoading = true;
    this.spinner.show();
    this.tableColumnHeaders.set([]);
    this.tableData.set([]);
    this.resultLength.set(0);
    this.buttonConfig = { left: { label: 'Reset' }, right: { label: 'Fetching…', disabled: true } };

    let startDate: string;
    let endDate: string;
    if (this.periodType() === 'monthly') {
      startDate = `${this.startPeriod}-01`;
      const [ey, em] = this.endPeriod.split('-').map(Number);
      endDate = `${this.endPeriod}-${String(new Date(ey, em, 0).getDate()).padStart(2, '0')}`;
    } else {
      startDate = `${this.startPeriod}-01-01`;
      endDate   = `${this.endPeriod}-12-31`;
    }

    const payload: RatesRangePayload = {
      startDate, endDate,
      baseCurrency: 'AUD',
      currencyFrom: this.fromCurrency
    };
    if (this.selectedToCurrencies.length) payload.currencyTo = [...this.selectedToCurrencies];

    this.fetchXRApiService.getRatesRange(payload).subscribe({
      next: (result) => {
        this.rawResult = result ?? {};
        this.availableCurrenciesInResult = this.extractCurrencies(this.rawResult);
        if (!this.selectedCurrency && this.availableCurrenciesInResult.length) {
          this.selectedCurrency = this.availableCurrenciesInResult[0];
        }
        this.recomputeTable();
        this.hasSearched.set(true);
        this.isLoading = false;
        this.spinner.hide();
        this.buttonConfig = { left: { label: 'Reset' }, right: { label: 'Fetch Statistics', disabled: false } };
      },
      error: () => {
        this.validationError.set('Failed to fetch rates. Please try again.');
        this.hasSearched.set(true);
        this.isLoading = false;
        this.spinner.hide();
        this.buttonConfig = { left: { label: 'Reset' }, right: { label: 'Fetch Statistics', disabled: false } };
      }
    });
  }

  // ── Table computation ─────────────────────────────────────────────────────────
  private extractCurrencies(result: Record<string, any>): string[] {
    const set = new Set<string>();
    for (const values of Object.values(result)) {
      for (const key of Object.keys(values ?? {})) set.add(key);
    }
    if (this.selectedToCurrencies.length) {
      return this.selectedToCurrencies.filter(c => set.has(c));
    }
    return Array.from(set).sort();
  }

  private recomputeTable(): void {
    if (!Object.keys(this.rawResult).length) return;
    const { headers, rows } = this.buildTableData();
    this.tableColumnHeaders.set(headers);
    this.tableData.set(rows);
    this.resultLength.set(rows.length);
  }

  /** Groups raw daily rates into a period → currency → values[] map */
  private buildPeriodMap(): Map<string, Map<string, number[]>> {
    const periodMap = new Map<string, Map<string, number[]>>();
    for (const [date, values] of Object.entries(this.rawResult)) {
      const period = this.periodType() === 'monthly'
        ? date.substring(0, 7)
        : date.substring(0, 4);
      if (!periodMap.has(period)) periodMap.set(period, new Map());
      const currMap = periodMap.get(period)!;
      for (const [currency, rate] of Object.entries(values ?? {})) {
        if (!currMap.has(currency)) currMap.set(currency, []);
        currMap.get(currency)!.push(rate as number);
      }
    }
    return periodMap;
  }

  /** Returns the resolved currency list from the period map (respects selectedToCurrencies) */
  private resolveCurrencies(periodMap: Map<string, Map<string, number[]>>): string[] {
    return this.availableCurrenciesInResult.length
      ? this.availableCurrenciesInResult
      : Array.from(new Set(
          Array.from(periodMap.values()).flatMap(m => Array.from(m.keys()))
        )).sort();
  }

  private buildTableData(): { headers: string[]; rows: any[] } {
    const periodMap  = this.buildPeriodMap();
    const periods    = Array.from(periodMap.keys()).sort();
    const currencies = this.resolveCurrencies(periodMap);

    if (this.effectiveGroupBy === 'currency') {
      const currency = this.selectedToCurrencies.length === 1
        ? this.selectedToCurrencies[0]
        : (this.selectedCurrency || currencies[0] || '');

      const headers = ['Period', ...METRICS];
      const rows = periods.map(p => ({
        Period: p,
        ...this.computeMetrics(periodMap.get(p)?.get(currency) ?? [])
      }));
      return { headers, rows };

    } else {
      const metric  = this.selectedMetric || METRICS[0];
      const headers = ['Period', ...currencies];
      const rows = periods.map(p => {
        const row: any = { Period: p };
        for (const cur of currencies) {
          const m = this.computeMetrics(periodMap.get(p)?.get(cur) ?? []);
          row[cur] = m[metric] ?? '-';
        }
        return row;
      });
      return { headers, rows };
    }
  }

  private computeMetrics(values: number[]): Record<string, string | number> {
    if (!values.length) return Object.fromEntries(METRICS.map(m => [m, '-']));

    const sorted   = [...values].sort((a, b) => a - b);
    const n        = values.length;
    const avg      = values.reduce((s, v) => s + v, 0) / n;
    const mid      = Math.floor(n / 2);
    const med      = n % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    const min      = sorted[0];
    const max      = sorted[n - 1];
    const start    = values[0];
    const end      = values[n - 1];
    const chg      = start !== 0 ? ((end - start) / start) * 100 : 0;
    const variance = values.reduce((s, v) => s + (v - avg) ** 2, 0) / n;
    const vol      = Math.sqrt(variance);
    const rangePct = avg !== 0 ? ((max - min) / avg) * 100 : 0;
    const fmt      = (v: number, dp = 4) => parseFloat(v.toFixed(dp));

    return {
      'Average':      fmt(avg),
      'Median':       fmt(med),
      'Min':          fmt(min),
      'Max':          fmt(max),
      'Start':        fmt(start),
      'End':          fmt(end),
      'Change %':     fmt(chg, 2),
      'Volatility':   fmt(vol),
      'Trading Days': n,
      'Range %':      fmt(rangePct, 2)
    };
  }

  // ── Download ──────────────────────────────────────────────────────────────────
  private buildExportData(): GenericExcelWorkbook {
    const today       = new Date().toISOString().substring(0, 10);
    const periodLabel = this.periodType() === 'monthly' ? 'Monthly' : 'Yearly';
    const baseMetadata: any[][] = [
      ['Period Type',   periodLabel],
      ['Range',         `${this.startPeriod} → ${this.endPeriod}`],
      ['Generated On',  today]
    ];

    const periodMap  = this.buildPeriodMap();
    const allPeriods = Array.from(periodMap.keys()).sort();
    const currencies = this.resolveCurrencies(periodMap);
    const workbook: GenericExcelWorkbook = {};

    if (this.effectiveGroupBy === 'currency') {
      // One sheet per currency — columns: Period + all 10 metrics
      for (const currency of currencies) {
        const rows = allPeriods.map(p => ({
          Period: p,
          ...this.computeMetrics(periodMap.get(p)?.get(currency) ?? [])
        }));
        workbook[currency] = {
          metadataHeader: [['From ', this.fromCurrency, 'To', currency], ...baseMetadata],
          header: ['Period', ...METRICS],
          data:   rows
        };
      }
    } else {
      // One sheet per metric — columns: Period + all currencies
      for (const metric of METRICS) {
        const rows = allPeriods.map(p => {
          const row: any = { Period: p };
          for (const cur of currencies) {
            const m = this.computeMetrics(periodMap.get(p)?.get(cur) ?? []);
            row[cur] = m[metric] ?? '-';
          }
          return row;
        });
        workbook[metric] = {
          metadataHeader: [...baseMetadata, ['Statistic', metric]],
          header: ['Period', ...currencies],
          data:   rows
        };
      }
    }

    return workbook;
  }

  private get exportReportName(): string {
    return `Currency_Statistics_${this.fromCurrency}_${this.startPeriod}_to_${this.endPeriod}`;
  }

  downloadExcel(): void {
    this.excelReport.workbookData = this.buildExportData();
    this.excelReport.reportName   = this.exportReportName;
    this.excelReport.generateExcel();
  }

  downloadCsv(): void {
    this.csvReport.workbookData = this.buildExportData() as unknown as GenericCsvWorkbook;
    this.csvReport.reportName   = this.exportReportName;
    this.csvReport.generateCsvFiles();
  }

  downloadPdf(): void {
    this.pdfReport.workbookData = this.buildExportData() as unknown as GenericPdfWorkbook;
    this.pdfReport.reportName   = this.exportReportName;
    this.pdfReport.generatePdf();
  }

  // ── Reset ─────────────────────────────────────────────────────────────────────
  reset(): void {
    this.fromCurrency  = '';
    this.availableToCurrencies = [...this.COMMON_CURRENCIES];
    this.selectedToCurrencies  = [];
    this.startPeriod   = '';
    this.endPeriod     = '';
    this.isLoading     = false;
    this.rawResult     = {};
    this.availableCurrenciesInResult = [];
    this.selectedCurrency = '';
    this.selectedMetric   = 'Average';
    this.tableColumnHeaders.set([]);
    this.tableData.set([]);
    this.resultLength.set(0);
    this.validationError.set('');
    this.hasSearched.set(false);
    this.groupBy.set('currency');
    this.buttonConfig = { left: { label: 'Reset' }, right: { label: 'Fetch Statistics', disabled: false } };
  }

  handleAction(side: 'left' | 'right'): void {
    side === 'left' ? this.reset() : this.fetchStatistics();
  }
}
