import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { Router } from '@angular/router';
import { fetchAuthSession, signOut } from 'aws-amplify/auth';
import { jwtDecode } from 'jwt-decode';

@Component({
  selector: 'app-menu',
  templateUrl: './menu.component.html',
  styleUrls: ['./menu.component.scss'],
  standalone: false
})
export class MenuComponent implements OnInit {
  @Input() menuItems: any;
  @Output() menuClose: EventEmitter<any> = new EventEmitter<any>();
  @Output() themeChange: EventEmitter<string> = new EventEmitter<string>();
  
  userName: string = '';
  hovering = false;
  currentTheme: 'light' | 'dark' = 'light';

  constructor(private router: Router) {}

  async ngOnInit() {
    this.userName = sessionStorage.getItem("userName") || await this.getUserName();
    
    // Load saved theme preference
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark';
    if (savedTheme) {
      this.currentTheme = savedTheme;
      this.applyTheme(savedTheme);
    }
  }

  objectKeys(obj: any): string[] {
    return obj ? Object.keys(obj) : [];
  }

  async getUserName() {
    try {
      const session = await fetchAuthSession();
      const idToken = session?.tokens?.idToken?.toString();
      if (!idToken) return 'User';
      
      const decoded = jwtDecode<any>(idToken);
      const givenName = decoded.given_name || decoded.name || decoded.email?.split('@')[0];
      sessionStorage.setItem("userName", givenName ?? '');
      return givenName ?? 'User';
    } catch (error) {
      console.error('Error fetching user name:', error);
      return 'User';
    }
  }

  asIsOrder(a: any, b: any): number {
    return 1;
  }

  dashboard() {
    this.router.navigate(['/dashboard']);
  }

  api() {
    this.router.navigate(['/api']);
  }

  bar_chart() {
    this.router.navigate(['/dashboard/usage']);
  }

  settings() {
    this.router.navigate(['/dashboard/settings']);
  }

  callMethod(fn: string): void {
    switch(fn) {
      case 'dashboard':
        this.dashboard();
        break;
      case 'api':
        this.api();
        break;
      case 'bar_chart':
        this.bar_chart();
        break;
      case 'settings':
        this.settings();
        break;
    }
  }

  closeMenu() {
    this.menuClose.emit(true);
  }

  toggleTheme() {
    this.currentTheme = this.currentTheme === 'light' ? 'dark' : 'light';
    this.applyTheme(this.currentTheme);
    localStorage.setItem('theme', this.currentTheme);
    this.themeChange.emit(this.currentTheme);
  }

  applyTheme(theme: 'light' | 'dark') {
    document.body.classList.remove('light-theme', 'dark-theme');
    document.body.classList.add(`${theme}-theme`);
  }

  async userSignout() {
    try {
      await signOut({ global: true });
      localStorage.clear();
      sessionStorage.clear();
      this.router.navigate(['/login']); 
    } catch (error) {
      console.error('Error signing out:', error);
      this.router.navigate(['/login']);
    }
  }
}
