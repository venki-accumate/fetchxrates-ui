import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { fetchAuthSession, getCurrentUser, signOut } from 'aws-amplify/auth';

export interface SubscriptionData {
  status: string;
  planStatus: string;
  substatus: string;
  startedAt: string | null;
  currentPeriodEnd: string | null;
  nextBillingDate: string | null;
  cancelAtPeriodEnd: boolean;
}

export interface StripeData {
  customerId: string | null;
  subscriptionId: string | null;
  sessionId: string | null;
  paymentIntentId: string | null;
}

export interface UserData {
  userId: string;
  email: string;
  emailHash: string;
  firstName: string;
  lastName: string;
  company: string;
  createdAt: string;
  lastUpdate: number;
  homePage: string;
  hasScheduling: boolean;
  subscription?: SubscriptionData;
  stripe?: StripeData;
}

@Injectable({ providedIn: 'root' })
export class AuthStateService {
    private userSubject = new BehaviorSubject<any | null>(null);
    private userDataSubject = new BehaviorSubject<any | null>(null);
    private newUserSubject = new BehaviorSubject<boolean>(false);
    private emailHashValue = '';

    // Observable streams
    currentUser$ = this.userSubject.asObservable();
    currentUserData$ = this.userDataSubject.asObservable();
    isNewUser$ = this.newUserSubject.asObservable();

    constructor() {}

    /**
     * Hydrate user from Amplify session on app start.
     * Must be called on every component init to restore auth state after page refresh.
     */
    async hydrateFromAmplify(): Promise<void> {
      try {
        const session = await fetchAuthSession();
        const idToken = session?.tokens?.idToken;

        if (!idToken) {
          this.userSubject.next(null);
          return;
        }

        const user = await getCurrentUser();
        const payload = idToken.payload;
        const email      = payload?.['email']       as string | undefined;
        const givenName  = payload?.['given_name']  as string | undefined;
        const familyName = payload?.['family_name'] as string | undefined;

        this.userSubject.next({ ...user, email, givenName, familyName });

        if (email) {
          this.computeEmailHash(email);
        }

      } catch {
        this.userSubject.next(null); // was incorrectly clearing userDataSubject
      }
    }

    /**
     * Set user object from Amplify user and extract userData
     * @param amplifyUser Raw user object from Amplify getCurrentUser()
     */
    async setUser(amplifyUser: any) {
      if (!amplifyUser) {
        this.userSubject.next(null);
        return;
      }
      console.log('Setting user in auth state from Amplify user:', amplifyUser);
      // Extract user information from Amplify user object
      const userData = {
        userId: amplifyUser.userId || amplifyUser.username,
        username: amplifyUser.username,
        email: amplifyUser.email,
        signInDetails: amplifyUser.signInDetails,
      };
      
      this.userSubject.next(userData);
      console.log('User set in auth state:', userData);
    }

    /**
     * Get user synchronously
     */
    getUser(): any | null {
      return this.userSubject.value;
    }

    /**
     * Set userData object
     */
    setUserData(userData: any): void {
      this.userDataSubject.next(userData);
      const email = userData?.email || '';
      if (email) {
        this.computeEmailHash(email);
      }
    }

    /**
     * Get cached emailHash
     */
    getEmailHash(): string {
      return this.emailHashValue;
    }

    /**
     * Compute SHA-256 hash of email and cache it
     */
    private async computeEmailHash(email: string): Promise<void> {
      const canonical = email.trim().toLowerCase();
      const data = new TextEncoder().encode(canonical);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      this.emailHashValue = Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    }

    /**
     * Get userData synchronously
     */
    getUserData(): any | null {
      return this.userDataSubject.value;
    }

    /**
     * Clear user and userData on logout
     */
    async clearAuth(): Promise<void> {
      try {
        await signOut();
      } catch (err) {
        console.error('Error signing out:', err);
      } finally {
        this.userSubject.next(null);
        this.userDataSubject.next(null);
        this.newUserSubject.next(false);
        this.emailHashValue = '';
        localStorage.removeItem('userData');
        sessionStorage.removeItem('intendedUrl');
      }
    }

    /**
     * Check if user is authenticated
     */
    isAuthenticated(): boolean {
      return this.userSubject.value !== null;
    }

    /**
     * Set new user flag (for IDP users without user data)
     */
    setNewUser(isNew: boolean): void {
      this.newUserSubject.next(isNew);
    }

    /**
     * Get new user flag
     */
    isNewUser(): boolean {
      return this.newUserSubject.value;
    }

    /**
     * Check if user has an active subscription.
     * Source of truth: subscription.status + subscription.substatus written by the Stripe webhook.
     */
    hasActiveSubscription(): boolean {
      const userData = this.userDataSubject.value as UserData | null;
      return (
        userData?.subscription?.status === 'active' &&
        userData?.subscription?.substatus === 'payment_succeeded'
      );
    }
  }
