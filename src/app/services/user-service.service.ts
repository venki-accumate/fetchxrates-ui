import { Injectable } from '@angular/core';
import { getCurrentUser } from 'aws-amplify/auth';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class UserServiceService {
  private userSubject = new BehaviorSubject<any>(null);
  user$ = this.userSubject.asObservable();
  userObject: any = {
    hasScheduling: false
  };

  constructor() {}

  async setUserObject() {
    console.log('in service');
    const { username, userId, signInDetails } = await getCurrentUser();
    console.log(username, userId);
    this.userObject.userName = username;
    this.userObject.userId = userId;
    this.userSubject.next(this.userObject);
  }

  setHasScheduling(value: boolean): void {
    this.userObject = { ...this.userObject, hasScheduling: value };
    this.userSubject.next(this.userObject);
  }

  isAuthenticated() {
    return this.userObject ? true : false;
  }
  
  getUserObject() {
    return this.userSubject;
  }
}
