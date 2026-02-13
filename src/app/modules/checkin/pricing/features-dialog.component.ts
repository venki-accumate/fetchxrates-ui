import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-features-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatIconModule, MatButtonModule],
  template: `
    <div class="features-dialog">
      <div class="dialog-header">
        <h2 mat-dialog-title>{{ data.tier.name }} Plan</h2>
        <button mat-icon-button (click)="dialogRef.close()">
          <mat-icon>close</mat-icon>
        </button>
      </div>
      
      <mat-dialog-content>
        <div class="plan-summary">
          <p class="description">{{ data.tier.description }}</p>
          <div class="pricing-info">
            <span class="label">{{ data.billingCycle === 'monthly' ? 'Monthly' : 'Yearly' }} Price:</span>
            <span class="price">{{ data.tier.price }}</span>
          </div>
        </div>
        
        <div class="features-list">
          <h3>All Features</h3>
          <div *ngFor="let feature of data.tier.features" class="feature-item">
            <mat-icon class="check-icon">check_circle</mat-icon>
            <span>{{ feature }}</span>
          </div>
        </div>
      </mat-dialog-content>
      
      <mat-dialog-actions>
        <button mat-button (click)="dialogRef.close()">Close</button>
        <button mat-raised-button color="primary" (click)="dialogRef.close('select')">
          Select This Plan
        </button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [`
    .features-dialog {
      .dialog-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 20px 24px 10px;
        border-bottom: 1px solid var(--border);
        
        h2 {
          margin: 0;
          font-size: 1.5rem;
          color: var(--text-primary);
        }
      }
      
      mat-dialog-content {
        padding: 24px;
        max-height: 60vh;
        
        .plan-summary {
          margin-bottom: 24px;
          padding: 16px;
          background: var(--bg-card);
          border-radius: 8px;
          border: 1px solid var(--border);
          
          .description {
            color: var(--text-secondary);
            margin-bottom: 12px;
          }
          
          .pricing-info {
            display: flex;
            justify-content: space-between;
            align-items: center;
            
            .label {
              color: var(--text-secondary);
              font-size: 0.9rem;
            }
            
            .price {
              font-size: 1.5rem;
              font-weight: 700;
              color: var(--accent);
            }
          }
        }
        
        .features-list {
          h3 {
            font-size: 1.1rem;
            margin-bottom: 16px;
            color: var(--text-primary);
          }
          
          .feature-item {
            display: flex;
            align-items: flex-start;
            gap: 12px;
            padding: 12px 0;
            border-bottom: 1px solid var(--border);
            
            &:last-child {
              border-bottom: none;
            }
            
            .check-icon {
              color: var(--accent);
              font-size: 20px;
              width: 20px;
              height: 20px;
              flex-shrink: 0;
            }
            
            span {
              color: var(--text-primary);
              line-height: 1.5;
            }
          }
        }
      }
      
      mat-dialog-actions {
        padding: 16px 24px;
        border-top: 1px solid var(--border);
        display: flex;
        justify-content: flex-end;
        gap: 12px;
      }
    }
  `]
})
export class FeaturesDialogComponent {
  constructor(
    public dialogRef: MatDialogRef<FeaturesDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { tier: any; billingCycle: string }
  ) {}
}
