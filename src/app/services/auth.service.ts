import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Router } from '@angular/router';
import { fetchAuthSession, signOut } from 'aws-amplify/auth';

export interface User {
  id: string;
  email: string;
  name: string;
  subscriptionStatus: 'active' | 'inactive' | 'trial' | 'cancelled';
  subscriptionPlan: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private currentUserSubject: BehaviorSubject<User | null>;
  public currentUser: Observable<User | null>;
  private token: string | null = null;
  private expiry: number = 0;
  private refreshing: any = null;

  constructor(private router: Router) {
    const storedUser = localStorage.getItem('currentUser');
    this.currentUserSubject = new BehaviorSubject<User | null>(
      storedUser ? JSON.parse(storedUser) : null
    );
    this.currentUser = this.currentUserSubject.asObservable();
  }

  public get currentUserValue(): User | null {
    return this.currentUserSubject.value;
  }

  async login(email: string, password: string): Promise<User> {
    // TODO: Replace with actual API call
    // This is a mock implementation
    const user: User = {
      id: '1',
      email,
      name: 'User Name',
      subscriptionStatus: 'active',
      subscriptionPlan: 'professional'
    };

    localStorage.setItem('currentUser', JSON.stringify(user));
    localStorage.setItem('authToken', 'mock-jwt-token');
    this.currentUserSubject.next(user);
    
    return user;
  }

  async logout(): Promise<void> {
    try {
      await signOut({ global: true });
    } catch (error) {
      console.error('Error signing out from Amplify:', error);
    } finally {
      localStorage.clear();
      sessionStorage.clear();
      this.currentUserSubject.next(null);
      this.token = null;
      this.expiry = 0;
      this.router.navigate(['/login']);
    }
  }

  isAuthenticated(): boolean {
    return !!this.currentUserValue && !!localStorage.getItem('authToken');
  }

  hasActiveSubscription(): boolean {
    const user = this.currentUserValue;
    return user?.subscriptionStatus === 'active' || user?.subscriptionStatus === 'trial';
  }

  getAuthToken(): string | null {
    return localStorage.getItem('authToken');
  }

  async getToken(): Promise<string | null> {
    const now = Math.floor(Date.now() / 1000);
    if (this.token && this.expiry > now + 60) return this.token;
    if (this.refreshing) return this.refreshing;

    this.refreshing = fetchAuthSession()
      .then(session => {
        const idToken = session.tokens?.idToken;
        if (!idToken) return null;

        const tokenStr = idToken.toString();
        this.token = tokenStr;

        const payloadBase64 = tokenStr.split('.')[1];
        const payload = JSON.parse(atob(payloadBase64));
        this.expiry = payload.exp || 0;

        return this.token;
      })
      .catch(() => null)
      .finally(() => {
        this.refreshing = null;
      });

    return this.refreshing;
  }
}

