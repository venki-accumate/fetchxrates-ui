import { Component, OnInit } from '@angular/core';
import { NotificationService } from '../../services/notification.service';
import { ActiveNotification } from '../../models/notification.model';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-maintenance-mode',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './maintenance-mode.component.html',
  styleUrl: './maintenance-mode.component.scss',
})
export class MaintenanceModeComponent implements OnInit {
  maintenanceNotification: ActiveNotification | null = null;

  constructor(private notificationService: NotificationService) {}

  ngOnInit(): void {
    const active = this.notificationService.notifications$.value;
    this.maintenanceNotification = active.find(n => n.mode === 'maintenance') ?? null;
  }
}
