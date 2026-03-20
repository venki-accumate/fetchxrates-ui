import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthStateService } from '../services/auth-state.service';

const SESSION_USER_DATA_KEY = 'userData';
const INTENDED_URL_KEY = 'intendedUrl';

export const subscriptionGuard: CanActivateFn = (route, state) => {
  const authState = inject(AuthStateService);
  const router = inject(Router);

  // Restore cached userData from localStorage on page refresh (before in-memory state is hydrated)
  if (!authState.hasActiveSubscription()) {
    const cached = localStorage.getItem(SESSION_USER_DATA_KEY);
    if (cached) {
      try {
        authState.setUserData(JSON.parse(cached));
      } catch {
        localStorage.removeItem(SESSION_USER_DATA_KEY);
      }
    }
  }

  if (authState.hasActiveSubscription()) {
    return true;
  }

  // Persist the intended URL so checkin can navigate back after login/verification
  sessionStorage.setItem(INTENDED_URL_KEY, state.url);
  return router.createUrlTree(['/checkin']);
};