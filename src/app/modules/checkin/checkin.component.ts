import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { NgxSpinnerService } from 'ngx-spinner';
import { AuthStateService } from '../../services/auth-state.service';
import { FetchXRApiService } from '../../services/fetchXR-api.service';

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
    private authState: AuthStateService,
    private apiService: FetchXRApiService,
    private spinner: NgxSpinnerService
  ) {
    // Expose this component instance for child components
    (window as any).checkinComponentInstance = this;
  }

  async ngOnInit(): Promise<void> {
    await this.handleUserDataAndNavigation();
  }

  private async handleUserDataAndNavigation(): Promise<void> {
    const user = this.authState.getUser();
    
    if (!user) {
      this.apiCallPending = false;
      this.showSignupFields = true;
      return;
    }

    try {
      this.spinner.show();
      const userData = await new Promise<any>(async (resolve, reject) => {
        const emailHash = await this.emailToSafeKey(user.email);
        this.apiService.getUserData(emailHash).subscribe({
          next: (data) => resolve(data),
          error: (err) => reject(err)
        });
      });

      console.log('User data retrieved:', userData);
      this.authState.setUserData(userData);

      // Check subscription status
      if (userData.subscription === 'Active') {
        // Redirect to homePage from user data
        const homePage = userData.homePage || '/dashboard';
        this.spinner.hide();
        this.router.navigate([homePage]);
      } else {
        // Has user data but inactive subscription - show pricing only
        this.showSignupFields = false;
        this.apiCallPending = false;
        this.spinner.hide();
      }
    } catch (error: any) {
      this.apiCallPending = false;
      this.spinner.hide();
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
      } else {
        console.error('Error fetching user data:', error);
        // On other errors, show pricing without signup fields
        this.showSignupFields = false;
      }
    }
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
}
