import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SessionService } from '../../services/session.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-session-modal',
  standalone: false,
  templateUrl: './session-modal.component.html',
  styleUrls: ['./session-modal.component.scss']
})
export class SessionModalComponent {
  showModal$;

  constructor(private sessionService: SessionService, private router: Router) {
    this.showModal$ = this.sessionService.showModal$;
  }

  get shouldShowModal() {
    const url = this.router.url;
    return url !== '/login' && url !== '/signup';
  }

  onExtendSession() {
    this.sessionService.extendSession();
  }
}
