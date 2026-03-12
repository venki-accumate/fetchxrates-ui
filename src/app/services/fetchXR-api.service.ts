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

export interface ExcelConversionRatesPayload {
  dates: string[];
  baseCurrency?: string;
  currencyFrom: string;
  currencyTo: string;
}

export interface RatesRangePayload {
  startDate: string;
  endDate: string;
  baseCurrency?: string;
  currencyFrom: string;
  currencyTo?: string[];  // omit to get all available currencies
}

export interface UserSchedule {
  id: string;
  frequency: 'daily' | 'weekly' | 'monthly';
  fromCurrency: string;
  toCurrencies: string[];         // empty = all available currencies
  deliveryFormat: 'excel' | 'csv' | 'pdf' | 'email_table';
  showStatistics: boolean;        // meaningful only for weekly / monthly
  additionalRecipients: string[]; // max 3; logged-in user is always included
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceRecord {
  id: string;
  stripeInvoiceId: string;
  invoiceNumber: string | null;
  amountPaid: number;
  currency: string;
  created: string;
  periodStart: string | null;
  periodEnd: string | null;
  customerName: string | null;
  customerEmail: string | null;
  description: string | null;
  hostedInvoiceUrl: string | null;
  invoicePdfUrl: string | null;
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

  postPaymentSuccess(email: string, sessionId: string) {
    return this.http.post(
      `${this.apiUrl}/stripe-success/payment-success`,
      { email, sessionId }
    );
}

  /**
   * Save user data to S3
   * @param userData User data object containing email, firstName, lastName, phone, etc.
   */
  saveUserData(userData: any): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/aws-s3/create-user-file`, { fileContent: userData});
  }

  /**
   * POST /exchange-rate/excel-conversion-rates
   * Fetches cross-rates for a list of dates and a currency pair.
   * Returns a map of { "YYYY-MM-DD": rate } for each requested date.
   */
  getExcelConversionRates(payload: ExcelConversionRatesPayload): Observable<Record<string, number>> {
    return this.http.post<Record<string, number>>(
      `${this.apiUrl}/exchange-rate/excel-conversion-rates`,
      payload
    );
  }

  /**
   * POST /exchange-rate/rates-range
   * Fetches historical rates for a date range.
   * Single pair → { date: rate }; all currencies (no currencyTo) → { date: { currency: rate } }
   */
  getRatesRange(payload: RatesRangePayload): Observable<Record<string, any>> {
    return this.http.post<Record<string, any>>(
      `${this.apiUrl}/exchange-rate/rates-range`,
      payload
    );
  }

  /**
   * GET /scheduling-manager/schedules?userId=<userId>
   * Returns the list of saved schedules for a user.
   */
  getSchedules(email: string): Observable<UserSchedule[]> {
    const params = new HttpParams().set('email', email);
    return this.http.get<UserSchedule[]>(
      `${this.apiUrl}/scheduling-manager/schedules`,
      { params }
    );
  }

  /**
   * POST /scheduling-manager/schedules
   * Body: { userId, schedules }
   * Persists the full list of schedules for a user (replaces existing).
   * Side effects: updates user.json hasScheduling flag + DynamoDB upsert.
   */
  saveSchedules(email: string, schedules: UserSchedule[], updateUser: boolean): Observable<any> {
    return this.http.post<any>(
      `${this.apiUrl}/scheduling-manager/schedules`,
      { email, schedules, updateUser }
    );
  }

  /**
   * GET /invoice-manager/:emailHash
   * Returns the invoices array for the given user.
   */
  getInvoices(emailHash: string): Observable<InvoiceRecord[]> {
    return this.http.get<InvoiceRecord[]>(
      `${this.apiUrl}/invoice-manager/${emailHash}`
    );
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
