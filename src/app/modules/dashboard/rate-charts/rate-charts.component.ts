import { Component, OnInit, ElementRef, signal, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatExpansionModule } from '@angular/material/expansion';
import { NgxSpinnerModule, NgxSpinnerService } from 'ngx-spinner';

import { FetchXRApiService, RatesRangePayload } from '../../../services/fetchXR-api.service';
import { CurrencyService } from '../../../services/currency.service';
import { ButtonBarComponent, ActionBarConfig } from '../../../components/button-bar/button-bar.component';
import { LineRaceComponent } from '../../../components/charts/line-race/line-race.component';
import { ComparisonBarComponent } from '../../../components/charts/comparison-bar/comparison-bar.component';

@Component({
  selector: 'app-rate-charts',
  standalone: true,
  templateUrl: './rate-charts.component.html',
  styleUrl: './rate-charts.component.scss',
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    MatExpansionModule,
    NgxSpinnerModule,
    ButtonBarComponent,
    LineRaceComponent,
    ComparisonBarComponent
  ]
})
export class RateChartsComponent implements OnInit {

  constructor(
    private apiService: FetchXRApiService,
    private spinner: NgxSpinnerService,
    readonly currencyService: CurrencyService
  ) {}

  ngOnInit(): void {
    this.currencyService.load().then(() => {
      this.availableToCurrencies = [...this.currencyService.codes()];
      this.currencies = Object.fromEntries(
        this.currencyService.codes().map(c => [c, this.currencyService.label(c)])
      );
    });
  }

  // ─── Constants ──────────────────────────────────────────────────────────────

  fromCurrency = '';
  startDate = '';
  endDate = '';
  availableToCurrencies: string[] = [];
  selectedToCurrencies: string[] = [];
  currencies: Record<string, string> = {};

  @ViewChild('availableSelect') availableSelectRef!: ElementRef<HTMLSelectElement>;
  @ViewChild('selectedSelect')  selectedSelectRef!: ElementRef<HTMLSelectElement>;

  // ─── Date helpers ─────────────────────────────────────────────────────────────

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

  onStartDateChange(): void {
    if (this.endDate && (this.endDate > this.maxEndDate || this.endDate < this.startDate)) {
      this.endDate = '';
    }
    this.validationError.set('');
  }

  // ─── UI state ────────────────────────────────────────────────────────────────

  isLoading = false;
  validationError = signal('');
  hasLoaded = signal(false);

  get resultTitle(): string {
    const n = this.loadedCurrencies.length;
    const to = n === 1 ? this.loadedCurrencies[0] : `${n} Currencies`;
    return `${this.loadedFrom} → ${to}`;
  }

  get resultSummary(): string {
    if (!this.startDate || !this.endDate) return '';
    return `${this.fmtDisplayDate(this.startDate)} → ${this.fmtDisplayDate(this.endDate)}`;
  }

  private fmtDisplayDate(iso: string): string {
    const [y, m, d] = iso.split('-');
    const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${d} ${names[parseInt(m, 10) - 1]} ${y}`;
  }

  buttonConfig: ActionBarConfig = {
    left:  { label: 'Reset' },
    right: { label: 'Load Charts' }
  };

  // ─── Chart data (signals) ────────────────────────────────────────────────────

  lineRaceSource = signal<any[][]>([]);
  comparisonData  = signal<any[]>([]);

  // Keep a snapshot of which currencies were last loaded (so inputs retain state)
  loadedCurrencies: string[] = [];
  loadedFrom = '';

  // ─── Button-bar handler ──────────────────────────────────────────────────────

  handleAction(side: 'left' | 'right'): void {
    side === 'left' ? this.reset() : this.loadCharts();
  }

  // ─── Validation ──────────────────────────────────────────────────────────────

  private validate(): string | null {
    if (!this.fromCurrency)                        return 'Please select a From currency.';
    if (this.selectedToCurrencies.length === 0)    return 'Please select at least one To currency.';
    if (this.selectedToCurrencies.length > 8)      return 'Please select at most 8 currencies for readability.';
    if (this.selectedToCurrencies.includes(this.fromCurrency))
                                                   return 'To currencies must differ from the From currency.';
    if (!this.startDate)                           return 'Please select a start date.';
    if (!this.endDate)                             return 'Please select an end date.';
    if (this.endDate < this.startDate)             return 'End date must be on or after start date.';
    const today = new Date().toISOString().substring(0, 10);
    if (this.endDate >= today)                     return 'End date cannot be today or in the future.';
    const diffDays = (new Date(this.endDate).getTime() - new Date(this.startDate).getTime()) / 86400000;
    if (diffDays > 365.25 * 5)                     return 'Date range cannot exceed 5 years.';
    return null;
  }

  // ─── Load charts ─────────────────────────────────────────────────────────────

  loadCharts(): void {
    const err = this.validate();
    if (err) { this.validationError.set(err); return; }

    this.validationError.set('');
    this.isLoading = true;
    this.lineRaceSource.set([]);
    this.comparisonData.set([]);
    this.hasLoaded.set(false);

    this.buttonConfig = { left: { label: 'Reset' }, right: { label: 'Loading…', disabled: true } };
    this.spinner.show();

    const payload: RatesRangePayload = {
      startDate: this.startDate,
      endDate: this.endDate,
      currencyFrom: this.fromCurrency,
      currencyTo: [...this.selectedToCurrencies]
    };

    this.apiService.getRatesRange(payload).subscribe({
      next: (result) => {
        this.processData(result);
        this.loadedCurrencies = [...this.selectedToCurrencies];
        this.loadedFrom = this.fromCurrency;
        this.hasLoaded.set(true);
        this.isLoading = false;
        this.spinner.hide();
        this.buttonConfig = { left: { label: 'Reset' }, right: { label: 'Load Charts' } };
      },
      error: () => {
        this.validationError.set('Failed to fetch data. Please try again.');
        this.isLoading = false;
        this.hasLoaded.set(false);
        this.spinner.hide();
        this.buttonConfig = { left: { label: 'Reset' }, right: { label: 'Load Charts' } };
      }
    });
  }

  // ─── Data transformation ─────────────────────────────────────────────────────

  /**
   * Converts the raw API response (daily keyed by date) into:
   *  - lineRaceSource: [['Currency','Period','Rate'], ...]  (ECharts dataset source)
   *  - comparisonData: [{Period:'Jan 2024', EUR:0.92, ...}, ...]  (grouped bar source)
   *
   * Groups daily data into monthly snapshots (last rate of each month).
   */
  private processData(result: Record<string, any>): void {
    const monthlyMap: Record<string, Record<string, number>> = {};

    Object.entries(result)
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([date, rates]) => {
        const month = date.substring(0, 7); // 'YYYY-MM'
        monthlyMap[month] = rates as Record<string, number>;
      });

    const months = Object.keys(monthlyMap).sort();
    const currencies = this.selectedToCurrencies;

    // Comparison bar dataset: one object per month
    const comparison = months.map(m => {
      const row: any = { Period: this.fmtMonth(m) };
      currencies.forEach(c => {
        row[c] = +(monthlyMap[m]?.[c] ?? 0).toFixed(4);
      });
      return row;
    });

    // Line race dataset source: flat rows [currency, period, rate]
    const source: any[][] = [['Currency', 'Period', 'Rate']];
    months.forEach(m => {
      const label = this.fmtMonth(m);
      currencies.forEach(c => {
        source.push([c, label, +(monthlyMap[m]?.[c] ?? 0).toFixed(4)]);
      });
    });

    this.comparisonData.set(comparison);
    this.lineRaceSource.set(source);
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private fmtMonth(yyyyMM: string): string {
    const [year, month] = yyyyMM.split('-');
    const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${names[parseInt(month, 10) - 1]} ${year}`;
  }

  // ─── Dual-listbox actions ────────────────────────────────────────────────────

  moveRight(): void {
    const sel = this.availableSelectRef.nativeElement;
    const toMove = Array.from(sel.selectedOptions).map(o => o.value);
    this.availableToCurrencies = this.availableToCurrencies.filter(c => !toMove.includes(c));
    this.selectedToCurrencies  = [...this.selectedToCurrencies, ...toMove].sort();
    this.validationError.set('');
  }

  moveLeft(): void {
    const sel = this.selectedSelectRef.nativeElement;
    const toMove = Array.from(sel.selectedOptions).map(o => o.value);
    this.selectedToCurrencies  = this.selectedToCurrencies.filter(c => !toMove.includes(c));
    this.availableToCurrencies = [...this.availableToCurrencies, ...toMove].sort();
    this.validationError.set('');
  }

  // ─── Reset ───────────────────────────────────────────────────────────────────

  reset(): void {
    this.fromCurrency           = '';
    this.startDate              = '';
    this.endDate                = '';
    this.availableToCurrencies  = [...this.currencyService.codes()];
    this.selectedToCurrencies   = [];
    this.loadedCurrencies       = [];
    this.loadedFrom             = '';
    this.isLoading              = false;
    this.lineRaceSource.set([]);
    this.comparisonData.set([]);
    this.validationError.set('');
    this.hasLoaded.set(false);
    this.buttonConfig = { left: { label: 'Reset' }, right: { label: 'Load Charts' } };
  }
}
