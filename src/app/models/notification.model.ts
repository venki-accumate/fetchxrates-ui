export type NotificationType = 'info' | 'warning' | 'error' | 'success';
export type NotificationMode = 'maintenance' | 'incident';

export interface AppNotificationMessage {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  startsAt?: string;
  endsAt?: string;
  dismissible: boolean;
  active: boolean;
  priority: number;
  mode?: NotificationMode;
}

export interface AppNotificationConfig {
  messages: AppNotificationMessage[];
}

export interface ActiveNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  dismissible: boolean;
  priority: number;
  mode?: NotificationMode;
}
