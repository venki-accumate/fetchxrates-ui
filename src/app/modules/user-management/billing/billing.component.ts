import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  UserManagementService,
  Invoice,
} from '../../../services/user-management.service';

@Component({
  selector: 'app-billing',
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule, MatTooltipModule],
  templateUrl: './billing.component.html',
  styleUrls: ['./billing.component.scss'],
})
export class BillingComponent implements OnInit {
  invoices: Invoice[] = [];
  loading = true;

  constructor(
    private router: Router,
    private userMgmtService: UserManagementService
  ) {}

  async ngOnInit(): Promise<void> {
    this.invoices = await this.userMgmtService.loadInvoices();
    this.loading = false;
  }

  download(invoice: Invoice): void {
    this.userMgmtService.downloadInvoice(invoice);
  }

  get totalPaid(): number {
    return this.invoices
      .filter(i => i.status === 'paid')
      .reduce((sum, i) => sum + i.amount, 0);
  }

  get pendingCount(): number {
    return this.invoices.filter(i => i.status === 'pending').length;
  }

  statusLabel(status: Invoice['status']): string {
    return { paid: 'Paid', pending: 'Pending', failed: 'Failed' }[status];
  }
}
