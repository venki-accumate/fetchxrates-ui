import { Component, OnInit } from '@angular/core';
import { FetchXRApiService } from '../../services/fetchXR-api.service';
import { AuthStateService } from '../../services/auth-state.service';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-stripe-success',
  standalone: true,
  templateUrl: './stripe-success.component.html',
  styleUrl: './stripe-success.component.scss',
})
export class StripeSuccessComponent implements OnInit {
  username: string | null = null;

  constructor(private authState: AuthStateService,
    private apiService: FetchXRApiService,
  private route: ActivatedRoute
  ) {}

  async ngOnInit(): Promise<void> {
    localStorage.removeItem('stripeFlow');
    this.username = localStorage.getItem('username');
    await this.authState.hydrateFromAmplify();
    const sessionId = this.route.snapshot.queryParamMap.get('session_id');
    if(sessionId) {
      this.updateUserStatus(sessionId);
    }
  }

  updateUserStatus(sessionId: string): void {
    const { email } = this.authState.getUserData();

    this.apiService.postPaymentSuccess(email, sessionId).subscribe({
      next: () => console.log('Payment success acknowledged'),
      error: (err: HttpErrorResponse) => console.error('Payment success notify failed', err)
    });
  }

}
