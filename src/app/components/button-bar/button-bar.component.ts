import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, ChangeDetectionStrategy } from '@angular/core';

export type ActionButtonConfig = {
  label: string;
  disabled?: boolean;
};

export type ActionBarConfig = {
  left?: ActionButtonConfig;
  right?: ActionButtonConfig;
};

@Component({
  selector: 'app-button-bar',
  standalone: true,
  templateUrl: './button-bar.component.html',
  styleUrl: './button-bar.component.scss',
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ButtonBarComponent {
  @Input() config?: ActionBarConfig;

  @Output() action = new EventEmitter<'left' | 'right'>();

  onClick(side: 'left' | 'right'): void {
    this.action.emit(side);
  }
}
