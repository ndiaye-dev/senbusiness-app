import { CommonModule, CurrencyPipe } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-kpi-card',
  standalone: true,
  imports: [CommonModule, CurrencyPipe],
  templateUrl: './kpi-card.component.html',
  styleUrl: './kpi-card.component.scss'
})
export class KpiCardComponent {
  @Input({ required: true }) title = '';
  @Input({ required: true }) value = 0;
  @Input() isCurrency = false;
  @Input() subtitle = '';
  @Input() accent: 'teal' | 'blue' = 'teal';
}
