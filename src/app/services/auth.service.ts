import { Injectable } from '@angular/core';
import { fetchAuthSession } from 'aws-amplify/auth';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private token: string | null = null;
  private expiry: number = 0;
  private refreshing: any = null;

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

