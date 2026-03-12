import { Component, OnInit, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthStateService } from '../../services/auth-state.service';
import { CurrencyService } from '../../services/currency.service';

@Component({
  selector: 'app-dashboard',
  standalone: false,
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit {
  currentUser: any = null;
  currentUserData: any = null;
  private destroyRef = inject(DestroyRef);

  constructor(private authState: AuthStateService, private currencyService: CurrencyService) {}

  ngOnInit(): void {
    this.currencyService.load();
    this.authState.currentUser$.pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(user => {
      this.currentUser = user;
    });
    this.authState.currentUserData$.pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(userData => {
      this.currentUserData = userData;
    });
  }
}
