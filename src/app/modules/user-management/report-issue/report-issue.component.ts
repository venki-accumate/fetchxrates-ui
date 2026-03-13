import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { firstValueFrom } from 'rxjs';
import {
  UserManagementService,
  IssuePayload,
  SubmitStatus,
} from '../../../services/user-management.service';
import { AuthStateService } from '../../../services/auth-state.service';
import { NgxSpinnerService } from 'ngx-spinner';

type SupportMeta = import('../../../services/user-management.service').SupportMeta;
type IssueForm = Omit<IssuePayload, keyof SupportMeta>;

@Component({
  selector: 'app-report-issue',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, MatIconModule],
  templateUrl: './report-issue.component.html',
  styleUrls: ['./report-issue.component.scss'],
})
export class ReportIssueComponent {
  private readonly userMgmtService = inject(UserManagementService);
  private readonly authState = inject(AuthStateService);
  private readonly spinner = inject(NgxSpinnerService);

  readonly categoryOptions = [
    { value: 'bug', label: 'Bug / Unexpected Behaviour', icon: 'bug_report' },
    { value: 'performance', label: 'Performance Issue', icon: 'speed' },
    { value: 'data-issue', label: 'Data / Conversion Issue', icon: 'table_chart' },
    { value: 'billing', label: 'Billing Issue', icon: 'receipt_long' },
    { value: 'other', label: 'Other', icon: 'help_outline' },
  ] as const;

  readonly severityOptions = [
    { value: 'low', label: 'Low', color: 'sev-low' },
    { value: 'medium', label: 'Medium', color: 'sev-medium' },
    { value: 'high', label: 'High', color: 'sev-high' },
    { value: 'critical', label: 'Critical', color: 'sev-critical' },
  ] as const;

  readonly form = signal<IssueForm>({
    category: 'bug',
    severity: 'medium',
    title: '',
    description: '',
    stepsToReproduce: '',
  });

  readonly status = signal<SubmitStatus>('idle');
  readonly incidentNumber = signal<string | null>(null);

  readonly isValid = computed(() => {
    const form = this.form();
    return form.title.trim().length >= 5 && form.description.trim().length >= 20;
  });

  setCategory(category: IssueForm['category']): void {
    this.form.update(form => ({ ...form, category }));
  }

  setSeverity(severity: IssueForm['severity']): void {
    this.form.update(form => ({ ...form, severity }));
  }

  setTitle(title: string): void {
    this.form.update(form => ({ ...form, title }));
  }

  setDescription(description: string): void {
    this.form.update(form => ({ ...form, description }));
  }

  setStepsToReproduce(stepsToReproduce: string): void {
    this.form.update(form => ({ ...form, stepsToReproduce }));
  }

  async submit(): Promise<void> {
    if (!this.isValid()) return;

    this.status.set('idle');
    this.spinner.show();

    try {
      const meta = await this.userMgmtService.buildSupportMeta(this.authState);
      const payload: IssuePayload = { ...this.form(), ...meta };
      const response = await firstValueFrom(this.userMgmtService.submitIssue(payload));

      this.incidentNumber.set(response?.incidentNumber ?? null);
      this.status.set(response?.success ? 'success' : 'error');
    } catch (error) {
      this.status.set('error');
      console.error('Failed to submit issue', error);
    } finally {
      this.spinner.hide();
    }
  }

  reset(): void {
    this.form.set({
      category: 'bug',
      severity: 'medium',
      title: '',
      description: '',
      stepsToReproduce: '',
    });
    this.incidentNumber.set(null);
    this.status.set('idle');
  }
}