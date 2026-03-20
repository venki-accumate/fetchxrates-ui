import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { NgxSpinnerService, NgxSpinnerModule } from 'ngx-spinner';
import { UserManagementService } from '../../../services/user-management.service';
import { AuthStateService } from '../../../services/auth-state.service';

type CancellationReason =
  | 'too-expensive'
  | 'missing-features'
  | 'found-alternative'
  | 'not-using-enough'
  | 'technical-issues'
  | 'other';

interface CancellationForm {
  reason: CancellationReason | '';
  additionalComments: string;
}

@Component({
  selector: 'app-subscription-cancellation',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, MatIconModule, NgxSpinnerModule],
  templateUrl: './subscription-cancellation.component.html',
  styleUrls: ['./subscription-cancellation.component.scss'],
})
export class SubscriptionCancellationComponent implements OnInit {
  private readonly userMgmtService = inject(UserManagementService);
  private readonly authState = inject(AuthStateService);
  private readonly spinner = inject(NgxSpinnerService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly reasonOptions: { value: CancellationReason; label: string; icon: string }[] = [
    { value: 'too-expensive',     label: 'Too expensive for my needs',        icon: 'money_off' },
    { value: 'missing-features',  label: 'Missing features I need',           icon: 'extension_off' },
    { value: 'found-alternative', label: 'Found a better alternative',        icon: 'swap_horiz' },
    { value: 'not-using-enough',  label: 'Not using the service enough',      icon: 'schedule' },
    { value: 'technical-issues',  label: 'Technical issues / poor experience', icon: 'bug_report' },
    { value: 'other',             label: 'Other reason',                      icon: 'help_outline' },
  ];

  readonly form = signal<CancellationForm>({ reason: '', additionalComments: '' });
  readonly loading = signal(false);
  readonly showConfirmation = signal(false);
  readonly loadError = signal(false);

  readonly isValid = computed(() => {
    const f = this.form();
    return f.reason !== '' && f.additionalComments.trim().length >= 10;
  });

  ngOnInit(): void {
    // Returning from Stripe billing portal after cancellation
    const status = this.route.snapshot.queryParamMap.get('status');
    if (status === 'cancelled') {
      this.showConfirmation.set(true);
      return;
    }

    // Also check if subscription already marked as cancel-at-period-end
    const userData = this.authState.getUserData();
    if (userData?.subscription?.cancelAtPeriodEnd === true) {
      this.showConfirmation.set(true);
    }
  }

  setReason(reason: CancellationReason): void {
    this.form.update(f => ({ ...f, reason }));
  }

  setComments(additionalComments: string): void {
    this.form.update(f => ({ ...f, additionalComments }));
  }

  async proceed(): Promise<void> {
    if (!this.isValid()) return;
    this.loading.set(true);
    this.loadError.set(false);
    this.spinner.show();
    try {
      const userData = this.authState.getUserData();
      const url = await this.userMgmtService.createBillingPortalSession({
        emailHash: userData?.emailHash ?? '',
        userId:    userData?.userId    ?? '',
        homePage:  userData?.homePage  ?? window.location.origin,
        isCancellation: true,
      });
      if (url) {
        window.location.href = url;
      }
    } catch (err) {
      console.error('[Cancellation] Failed to open billing portal', err);
      this.loadError.set(true);
    } finally {
      this.loading.set(false);
      this.spinner.hide();
    }
  }

  goToAccount(): void {
    this.router.navigate(['/user/account']);
  }
}
