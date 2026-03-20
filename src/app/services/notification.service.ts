import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import {
  ActiveNotification,
  AppNotificationConfig,
  AppNotificationMessage,
} from '../models/notification.model';
import { FetchXRApiService } from './fetchXR-api.service';

const DISMISSED_KEY = 'fxr-dismissed-notifications';
const CACHE_KEY = 'fxr-app-notifications';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

@Injectable({ providedIn: 'root' })
export class NotificationService {
  readonly notifications$ = new BehaviorSubject<ActiveNotification[]>([]);

  constructor(
    private api: FetchXRApiService,
    private router: Router,
  ) {}

  /**
   * Full initialisation — call once post-login (from checkin).
   * Fetches S3 config (with cache) and evaluates subscription state.
   */
  async initialize(userData: any): Promise<void> {
    const appMessages = await this.fetchAppNotifications();
    this.evaluateAndEmit(userData, appMessages);
  }

  /**
   * Lightweight re-evaluation — call on every NavigationEnd.
   * Reads userData and notification config from localStorage only (no API call
   * unless the 5-minute cache is stale).
   */
  async refresh(): Promise<void> {
    let userData: any = null;
    try {
      userData = JSON.parse(localStorage.getItem('userData') || 'null');
    } catch {}

    const appMessages = await this.fetchAppNotifications();
    this.evaluateAndEmit(userData, appMessages);
  }

  /** Dismiss a notification — persists to localStorage. */
  dismiss(id: string): void {
    const remaining = this.notifications$.value.filter(n => n.id !== id);
    this.notifications$.next(remaining);

    const dismissed = this.getDismissed();
    if (!dismissed.includes(id)) {
      try {
        localStorage.setItem(DISMISSED_KEY, JSON.stringify([...dismissed, id]));
      } catch {}
    }
  }

  // ---------------------------------------------------------------------------

  private evaluateAndEmit(userData: any, appMessages: AppNotificationMessage[]): void {
    const dismissed = this.getDismissed();
    const now = Date.now();
    const notifications: ActiveNotification[] = [];

    // 1. Subscription-based notifications from userData
    const sub = userData?.subscription;
    if (sub) {
      // Payment failure takes top priority
      if (sub.substatus === 'invoice_payment_failed') {
        const id = 'sub-payment-failed';
        if (!dismissed.includes(id)) {
          notifications.push({
            id,
            type: 'error',
            title: 'Payment Failed',
            message: 'Your subscription is inactive due to a payment issue. Please update your payment method to restore access.',
            dismissible: true,
            priority: 95,
          });
        }
      }

      // Subscription expiry warning — within 7 days
      const expiryDateStr = sub.nextBillingDate || sub.currentPeriodEnd;
      if (sub.status === 'active' && expiryDateStr) {
        const expiresAt = new Date(expiryDateStr).getTime();
        const daysLeft = Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24));
        if (daysLeft > 0 && daysLeft <= 7) {
          const id = 'sub-expiry-warning';
          if (!dismissed.includes(id)) {
            const formatted = new Date(expiryDateStr).toLocaleDateString('en-AU', {
              day: 'numeric', month: 'short', year: 'numeric',
            });
            notifications.push({
              id,
              type: 'warning',
              title: 'Subscription Expiring Soon',
              message: `Your subscription expires on ${formatted}. Renew now to avoid interruption.`,
              dismissible: true,
              priority: 80,
            });
          }
        }
      }
    }

    // 2. App-level notifications from S3
    for (const n of appMessages) {
      if (!n.active) continue;
      if (n.startsAt && new Date(n.startsAt).getTime() > now) continue;
      if (n.endsAt && new Date(n.endsAt).getTime() < now) continue;

      if (!dismissed.includes(n.id)) {
        notifications.push({
          id: n.id,
          type: n.type,
          title: n.title,
          message: n.message,
          dismissible: n.dismissible,
          priority: n.priority,
          mode: n.mode,
        });
      }

      // Maintenance window — redirect all routes except /maintenance itself
      if (
        n.mode === 'maintenance' &&
        n.active &&
        this.router.url !== '/maintenance'
      ) {
        this.router.navigate(['/maintenance']);
      }
    }

    notifications.sort((a, b) => b.priority - a.priority);
    this.notifications$.next(notifications);
  }

  private async fetchAppNotifications(): Promise<AppNotificationMessage[]> {
    // Return from localStorage cache if fresh
    try {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
        return cached.data as AppNotificationMessage[];
      }
    } catch {}

    try {
      const config = await firstValueFrom(
        this.api.getAppNotifications(),
      );
      const messages = config?.messages ?? [];
      localStorage.setItem(CACHE_KEY, JSON.stringify({ data: messages, fetchedAt: Date.now() }));
      return messages;
    } catch (err) {
      console.warn('[NotificationService] Could not fetch app notifications:', err);
      return [];
    }
  }

  private getDismissed(): string[] {
    try {
      return JSON.parse(localStorage.getItem(DISMISSED_KEY) || '[]');
    } catch {
      return [];
    }
  }
}
