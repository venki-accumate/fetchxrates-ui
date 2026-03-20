import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule, ActivatedRoute } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { NgxSpinnerModule, NgxSpinnerService } from 'ngx-spinner';
import { firstValueFrom } from 'rxjs';
import {
  UserManagementService,
  UserProfile,
} from '../../../services/user-management.service';
import { AuthStateService } from '../../../services/auth-state.service';

@Component({
  selector: 'app-account',
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule, MatTooltipModule, NgxSpinnerModule, MatSnackBarModule],
  templateUrl: './account.component.html',
  styleUrls: ['./account.component.scss'],
})
export class AccountComponent implements OnInit {
  profile: UserProfile | null = null;
  loading = true;
  actionLoading: 'upgrade' | null = null;

  /** State machine for the delete account flow */
  deleteState: 'idle' | 'blocked' | 'confirm' | 'loading' | 'success' | 'error' = 'idle';
  deletionIncidentNumber: string | null = null;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private userMgmtService: UserManagementService,
    private authState: AuthStateService,
    private spinner: NgxSpinnerService,
    private snackBar: MatSnackBar
  ) {}

  async ngOnInit(): Promise<void> {
    this.spinner.show();
    try {
      this.profile = await this.userMgmtService.loadUserProfile(this.authState);
    } finally {
      this.loading = false;
      this.spinner.hide();
    }

    // Show snackbar when returning from Stripe after a billing update
    const billing = this.route.snapshot.queryParamMap.get('billing');
    if (billing === 'updated') {
      this.snackBar.open('Billing Updated', 'Dismiss', {
        duration: 5000,
        panelClass: ['snack-success'],
      });
    }
  }

  async upgradePlan(): Promise<void> {
    this.actionLoading = 'upgrade';
    try {
      const userData = this.authState.getUserData();
      const url = await this.userMgmtService.createBillingPortalSession({
        emailHash: userData?.emailHash ?? '',
        userId:    userData?.userId    ?? '',
        homePage:  userData?.homePage  ?? window.location.origin,
        isCancellation: false,
      });
      if (url) {
        window.location.href = url;
      }
    } catch (err) {
      console.error('[Account] Failed to open billing portal', err);
    } finally {
      this.actionLoading = null;
    }
  }

  cancelSubscription(): void {
    this.router.navigate(['/user/cancel-subscription']);
  }

  /** True when the user has an active subscription that has not been scheduled for cancellation */
  get subscriptionIsActive(): boolean {
    const sub = this.authState.getUserData()?.subscription;
    return sub?.status === 'active' && !sub?.cancelAtPeriodEnd;
  }

  requestAccountDeletion(): void {
    this.deleteState = this.subscriptionIsActive ? 'blocked' : 'confirm';
  }

  closeDeleteDialog(): void {
    this.deleteState = 'idle';
  }

  async confirmDeletion(): Promise<void> {
    this.deleteState = 'loading';
    try {
      const meta = await this.userMgmtService.buildSupportMeta(this.authState);
      const resp = await firstValueFrom(this.userMgmtService.submitDeletionRequest(meta));
      this.deletionIncidentNumber = resp?.incidentNumber ?? null;
      this.deleteState = 'success';
    } catch {
      this.deleteState = 'error';
    }
  }

  get initials(): string {
    if (!this.profile?.name) return '?';
    return this.profile.name
      .split(' ')
      .map(w => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  }

  get planBadgeClass(): string {
    const p = (this.profile?.plan || '').toLowerCase();
    if (p.includes('enterprise')) return 'badge-enterprise';
    if (p.includes('pro')) return 'badge-pro';
    return 'badge-free';
  }
}
