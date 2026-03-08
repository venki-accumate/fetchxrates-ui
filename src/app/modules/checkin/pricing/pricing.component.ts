import { Component, OnInit, Input, Output, EventEmitter, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { AuthStateService } from '../../../services/auth-state.service';
import { FeaturesDialogComponent } from './features-dialog.component';
import { NavbarComponent } from '../../../components/navbar/navbar.component';
import { signInWithRedirect } from '@aws-amplify/auth/cognito';

@Component({
  selector: 'app-pricing',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
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

  // ── Signals ────────────────────────────────────────────────────────────────
  readonly loading = signal(true);
  readonly billingCycle = signal<'monthly' | 'yearly'>('monthly');
  readonly tierType = signal<'dashboard' | 'restapi'>('dashboard');
  readonly activePlan = signal('professional_dashboard');
  readonly errorMsg = signal('');
  readonly userLoggedIn = signal(false);

  private readonly monthlyPrices = signal<number[]>([]);
  private readonly yearlyPrices = signal<number[]>([]);
  private readonly allTiers = signal<any>({});

  readonly pricingTiers = computed(() => {
    const tiers = this.allTiers();
    const type = this.tierType();
    return tiers[type] ?? [];
  });

  readonly currentPrices = computed(() =>
    this.billingCycle() === 'monthly' ? this.monthlyPrices() : this.yearlyPrices()
  );

  constructor(
    private http: HttpClient,
    private authState: AuthStateService,
    private dialog: MatDialog
  ) {}

  ngOnInit(): void {
    this.activePlan.set(this.selectedPlan || 'professional_dashboard');
    this.errorMsg.set(this.error || '');

    this.http.get<any>('assets/pricing-tiers.json').subscribe({
      next: (data) => {
        this.monthlyPrices.set(data.pricing.monthly);
        this.yearlyPrices.set(data.pricing.yearly);
        this.allTiers.set(data.tiers);
        this.loading.set(false);
      },
      error: () => {
        this.errorMsg.set('Failed to load pricing information');
        this.loading.set(false);
      }
    });

    const user = this.authState.getUser();
    if (user) {
      this.userData.email = user.email;
      this.userLoggedIn.set(true);
    }
  }

  selectPlan(planId: string): void {
    this.activePlan.set(planId);
    this.selectedPlan = planId;
  }

  toggleBillingCycle(cycle: 'monthly' | 'yearly'): void {
    this.billingCycle.set(cycle);
  }

  switchTierType(type: 'dashboard' | 'restapi'): void {
    this.tierType.set(type);
    const popular = this.pricingTiers().find((t: any) => t.popular);
    if (popular) { this.selectPlan(popular.id); }
  }

  openFeaturesDialog(tier: any): void {
    this.dialog.open(FeaturesDialogComponent, {
      width: '600px',
      data: { tier, billingCycle: this.billingCycle() }
    });
  }

  validateSignupFields(): boolean {
    if (!this.showSignupFields) return true;

    if (!this.userData.firstName || !this.userData.lastName ||
        (!this.userLoggedIn() && (!this.userData.email || !this.userData.password))) {
      this.errorMsg.set('Please fill in all required fields');
      return false;
    }

    if (!this.termsAccepted) {
      this.errorMsg.set('Please accept the Terms and Conditions');
      return false;
    }

    if (this.userLoggedIn()) return true;

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.userData.email)) {
      this.errorMsg.set('Please enter a valid email address');
      return false;
    }

    if (this.userData.password.length < 8) {
      this.errorMsg.set('Password must be at least 8 characters long');
      return false;
    }

    return true;
  }

  async startCheckout(priceId: string): Promise<void> {
    this.errorMsg.set('');
    if (this.showSignupFields && !this.validateSignupFields()) return;

    const cycle = this.billingCycle();
    priceId = `${priceId}_${cycle}`;
    const user = this.authState.getUser();
    const email = user?.email || this.userData.email;

    const newUserData = {
      email,
      emailHash: await this.emailToSafeKey(email),
      firstName: this.userData.firstName,
      lastName: this.userData.lastName,
      company: this.userData.company || '',
      userId: user?.userId || null,
      subscription: 'Inactive',
      homePage: '/dashboard',
      createdAt: new Date().toISOString()
    };

    this.startStripeCheckout.emit(JSON.stringify({ priceId, userData: newUserData }));
  }

  async emailToSafeKey(email: string): Promise<string> {
    const canonical = email.trim().toLowerCase();
    const data = new TextEncoder().encode(canonical);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  async signInWith(provider: string): Promise<void> {
    const data = {
      selectedPlan: `${this.activePlan()}_${this.billingCycle()}`,
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
