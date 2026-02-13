import { Component, OnInit, signal, DestroyRef, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { SessionService } from './services/session.service';
import { EventBusService } from './services/event-bus.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AuthStateService } from './services/auth-state.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  standalone: false,
  styleUrl: './app.scss'
})
export class AppComponent implements OnInit {
  protected readonly title = signal('fetchxrates-ui');
  showLayout = true;
  hideMenuItems = false;
  showNavbar = true;
  private destroyRef = inject(DestroyRef);

  constructor(
    private router: Router,
    private sessionService: SessionService,
    private eventBus: EventBusService,
    private snackBar: MatSnackBar,
    private authState: AuthStateService
  ) {
    // Subscribe to event bus for snackbar notifications
    this.eventBus.snackbar$.pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(({ message, type }) => {
      this.snackBar.open(message, 'Close', {
        duration: type === 'success' ? 3000 : 6000,
        panelClass: [type === 'success' ? 'snackbar-success' : 'snackbar-error']
      });
    });
  }

  ngOnInit(): void {
    // Listen to route changes to determine layout visibility and start session timer
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe((event: any) => {
      const url = event.url;
      this.showLayout = !url.includes('/login') && !url.includes('/signup');
      this.hideMenuItems = url.includes('/checkin');
      this.showNavbar = url.includes('/checkin') && this.authState.getUser();
      // Start session timer on every navigation
      this.sessionService.startSessionTimer();
    });

    // Set initial state
    const currentUrl = this.router.url;
    this.showLayout = !currentUrl.includes('/login') && !currentUrl.includes('/signup');
    this.hideMenuItems = currentUrl.includes('/checkin');
    this.showNavbar = currentUrl.includes('/checkin') && this.authState.getUser();
  }
}
