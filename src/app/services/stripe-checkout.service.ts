import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface CreateCheckoutSessionRequest {
  priceId: string;
  userId?: string;
  userEmail?: string;
}

export interface CheckoutSessionResponse {
  url: string;
  sessionId: string;
}

export interface ErrorResponse {
  error: string;
  message?: string;
}

@Injectable({
  providedIn: 'root'
})
export class StripeCheckoutService {
  private apiUrl = environment.backendUrl;

  constructor(private http: HttpClient) {}

  /**
   * Create a Stripe checkout session for subscription
   * @param priceId Stripe Price ID for the subscription plan
   * @param userId Optional user ID for tracking
   * @returns Observable with checkout URL and session ID
   */
  createCheckoutSession(priceId: string, userId?: string, userEmail?: string): Observable<CheckoutSessionResponse> {
    const payload: CreateCheckoutSessionRequest = {
      priceId,
      ...(userId && { userId }),
      ...(userEmail && { userEmail })
    };

    return this.http.post<CheckoutSessionResponse>(
      `${this.apiUrl}/stripe-checkout/create-session`,
      payload
    );
  }

  /**
   * Verify checkout session status
   * @param sessionId Stripe checkout session ID
   * @returns Observable with session status
   */
  verifyCheckoutSession(sessionId: string): Observable<any> {
    return this.http.get<any>(
      `${this.apiUrl}/stripe-checkout/verify-session/${sessionId}`
    );
  }

  /**
   * Handle successful checkout
   * @param sessionId Stripe checkout session ID from URL parameter
   */
  handleCheckoutSuccess(sessionId: string): Observable<any> {
    return this.http.post<any>(
      `${this.apiUrl}/stripe-checkout/success`,
      { sessionId }
    );
  }

  /**
   * Handle cancelled checkout
   */
  handleCheckoutCancel(): void {
    console.log('Checkout was cancelled by user');
    // Additional logic can be added here
  }
}
