import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { NgxSpinnerService } from 'ngx-spinner';
import { AuthStateService } from '../../services/auth-state.service';
import { FetchXRApiService } from '../../services/fetchXR-api.service';
import { firstValueFrom } from 'rxjs';
import { StripeCheckoutService, CheckoutSessionResponse } from '../../services/stripe-checkout.service';
import { fetchAuthSession } from '@aws-amplify/core';
import { getCurrentUser } from 'aws-amplify/auth';


@Component({
  selector: 'app-checkin',
  standalone: false,
  templateUrl: './checkin.component.html',
  styleUrls: ['./checkin.component.scss']
})
export class CheckinComponent implements OnInit {
  apiCallPending = true;
  error = '';
  showSignupFields = false;
  selectedPlan: string = '';

  // Signup form data
  userData = {
    firstName: '',
    lastName: '',
    email: '',
    phone: ''
  };
  termsAccepted = false;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private authState: AuthStateService,
    private apiService: FetchXRApiService,
    private spinner: NgxSpinnerService,
    private stripeCheckoutService: StripeCheckoutService,
    private cdRef: ChangeDetectorRef
  ) { }

  async ngOnInit(): Promise<void> {
    await this.handleUserDataAndNavigation();
  }

  private async handleUserDataAndNavigation(): Promise<void> {
    const user = this.authState.getUser();
    if (!user) {
      this.enterSignupFlowFromRoute();
      return;
    }
    this.spinner.show();
    try {
      const userData = await this.fetchUserData(user.email);
      this.userExists(userData);
    } catch (err: any) {
      const localData = JSON.parse(localStorage.getItem('stripeFlow') || '{}');
      if (localData?.selectedPlan && localData?.googleFlow) {
        this.startCheckout({
          priceId: localData.selectedPlan,
          userData: user
        });
        return;
      }
      this.newUser(err, user);
    } finally {
      this.cdRef.detectChanges();
      this.spinner.hide();
    }
  }

  async checkIfLoggedIn() {
    try {
      const session = await fetchAuthSession();
      if (session?.tokens?.idToken) {
        console.log('User is authenticated');
        const user = await getCurrentUser();
        if (user) {
          const idToken = session.tokens?.idToken?.payload;
          const givenName = idToken?.['given_name'] as string || '';
          sessionStorage.setItem('userName', givenName);
          const email = idToken?.['email'];
          this.authState.setUser({ ...user, email });
        }
      }
    } catch {}
    return this.authState.getUser();
  }

  private enterSignupFlowFromRoute(): void {
    this.selectedPlan = this.route.snapshot.paramMap.get('plan') || 'professional_dashboard';
    this.apiCallPending = false;
    this.showSignupFields = true;
    this.cdRef.detectChanges();
  }

  private async fetchUserData(email?: string): Promise<any> {
    const emailHash = await this.emailToSafeKey(email || '');
    return firstValueFrom(this.apiService.getUserData(emailHash));
  }

  private userExists(userData: any): void {
    this.authState.setUserData(userData);
    // Check subscription status
    if (userData.status === 'active' 
      && userData.substatus === 'subscription_created_active') {
      const homePage = userData.homePage || '/dashboard';
      this.spinner.hide();
      this.router.navigate([homePage]);
    }
    if(userData.substatus === 'payment_succeeded_pending_activation') {
      this.spinner.hide();
      this.router.navigate(['/payment-success']);
    }
    this.showSignupFields = false;
    this.apiCallPending = false;
    this.spinner.hide();
    this.cdRef.detectChanges();
  }

  private newUser(error: any, user: any): void {
    // If 500 error, it's a new user - show signup fields
    if (error?.status === 500) {
      console.log('New user detected, showing signup fields');
      this.showSignupFields = true;
      // Pre-populate email and name from auth state
      this.userData.email = user.email || '';
      if (user.username) {
        const nameParts = user.username.split(/[\s._-]+/);
        if (nameParts.length >= 2) {
          this.userData.firstName = nameParts[0];
          this.userData.lastName = nameParts.slice(1).join(' ');
        }
      }
    }
    this.apiCallPending = false;
    this.spinner.hide();
    this.cdRef.detectChanges();
  }

  validateSignupFields(): boolean {
    if (!this.showSignupFields) {
      return true; // No validation needed if signup fields not shown
    }

    if (!this.userData.firstName || !this.userData.lastName || !this.userData.phone) {
      this.error = 'Please fill in all required fields';
      return false;
    }

    if (!this.termsAccepted) {
      this.error = 'Please accept the Terms and Conditions';
      return false;
    }

    return true;
  }

  async emailToSafeKey(email: string): Promise<string> {
    const canonical = email.trim().toLowerCase();
    const data = new TextEncoder().encode(canonical);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }


  /**
    * Redirect user to Stripe checkout page after validating signup fields
    * @param emitJSON JSON object containing priceId and userData
  */
  async startCheckout(emitJSON: any): Promise<void> {
    emitJSON = JSON.parse(emitJSON);
    this.saveUserData(emitJSON.userData);
    try {
      const response = await new Promise<CheckoutSessionResponse>((resolve, reject) => {
        this.stripeCheckoutService.createCheckoutSession(emitJSON.priceId, emitJSON.userData.userId, emitJSON.userData.email).subscribe({
          next: (result) => resolve(result),
          error: (err) => reject(err)
        });
      });

      if (response?.url) {
        window.location.href = response.url;
      } else {
        throw new Error('No checkout URL received from server');
      }
    } catch (error) {
      console.error('Error redirecting to checkout:', error);
      throw error;
    }
  }

  async saveUserData(newUserData: any): Promise<boolean> {
    try {
      await new Promise<void>((resolve, reject) => {
        this.apiService.saveUserData(newUserData).subscribe({
          next: () => {
            this.authState.setUserData(newUserData);
            resolve();
          },
          error: (err) => reject(err)
        });
      });
      return true;
    } catch (err: any) {
      console.error('Error saving user data:', err);
      this.error = 'Failed to save profile. Please try again.';
      return false;
    }
  }
}