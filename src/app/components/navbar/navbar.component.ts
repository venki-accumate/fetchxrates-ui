import { Component, Input, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { signOut, fetchAuthSession } from '@aws-amplify/auth';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule],
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.scss']
})
export class NavbarComponent implements OnInit {
  @Input() hideMenu = false;
  
  isDarkTheme = signal(false);
  mobileMenuOpen = signal(false);
  showUserMenu = signal(false);
  userName = signal('');
  
  menuItems = [
    { label: 'Dashboard', icon: 'dashboard', route: '/dashboard' },
    { label: 'API', icon: 'api', route: '/api' },
    { label: 'Usage', icon: 'bar_chart', route: '/usage' },
    { label: 'Settings', icon: 'settings', route: '/settings' }
  ];

  constructor(private router: Router) {}

  async ngOnInit() {
    // Check theme from localStorage
    const theme = localStorage.getItem('theme');
    this.isDarkTheme.set(theme === 'dark');
    this.applyTheme(this.isDarkTheme());
    
    // Get user name
    this.userName.set(sessionStorage.getItem('userName') || await this.getUserName());
  }

  async getUserName(): Promise<string> {
    try {
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken?.payload;
      const givenName = idToken?.['given_name'] as string || '';
      sessionStorage.setItem('userName', givenName);
      return givenName;
    } catch (error) {
      console.error('Error fetching user name:', error);
      return '';
    }
  }

  toggleTheme() {
    const newTheme = !this.isDarkTheme();
    this.isDarkTheme.set(newTheme);
    localStorage.setItem('theme', newTheme ? 'dark' : 'light');
    this.applyTheme(newTheme);
  }

  private applyTheme(isDark: boolean) {
    if (isDark) {
      document.body.classList.add('dark-theme');
      document.body.classList.remove('light-theme');
    } else {
      document.body.classList.add('light-theme');
      document.body.classList.remove('dark-theme');
    }
  }

  toggleMobileMenu() {
    this.mobileMenuOpen.update(v => !v);
  }

  closeMobileMenu() {
    this.mobileMenuOpen.set(false);
  }

  toggleUserMenu() {
    this.showUserMenu.update(v => !v);
  }

  async logout() {
    try {
      await signOut();
      sessionStorage.clear();
      this.router.navigate(['/login']);
    } catch (error) {
      console.error('Error signing out:', error);
    }
  }
}
