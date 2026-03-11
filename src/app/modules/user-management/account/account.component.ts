import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  UserManagementService,
  UserProfile,
} from '../../../services/user-management.service';

@Component({
  selector: 'app-account',
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule, MatTooltipModule],
  templateUrl: './account.component.html',
  styleUrls: ['./account.component.scss'],
})
export class AccountComponent implements OnInit {
  profile: UserProfile | null = null;
  loading = true;
  actionLoading: 'upgrade' | 'cancel' | null = null;

  constructor(
    private router: Router,
    private userMgmtService: UserManagementService
  ) {}

  async ngOnInit(): Promise<void> {
    this.profile = await this.userMgmtService.loadUserProfile();
    this.loading = false;
  }

  async manageSubscription(action: 'upgrade' | 'cancel'): Promise<void> {
    this.actionLoading = action;
    const url = await this.userMgmtService.getSubscriptionManageUrl(action);
    this.actionLoading = null;
    if (url && url !== '#') {
      window.open(url, '_blank');
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
