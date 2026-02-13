import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthStateService } from '../services/auth-state.service';

export const subscriptionGuard: CanActivateFn = (route, state) => {
  const authState = inject(AuthStateService);
  const router = inject(Router);

  const hasSubscription = authState.hasActiveSubscription();
  
  if (hasSubscription) {
    return true;
  }

  // No active subscription - redirect to checkin page which shows pricing
  return router.createUrlTree(['/checkin']);
};