import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { StatusBadgeComponent } from '../status-badge/status-badge.component';

export interface DataTableColumn<T> {
  key: keyof T | string;
  label: string;
  type?: 'text' | 'currency' | 'date' | 'status';
  formatter?: (row: T) => string | number;
}

@Component({
  selector: 'app-data-table',
  standalone: true,
  imports: [CommonModule, CurrencyPipe, DatePipe, StatusBadgeComponent],
  templateUrl: './data-table.component.html',
  styleUrl: './data-table.component.scss'
})
export class DataTableComponent<T extends { id: number }> {
  @Input({ required: true }) columns: DataTableColumn<T>[] = [];
  @Input({ required: true }) rows: T[] = [];
  @Input() loading = false;
  @Input() errorMessage = '';
  @Input() emptyMessage = 'Aucune donnee';
  @Input() canEdit = false;
  @Input() canDelete = false;
  @Input() canView = false;

  @Output() view = new EventEmitter<T>();
  @Output() edit = new EventEmitter<T>();
  @Output() delete = new EventEmitter<T>();

  resolveCell(row: T, column: DataTableColumn<T>): unknown {
    if (column.formatter) {
      return column.formatter(row);
    }

    return row[column.key as keyof T];
  }

  asCurrency(value: unknown): number {
    return typeof value === 'number' ? value : Number(value ?? 0);
  }

  asDate(value: unknown): string | number | Date {
    return value instanceof Date || typeof value === 'number' || typeof value === 'string'
      ? value
      : '';
  }

  asText(value: unknown): string {
    return String(value ?? '');
  }
}
