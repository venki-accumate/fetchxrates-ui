import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';
import { NotificationService } from '../../services/notification.service';
import { ActiveNotification } from '../../models/notification.model';

@Component({
  selector: 'app-notification-banner',
  standalone: false,
  templateUrl: './notification-banner.component.html',
  styleUrl: './notification-banner.component.scss',
})
export class NotificationBannerComponent implements OnInit, OnDestroy {
  notifications: ActiveNotification[] = [];
  private sub!: Subscription;

  constructor(private notificationService: NotificationService) {}

  ngOnInit(): void {
    this.sub = this.notificationService.notifications$.subscribe(n => {
      this.notifications = n;
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  dismiss(id: string): void {
    this.notificationService.dismiss(id);
  }

  trackById(_: number, n: ActiveNotification): string {
    return n.id;
  }
}
