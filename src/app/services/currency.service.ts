import { Injectable, computed, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

export interface CurrencyInfo {
  /** Display name, e.g. "Australian Dollar" */
  d: string;
  /** Supported pair providers */
  p: string[];
}

export type CurrencyMap = Record<string, CurrencyInfo>;

const SESSION_KEY = 'app_currencies';

@Injectable({ providedIn: 'root' })
export class CurrencyService {
  private readonly _map = signal<CurrencyMap>({});

  /** True once the map has been populated. */
  readonly isReady = computed(() => Object.keys(this._map()).length > 0);

  /** Sorted list of currency codes, e.g. ['AED','AUD','BRL',...] */
  readonly codes = computed(() => Object.keys(this._map()).sort());

  /** Promise-based guard so we never fire multiple concurrent fetches. */
  private _loadPromise: Promise<void> | null = null;

  constructor(private http: HttpClient) {}

  /**
   * Returns the full display label for a currency code.
   * e.g. label('CAD') → "Canadian Dollar (CAD)"
   * Falls back to just the code if not found.
   */
  label(code: string): string {
    const info = this._map()[code];
    return info ? `${info.d} (${code})` : code;
  }

  /**
   * Idempotent loader.
   * Priority: in-memory → sessionStorage → GET /api/currencies
   * Safe to call from multiple components; only one HTTP request will ever be made per session.
   */
  load(): Promise<void> {
    // Already loaded in memory
    if (this.isReady()) {
      return this._loadPromise ?? Promise.resolve();
    }

    // Already in flight
    if (this._loadPromise) return this._loadPromise;

    // Check sessionStorage cache
    const cached = sessionStorage.getItem(SESSION_KEY);
    if (cached) {
      try {
        this._map.set(JSON.parse(cached));
        this._loadPromise = Promise.resolve();
        return this._loadPromise;
      } catch {
        sessionStorage.removeItem(SESSION_KEY);
      }
    }

    // Fetch from API
    this._loadPromise = firstValueFrom(
      this.http.get<CurrencyMap>(`${environment.backendUrl}/api/currencies`)
    ).then(data => {
      this._map.set(data);
      try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(data)); } catch { /* storage full */ }
    }).catch(err => {
      console.error('[CurrencyService] Failed to load currencies:', err);
      this._loadPromise = null; // allow retry on next call
    });

    return this._loadPromise;
  }

  /** Call on sign-out to clear cached state. */
  clear(): void {
    this._map.set({});
    this._loadPromise = null;
    sessionStorage.removeItem(SESSION_KEY);
  }
}
