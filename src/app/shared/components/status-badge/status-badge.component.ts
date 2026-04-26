import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-status-badge',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './status-badge.component.html',
  styleUrl: './status-badge.component.scss'
})
export class StatusBadgeComponent {
  @Input({ required: true }) status = '';

  badgeClass(): string {
    const status = this.status.toLowerCase();

    if (['actif', 'payee', 'valide', 'accepte', 'recu', 'emise'].includes(status)) {
      return 'status-badge status-badge--success';
    }

    if (['partiellement_payee', 'envoye', 'commande', 'en_attente', 'brouillon'].includes(status)) {
      return 'status-badge status-badge--warning';
    }

    if (['inactif', 'annule', 'annulee', 'refuse', 'expire'].includes(status)) {
      return 'status-badge status-badge--danger';
    }

    return 'status-badge';
  }

  formatStatus(): string {
    return this.status.replaceAll('_', ' ');
  }
}
