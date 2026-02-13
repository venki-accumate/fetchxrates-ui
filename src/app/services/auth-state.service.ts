  import { Injectable } from '@angular/core';
  import { BehaviorSubject, Observable } from 'rxjs';
  import { getCurrentUser, signOut } from 'aws-amplify/auth';

  @Injectable({ providedIn: 'root' })
  export class AuthStateService {
    private userSubject = new BehaviorSubject<any | null>(null);
    private userDataSubject = new BehaviorSubject<any | null>(null);
    private newUserSubject = new BehaviorSubject<boolean>(false);

    // Observable streams
    currentUser$ = this.userSubject.asObservable();
    currentUserData$ = this.userDataSubject.asObservable();
    isNewUser$ = this.newUserSubject.asObservable();

    constructor() {}

    /**
     * Hydrate user from Amplify session on app start
     */
    async hydrateFromAmplify(): Promise<void> {
      try {
        const user = await getCurrentUser();
        this.userSubject.next(user ?? null);
      } catch {
        this.userSubject.next(null);
      }
    }

    /**
     * Set user object from Amplify user and extract userData
     * @param amplifyUser Raw user object from Amplify getCurrentUser()
     */
    setUser(amplifyUser: any): void {
      if (!amplifyUser) {
        this.userSubject.next(null);
        return;
      }
      console.log('Setting user in auth state from Amplify user:', amplifyUser);
      // Extract user information from Amplify user object
      const userData = {
        userId: amplifyUser.userId || amplifyUser.username,
        username: amplifyUser.username,
        email: amplifyUser.email,
        signInDetails: amplifyUser.signInDetails,
      };
      
      this.userSubject.next(userData);
      console.log('User set in auth state:', userData);
    }

    /**
     * Get user synchronously
     */
    getUser(): any | null {
      return this.userSubject.value;
    }

    /**
     * Set userData object
     */
    setUserData(userData: any): void {
      this.userDataSubject.next(userData);
    }

    /**
     * Get userData synchronously
     */
    getUserData(): any | null {
      return this.userDataSubject.value;
    }

    /**
     * Refresh userData from API
     * @param userId Optional userId, uses current user if not provided
     * @returns Observable of userData
     */
    refreshUserData(userId?: string): any {
      const user = this.userSubject.value;
      const effectiveUserId = userId || user?.userId;

      if (!effectiveUserId) {
        throw new Error('No user ID available for refreshing user data');
      }

     /* return new Observable(observer => {
        this.finApiService.getUserStoreObject(effectiveUserId, 'userSetup').subscribe({
          next: (data: any) => {
            const userData = data ?? {};
            this.userDataSubject.next(userData);
            observer.next(userData);
            observer.complete();
          },
          error: (err) => {
            console.error('Error refreshing user data:', err);
            observer.error(err);
          }
        });
      });*/
      return null;
    }

    /**
     * Clear user and userData on logout
     */
    async clearAuth(): Promise<void> {
      try {
        await signOut();
      } catch (err) {
        console.error('Error signing out:', err);
      } finally {
        this.userSubject.next(null);
        this.userDataSubject.next(null);
        this.newUserSubject.next(false);
      }
    }

    /**
     * Check if user is authenticated
     */
    isAuthenticated(): boolean {
      return this.userSubject.value !== null;
    }

    /**
     * Set new user flag (for IDP users without user data)
     */
    setNewUser(isNew: boolean): void {
      this.newUserSubject.next(isNew);
    }

    /**
     * Get new user flag
     */
    isNewUser(): boolean {
      return this.newUserSubject.value;
    }

    /**
     * Check if user has active subscription
     */
    hasActiveSubscription(): boolean {
      const userData = this.userDataSubject.value;
      return userData?.subscription === 'Active';
    }
  }
