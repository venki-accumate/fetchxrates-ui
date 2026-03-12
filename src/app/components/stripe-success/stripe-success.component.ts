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

  private readonly phases = [
    { delay: 10_000, count: 3 },
    { delay: 30_000, count: 3 },
    { delay: 60_000, count: 3 },
  ];

  private phaseIndex = 0;
  private phaseAttempts = 0;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private authState: AuthStateService,
    private apiService: FetchXRApiService,
    private route: ActivatedRoute,
    private router: Router,
    private spinner: NgxSpinnerService,
  ) {}

  async ngOnInit(): Promise<void> {
    localStorage.removeItem('stripeFlow');
    await this.authState.hydrateFromAmplify();
    const user = this.authState.getUser();
    this.username = user?.givenName || user?.email?.split('@')[0] || null;
    this.sessionId = this.route.snapshot.queryParamMap.get('session_id');
    if (this.sessionId) {
      this.updateUserStatus(this.sessionId);
    }
    this.startPolling();
  }

  ngOnDestroy(): void {
    this.clearTimers();
  }

  private clearTimers(): void {
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.pollTimer = null;
  }

  updateUserStatus(sessionId: string): void {
    const user = this.authState.getUser();
    const email = user?.email;
    if (!email) {
      console.error('updateUserStatus: no email in auth state');
      return;
    }
    this.apiService.postPaymentSuccess(email, sessionId).subscribe({
      next: () => console.log('Payment success acknowledged'),
      error: (err: HttpErrorResponse) => console.error('Payment success notify failed', err),
    });
  }

  private startPolling(): void {
    this.isPolling.set(true);
    this.pollMessage.set('Subscription activation in progress…');
    this.scheduleNextPoll();
  }

  private scheduleNextPoll(): void {
    if (this.phaseIndex >= this.phases.length) {
      this.stopPolling();
      return;
    }
    const { delay } = this.phases[this.phaseIndex];
    const delayLabel = delay < 60_000
      ? `${delay / 1000} seconds`
      : `${delay / 60_000} minute${delay / 60_000 !== 1 ? 's' : ''}`;
    this.pollMessage.set(`Activation in progress. Next check in ${delayLabel}…`);

    this.pollTimer = setTimeout(async () => {
      const done = await this.doPoll();
      if (done) return;
      this.phaseAttempts++;
      if (this.phaseAttempts >= this.phases[this.phaseIndex].count) {
        this.phaseIndex++;
        this.phaseAttempts = 0;
      }
      this.scheduleNextPoll();
    }, delay);
  }

  private async doPoll(): Promise<boolean> {
    this.pollCount.update(c => c + 1);
    const count = this.pollCount();
    const total = this.phases.reduce((s, p) => s + p.count, 0);
    this.pollMessage.set(`Checking subscription status… (attempt ${count} of ${total})`);

    try {
      const user = this.authState.getUser();
      const email = user?.email;
      if (!email) {
        console.error('doPoll: no email in auth state');
        this.stopPolling();
        return true;
      }
      const emailHash = await this.emailToSafeKey(email);
      const userData = await firstValueFrom(this.apiService.getUserData(emailHash));
      this.authState.setUserData(userData);

      if (userData.subscription?.status === 'active' && userData.subscription?.substatus === 'subscription_created_active') {
        const homePage = userData.homePage || '/dashboard';
        this.clearTimers();
        this.router.navigate([homePage]);
        return true;
      }
      return false;
    } catch (err) {
      console.error('Poll error:', err);
      return false;
    }
  }

  private stopPolling(): void {
    this.clearTimers();
    this.isPolling.set(false);
    this.pollMessage.set(
      'Sorry, we are encountering an unexpected issue. Our team has been notified and will action this immediately.'
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
