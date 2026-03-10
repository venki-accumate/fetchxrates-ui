import {
  Component, Input, Output, EventEmitter,
  OnChanges, SimpleChanges, ViewChild, AfterViewInit,
  OnInit
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatPaginatorModule, MatPaginator } from '@angular/material/paginator';
import { MatSortModule, MatSort } from '@angular/material/sort';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-data-table',
  standalone: true,
  templateUrl: './data-table.component.html',
  styleUrl: './data-table.component.scss',
  imports: [
    CommonModule,
    FormsModule,
    MatTableModule,
    MatPaginatorModule,
    MatSortModule,
    MatIconModule,
    MatButtonModule
  ]
})
export class DataTableComponent implements OnChanges, AfterViewInit {
  /** Column names — used as both display headers and object keys in dataSource rows */
  @Input() columnHeaders: string[] = [];
  /** Array of row objects; each key must match a value in columnHeaders */
  @Input() dataSource: any[] = [];
  /** Enable double-click inline cell editing */
  @Input() editable = false;
  @Input() disablePagination = false;
  /** Emits when a cell edit is saved; parent must call onEditSuccess() or onEditFailure() */
  @Output() saveCellValue = new EventEmitter<{ rowData: any; column: string; newValue: any }>();

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  displayedColumns: string[] = [];
  matDataSource = new MatTableDataSource<any>([]);

  editingCell: { row: any; column: string } | null = null;
  editingValue: any = '';
  hasError = false;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['columnHeaders']) {
      this.displayedColumns = [...(this.columnHeaders || [])];
    }
    if (changes['dataSource']) {
      this.matDataSource.data = this.dataSource || [];
    }
    if (changes['disablePagination'] && this.paginator) {
      this.matDataSource.paginator = this.disablePagination ? null : this.paginator;
    }
  }

  ngAfterViewInit(): void {
    if (!this.disablePagination) {
      this.matDataSource.paginator = this.paginator;
    }
    this.matDataSource.sort = this.sort;
  }

  applyFilter(event: Event): void {
    const filterValue = (event.target as HTMLInputElement).value;
    this.matDataSource.filter = filterValue.trim().toLowerCase();
    if (this.matDataSource.paginator) {
      this.matDataSource.paginator.firstPage();
    }
  }

  isEditing(row: any, column: string): boolean {
    return this.editingCell?.row === row && this.editingCell?.column === column;
  }

  onCellDoubleClick(row: any, column: string): void {
    if (!this.editable) return;
    this.editingCell = { row, column };
    this.editingValue = row[column];
    this.hasError = false;
    setTimeout(() => {
      const input = document.querySelector('.edit-input') as HTMLInputElement;
      if (input) { input.focus(); input.select(); }
    }, 50);
  }

  onSaveEdit(): void {
    if (!this.editingCell) return;
    const { row, column } = this.editingCell;
    this.saveCellValue.emit({ rowData: row, column, newValue: this.editingValue });
  }

  /** Call from parent after a successful save to commit the value */
  onEditSuccess(): void {
    if (!this.editingCell) return;
    this.editingCell.row[this.editingCell.column] = this.editingValue;
    this.editingCell = null;
    this.hasError = false;
  }

  /** Call from parent when save fails to highlight the input in error state */
  onEditFailure(): void {
    this.hasError = true;
  }

  onCancelEdit(): void {
    this.editingCell = null;
    this.hasError = false;
  }
}
