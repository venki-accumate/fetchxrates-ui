import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface ExchangeRate {
  base: string;
  target: string;
  rate: number;
  timestamp: string;
}

export interface ExchangeRateResponse {
  success: boolean;
  data: ExchangeRate | ExchangeRate[];
  message?: string;
}

@Injectable({
  providedIn: 'root'
})
export class FetchXRApiService {
  private apiUrl = environment.backendUrl;

  constructor(private http: HttpClient) {}

  /**
   * Get exchange rate(s) from the API
   * @param base Base currency code (e.g., 'USD')
   * @param target Target currency code (e.g., 'EUR') or multiple currencies comma-separated
   */
  getExchangeRate(base: string, target: string): Observable<ExchangeRateResponse> {
    const params = new HttpParams()
      .set('base', base)
      .set('target', target);

    return this.http.get<ExchangeRateResponse>(
      `${this.apiUrl}/exchange-rate`,
      { params }
    );
  }

  /**
   * Get exchange rates for multiple currency pairs
   * @param pairs Array of currency pairs { base: string, target: string }
   */
  getMultipleExchangeRates(pairs: Array<{ base: string; target: string }>): Observable<ExchangeRateResponse> {
    return this.http.post<ExchangeRateResponse>(
      `${this.apiUrl}/exchange-rate/multiple`,
      { pairs }
    );
  }

  /**
   * Get historical exchange rate
   * @param base Base currency code
   * @param target Target currency code
   * @param date Date in ISO format (YYYY-MM-DD)
   */
  getHistoricalExchangeRate(base: string, target: string, date: string): Observable<ExchangeRateResponse> {
    const params = new HttpParams()
      .set('base', base)
      .set('target', target)
      .set('date', date);

    return this.http.get<ExchangeRateResponse>(
      `${this.apiUrl}/exchange-rate/historical`,
      { params }
    );
  }

  getUserData(email: string): Observable<any> {
    const params = new HttpParams().set('user', email);
    return this.http.get<any>(`${this.apiUrl}/aws-s3/user-file`, { params });
  }

  /**
   * Save user data to S3
   * @param userData User data object containing email, firstName, lastName, phone, etc.
   */
  saveUserData(userData: any): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/aws-s3/create-user-file`, { fileContent: userData});
  }

  /**
   * Generic GET request to the API
   * @param endpoint API endpoint path (without base URL)
   * @param params Optional query parameters
   */
  get<T>(endpoint: string, params?: HttpParams): Observable<T> {
    return this.http.get<T>(`${this.apiUrl}${endpoint}`, { params });
  }

  /**
   * Generic POST request to the API
   * @param endpoint API endpoint path (without base URL)
   * @param body Request body
   */
  post<T>(endpoint: string, body: any): Observable<T> {
    return this.http.post<T>(`${this.apiUrl}${endpoint}`, body);
  }

  /**
   * Generic PUT request to the API
   * @param endpoint API endpoint path (without base URL)
   * @param body Request body
   */
  put<T>(endpoint: string, body: any): Observable<T> {
    return this.http.put<T>(`${this.apiUrl}${endpoint}`, body);
  }

  /**
   * Generic DELETE request to the API
   * @param endpoint API endpoint path (without base URL)
   */
  delete<T>(endpoint: string): Observable<T> {
    return this.http.delete<T>(`${this.apiUrl}${endpoint}`);
  }
}
