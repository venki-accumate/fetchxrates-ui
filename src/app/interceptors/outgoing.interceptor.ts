import { Injectable } from '@angular/core';
import { HttpRequest, HttpHandler, HttpEvent, HttpInterceptor } from '@angular/common/http';
import { Observable, from } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';
import { AuthStateService } from '../services/auth-state.service';
import { environment } from '../../environments/environment';

@Injectable()
export class OutgoingInterceptor implements HttpInterceptor {
  constructor(
    private authService: AuthService,
    private authState: AuthStateService
  ) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    // Only attach headers to calls destined for our own backend
    if (!req.url.startsWith(environment.backendUrl)) {
      return next.handle(req);
    }

    return from(this.authService.getToken()).pipe(
      switchMap(token => {
        const user = this.authState.getUser();

        const headers: Record<string, string> = {};

        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        headers['x-request-id'] = crypto.randomUUID();
        headers['x-browser-time'] = new Date().toISOString();
        headers['x-user-id'] = user?.userId || '';
        headers['x-email'] = user?.email || '';
        headers['x-email-hash'] = this.authState.getEmailHash();
        headers['x-user-agent'] = navigator.userAgent;

        const cloned = req.clone({ setHeaders: headers });
        return next.handle(cloned);
      })
    );
  }
}
