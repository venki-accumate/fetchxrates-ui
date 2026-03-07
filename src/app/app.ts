import { Component, OnInit, signal, DestroyRef, inject } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
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
    private activatedRoute: ActivatedRoute
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
  const hideLayout$ = this.router.events.pipe(
    filter(e => e instanceof NavigationEnd),
    map(() => {
      let r: ActivatedRoute | null = this.activatedRoute;
      while (r?.firstChild) r = r.firstChild;
      return !!r?.snapshot.data?.['hideLayout'];
    }),
    takeUntilDestroyed(this.destroyRef)
  );

  hideLayout$.subscribe(hideLayout => {
    this.showLayout = !hideLayout;
    this.sessionService.startSessionTimer();
  });

  let r: ActivatedRoute | null = this.activatedRoute;
  while (r?.firstChild) r = r.firstChild;
  this.showLayout = !r?.snapshot.data?.['hideLayout'];
}

}
