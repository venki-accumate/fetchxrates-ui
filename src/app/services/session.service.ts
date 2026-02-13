import { Injectable } from '@angular/core';
import { BehaviorSubject, timer, Subscription } from 'rxjs';
import { signOut, fetchAuthSession } from 'aws-amplify/auth';
import { Router } from '@angular/router';

@Injectable({
  providedIn: 'root',
})
export class SessionService {
  private sessionExpiryTime = 3460;
  private warningTime = 600;
  public showModal$ = new BehaviorSubject<boolean>(false);
  private checkInterval?: Subscription;
  private sessionStartTime: number = Date.now();

  constructor(private router: Router) {}

  startSessionTimer() {
    const url = this.router.url;
    this.clearTimers();
    if (url === '/login' || url === '/signup') return;

    this.sessionStartTime = Date.now();

    this.checkInterval = timer(0, 30 * 1000).subscribe(() => {
      const elapsed = (Date.now() - this.sessionStartTime) / 1000;

      if (elapsed >= this.sessionExpiryTime) {
        this.invalidateSession();
      } else if (elapsed >= this.sessionExpiryTime - this.warningTime) {
        this.showModal$.next(true);
      }
    });
  }

  clearTimers() {
    this.checkInterval?.unsubscribe();
    this.checkInterval = undefined;
  }

  async extendSession() {
    try {
      await fetchAuthSession({ forceRefresh: true });
      this.showModal$.next(false);
      this.startSessionTimer();
    } catch (error) {
      console.error('Error extending session:', error);
      this.invalidateSession();
    }
  }

  async invalidateSession() {
    await signOut({ global: true });
    localStorage.clear();
    this.showModal$.next(false);
    this.router.navigate(['/login']);
  }
}
