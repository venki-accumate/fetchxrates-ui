import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { firstValueFrom } from 'rxjs';
import { FetchXRApiService, InvoiceRecord } from '../../../services/fetchXR-api.service';
import { AuthStateService } from '../../../services/auth-state.service';
import { InvoiceGeneratorService } from '../../../components/invoice-generator/invoice-generator.service';

@Component({
  selector: 'app-billing',
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule, MatTooltipModule],
  templateUrl: './billing.component.html',
  styleUrls: ['./billing.component.scss'],
})
export class BillingComponent implements OnInit {
  invoices: InvoiceRecord[] = [];
  loading = true;
  error = '';
  downloading: string | null = null;  // id of invoice currently being generated

  constructor(
    private router: Router,
    private apiService: FetchXRApiService,
    private authState: AuthStateService,
    private invoiceGenerator: InvoiceGeneratorService
  ) {}

  async ngOnInit(): Promise<void> {
    try {
      const userData = this.authState.getUserData();
      const emailHash = userData?.emailHash;
      if (!emailHash) {
        this.error = 'Could not identify user. Please log in again.';
        return;
      }
      this.invoices = await firstValueFrom(this.apiService.getInvoices(emailHash));
    } catch {
      this.error = 'Failed to load invoices. Please try again later.';
    } finally {
      this.loading = false;
    }
  }

  async downloadPdf(invoice: InvoiceRecord): Promise<void> {
    this.downloading = invoice.id;
    try {
      await this.invoiceGenerator.download(invoice);
    } finally {
      this.downloading = null;
    }
  }

  get totalPaid(): number {
    return this.invoices.reduce((sum, i) => sum + i.amountPaid, 0);
  }

  formatAmount(amountPaid: number, currency: string): string {
    // amountPaid is in smallest currency unit (cents); divide by 100
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amountPaid / 100);
  }
}

