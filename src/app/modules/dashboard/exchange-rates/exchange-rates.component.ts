import { Component, ViewChild, ElementRef, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ButtonBarComponent } from '../../../components/button-bar/button-bar.component';
import { DataTableComponent } from '../../../components/data-table/data-table.component';
import { ExcelReportComponent, GenericExcelWorkbook } from '../../../components/excel-report/excel-report.component';
import { CsvReportComponent, GenericCsvWorkbook } from '../../../components/csv-report/csv-report.component';
import { PdfReportComponent, GenericPdfWorkbook } from '../../../components/pdf-report/pdf-report.component';
import { NgxSpinnerModule, NgxSpinnerService } from 'ngx-spinner';
import { FetchXRApiService, RatesRangePayload } from '../../../services/fetchXR-api.service';

@Component({
  selector: 'app-exchange-rates',
  standalone: true,
  templateUrl: './exchange-rates.component.html',
  styleUrl: './exchange-rates.component.scss',
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    MatExpansionModule,
    MatMenuModule,
    MatTooltipModule,
    ButtonBarComponent,
    NgxSpinnerModule,
    DataTableComponent,
    ExcelReportComponent,
    CsvReportComponent,
    PdfReportComponent
  ]
})
export class ExchangeRatesComponent {
  constructor(
    private fetchXRApiService: FetchXRApiService,
    private spinner: NgxSpinnerService
  ) {}

  readonly COMMON_CURRENCIES = [
    'AUD', 'BRL', 'CAD', 'CHF', 'CNY', 'EUR', 'GBP', 'HKD', 'IDR', 'INR',
    'JPY', 'KRW', 'MXN', 'MYR', 'NOK', 'NZD', 'PHP', 'PLN', 'RUB', 'SAR',
    'SEK', 'SGD', 'THB', 'TRY', 'TWD', 'USD', 'ZAR'
  ];

  fromCurrency = '';
  availableToCurrencies = [...this.COMMON_CURRENCIES];
  selectedToCurrencies: string[] = [];

  @ViewChild('availableSelect') availableSelectRef!: ElementRef<HTMLSelectElement>;
  @ViewChild('selectedSelect')  selectedSelectRef!: ElementRef<HTMLSelectElement>;
  @ViewChild('excelReport') excelReport!: ExcelReportComponent;
  @ViewChild('csvReport')   csvReport!: CsvReportComponent;
  @ViewChild('pdfReport')   pdfReport!: PdfReportComponent;

  startDate = '';
  endDate = '';
  isLoading = false;

  ratesResult = signal<Record<string, Record<string, number>>>({});
  resultLength = signal(0);
  tableColumnHeaders = signal<string[]>([]);
  tableData = signal<any[]>([]);
  validationError = signal('');
  hasSearched = signal(false);
  isPaginationEnabled = signal(true);

  private rawTableData = signal<any[]>([]);
  dateFormat = signal('YYYY-MM-DD');

  readonly DATE_FORMATS = [
    { label: 'YYYY-MM-DD',  value: 'YYYY-MM-DD'  },
    { label: 'DD-MM-YYYY',  value: 'DD-MM-YYYY'  },
    { label: 'DD/MM/YYYY',  value: 'DD/MM/YYYY'  },
    { label: 'MM/DD/YYYY',  value: 'MM/DD/YYYY'  },
    { label: 'DD MMM YYYY', value: 'DD MMM YYYY' },
    { label: 'MMM DD, YYYY', value: 'MMM DD, YYYY' }
  ];

  buttonConfig = {
    left: { label: 'Reset' },
    right: { label: 'Fetch Rates', disabled: false }
  };

  get maxDate(): string {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().substring(0, 10);
  }

  get maxEndDate(): string {
    if (!this.startDate) return this.maxDate;
    const d = new Date(this.startDate);
    d.setFullYear(d.getFullYear() + 5);
    const fiveYearsOut = d.toISOString().substring(0, 10);
    return fiveYearsOut < this.maxDate ? fiveYearsOut : this.maxDate;
  }

  get resultTitle(): string {
    const n = this.selectedToCurrencies.length;
    const to =
      n === 0
        ? 'All Currencies'
        : n === 1
          ? this.selectedToCurrencies[0]
          : `${n} Currencies`;

    return `${this.fromCurrency} → ${to}`;
  }

  get resultSummary(): string {
    const rows = this.tableData();
    if (!rows.length) return '';

    const count = rows.length;
    const first = rows[0].Date;
    const last = rows[count - 1].Date;

    return `${first} → ${last}  (${count} trading day${count === 1 ? '' : 's'})`;
  }

  onStartDateChange(): void {
    if (this.endDate && (this.endDate > this.maxEndDate || this.endDate < this.startDate)) {
      this.endDate = '';
    }
    this.validationError.set('');
  }

  private validate(): string | null {
    if (!this.fromCurrency) return 'Please select a From currency.';
    if (!this.startDate) return 'Please select a start date.';
    if (!this.endDate) return 'Please select an end date.';
    if (this.endDate < this.startDate) return 'End date must be on or after start date.';

    const today = new Date().toISOString().substring(0, 10);
    if (this.endDate >= today) return 'End date cannot be today or in the future.';

    const diffDays =
      (new Date(this.endDate).getTime() - new Date(this.startDate).getTime()) / 86400000;

    if (diffDays > 365.25 * 5) return 'Date range cannot exceed 5 years.';
    return null;
  }

  fetchRates(): void {
    const err = this.validate();
    if (err) {
      this.validationError.set(err);
      return;
    }

    this.validationError.set('');
    this.isLoading = true;
    this.spinner.show();
    this.ratesResult.set({});
    this.resultLength.set(0);
    this.tableColumnHeaders.set([]);
    this.tableData.set([]);
    this.buttonConfig = {
      left: { label: 'Reset' },
      right: { label: 'Fetching…', disabled: true }
    };

    const payload: RatesRangePayload = {
      startDate: this.startDate,
      endDate: this.endDate,
      baseCurrency: 'AUD',
      currencyFrom: this.fromCurrency
    };

    if (this.selectedToCurrencies.length) {
      payload.currencyTo = [...this.selectedToCurrencies];
    }

    this.fetchXRApiService.getRatesRange(payload).subscribe({
      next: (result) => {
        const rows = Object.entries(result ?? {}).map(([date, values]) => ({
          Date: date,
          ...(values ?? {})
        }));

        const valueHeaders = rows.length
          ? Object.keys(rows[0]).filter(key => key !== 'Date').sort()
          : [];

        this.ratesResult.set(result ?? {});
        this.resultLength.set(rows.length);
        this.tableColumnHeaders.set(['Date', ...valueHeaders]);
        this.rawTableData.set(rows);
        this.tableData.set(this.applyDateFormat(rows));
        this.validationError.set('');

        this.isLoading = false;
        this.hasSearched.set(true);
        this.spinner.hide();
        this.buttonConfig = {
          left: { label: 'Reset' },
          right: { label: 'Fetch Rates', disabled: false }
        };
      },
      error: () => {
        this.ratesResult.set({});
        this.resultLength.set(0);
        this.tableColumnHeaders.set([]);
        this.tableData.set([]);
        this.validationError.set('Failed to fetch rates. Please try again.');
        this.hasSearched.set(true);
        this.isLoading = false;
        this.spinner.hide();
        this.buttonConfig = {
          left: { label: 'Reset' },
          right: { label: 'Fetch Rates', disabled: false }
        };
      }
    });
  }

  reset(): void {
    this.fromCurrency = '';
    this.availableToCurrencies = [...this.COMMON_CURRENCIES];
    this.selectedToCurrencies = [];
    this.startDate = '';
    this.endDate = '';
    this.isLoading = false;

    this.ratesResult.set({});
    this.resultLength.set(0);
    this.tableColumnHeaders.set([]);
    this.rawTableData.set([]);
    this.tableData.set([]);
    this.validationError.set('');

    this.hasSearched.set(false);

    this.buttonConfig = {
      left: { label: 'Reset' },
      right: { label: 'Fetch Rates', disabled: false }
    };
  }

  moveRight(): void {
    const sel = this.availableSelectRef.nativeElement;
    const toMove = Array.from(sel.selectedOptions).map(o => o.value);

    this.availableToCurrencies = this.availableToCurrencies.filter(c => !toMove.includes(c));
    this.selectedToCurrencies = [...this.selectedToCurrencies, ...toMove].sort();
    this.validationError.set('');
  }

  moveLeft(): void {
    const sel = this.selectedSelectRef.nativeElement;
    const toMove = Array.from(sel.selectedOptions).map(o => o.value);

    this.selectedToCurrencies = this.selectedToCurrencies.filter(c => !toMove.includes(c));
    this.availableToCurrencies = [...this.availableToCurrencies, ...toMove].sort();
    this.validationError.set('');
  }

  setDateFormat(format: string): void {
    this.dateFormat.set(format);
    this.tableData.set(this.applyDateFormat(this.rawTableData()));
  }

  private applyDateFormat(rows: any[]): any[] {
    const fmt = this.dateFormat();
    if (fmt === 'YYYY-MM-DD') return rows;
    return rows.map(row => ({ ...row, Date: this.formatDate(row.Date, fmt) }));
  }

  private formatDate(iso: string, format: string): string {
    const parts = (iso ?? '').split('-');
    if (parts.length !== 3) return iso;
    const [y, m, d] = parts;
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    switch (format) {
      case 'DD-MM-YYYY':  return `${d}-${m}-${y}`;
      case 'DD/MM/YYYY':  return `${d}/${m}/${y}`;
      case 'MM/DD/YYYY':  return `${m}/${d}/${y}`;
      case 'DD MMM YYYY': return `${d} ${months[parseInt(m, 10) - 1]} ${y}`;
      case 'MMM DD, YYYY': return `${months[parseInt(m, 10) - 1]} ${d}, ${y}`;
      default:            return iso;
    }
  }

  /** Builds the one-sheet workbook that both Excel and CSV reporters consume */
  private buildExportData(): GenericExcelWorkbook {
    return {
      'Exchange Rates': {
        metadataHeader: [],
        header: this.tableColumnHeaders(),
        data: this.tableData()
      }
    };
  }

  private get exportReportName(): string {
    return `Exchange_Rates_${this.fromCurrency}_${this.startDate}_to_${this.endDate}`;
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

  togglePagination(): void { 
    this.isPaginationEnabled.set(!this.isPaginationEnabled());
  }

  handleAction(side: 'left' | 'right'): void {
    side === 'left' ? this.reset() : this.fetchRates();
  }
}