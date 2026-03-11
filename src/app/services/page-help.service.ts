import { Injectable, signal } from '@angular/core';

export interface HelpSection {
  icon: string;
  title: string;
  color?: 'accent' | 'secondary' | 'muted';
  items: string[];
}

export interface PageHelpContent {
  title: string;
  subtitle: string;
  sections: HelpSection[];
}

/**
 * Lightweight signal-based service that lets any page component register
 * its help content so the navbar can display and open it on demand.
 * Call registerHelp() on component init; call clearHelp() on destroy.
 */
@Injectable({ providedIn: 'root' })
export class PageHelpService {
  private _content = signal<PageHelpContent | null>(null);

  /** Read-only signal consumed by NavbarComponent */
  readonly content = this._content.asReadonly();

  registerHelp(content: PageHelpContent): void {
    this._content.set(content);
  }

  clearHelp(): void {
    this._content.set(null);
  }
}
