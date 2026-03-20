import { Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

const COOKIE_KEY = 'fxr-cookie-consent';

@Component({
  selector: 'app-cookie-consent',
  standalone: false,
  templateUrl: './cookie-consent.component.html',
  styleUrls: ['./cookie-consent.component.scss'],
})
export class CookieConsentComponent {
  showBanner = !this.getCookie(COOKIE_KEY);

  acceptCookies(): void {
    this.setCookie(COOKIE_KEY, 'true');
    this.showBanner = false;
  }

  private setCookie(name: string, value: string, days = 365): void {
    const d = new Date();
    d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000);
    document.cookie = `${name}=${value}; expires=${d.toUTCString()}; path=/; SameSite=Lax; Secure`;
  }

  private getCookie(name: string): string | null {
    for (const c of document.cookie.split(';')) {
      const [key, value] = c.trim().split('=');
      if (key === name) return value ?? null;
    }
    return null;
  }
}
