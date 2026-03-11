import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import {
  UserManagementService,
  IssuePayload,
  SubmitStatus,
} from '../../../services/user-management.service';

@Component({
  selector: 'app-report-issue',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, MatIconModule],
  templateUrl: './report-issue.component.html',
  styleUrls: ['./report-issue.component.scss'],
})
export class ReportIssueComponent {
  form: IssuePayload = {
    category: 'bug',
    severity: 'medium',
    title: '',
    description: '',
    stepsToReproduce: '',
  };

  status: SubmitStatus = 'idle';

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

  constructor(
    private router: Router,
    private userMgmtService: UserManagementService
  ) {}

  get isValid(): boolean {
    return (
      this.form.title.trim().length >= 5 &&
      this.form.description.trim().length >= 20
    );
  }

  async submit(): Promise<void> {
    if (!this.isValid || this.status === 'submitting') return;
    this.status = 'submitting';
    try {
      await this.userMgmtService.submitIssue(this.form);
      this.status = 'success';
    } catch {
      this.status = 'error';
    }
  }

  reset(): void {
    this.form = {
      category: 'bug',
      severity: 'medium',
      title: '',
      description: '',
      stepsToReproduce: '',
    };
    this.status = 'idle';
  }
}
