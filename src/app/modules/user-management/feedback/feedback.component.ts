import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import {
  UserManagementService,
  FeedbackPayload,
  SubmitStatus,
} from '../../../services/user-management.service';

@Component({
  selector: 'app-feedback',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, MatIconModule],
  templateUrl: './feedback.component.html',
  styleUrls: ['./feedback.component.scss'],
})
export class FeedbackComponent {
  form: FeedbackPayload = { type: 'general', rating: 0, message: '' };
  status: SubmitStatus = 'idle';
  hoverRating = 0;

  readonly typeOptions = [
    { value: 'general', label: 'General Feedback' },
    { value: 'feature-request', label: 'Feature Request' },
    { value: 'praise', label: 'Praise' },
    { value: 'other', label: 'Other' },
  ] as const;

  readonly stars = [1, 2, 3, 4, 5];

  constructor(
    private router: Router,
    private userMgmtService: UserManagementService
  ) {}

  setRating(n: number): void {
    this.form.rating = n;
  }

  starFilled(n: number): boolean {
    return n <= (this.hoverRating || this.form.rating);
  }

  get isValid(): boolean {
    return this.form.rating > 0 && this.form.message.trim().length >= 10;
  }

  async submit(): Promise<void> {
    if (!this.isValid || this.status === 'submitting') return;
    this.status = 'submitting';
    try {
      await this.userMgmtService.submitFeedback(this.form);
      this.status = 'success';
    } catch {
      this.status = 'error';
    }
  }

  reset(): void {
    this.form = { type: 'general', rating: 0, message: '' };
    this.status = 'idle';
  }
}
