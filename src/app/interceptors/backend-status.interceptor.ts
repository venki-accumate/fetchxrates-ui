import { Injectable } from '@angular/core';
import {
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpInterceptor,
  HttpErrorResponse,
} from '@angular/common/http';
import { Observable, throwError, from } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { Router } from '@angular/router';
import { fetchAuthSession } from 'aws-amplify/auth';
import { environment } from '../../environments/environment';

const BACKEND_DOWN_STATUSES = new Set([0, 502, 503, 504]);
const RETRY_HEADER = 'X-Auth-Retry';

@Injectable()
export class BackendStatusInterceptor implements HttpInterceptor {
  constructor(private router: Router) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    return next.handle(req).pipe(
      catchError((err: HttpErrorResponse) => {
        if (this.isBackendDown(err)) {
          this.navigateOnce('/error');
          return throwError(() => err);
        }

        if (!req.url.startsWith(environment.backendUrl)) {
          return throwError(() => err);
        }

        if (err.status === 401) {
          if (req.headers.has(RETRY_HEADER)) {
            this.navigateOnce('/login');
            return throwError(() => err);
          }

          return from(fetchAuthSession({ forceRefresh: true })).pipe(
            switchMap(() => {
              const retryReq = req.clone({
                setHeaders: { [RETRY_HEADER]: '1' },
              });
              return next.handle(retryReq).pipe(
                catchError((retryErr: HttpErrorResponse) => {
                  if (retryErr.status === 401) {
                    this.navigateOnce('/login');
                  }
                  return throwError(() => retryErr);
                })
              );
            }),
            catchError(() => {
              this.navigateOnce('/login');
              return throwError(() => err);
            })
          );
        }

        if (err.status === 403 && this.isPlanError(err)) {
          this.navigateOnce('/checkin');
          return throwError(() => err);
        }

        console.error(`[HTTP ${err.status}] ${req.method} ${req.urlWithParams}`, err.error ?? err.message);
        return throwError(() => err);
      })
    );
  }

  private isBackendDown(err: HttpErrorResponse): boolean {
    return BACKEND_DOWN_STATUSES.has(err.status);
  }

  private isPlanError(err: HttpErrorResponse): boolean {
    const code = err.error?.code;
    return code === 'SUBSCRIPTION_REQUIRED' || code === 'PLAN_EXPIRED' || code === 'FEATURE_NOT_ALLOWED';
  }

  private navigateOnce(path: string): void {
    if (this.router.url !== path) {
      this.router.navigate([path]);
    }
  }
}