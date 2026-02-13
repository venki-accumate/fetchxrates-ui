import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class EventBusService {
  snackbar$ = new Subject<{ message: string, type: 'success' | 'error' }>();

  showSuccess(message: string) {
    this.snackbar$.next({ message, type: 'success' });
  }

  showError(message: string) {
    this.snackbar$.next({ message, type: 'error' });
  }
}
