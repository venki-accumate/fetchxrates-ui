import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { PageHelpContent } from '../../services/page-help.service';

@Component({
  selector: 'app-page-help-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatIconModule, MatButtonModule],
  templateUrl: './page-help-dialog.component.html',
  styleUrls: ['./page-help-dialog.component.scss']
})
export class PageHelpDialogComponent {
  constructor(
    public dialogRef: MatDialogRef<PageHelpDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: PageHelpContent
  ) {}

  close(): void {
    this.dialogRef.close();
  }
}
