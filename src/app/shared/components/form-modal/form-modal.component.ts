import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-form-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './form-modal.component.html',
  styleUrl: './form-modal.component.scss'
})
export class FormModalComponent {
  @Input() title = '';
  @Input() open = false;
  @Input() submitLabel = 'Enregistrer';
  @Input() loading = false;

  @Output() close = new EventEmitter<void>();
  @Output() submit = new EventEmitter<void>();
}
