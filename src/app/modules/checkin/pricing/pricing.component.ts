import { Component, OnInit, Input, Output, EventEmitter, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { MatTabsModule } from '@angular/material/tabs';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { AuthStateService } from '../../../services/auth-state.service';
import { FetchXRApiService } from '../../../services/fetchXR-api.service';
import { FeaturesDialogComponent } from './features-dialog.component';
import { NavbarComponent } from '../../../components/navbar/navbar.component';
import { signInWithRedirect } from '@aws-amplify/auth/cognito';

@Component({
  selector: 'app-pricing',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatTabsModule,
    MatDialogModule,
    MatIconModule,
    MatButtonModule,
    NavbarComponent
  ],
  templateUrl: './pricing.component.html',
  styleUrls: ['./pricing.component.scss']
})
export class PricingComponent implements OnInit {
  @Input() showSignupFields: boolean = false;
  @Input() userData: any = {};
  @Input() termsAccepted = false;
  @Input() selectedPlan: string = 'professional_dashboard';
  @Input() error = '';
  @Output() userDataChange = new EventEmitter<any>();
  @Output() termsAcceptedChange = new EventEmitter<boolean>();
  @Output() startStripeCheckout = new EventEmitter<string>();

  pricingTiers: any[] = [];
  loading: boolean = true;
  billingCycle: 'monthly' | 'yearly' = 'monthly';
  tierType: 'dashboard' | 'restapi' = 'dashboard';
  selectedTabIndex: number = 0;
  monthlyPrices: number[] = [];
  yearlyPrices: number[] = [];
  allTiers: any = {};
  userLoggedIn: boolean = false;

  faqs = [
    {
      question: 'Can I change plans at any time?',
      answer: 'Yes, you can upgrade or downgrade your plan at any time. Upgrades take effect immediately, while downgrades will take effect at the start of your next billing cycle.',
      open: false
    },
    {
      question: 'What happens if I exceed my request limit?',
      answer: 'If you exceed your monthly limit, API requests will return a 429 (Too Many Requests) error. You can upgrade your plan or wait until the next billing cycle. We\'ll send you email notifications before you reach your limit.',
      open: false
    },
    {
      question: 'Is there a free trial for paid plans?',
      answer: 'Yes, all paid plans come with a 14-day free trial. No credit card required to start your trial.',
      open: false
    },
    {
      question: 'What payment methods do you accept?',
      answer: 'We accept all major credit cards (Visa, Mastercard, American Express), as well as PayPal for monthly subscriptions. Annual plans can also be paid via bank transfer.',
      open: false
    },
    {
      question: 'Do you offer refunds?',
      answer: 'Yes, we offer a 30-day money-back guarantee for annual plans. Monthly subscriptions can be cancelled at any time with no refunds for the current month.',
      open: false
    },
    {
      question: 'Can I get a discount for annual billing?',
      answer: 'Yes! Save 20% by switching to annual billing. Contact our sales team for enterprise volume discounts.',
      open: false
    }
  ];

  constructor(
    private http: HttpClient,
    private authState: AuthStateService,
    private dialog: MatDialog,
    private cdRef: ChangeDetectorRef
  ) { }

  openFeaturesDialog(tier: any): void {
    this.dialog.open(FeaturesDialogComponent, {
      width: '600px',
      data: { tier, billingCycle: this.billingCycle }
    });
  }

  ngOnInit(): void {
    console.log('PricingComponent ngOnInit called');
    this.loading = true;
    
    this.http.get<any>('assets/pricing-tiers.json').subscribe({
      next: (data) => {
        console.log('Pricing data loaded:', data);
        setTimeout(() => {
          this.monthlyPrices = data.pricing.monthly;
          this.yearlyPrices = data.pricing.yearly;
          this.allTiers = data.tiers;
          this.pricingTiers = data.tiers.dashboard;
          console.log('Pricing tiers set:', this.pricingTiers);
          this.loading = false;
        });
      },
      error: (error) => {
        console.error('Error loading pricing tiers:', error);
        this.error = 'Failed to load pricing information';
        this.loading = false;
      }
    });
    const user = this.authState.getUser();
    if (user) {
      this.userData.email = user.email;
      this.userLoggedIn = true;
      this.cdRef.detectChanges();
    }
  }

  selectPlan(planId: string): void {
    this.selectedPlan = planId;
  }

  toggleBillingCycle(cycle: 'monthly' | 'yearly'): void {
    this.billingCycle = cycle;
  }


  switchTierType(type: 'dashboard' | 'restapi'): void {
    this.tierType = type;
    this.pricingTiers = this.allTiers[type];
    this.selectedTabIndex = type === 'dashboard' ? 0 : 1;
  }

  onTabChange(index: number): void {
    const type = index === 0 ? 'dashboard' : 'restapi';
    this.switchTierType(type);
  }

  getPrice(index: number): number {
    return this.billingCycle === 'monthly'
      ? this.monthlyPrices[index]
      : this.yearlyPrices[index];
  }

  getSavingsPercent(): number {
    // Calculate savings percentage for yearly billing
    const monthlyTotal = this.monthlyPrices[1] * 12; // Using professional tier
    const yearlyTotal = this.yearlyPrices[1];
    return Math.round(((monthlyTotal - yearlyTotal) / monthlyTotal) * 100);
  }

  toggleFAQ(index: number): void {
    this.faqs[index].open = !this.faqs[index].open;
  }

  validateSignupFields(): boolean {
    if (!this.showSignupFields) {
      return true; // No validation needed if signup fields not shown
    }

    if (!this.userData.firstName || !this.userData.lastName || !this.userData.email || !this.userData.password) {
      this.error = 'Please fill in all required fields';
      return false;
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(this.userData.email)) {
      this.error = 'Please enter a valid email address';
      return false;
    }

    // Password validation (min 8 characters)
    if (this.userData.password.length < 8) {
      this.error = 'Password must be at least 8 characters long';
      return false;
    }

    if (!this.termsAccepted) {
      this.error = 'Please accept the Terms and Conditions';
      return false;
    }

    return true;
  }

  async startCheckout(priceId: string) {
    let emitJSON: any = {};
    if (this.showSignupFields) {
      if (!this.validateSignupFields()) {
        return;
      }
    }
    priceId = this.billingCycle === 'monthly' ? `${priceId}_monthly` : `${priceId}_yearly`;
    const user = this.authState.getUser();
    const email = user?.email || this.userData.email;

    const newUserData = {
      email: email,
      emailHash: await this.emailToSafeKey(email),
      firstName: this.userData.firstName,
      lastName: this.userData.lastName,
      company: this.userData.company || '',
      subscription: 'Inactive',
      homePage: '/dashboard',
      createdAt: new Date().toISOString()
    };
    emitJSON.priceId = priceId;
    emitJSON.userData = newUserData;
    console.log('Emitting checkout event with data:', emitJSON);
    this.startStripeCheckout.emit(JSON.stringify(emitJSON));
  }

  async emailToSafeKey(email: string): Promise<string> {
    const canonical = email.trim().toLowerCase();
    const data = new TextEncoder().encode(canonical);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  async signInWith(provider: string) {
    const data = {
      selectedPlan: `${this.selectedPlan}_${this.billingCycle}`,
      googleFlow: true
    };
    localStorage.setItem('stripeFlow', JSON.stringify(data));
    try {
      await signInWithRedirect({ provider: provider as any });
    } catch (err) {
      console.error(`${provider} sign-in failed!`, err);
    }
  }
}
