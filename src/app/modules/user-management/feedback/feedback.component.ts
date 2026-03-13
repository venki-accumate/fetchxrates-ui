import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { firstValueFrom } from 'rxjs';
import {
  UserManagementService,
  FeedbackPayload,
  SubmitStatus,
} from '../../../services/user-management.service';
import { AuthStateService } from '../../../services/auth-state.service';
import { NgxSpinnerService } from 'ngx-spinner';

type SupportMeta = import('../../../services/user-management.service').SupportMeta;
type FeedbackForm = Omit<FeedbackPayload, keyof SupportMeta>;

@Component({
  selector: 'app-feedback',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, MatIconModule],
  templateUrl: './feedback.component.html',
  styleUrls: ['./feedback.component.scss'],
})
export class FeedbackComponent {
  private readonly userMgmtService = inject(UserManagementService);
  private readonly authState = inject(AuthStateService);
  private readonly spinner = inject(NgxSpinnerService);

  readonly typeOptions = [
    { value: 'general', label: 'General Feedback' },
    { value: 'feature-request', label: 'Feature Request' },
    { value: 'praise', label: 'Praise' },
    { value: 'other', label: 'Other' },
  ] as const;

  readonly stars = [1, 2, 3, 4, 5];

  readonly form = signal<FeedbackForm>({
    type: 'general',
    rating: 0,
    message: '',
  });

  readonly status = signal<SubmitStatus>('idle');
  readonly hoverRating = signal(0);
  readonly isSubmitting = signal(false);

  readonly isValid = computed(() => {
    const form = this.form();
    return form.rating > 0 && form.message.trim().length >= 10;
  });

  setType(type: FeedbackForm['type']): void {
    this.form.update(form => ({ ...form, type }));
  }

  setMessage(message: string): void {
    this.form.update(form => ({ ...form, message }));
  }

  setRating(rating: number): void {
    this.form.update(form => ({ ...form, rating }));
  }

  setHoverRating(rating: number): void {
    this.hoverRating.set(rating);
  }

  starFilled(n: number): boolean {
    return n <= (this.hoverRating() || this.form().rating);
  }

  async submit(): Promise<void> {
    if (!this.isValid() || this.isSubmitting()) return;

    this.isSubmitting.set(true);
    this.status.set('idle');
    this.spinner.show();

    try {
      const meta = await this.userMgmtService.buildSupportMeta(this.authState);
      const payload: FeedbackPayload = { ...this.form(), ...meta };
      const response = await firstValueFrom(this.userMgmtService.submitFeedback(payload));

      this.status.set(response?.success ? 'success' : 'error');
    } catch (error) {
      this.status.set('error');
      console.error('Failed to submit feedback', error);
    } finally {
      this.spinner.hide();
      this.isSubmitting.set(false);
    }
  }

  reset(): void {
    this.form.set({
      type: 'general',
      rating: 0,
      message: '',
    });
    this.hoverRating.set(0);
    this.status.set('idle');
  }
}