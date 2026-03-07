import { Component, OnInit, OnDestroy, signal } from '@angular/core';
import { FetchXRApiService } from '../../services/fetchXR-api.service';
import { AuthStateService } from '../../services/auth-state.service';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { NgxSpinnerService } from 'ngx-spinner';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-stripe-success',
  standalone: true,
  imports: [],
  templateUrl: './stripe-success.component.html',
  styleUrl: './stripe-success.component.scss',
})
export class StripeSuccessComponent implements OnInit, OnDestroy {
  username: string | null = null;
  sessionId: string | null = null;

  isPolling = signal(false);
  pollCount = signal(0);
  pollMessage = signal('');
  readonly maxPolls = 10;

  private initialTimer: ReturnType<typeof setTimeout> | null = null;
  private pollInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private authState: AuthStateService,
    private apiService: FetchXRApiService,
    private route: ActivatedRoute,
    private router: Router,
    private spinner: NgxSpinnerService,
  ) {}

  async ngOnInit(): Promise<void> {
    localStorage.removeItem('stripeFlow');
    this.username = localStorage.getItem('username');
    await this.authState.hydrateFromAmplify();
    this.sessionId = this.route.snapshot.queryParamMap.get('session_id');
    if (this.sessionId) {
      this.updateUserStatus(this.sessionId);
    }
    this.startPollingAfterDelay();
  }

  ngOnDestroy(): void {
    this.clearTimers();
  }

  private clearTimers(): void {
    if (this.initialTimer) clearTimeout(this.initialTimer);
    if (this.pollInterval) clearInterval(this.pollInterval);
  }

  updateUserStatus(sessionId: string): void {
    const { email } = this.authState.getUserData();
    this.apiService.postPaymentSuccess(email, sessionId).subscribe({
      next: () => console.log('Payment success acknowledged'),
      error: (err: HttpErrorResponse) => console.error('Payment success notify failed', err),
    });
  }

  private startPollingAfterDelay(): void {
    this.pollMessage.set('Checking your subscription status in 30 seconds…');
    this.initialTimer = setTimeout(() => {
      this.isPolling.set(true);
      this.doPoll();
      this.pollInterval = setInterval(() => {
        if (this.pollCount() >= this.maxPolls) {
          this.stopPolling();
          return;
        }
        this.doPoll();
      }, 60_000);
    }, 30_000);
  }

  private async doPoll(): Promise<void> {
    this.pollCount.update(c => c + 1);
    const count = this.pollCount();
    const remaining = this.maxPolls - count;
    this.pollMessage.set(`Checking subscription status… (attempt ${count} of ${this.maxPolls})`);

    try {
      const { email } = this.authState.getUserData();
      const emailHash = await this.emailToSafeKey(email || '');
      const userData = await firstValueFrom(this.apiService.getUserData(emailHash));
      this.authState.setUserData(userData);

      if (userData.status === 'active' && userData.substatus === 'subscription_created_active') {
        const homePage = userData.homePage || '/dashboard';
        this.clearTimers();
        this.router.navigate([homePage]);
        return;
      }

      if (remaining > 0) {
        this.pollMessage.set(
          `Activation in progress. Next check in 1 minute (${remaining} attempt${remaining !== 1 ? 's' : ''} remaining).`
        );
      } else {
        this.stopPolling();
      }
    } catch (err) {
      console.error('Poll error:', err);
      if (this.pollCount() >= this.maxPolls) {
        this.stopPolling();
      } else {
        const rem = this.maxPolls - this.pollCount();
        this.pollMessage.set(
          `Check failed. Retrying in 1 minute (${rem} attempt${rem !== 1 ? 's' : ''} remaining).`
        );
      }
    }
  }

  private stopPolling(): void {
    this.clearTimers();
    this.isPolling.set(false);
    this.pollMessage.set(
      'Auto-check complete. Please refresh the page manually or contact support if your account is not yet active.'
    );
  }

  async emailToSafeKey(email: string): Promise<string> {
    const canonical = email.trim().toLowerCase();
    const data = new TextEncoder().encode(canonical);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
}
