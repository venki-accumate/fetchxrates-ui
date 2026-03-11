import { Injectable, signal } from '@angular/core';
import { fetchAuthSession } from '@aws-amplify/auth';

// ─── Models ──────────────────────────────────────────────────────────────────

export interface UserProfile {
  name: string;
  email: string;
  userId: string;
  /** e.g. 'Free' | 'Pro' | 'Enterprise' — read from Cognito custom attribute */
  plan: string;
  nextRenewalDate: string | null;
  lastPaymentDate: string | null;
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

export interface FeedbackPayload {
  type: 'general' | 'feature-request' | 'praise' | 'other';
  rating: number; // 1–5
  message: string;
}

export interface IssuePayload {
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

  // ── Profile ──────────────────────────────────────────────────────────────

  /** Loads from Cognito token; returns cached value on subsequent calls. */
  async loadUserProfile(): Promise<UserProfile> {
    const cached = this._profile();
    if (cached) return cached;

    try {
      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.payload ?? {};

      const profile: UserProfile = {
        name:
          (token['given_name'] as string) ||
          (token['name'] as string) ||
          sessionStorage.getItem('userName') ||
          'User',
        email: (token['email'] as string) || '',
        userId: (token['sub'] as string) || '',
        // Custom Cognito attributes — populate these in your user pool
        plan:
          (token['custom:plan'] as string) ||
          sessionStorage.getItem('userPlan') ||
          'Pro',
        nextRenewalDate:
          (token['custom:nextRenewalDate'] as string) ||
          sessionStorage.getItem('nextRenewalDate') ||
          null,
        lastPaymentDate:
          (token['custom:lastPaymentDate'] as string) ||
          sessionStorage.getItem('lastPaymentDate') ||
          null,
      };

      this._profile.set(profile);
      return profile;
    } catch {
      const fallback: UserProfile = {
        name: sessionStorage.getItem('userName') || 'User',
        email: '',
        userId: '',
        plan: 'Pro',
        nextRenewalDate: null,
        lastPaymentDate: null,
      };
      this._profile.set(fallback);
      return fallback;
    }
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
   * Submits user feedback.
   * TODO: replace stub with `this.http.post('/api/user/feedback', payload).toPromise()`.
   */
  async submitFeedback(payload: FeedbackPayload): Promise<void> {
    console.log('[UserManagement] Feedback submitted:', payload);
    // Simulate network delay
    await new Promise(r => setTimeout(r, 800));
  }

  // ── Issue Reporting ───────────────────────────────────────────────────────

  /**
   * Submits a support / bug report.
   * TODO: replace stub with `this.http.post('/api/user/issues', payload).toPromise()`.
   */
  async submitIssue(payload: IssuePayload): Promise<void> {
    console.log('[UserManagement] Issue reported:', payload);
    // Simulate network delay
    await new Promise(r => setTimeout(r, 800));
  }
}
