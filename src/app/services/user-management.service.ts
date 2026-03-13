import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, Observable } from 'rxjs';
import { AuthStateService } from './auth-state.service';
import { environment } from '../../environments/environment';

// ─── Models ──────────────────────────────────────────────────────────────────

export interface UserProfile {
  name: string;
  email: string;
  userId: string;
  /** e.g. 'Free' | 'Pro' | 'Enterprise' — read from Cognito custom attribute */
  plan: string;
  nextRenewalDate: string | null;
  lastPaymentDate: string | null;
  createdAt?: string;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  date: string;
  description: string;
  amount: number;
  currency: string;
  status: 'paid' | 'pending' | 'failed';
  /** Pre-signed download URL — set by API */
  downloadUrl?: string;
}

/** Metadata automatically appended to every support submission */
export interface SupportMeta {
  email: string;
  userName: string;
  userId: string;
  userTime: string;      // ISO local datetime
  utcTime: string;       // UTC datetime string
  browserAgent: string;
  locale: string;
}

export interface FeedbackPayload extends SupportMeta {
  type: 'general' | 'feature-request' | 'praise' | 'other';
  rating: number; // 1–5
  message: string;
}

export interface IssuePayload extends SupportMeta {
  category: 'bug' | 'performance' | 'data-issue' | 'billing' | 'other';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  stepsToReproduce: string;
}

export type SubmitStatus = 'idle' | 'submitting' | 'success' | 'error';

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class UserManagementService {
  private _profile = signal<UserProfile | null>(null);
  readonly profile = this._profile.asReadonly();

  constructor(private http: HttpClient) {}

  // ── Profile ──────────────────────────────────────────────────────────────

  /** Loads profile from AuthStateService (userData + user object). Uses in-memory cache. */
  async loadUserProfile(authState: AuthStateService): Promise<UserProfile> {
    const cached = this._profile();
    if (cached) return cached;

    const userData = authState.getUserData();
    const user = authState.getUser();

    const name = userData
      ? `${userData.firstName ?? ''} ${userData.lastName ?? ''}`.trim() || userData.email?.split('@')[0] || 'User'
      : user?.givenName || user?.email?.split('@')[0] || 'User';

    const sub = userData?.subscription;
    const stripe = userData?.stripe;

    const profile: UserProfile = {
      name,
      email: userData?.email || user?.email || '',
      userId: userData?.userId || user?.userId || '',
      plan: sub?.planStatus || (sub?.status === 'active' ? 'Pro' : 'Free'),
      nextRenewalDate: sub?.nextBillingDate ?? sub?.currentPeriodEnd ?? null,
      lastPaymentDate: sub?.startedAt ?? null,
      createdAt: userData?.createdAt,
    };

    this._profile.set(profile);
    return profile;
  }

  /** Call on sign-out to clear cached profile. */
  clearProfile(): void {
    this._profile.set(null);
  }

  // ── Invoices ─────────────────────────────────────────────────────────────

  /**
   * Fetches invoices for the current user.
   * TODO: replace stub with `this.http.get<Invoice[]>('/api/user/invoices').toPromise()`.
   */
  async loadInvoices(): Promise<Invoice[]> {
    // Stub — returns empty list until API is wired
    return [];
  }

  /**
   * Triggers a download for a specific invoice.
   * TODO: replace stub with actual pre-signed URL fetch if downloadUrl is missing.
   */
  downloadInvoice(invoice: Invoice): void {
    if (!invoice.downloadUrl || invoice.downloadUrl === '#') {
      console.warn('[UserManagement] No download URL for invoice', invoice.id);
      return;
    }
    const a = document.createElement('a');
    a.href = invoice.downloadUrl;
    a.download = `invoice-${invoice.invoiceNumber}.pdf`;
    a.click();
  }

  // ── Subscription ─────────────────────────────────────────────────────────

  /**
   * Returns the Stripe billing portal URL for upgrade / cancel.
   * TODO: replace stub with `this.http.post<{url:string}>('/api/stripe/portal', {action}).toPromise()`.
   */
  async getSubscriptionManageUrl(action: 'upgrade' | 'cancel'): Promise<string> {
    // Stub — replace with real Stripe billing portal session URL
    console.log('[UserManagement] Subscription action requested:', action);
    return '#';
  }

  // ── Feedback ─────────────────────────────────────────────────────────────

  /**
   * Collects browser / user metadata to attach to every support submission.
   * IP address is fetched from ipify (lightweight, no-auth public API).
   */
  async buildSupportMeta(authState: AuthStateService): Promise<SupportMeta> {
    const userData = authState.getUserData();
    const user     = authState.getUser();

    const email    = userData?.email    || user?.email    || '';
    const userName = userData
      ? `${userData.firstName ?? ''} ${userData.lastName ?? ''}`.trim() || email.split('@')[0]
      : user?.givenName || email.split('@')[0] || 'User';
    const userId = userData?.userId || user?.userId || '';

    return {
      email,
      userName,
      userId,
      userTime: new Date().toISOString(),
      utcTime:  new Date().toUTCString(),
      browserAgent: navigator.userAgent,
      locale: navigator.language,
    };
  }

  /** Submits user feedback to POST /support/feedback */
  submitFeedback(payload: FeedbackPayload): Observable<any> {
      return this.http.post(`${environment.backendUrl}/support/feedback`, payload);
  }

  // ── Issue Reporting ───────────────────────────────────────────────────────

  /** Submits a bug / issue report to POST /support/issue */
  submitIssue(payload: IssuePayload): Observable<any> {
    return this.http.post(`${environment.backendUrl}/support/issue`, payload);
  }
}
