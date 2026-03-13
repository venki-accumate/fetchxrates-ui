import { Injectable } from '@angular/core';
import {
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpInterceptor,
  HttpErrorResponse,
} from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { Router } from '@angular/router';

/**
 * Status codes / error patterns that indicate the backend is unreachable
 * or the gateway is broken (502 Bad Gateway, 503 Service Unavailable,
 * 504 Gateway Timeout, 0 = no response / CORS / network error).
 */
const BACKEND_DOWN_STATUSES = new Set([0, 502, 503, 504]);

@Injectable()
export class BackendStatusInterceptor implements HttpInterceptor {
  constructor(private router: Router) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    return next.handle(req).pipe(
      catchError((err: HttpErrorResponse) => {
        if (this.isBackendDown(err)) {
          this.router.navigate(['/error']);
        }
        return throwError(() => err);
      })
    );
  }

  private isBackendDown(err: HttpErrorResponse): boolean {
    // status 0 covers: no response, CORS preflight failure, network offline
    if (BACKEND_DOWN_STATUSES.has(err.status)) {
      return true;
    }

    // Some CORS errors surface as ProgressEvent with status 0
    if (err.status === 0 && err.error instanceof ProgressEvent) {
      return true;
    }

    return false;
  }
}
