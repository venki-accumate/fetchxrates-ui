import { Component, Input, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { signOut, fetchAuthSession } from '@aws-amplify/auth';
import { PageHelpService } from '../../services/page-help.service';
import { PageHelpDialogComponent } from '../page-help/page-help-dialog.component';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule, MatDialogModule],
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.scss']
})
export class NavbarComponent implements OnInit {
  @Input() hideMenu = false;
  @Input() minimalMode = false; // For pricing page - only show theme toggle and user menu
  
  isDarkTheme = signal(false);
  mobileMenuOpen = signal(false);
  showUserMenu = signal(false);
  userName = signal('');
  
  menuItems = [
    { label: 'Upload & Convert', icon: 'dashboard', route: '/dashboard/conversion' },
    { label: 'Fetch Rates', icon: 'api', route: '/dashboard/rates' },
    { label: 'Statistics', icon: 'analytics', route: '/dashboard/statistics' },
    { label: 'Scheduling', icon: 'schedule', route: '/dashboard/schedule' },
    { label: 'Usage', icon: 'bar_chart', route: '/dashboard/usage' }
  ];

  constructor(
    private router: Router,
    private dialog: MatDialog,
    public pageHelpService: PageHelpService
  ) {}

  navigateTo(path: string): void {
    this.showUserMenu.set(false);
    this.router.navigate([path]);
  }

  openHelp(): void {
    const content = this.pageHelpService.content();
    if (!content) return;
    this.dialog.open(PageHelpDialogComponent, {
      data: content,
      panelClass: 'help-dialog-panel',
      maxWidth: '720px',
      width: '95vw',
      autoFocus: false
    });
  }

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
    } catch (error) {
      console.error('Error signing out:', error);
    }
  }
}
