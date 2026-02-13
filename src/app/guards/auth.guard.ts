import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { fetchAuthSession } from 'aws-amplify/auth';

export const authGuard: CanActivateFn = async () => {
  const router = inject(Router);
  try {
    const session = await fetchAuthSession();
    if (session?.tokens?.idToken) {
      return true;
    } else {
      router.navigate(['/login']);
      return false;
    }
  } catch(error) {
    router.navigate(['/login']);
    return false;
  } 
};
