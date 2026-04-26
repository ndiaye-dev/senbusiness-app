import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { FeatureKey } from '../../core/constants/permissions';
import { Depense } from '../../core/models/entities';
import { AuthService } from '../../core/services/auth.service';
import { MockDbService } from '../../core/services/mock-db.service';
import { FormModalComponent } from '../../shared/components/form-modal/form-modal.component';
import { paginate } from '../../shared/utils/list-helpers';

type UiExpenseCategory = 'Loyer' | 'Salaires' | 'Fournitures' | 'Transport' | 'Services' | 'Autre';
type UiExpenseMode = 'virement' | 'especes' | 'cheque' | 'mobile_money' | 'carte_bancaire' | 'autre';

interface DepenseView {
  id: number;
  date_depense: string;
  categorie_label: UiExpenseCategory;
  libelle: string;
  montant: number;
  mode_label: string;
  mode_tone: UiExpenseMode;
  mode_icon: string;
  has_piece: boolean;
}

@Component({
  selector: 'app-depenses-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, CurrencyPipe, DatePipe, FormModalComponent],
  templateUrl: './depenses.page.html',
  styleUrl: './depenses.page.scss'
})
export class DepensesPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly db = inject(MockDbService);
  private readonly auth = inject(AuthService);
  private readonly featureKey: FeatureKey = 'depenses';

  readonly loading = signal(false);
  readonly errorMessage = signal('');
  readonly actionMessage = signal('');

  readonly search = signal('');
  readonly categoryFilter = signal<'toutes' | UiExpenseCategory>('toutes');
  readonly statusFilter = signal<'tous' | Depense['statut']>('tous');
  readonly modeFilter = signal<'tous' | UiExpenseMode>('tous');
  readonly showFilters = signal(false);

  readonly page = signal(1);
  readonly pageSize = 8;

  readonly isDetailsModalOpen = signal(false);
  readonly detailsTitle = signal('Détails');
  readonly detailsLines = signal<string[]>([]);

  readonly depenses = signal<Depense[]>([]);
  readonly isModalOpen = signal(false);  readonly editingId = signal<number | null>(null);

  readonly form = this.fb.group({
    libelle: ['', [Validators.required]],
    categorie_depense: ['Services', [Validators.required]],
    montant: [0, [Validators.required, Validators.min(0)]],
    date_depense: [new Date().toISOString().slice(0, 10), [Validators.required]],
    mode_paiement: ['virement', [Validators.required]],
    justificatif: [''],
    statut: ['validee', Validators.required]
  });

  readonly canView = computed(() => this.auth.can(this.featureKey, 'can_view'));
  readonly canCreate = computed(() => this.auth.can(this.featureKey, 'can_create'));
  readonly canEdit = computed(() => this.auth.can(this.featureKey, 'can_edit'));
  readonly canDelete = computed(() => this.auth.can(this.featureKey, 'can_delete'));

  readonly stats = computed(() => {
    const rows = this.depenses();
    const total = rows.length;

    const amountByCategory = {
      Loyer: 0,
      Salaires: 0,
      Fournitures: 0,
      Transport: 0,
      Services: 0,
      Autre: 0
    } as Record<UiExpenseCategory, number>;

    for (const item of rows) {
      const category = this.toUiCategory(item.categorie_depense);
      amountByCategory[category] += item.montant;
    }

    return {
      total,
      loyer: amountByCategory.Loyer,
      salaires: amountByCategory.Salaires,
      fournitures: amountByCategory.Fournitures,
      transport: amountByCategory.Transport,
      services: amountByCategory.Services
    };
  });

  readonly filtered = computed(() => {
    const query = this.search().trim().toLowerCase();

    const filtered = this.depenses().filter((item) => {
      const category = this.toUiCategory(item.categorie_depense);
      const mode = this.toUiMode(item.mode_paiement);

      const matchesSearch =
        !query || `${item.libelle} ${item.categorie_depense} ${item.mode_paiement} ${item.montant}`.toLowerCase().includes(query);

      const matchesCategory = this.categoryFilter() === 'toutes' || category === this.categoryFilter();
      const matchesStatus = this.statusFilter() === 'tous' || item.statut === this.statusFilter();
      const matchesMode = this.modeFilter() === 'tous' || mode === this.modeFilter();

      return matchesSearch && matchesCategory && matchesStatus && matchesMode;
    });

    return filtered.sort((a, b) => {
      const dateDiff = b.date_depense.localeCompare(a.date_depense);
      if (dateDiff !== 0) {
        return dateDiff;
      }
      return b.id - a.id;
    });
  });

  readonly paginated = computed(() => paginate(this.filtered(), this.page(), this.pageSize));

  readonly rows = computed<DepenseView[]>(() =>
    this.paginated().items.map((item) => {
      const mode = this.toUiMode(item.mode_paiement);
      return {
        id: item.id,
        date_depense: item.date_depense,
        categorie_label: this.toUiCategory(item.categorie_depense),
        libelle: item.libelle,
        montant: item.montant,
        mode_label: this.modeLabel(mode),
        mode_tone: mode,
        mode_icon: this.modeIcon(mode),
        has_piece: !!item.justificatif?.trim()
      };
    })
  );

  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.pageSize)));
  readonly pages = computed(() => Array.from({ length: this.totalPages() }, (_, index) => index + 1));
  private readonly xofFormatter = new Intl.NumberFormat('fr-FR');
  closeDetailsModal(): void {
    this.isDetailsModalOpen.set(false);
  }

  private openDetailsModal(title: string, details: string): void {
    this.detailsTitle.set(title);
    this.detailsLines.set(details.split('\n'));
    this.isDetailsModalOpen.set(true);
  }

  constructor() {
    this.loadData();
  }

  loadData(): void {
    this.loading.set(true);
    this.errorMessage.set('');

    try {
      this.ensureDemoDepenses();
      this.depenses.set(this.db.getCollection('depenses'));
    } catch {
      this.errorMessage.set('Impossible de charger les dépenses.');
    } finally {
      this.loading.set(false);
    }
  }

  onSearch(value: string): void {
    this.search.set(value);
    this.page.set(1);
  }

  onCategoryFilter(value: string): void {
    this.categoryFilter.set((value as 'toutes' | UiExpenseCategory) ?? 'toutes');
    this.page.set(1);
  }

  onStatusFilter(value: string): void {
    this.statusFilter.set((value as 'tous' | Depense['statut']) ?? 'tous');
    this.page.set(1);
  }

  onModeFilter(value: string): void {
    this.modeFilter.set((value as 'tous' | UiExpenseMode) ?? 'tous');
    this.page.set(1);
  }

  toggleFilters(): void {
    this.showFilters.update((state) => !state);
  }

  resetFilters(): void {
    this.search.set('');
    this.categoryFilter.set('toutes');
    this.statusFilter.set('tous');
    this.modeFilter.set('tous');
    this.page.set(1);
  }

  openCreateModal(): void {
    this.editingId.set(null);
    this.actionMessage.set('');

    this.form.reset({
      libelle: '',
      categorie_depense: 'Services',
      montant: 0,
      date_depense: new Date().toISOString().slice(0, 10),
      mode_paiement: 'virement',
      justificatif: '',
      statut: 'validee'
    });

    this.isModalOpen.set(true);
  }

  openEditModalById(id: number): void {
    const item = this.depenses().find((entry) => entry.id === id);
    if (!item) {
      return;
    }

    this.editingId.set(item.id);
    this.actionMessage.set('');
    this.form.reset({ ...item });
    this.isModalOpen.set(true);
  }

  closeModal(): void {
    this.isModalOpen.set(false);
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const values = this.form.getRawValue();

    if (this.editingId()) {
      this.db.update('depenses', this.editingId() as number, values);
      this.actionMessage.set('Dépense mise à jour avec succès.');
    } else {
      this.db.create('depenses', values);
      this.actionMessage.set('Dépense créée avec succès.');
    }

    this.closeModal();
    this.loadData();
  }

  viewById(id: number): void {
    if (this.canEdit()) {
      this.openEditModalById(id);
      return;
    }

    const item = this.depenses().find((entry) => entry.id === id);
    if (!item) {
      return;
    }

    const details = [
      `Dépense: ${item.libelle}`,
      `Date: ${item.date_depense}`,
      `Catégorie: ${this.toUiCategory(item.categorie_depense)}`,
      `Montant: ${item.montant.toLocaleString('fr-FR')} XOF`,
      `Mode: ${this.modeLabel(this.toUiMode(item.mode_paiement))}`,
      `Statut: ${this.statusLabel(item.statut)}`,
      `Pièce: ${item.justificatif?.trim() ? 'Oui' : 'Non'}`
    ].join('\n');

    this.openDetailsModal('Détails', details);
  }

  removeById(id: number): void {
    const item = this.depenses().find((entry) => entry.id === id);
    if (!item) {
      return;
    }

    if (!window.confirm(`Supprimer la dépense "${item.libelle}" ?`)) {
      return;
    }

    this.db.delete('depenses', item.id);
    this.actionMessage.set('Dépense supprimée avec succès.');
    this.loadData();
  }

  exportDepenses(): void {
    const header = 'date_depense,categorie,libelle,montant,mode_paiement,justificatif,statut';
    const lines = this.filtered().map((item) =>
      [
        item.date_depense,
        this.toUiCategory(item.categorie_depense),
        item.libelle,
        item.montant,
        this.modeLabel(this.toUiMode(item.mode_paiement)),
        item.justificatif,
        this.statusLabel(item.statut)
      ]
        .map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`)
        .join(',')
    );

    const csv = [header, ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `senbusiness-depenses-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  categoryTone(category: UiExpenseCategory): 'loyer' | 'salaires' | 'fournitures' | 'transport' | 'services' | 'autre' {
    switch (category) {
      case 'Loyer':
        return 'loyer';
      case 'Salaires':
        return 'salaires';
      case 'Fournitures':
        return 'fournitures';
      case 'Transport':
        return 'transport';
      case 'Services':
        return 'services';
      default:
        return 'autre';
    }
  }

  categoryIcon(category: UiExpenseCategory): string {
    switch (category) {
      case 'Loyer':
        return 'business';
      case 'Salaires':
        return 'groups';
      case 'Fournitures':
        return 'build';
      case 'Transport':
        return 'local_shipping';
      case 'Services':
        return 'wifi';
      default:
        return 'more_horiz';
    }
  }

  modeLabel(mode: UiExpenseMode): string {
    switch (mode) {
      case 'virement':
        return 'Virement';
      case 'especes':
        return 'Espèces';
      case 'cheque':
        return 'Chèque';
      case 'mobile_money':
        return 'Mobile Money';
      case 'carte_bancaire':
        return 'Carte bancaire';
      default:
        return 'Autre';
    }
  }

  modeIcon(mode: UiExpenseMode): string {
    switch (mode) {
      case 'virement':
        return 'currency_exchange';
      case 'especes':
        return 'paid';
      case 'cheque':
        return 'receipt';
      case 'mobile_money':
        return 'smartphone';
      case 'carte_bancaire':
        return 'credit_card';
      default:
        return 'payments';
    }
  }

  statusLabel(status: Depense['statut']): string {
    switch (status) {
      case 'validee':
        return 'Validée';
      case 'en_attente':
        return 'En attente';
      default:
        return 'Annulée';
    }
  }

  nextPage(): void {
    this.goToPage(this.page() + 1);
  }

  previousPage(): void {
    this.goToPage(this.page() - 1);
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages() || page === this.page()) {
      return;
    }

    this.page.set(page);
  }

  startResult(): number {
    if (!this.filtered().length) {
      return 0;
    }

    return (this.page() - 1) * this.pageSize + 1;
  }

  endResult(): number {
    return Math.min(this.page() * this.pageSize, this.filtered().length);
  }

  totalMontant(): number {
    return this.stats().loyer + this.stats().salaires + this.stats().fournitures + this.stats().transport + this.stats().services;
  }

  formatXof(value: number): string {
    const amount = this.xofFormatter.format(Math.round(value)).replace(/[\u00a0\u202f]/g, ' ');
    return `${amount} FCFA`;
  }
  private toUiCategory(value: string): UiExpenseCategory {
    const normalized = String(value).trim().toLowerCase();

    if (normalized.includes('loyer')) {
      return 'Loyer';
    }
    if (normalized.includes('salaire')) {
      return 'Salaires';
    }
    if (normalized.includes('fourniture') || normalized.includes('papeterie')) {
      return 'Fournitures';
    }
    if (normalized.includes('transport') || normalized.includes('carburant') || normalized.includes('livraison')) {
      return 'Transport';
    }
    if (
      normalized.includes('service') ||
      normalized.includes('internet') ||
      normalized.includes('telephone') ||
      normalized.includes('téléphone')
    ) {
      return 'Services';
    }

    return 'Autre';
  }
  private toUiMode(mode: string): UiExpenseMode {
    const value = String(mode).toLowerCase();

    if (value.includes('vir')) {
      return 'virement';
    }
    if (value.includes('esp')) {
      return 'especes';
    }
    if (value.includes('che')) {
      return 'cheque';
    }
    if (value.includes('mobile') || value.includes('mm')) {
      return 'mobile_money';
    }
    if (value.includes('carte') || value.includes('visa') || value.includes('cb')) {
      return 'carte_bancaire';
    }

    return 'autre';
  }
  private ensureDemoDepenses(): void {
    const existing = this.db.getCollection('depenses');
    const keys = new Set(existing.map((item) => `${item.date_depense}|${item.libelle}`.toLowerCase()));

    const demo: Array<Omit<Depense, 'id'>> = [
      {
        libelle: 'Loyer bureau Dakar Plateau',
        categorie_depense: 'Loyer',
        montant: 450000,
        date_depense: '2026-04-24',
        mode_paiement: 'virement',
        justificatif: 'Quitance loyer avril 2026',
        statut: 'validee'
      },
      {
        libelle: 'Salaires avril 2026',
        categorie_depense: 'Salaires',
        montant: 3200000,
        date_depense: '2026-04-23',
        mode_paiement: 'virement',
        justificatif: '',
        statut: 'validee'
      },
      {
        libelle: 'Achat papeterie et fournitures',
        categorie_depense: 'Fournitures',
        montant: 125000,
        date_depense: '2026-04-22',
        mode_paiement: 'especes',
        justificatif: 'Facture papeterie centre-ville',
        statut: 'validee'
      },
      {
        libelle: 'Frais livraison clients',
        categorie_depense: 'Transport',
        montant: 85000,
        date_depense: '2026-04-21',
        mode_paiement: 'especes',
        justificatif: '',
        statut: 'validee'
      },
      {
        libelle: 'Facture internet et téléphone',
        categorie_depense: 'Services',
        montant: 95000,
        date_depense: '2026-04-20',
        mode_paiement: 'virement',
        justificatif: 'Facture Sonatel Avril',
        statut: 'validee'
      },
      {
        libelle: 'Réparation climatisation',
        categorie_depense: 'Autre',
        montant: 180000,
        date_depense: '2026-04-19',
        mode_paiement: 'cheque',
        justificatif: 'Bon intervention maintenance',
        statut: 'en_attente'
      },
      {
        libelle: 'Cartouches imprimante',
        categorie_depense: 'Fournitures',
        montant: 45000,
        date_depense: '2026-04-18',
        mode_paiement: 'especes',
        justificatif: '',
        statut: 'validee'
      },
      {
        libelle: 'Carburant véhicule société',
        categorie_depense: 'Transport',
        montant: 120000,
        date_depense: '2026-04-17',
        mode_paiement: 'especes',
        justificatif: '',
        statut: 'annulee'
      }
    ];

    for (const item of demo) {
      const key = `${item.date_depense}|${item.libelle}`.toLowerCase();
      if (!keys.has(key)) {
        this.db.create('depenses', item);
      }
    }
  }
}


