import { Injectable, NgZone, OnDestroy } from '@angular/core';
import { BehaviorSubject, Subscription } from 'rxjs';
import { signOut, fetchAuthSession } from 'aws-amplify/auth';
import { Router } from '@angular/router';

const LS_LOGOUT_KEY = 'app:logout';

@Injectable({
  providedIn: 'root',
})
export class SessionService implements OnDestroy {
  private warningTime = 600; // seconds before expiry to show modal
  public showModal$ = new BehaviorSubject<boolean>(false);
  private checkInterval?: Subscription;
  private tokenExpiresAt: number = 0; // unix ms
  private storageListener = (event: StorageEvent) => {
    if (event.key === LS_LOGOUT_KEY) {
      // Another tab signed out — clean up this tab without calling signOut() again
      NgZone.assertInAngularZone();
      this.clearTimers();
      this.showModal$.next(false);
      this.router.navigate(['/login']);
    }
  };

  constructor(private router: Router, private zone: NgZone) {
    window.addEventListener('storage', this.storageListener);
  }

  ngOnDestroy(): void {
    window.removeEventListener('storage', this.storageListener);
  }

  /**
   * Reads the actual Cognito token expiry from the current session and starts
   * a poll that fires every 30 s. Shows the warning modal 10 min before expiry
   * and auto-signs-out when the token has expired.
   */
  async startSessionTimer(): Promise<void> {
    const url = this.router.url;
    this.clearTimers();
    if (url === '/login' || url === '/signup') return;

    try {
      const session = await fetchAuthSession();
      const exp = session?.tokens?.idToken?.payload?.['exp'] as number | undefined;
      // exp is in seconds (JWT standard); convert to ms
      this.tokenExpiresAt = exp ? exp * 1000 : Date.now() + 3600 * 1000;
    } catch {
      // If we cannot read the session, default to 1 hour from now
      this.tokenExpiresAt = Date.now() + 3600 * 1000;
    }

    const tick = () => {
      this.zone.run(() => {
        const secondsLeft = (this.tokenExpiresAt - Date.now()) / 1000;
        if (secondsLeft <= 0) {
          this.invalidateSession();
        } else if (secondsLeft <= this.warningTime) {
          this.showModal$.next(true);
        } else {
          this.showModal$.next(false);
        }
      });
    };

    const id = window.setInterval(tick, 30_000);
    // Store as a pseudo-Subscription so clearTimers() works uniformly
    this.checkInterval = new Subscription(() => window.clearInterval(id));
    tick(); // run immediately
  }

  clearTimers(): void {
    this.checkInterval?.unsubscribe();
    this.checkInterval = undefined;
  }

  async extendSession(): Promise<void> {
    try {
      await fetchAuthSession({ forceRefresh: true });
      this.showModal$.next(false);
      await this.startSessionTimer();
    } catch (error) {
      console.error('Error extending session:', error);
      this.invalidateSession();
    }
  }

  async invalidateSession(broadcast = true): Promise<void> {
    this.clearTimers();
    if (broadcast) {
      // Signal all other tabs to sign out
      localStorage.setItem(LS_LOGOUT_KEY, Date.now().toString());
    }
    try {
      await signOut({ global: true });
    } catch { /* ignore — token may already be gone */ }
    localStorage.removeItem('userData');
    sessionStorage.removeItem('intendedUrl');
    this.showModal$.next(false);
    this.router.navigate(['/login']);
  }
}
