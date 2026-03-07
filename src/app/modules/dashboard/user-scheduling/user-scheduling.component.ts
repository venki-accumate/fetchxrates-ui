import {
  Component, OnInit, ViewChild, ElementRef,
  signal, AfterViewInit
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatButtonModule } from '@angular/material/button';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { ButtonBarComponent } from '../../../components/button-bar/button-bar.component';
import { NgxSpinnerModule, NgxSpinnerService } from 'ngx-spinner';
import { FetchXRApiService, UserSchedule } from '../../../services/fetchXR-api.service';
import { UserServiceService } from '../../../services/user-service.service';
import { AuthStateService } from '../../../services/auth-state.service';
import { EventBusService } from '../../../services/event-bus.service';

@Component({
  selector: 'app-user-scheduling',
  standalone: true,
  templateUrl: './user-scheduling.component.html',
  styleUrl: './user-scheduling.component.scss',
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    MatExpansionModule,
    MatSlideToggleModule,
    MatTooltipModule,
    MatButtonModule,
    MatTableModule,
    ButtonBarComponent,
    NgxSpinnerModule
  ]
})
export class UserSchedulingComponent implements OnInit {
  constructor(
    private fetchXRApiService: FetchXRApiService,
    private userService: UserServiceService,
    private authState: AuthStateService,
    private eventBus: EventBusService,
    private spinner: NgxSpinnerService
  ) {}

  readonly COMMON_CURRENCIES = [
    'AUD', 'BRL', 'CAD', 'CHF', 'CNY', 'EUR', 'GBP', 'HKD', 'IDR', 'INR',
    'JPY', 'KRW', 'MXN', 'MYR', 'NOK', 'NZD', 'PHP', 'PLN', 'RUB', 'SAR',
    'SEK', 'SGD', 'THB', 'TRY', 'TWD', 'USD', 'ZAR'
  ];

  readonly FREQUENCIES = [
    { value: 'daily',   label: 'Daily'   },
    { value: 'weekly',  label: 'Weekly'  },
    { value: 'monthly', label: 'Monthly' }
  ] as const;

  readonly FORMATS = [
    { value: 'excel',       label: 'Excel'       },
    { value: 'csv',         label: 'CSV'         },
    { value: 'pdf',         label: 'PDF'         },
    { value: 'email_table', label: 'Email Table' }
  ] as const;

  readonly scheduleTableColumns = [
    'frequency', 'fromCurrency', 'toCurrencies',
    'deliveryFormat', 'statistics', 'recipients', 'actions'
  ];

  // ── Form state ────────────────────────────────────────────────────────────
  frequency: 'daily' | 'weekly' | 'monthly' = 'daily';
  fromCurrency = '';
  availableToCurrencies = [...this.COMMON_CURRENCIES];
  selectedToCurrencies: string[] = [];
  deliveryFormat: 'excel' | 'csv' | 'pdf' | 'email_table' = 'excel';
  showStatistics = false;
  emailRecipientsInput = '';
  editingScheduleId: string | null = null;

  @ViewChild('availableSelect') availableSelectRef!: ElementRef<HTMLSelectElement>;
  @ViewChild('selectedSelect')  selectedSelectRef!:  ElementRef<HTMLSelectElement>;

  // ── Data / UI state ───────────────────────────────────────────────────────
  hasScheduling    = signal(false);
  pendingSchedules = signal<UserSchedule[]>([]);
  hasUnsavedChanges = signal(false);
  validationError   = signal('');
  isLoading = false;

  scheduleTableSource = new MatTableDataSource<UserSchedule>([]);

  buttonConfig = {
    left:  { label: 'Reset'          },
    right: { label: 'Save Schedule', disabled: false }
  };

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  ngOnInit(): void {
    const userData     = this.authState.getUserData();
    const hasSchedules = userData?.hasScheduling === true
      || this.userService.userObject?.hasScheduling === true;

    this.hasScheduling.set(hasSchedules);
    if (hasSchedules) this.loadSchedules();
  }

  private loadSchedules(): void {
    const userId = this.userService.userObject?.userId;
    if (!userId) return;

    this.isLoading = true;
    this.spinner.show();

    this.fetchXRApiService.getSchedules(userId).subscribe({
      next: (schedules) => {
        const list = schedules ?? [];
        this.pendingSchedules.set(list);
        this.scheduleTableSource.data = list;
        this.hasUnsavedChanges.set(false);
        this.isLoading = false;
        this.spinner.hide();
      },
      error: () => {
        this.eventBus.showError('Failed to load schedules. Please try again.');
        this.isLoading = false;
        this.spinner.hide();
      }
    });
  }

  // ── Dual listbox ──────────────────────────────────────────────────────────
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

  // ── Computed helpers ──────────────────────────────────────────────────────
  get showStatisticsToggle(): boolean {
    return this.frequency === 'weekly' || this.frequency === 'monthly';
  }

  get isEditMode(): boolean { return !!this.editingScheduleId; }

  displayToCurrencies(currencies: string[]): string {
    if (!currencies.length) return 'All';
    return currencies.length <= 3
      ? currencies.join(', ')
      : `${currencies.slice(0, 3).join(', ')} +${currencies.length - 3}`;
  }

  displayStatistics(s: UserSchedule): string {
    if (s.frequency === 'daily') return 'N/A';
    return s.showStatistics ? 'Yes' : 'No';
  }

  displayFormat(fmt: string): string {
    const map: Record<string, string> = {
      excel: 'Excel', csv: 'CSV', pdf: 'PDF', email_table: 'Email Table'
    };
    return map[fmt] ?? fmt;
  }

  displayFrequency(freq: string): string {
    return freq.charAt(0).toUpperCase() + freq.slice(1);
  }

  displayRecipients(s: UserSchedule): string {
    const userEmail = this.getUserEmail();
    const all = [userEmail, ...(s.additionalRecipients ?? [])].filter(Boolean);
    if (all.length <= 2) return all.join(', ');
    return `${all[0]} +${all.length - 1} more`;
  }

  private getUserEmail(): string {
    return this.authState.getUser()?.signInDetails?.loginId
      || this.authState.getUser()?.email
      || '';
  }

  // ── Validation ────────────────────────────────────────────────────────────
  private validateForm(): string | null {
    if (!this.fromCurrency)  return 'Please select a From Currency.';
    if (!this.frequency)     return 'Please select a Frequency.';
    if (!this.deliveryFormat) return 'Please select a Delivery Format.';

    const recipients = this.parseRecipients();
    if (recipients === null) return 'One or more email addresses are invalid.';
    if (recipients.length > 3) return 'Maximum 3 additional recipients allowed.';

    return null;
  }

  private parseRecipients(): string[] | null {
    if (!this.emailRecipientsInput.trim()) return [];
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const parts = this.emailRecipientsInput.split(',').map(e => e.trim()).filter(Boolean);
    for (const p of parts) { if (!emailRegex.test(p)) return null; }
    return parts;
  }

  // ── Build schedule object ─────────────────────────────────────────────────
  private buildScheduleFromForm(): UserSchedule {
    const existingCreatedAt = this.editingScheduleId
      ? (this.pendingSchedules().find(s => s.id === this.editingScheduleId)?.createdAt ?? new Date().toISOString())
      : new Date().toISOString();

    return {
      id:                   this.editingScheduleId || this.generateId(),
      frequency:            this.frequency,
      fromCurrency:         this.fromCurrency,
      toCurrencies:         [...this.selectedToCurrencies],
      deliveryFormat:       this.deliveryFormat,
      showStatistics:       this.showStatisticsToggle ? this.showStatistics : false,
      additionalRecipients: this.parseRecipients() ?? [],
      createdAt:            existingCreatedAt,
      updatedAt:            new Date().toISOString()
    };
  }

  private generateId(): string {
    return `sched_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
  }

  // ── Table actions ─────────────────────────────────────────────────────────
  editScheduleRow(schedule: UserSchedule): void {
    this.editingScheduleId   = schedule.id;
    this.frequency           = schedule.frequency;
    this.fromCurrency        = schedule.fromCurrency;
    this.selectedToCurrencies  = [...schedule.toCurrencies];
    this.availableToCurrencies = this.COMMON_CURRENCIES.filter(c => !schedule.toCurrencies.includes(c));
    this.deliveryFormat      = schedule.deliveryFormat;
    this.showStatistics      = schedule.showStatistics;
    this.emailRecipientsInput = schedule.additionalRecipients.join(', ');
    this.validationError.set('');
  }

  deleteScheduleRow(id: string): void {
    this.pendingSchedules.update(list => list.filter(s => s.id !== id));
    this.scheduleTableSource.data = this.pendingSchedules();
    this.hasUnsavedChanges.set(true);
    if (this.editingScheduleId === id) this.resetForm();
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  saveSchedules(): void {
    // If form has a selection → validate and add/update entry
    const formHasData = !!this.fromCurrency;
    if (formHasData) {
      const err = this.validateForm();
      if (err) { this.validationError.set(err); return; }

      const schedule = this.buildScheduleFromForm();
      if (this.editingScheduleId) {
        this.pendingSchedules.update(list =>
          list.map(s => s.id === this.editingScheduleId ? schedule : s));
      } else {
        this.pendingSchedules.update(list => [...list, schedule]);
      }
    }

    const userId = this.userService.userObject?.userId;
    if (!userId) {
      this.eventBus.showError('User session not found. Please log in again.');
      return;
    }

    const wasFirstSchedule = !this.hasScheduling();
    this.isLoading = true;
    this.spinner.show();
    this.buttonConfig = { left: { label: 'Reset' }, right: { label: 'Saving…', disabled: true } };

    this.fetchXRApiService.saveSchedules(userId, this.pendingSchedules()).subscribe({
      next: () => {
        if (wasFirstSchedule) {
          this.hasScheduling.set(true);
          this.userService.setHasScheduling(true);
          const userData    = this.authState.getUserData() ?? {};
          const updatedUser = { ...userData, hasScheduling: true };
          this.authState.setUserData(updatedUser);
          this.fetchXRApiService.saveUserData(updatedUser).subscribe();
        }
        this.scheduleTableSource.data = this.pendingSchedules();
        this.hasUnsavedChanges.set(false);
        this.resetForm();
        this.isLoading = false;
        this.spinner.hide();
        this.buttonConfig = { left: { label: 'Reset' }, right: { label: 'Save Schedule', disabled: false } };
        this.eventBus.showSuccess('Schedule saved successfully.');
      },
      error: () => {
        this.eventBus.showError('Failed to save schedule. Please try again.');
        this.isLoading = false;
        this.spinner.hide();
        this.buttonConfig = { left: { label: 'Reset' }, right: { label: 'Save Schedule', disabled: false } };
      }
    });
  }

  reset(): void { this.resetForm(); }

  private resetForm(): void {
    this.frequency           = 'daily';
    this.fromCurrency        = '';
    this.availableToCurrencies = [...this.COMMON_CURRENCIES];
    this.selectedToCurrencies  = [];
    this.deliveryFormat      = 'excel';
    this.showStatistics      = false;
    this.emailRecipientsInput = '';
    this.editingScheduleId   = null;
    this.validationError.set('');
  }

  handleAction(side: 'left' | 'right'): void {
    side === 'left' ? this.reset() : this.saveSchedules();
  }
}
