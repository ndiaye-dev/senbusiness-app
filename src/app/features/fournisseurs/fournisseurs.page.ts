import { CommonModule, CurrencyPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { FeatureKey } from '../../core/constants/permissions';
import { Achat, Fournisseur } from '../../core/models/entities';
import { AuthService } from '../../core/services/auth.service';
import { MockDbService } from '../../core/services/mock-db.service';
import { FormModalComponent } from '../../shared/components/form-modal/form-modal.component';
import { paginate } from '../../shared/utils/list-helpers';

interface FournisseurRow {
  id: number;
  initial: string;
  avatarTone: 'teal' | 'blue' | 'emerald' | 'orange' | 'pink' | 'cyan';
  raison_sociale: string;
  email: string;
  telephone: string;
  ville: string;
  total_achats: number;
  statut: Fournisseur['statut'];
}

@Component({
  selector: 'app-fournisseurs-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, CurrencyPipe, FormModalComponent],
  templateUrl: './fournisseurs.page.html',
  styleUrl: './fournisseurs.page.scss'
})
export class FournisseursPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly db = inject(MockDbService);
  private readonly auth = inject(AuthService);
  private readonly featureKey: FeatureKey = 'fournisseurs';

  readonly loading = signal(false);
  readonly errorMessage = signal('');
  readonly search = signal('');
  readonly statusFilter = signal<'tous' | Fournisseur['statut']>('tous');
  readonly cityFilter = signal('toutes');
  readonly showFilters = signal(false);

  readonly page = signal(1);
  readonly pageSize = 6;

  readonly isDetailsModalOpen = signal(false);
  readonly detailsTitle = signal('Details');
  readonly detailsLines = signal<string[]>([]);

  readonly fournisseurs = signal<Fournisseur[]>([]);
  readonly achats = signal<Achat[]>([]);

  readonly isModalOpen = signal(false);  readonly editingId = signal<number | null>(null);

  readonly form = this.fb.group({
    code_fournisseur: ['', [Validators.required]],
    raison_sociale: ['', [Validators.required]],
    contact_nom: ['', [Validators.required]],
    telephone: ['', [Validators.required]],
    email: ['', [Validators.email]],
    adresse: ['', [Validators.required]],
    ville: ['', [Validators.required]],
    ninea: [''],
    delai_paiement_jours: [30, [Validators.required, Validators.min(0)]],
    statut: ['actif', Validators.required]
  });

  readonly canView = computed(() => this.auth.can(this.featureKey, 'can_view'));
  readonly canCreate = computed(() => this.auth.can(this.featureKey, 'can_create'));
  readonly canEdit = computed(() => this.auth.can(this.featureKey, 'can_edit'));
  readonly canDelete = computed(() => this.auth.can(this.featureKey, 'can_delete'));

  readonly allCities = computed(() => {
    return [...new Set(this.fournisseurs().map((item) => item.ville).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  });

  readonly filtered = computed(() => {
    const query = this.search().trim().toLowerCase();

    const filtered = this.fournisseurs().filter((item) => {
      const matchesSearch =
        !query ||
        `${item.code_fournisseur} ${item.raison_sociale} ${item.contact_nom} ${item.email} ${item.telephone} ${item.ville}`
          .toLowerCase()
          .includes(query);

      const matchesStatus = this.statusFilter() === 'tous' || item.statut === this.statusFilter();
      const matchesCity = this.cityFilter() === 'toutes' || item.ville === this.cityFilter();

      return matchesSearch && matchesStatus && matchesCity;
    });

    const preferredOrder = [
      'Societe Senegal Import SARL',
      'Groupe Alimentaire du Senegal',
      'Sow Distribution SA',
      'Konate Fournitures Bureau',
      'Mbaye Materiel Industriel',
      'Ndiaye Emballages & Cie'
    ];

    const rank = new Map(preferredOrder.map((name, index) => [name.toLowerCase(), index]));

    return filtered.sort((a, b) => {
      const rankA = rank.get(this.stripAccents(a.raison_sociale).toLowerCase());
      const rankB = rank.get(this.stripAccents(b.raison_sociale).toLowerCase());

      if (rankA !== undefined && rankB !== undefined) {
        return rankA - rankB;
      }
      if (rankA !== undefined) {
        return -1;
      }
      if (rankB !== undefined) {
        return 1;
      }

      return a.raison_sociale.localeCompare(b.raison_sociale, 'fr');
    });
  });

  readonly paginated = computed(() => paginate(this.filtered(), this.page(), this.pageSize));

  readonly rows = computed<FournisseurRow[]>(() => {
    const tones: FournisseurRow['avatarTone'][] = ['teal', 'blue', 'emerald', 'orange', 'pink', 'cyan'];

    return this.paginated().items.map((item, index) => {
      const totalAchats = this.resolveTotalAchats(item);
      return {
        id: item.id,
        initial: item.raison_sociale[0]?.toUpperCase() ?? 'F',
        avatarTone: tones[(item.id + index) % tones.length],
        raison_sociale: item.raison_sociale,
        email: item.email || '-',
        telephone: item.telephone,
        ville: item.ville,
        total_achats: totalAchats,
        statut: item.statut
      };
    });
  });

  readonly stats = computed(() => {
    const all = this.fournisseurs();
    const total = all.length;
    const actifs = all.filter((item) => item.statut === 'actif').length;
    const inactifs = all.filter((item) => item.statut === 'inactif').length;
    const totalAchats = all.reduce((sum, item) => sum + this.resolveTotalAchats(item), 0);

    return { total, actifs, inactifs, totalAchats };
  });

  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.pageSize)));
  readonly pages = computed(() => Array.from({ length: this.totalPages() }, (_, index) => index + 1));
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
      this.ensureDemoFournisseurs();
      this.fournisseurs.set(this.db.getCollection('fournisseurs'));
      this.achats.set(this.db.getCollection('achats'));
    } catch {
      this.errorMessage.set('Impossible de charger les fournisseurs.');
    } finally {
      this.loading.set(false);
    }
  }

  onSearch(value: string): void {
    this.search.set(value);
    this.page.set(1);
  }

  onStatusFilter(value: string): void {
    this.statusFilter.set((value as 'tous' | Fournisseur['statut']) ?? 'tous');
    this.page.set(1);
  }

  onCityFilter(value: string): void {
    this.cityFilter.set(value || 'toutes');
    this.page.set(1);
  }

  toggleFilters(): void {
    this.showFilters.update((state) => !state);
  }

  resetFilters(): void {
    this.search.set('');
    this.statusFilter.set('tous');
    this.cityFilter.set('toutes');
    this.page.set(1);
  }

  openCreateModal(): void {
    this.editingId.set(null);
    this.form.reset({
      code_fournisseur: `FRN-${String(Date.now()).slice(-4)}`,
      raison_sociale: '',
      contact_nom: '',
      telephone: '',
      email: '',
      adresse: '',
      ville: 'Dakar',
      ninea: '',
      delai_paiement_jours: 30,
      statut: 'actif'
    });
    this.isModalOpen.set(true);
  }

  openEditModalById(id: number): void {
    const item = this.fournisseurs().find((entry) => entry.id === id);
    if (!item) {
      return;
    }

    this.editingId.set(item.id);
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
      this.db.update('fournisseurs', this.editingId() as number, values);
    } else {
      this.db.create('fournisseurs', values);
    }

    this.closeModal();
    this.loadData();
  }

  viewById(id: number): void {
    const item = this.fournisseurs().find((entry) => entry.id === id);
    if (!item) {
      return;
    }

    const details = [
      `Fournisseur: ${item.raison_sociale}`,
      `Code: ${item.code_fournisseur}`,
      `Contact: ${item.contact_nom}`,
      `Email: ${item.email || '-'}`,
      `Téléphone: ${item.telephone}`,
      `Ville: ${item.ville}`,
      `NINEA: ${item.ninea || '-'}`,
      `Total achats: ${this.resolveTotalAchats(item).toLocaleString('fr-FR')} XOF`
    ].join('\n');

    this.openDetailsModal('Details', details);
  }

  removeById(id: number): void {
    const item = this.fournisseurs().find((entry) => entry.id === id);
    if (!item) {
      return;
    }

    if (!window.confirm(`Supprimer le fournisseur ${item.raison_sociale} ?`)) {
      return;
    }

    this.db.delete('fournisseurs', item.id);
    this.loadData();
  }

  exportFournisseurs(): void {
    const header = 'code_fournisseur,raison_sociale,contact_nom,telephone,email,ville,statut,total_achats';
    const lines = this.filtered().map((item) =>
      [
        item.code_fournisseur,
        item.raison_sociale,
        item.contact_nom,
        item.telephone,
        item.email,
        item.ville,
        item.statut,
        this.resolveTotalAchats(item)
      ]
        .map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`)
        .join(',')
    );

    const csv = [header, ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `senbusiness-fournisseurs-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
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

  hasFiltersApplied(): boolean {
    return !!this.search().trim() || this.statusFilter() !== 'tous' || this.cityFilter() !== 'toutes';
  }
  private resolveTotalAchats(item: Fournisseur): number {
    const achatsDb = this.achats().filter((achat) => achat.fournisseur_id === item.id);
    if (achatsDb.length) {
      return achatsDb.reduce((sum, achat) => sum + achat.total_ttc, 0);
    }

    const fallback: Record<string, number> = {
      'Societe Senegal Import SARL': 8500000,
      'Groupe Alimentaire du Senegal': 15200000,
      'Sow Distribution SA': 4300000,
      'Konate Fournitures Bureau': 2100000,
      'Mbaye Materiel Industriel': 6700000,
      'Ndiaye Emballages & Cie': 3200000
    };

    return fallback[this.stripAccents(item.raison_sociale)] ?? 0;
  }
  private stripAccents(value: string): string {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }
  private ensureDemoFournisseurs(): void {
    const existing = this.db.getCollection('fournisseurs');
    const byName = new Set(existing.map((item) => this.stripAccents(item.raison_sociale).toLowerCase()));

    const demo: Array<Omit<Fournisseur, 'id'>> = [
      {
        code_fournisseur: 'FRN-2001',
        raison_sociale: 'Societe Senegal Import SARL',
        contact_nom: 'Amadou Diop',
        telephone: '+221 77 111 22 33',
        email: 'contact@senegalimport.sn',
        adresse: 'Zone portuaire',
        ville: 'Dakar',
        ninea: 'SN-DKR-2020-B-11001',
        delai_paiement_jours: 30,
        statut: 'actif'
      },
      {
        code_fournisseur: 'FRN-2002',
        raison_sociale: 'Groupe Alimentaire du Senegal',
        contact_nom: 'Awa Ndiaye',
        telephone: '+221 76 222 33 44',
        email: 'achats@gas.sn',
        adresse: 'Route de Mbour',
        ville: 'Thies',
        ninea: 'SN-THS-2019-A-22003',
        delai_paiement_jours: 21,
        statut: 'actif'
      },
      {
        code_fournisseur: 'FRN-2003',
        raison_sociale: 'Sow Distribution SA',
        contact_nom: 'Ibrahima Sow',
        telephone: '+221 70 333 44 55',
        email: 'commandes@sowdist.sn',
        adresse: 'Escale',
        ville: 'Saint-Louis',
        ninea: 'SN-STL-2021-C-30877',
        delai_paiement_jours: 30,
        statut: 'actif'
      },
      {
        code_fournisseur: 'FRN-2004',
        raison_sociale: 'Konate Fournitures Bureau',
        contact_nom: 'Fatou Konate',
        telephone: '+221 78 444 55 66',
        email: 'f.konate@fournitures.sn',
        adresse: 'VDN 2',
        ville: 'Dakar',
        ninea: 'SN-DKR-2022-B-67312',
        delai_paiement_jours: 15,
        statut: 'inactif'
      },
      {
        code_fournisseur: 'FRN-2005',
        raison_sociale: 'Mbaye Materiel Industriel',
        contact_nom: 'Ousmane Mbaye',
        telephone: '+221 77 555 66 77',
        email: 'contact@mbayemateriel.sn',
        adresse: 'Avenue Faidherbe',
        ville: 'Kaolack',
        ninea: 'SN-KLK-2018-A-10228',
        delai_paiement_jours: 45,
        statut: 'actif'
      },
      {
        code_fournisseur: 'FRN-2006',
        raison_sociale: 'Ndiaye Emballages & Cie',
        contact_nom: 'Moussa Ndiaye',
        telephone: '+221 76 666 77 88',
        email: 'commandes@ndiayeemb.sn',
        adresse: 'Zone industrielle Hann',
        ville: 'Dakar',
        ninea: 'SN-DKR-2023-C-99013',
        delai_paiement_jours: 30,
        statut: 'actif'
      }
    ];

    for (const supplier of demo) {
      const key = this.stripAccents(supplier.raison_sociale).toLowerCase();
      if (!byName.has(key)) {
        this.db.create('fournisseurs', supplier);
      }
    }
  }
}


