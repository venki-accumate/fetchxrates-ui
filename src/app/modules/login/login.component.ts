import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { NgxSpinnerModule, NgxSpinnerService } from 'ngx-spinner';
import { signIn, getCurrentUser, signInWithRedirect, fetchAuthSession } from 'aws-amplify/auth';
import { AuthStateService } from '../../services/auth-state.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    NgxSpinnerModule
  ],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent implements OnInit, OnDestroy {
  email = '';
  password = '';
  showLogin = false;

  constructor(
    private router: Router,
    private authState: AuthStateService,
    private spinner: NgxSpinnerService,
    private cdRef: ChangeDetectorRef
  ) {}

  async ngOnInit() {
    try {
      const session = await fetchAuthSession();
      console.log('Auth session:', session);
      if (session?.tokens?.idToken) {
        console.log('User is authenticated');
        // Hydrate user state from Amplify
        const user = await getCurrentUser();
        if (user) {
          const email = session?.tokens?.idToken?.payload?.['email'];
          this.authState.setUser({...user, email});
        }
        // Redirect to checkin for user data check and subscription handling
        this.router.navigate(['/checkin']);
        return;
      }
    } catch {
      // Not authenticated, show login
    }
    console.log('User not authenticated, showing login form');
    this.showLogin = true;
    this.cdRef.detectChanges();
  }

  ngOnDestroy() {}

  async login() {
    try {
      this.spinner.show();
      await signIn({ username: this.email, password: this.password });
      const user = await getCurrentUser();
      if (user) {
        await this.postAuthenticationStep({...user, email: this.email});
      }
    } catch (err) {
      console.error('Login failed!', err);
      this.spinner.hide();
    }
  }

  async signInWith(provider: string) {
    try {
      await signInWithRedirect({ provider: provider as any });
    } catch (err) {
      console.error(`${provider} sign-in failed!`, err);
    }
  }

  async postAuthenticationStep(user: any) {
    this.authState.setUser(user);
    this.spinner.hide();
    // Redirect to checkin for user data check and subscription handling
    this.router.navigate(['/checkin']);
  }
}