import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-something-went-wrong',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './something-went-wrong.component.html',
  styleUrl: './something-went-wrong.component.scss',
})
export class SomethingWentWrongComponent {
  constructor(private router: Router) {}

  retry(): void {
    window.location.reload();
  }

  goHome(): void {
    this.router.navigate(['/dashboard']);
  }

  signOut(): void {
    // Clear local storage and redirect to login
    localStorage.clear();
    this.router.navigate(['/login']);
  }
}
