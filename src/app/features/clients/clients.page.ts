import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { FeatureKey } from '../../core/constants/permissions';
import { Client } from '../../core/models/entities';
import { AuthService } from '../../core/services/auth.service';
import { MockDbService } from '../../core/services/mock-db.service';
import { FormModalComponent } from '../../shared/components/form-modal/form-modal.component';
import { paginate } from '../../shared/utils/list-helpers';

function clientTypeValidator(control: AbstractControl): ValidationErrors | null {
  const type = control.get('type_client')?.value as Client['type_client'];
  const nom = String(control.get('nom')?.value ?? '').trim();
  const prenom = String(control.get('prenom')?.value ?? '').trim();
  const raison = String(control.get('raison_sociale')?.value ?? '').trim();

  if (type === 'particulier' && (!nom || !prenom)) {
    return { particulier_incomplet: true };
  }

  if (type === 'entreprise' && !raison) {
    return { entreprise_incomplete: true };
  }

  return null;
}

interface ClientView {
  id: number;
  initial: string;
  avatarTone: 'teal' | 'blue' | 'emerald' | 'orange' | 'pink' | 'cyan';
  nomAffiche: string;
  contact: string;
  telephone: string;
  ville: string;
  statut: Client['statut'];
  solde: number;
}

@Component({
  selector: 'app-clients-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormModalComponent],
  templateUrl: './clients.page.html',
  styleUrl: './clients.page.scss'
})
export class ClientsPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly db = inject(MockDbService);
  private readonly auth = inject(AuthService);
  private readonly featureKey: FeatureKey = 'clients';

  readonly loading = signal(false);
  readonly errorMessage = signal('');
  readonly search = signal('');
  readonly statusFilter = signal<'tous' | Client['statut']>('tous');
  readonly typeFilter = signal<'tous' | Client['type_client']>('tous');
  readonly cityFilter = signal('toutes');
  readonly showFilters = signal(false);

  readonly page = signal(1);
  readonly pageSize = 6;

  readonly isDetailsModalOpen = signal(false);
  readonly detailsTitle = signal('Details');
  readonly detailsLines = signal<string[]>([]);

  readonly clients = signal<Client[]>([]);
  readonly isModalOpen = signal(false);  readonly editingId = signal<number | null>(null);

  readonly form = this.fb.group(
    {
      code_client: ['', [Validators.required]],
      type_client: ['particulier', Validators.required],
      nom: [''],
      prenom: [''],
      raison_sociale: [''],
      telephone: ['', [Validators.required, Validators.minLength(9)]],
      email: ['', [Validators.email]],
      adresse: ['', [Validators.required]],
      ville: ['', [Validators.required]],
      region: ['', [Validators.required]],
      ninea: [''],
      plafond_credit: [0, [Validators.required, Validators.min(0)]],
      statut: ['actif', Validators.required]
    },
    { validators: clientTypeValidator }
  );

  readonly canView = computed(() => this.auth.can(this.featureKey, 'can_view'));
  readonly canCreate = computed(() => this.auth.can(this.featureKey, 'can_create'));
  readonly canEdit = computed(() => this.auth.can(this.featureKey, 'can_edit'));
  readonly canDelete = computed(() => this.auth.can(this.featureKey, 'can_delete'));

  readonly allCities = computed(() => {
    return [...new Set(this.clients().map((client) => client.ville).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  });

  readonly stats = computed(() => {
    const rows = this.clients();
    const total = rows.length;
    const actifs = rows.filter((client) => client.statut === 'actif').length;
    const inactifs = rows.filter((client) => client.statut === 'inactif').length;
    const nouveauxMois = Math.min(8, total);

    return { total, actifs, inactifs, nouveauxMois };
  });

  readonly filtered = computed(() => {
    const query = this.search().trim().toLowerCase();
    const filtered = this.clients().filter((client) => {
      const displayName = this.getDisplayName(client).toLowerCase();
      const matchesSearch =
        !query ||
        `${client.code_client} ${displayName} ${client.email} ${client.telephone} ${client.ville} ${client.region}`
          .toLowerCase()
          .includes(query);

      const matchesStatus = this.statusFilter() === 'tous' || client.statut === this.statusFilter();
      const matchesType = this.typeFilter() === 'tous' || client.type_client === this.typeFilter();
      const matchesCity = this.cityFilter() === 'toutes' || client.ville === this.cityFilter();

      return matchesSearch && matchesStatus && matchesType && matchesCity;
    });

    const preferredOrder = [
      'Diallo & Freres SARL',
      'Groupe Ndiaye Commerce',
      'Sow Electronique',
      'Mbaye Distribution',
      'Fatou Textiles',
      'Konate Agro-Alimentaire',
      'Traore & Associes',
      'Sarr Import-Export'
    ];

    const rank = new Map(preferredOrder.map((name, index) => [name.toLowerCase(), index]));

    return filtered.sort((a, b) => {
      const nameA = this.getDisplayName(a);
      const nameB = this.getDisplayName(b);
      const rankA = rank.get(nameA.toLowerCase());
      const rankB = rank.get(nameB.toLowerCase());

      if (rankA !== undefined && rankB !== undefined) {
        return rankA - rankB;
      }
      if (rankA !== undefined) {
        return -1;
      }
      if (rankB !== undefined) {
        return 1;
      }

      return nameA.localeCompare(nameB, 'fr');
    });
  });

  readonly paginated = computed(() => paginate(this.filtered(), this.page(), this.pageSize));

  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.pageSize)));
  readonly pages = computed(() => Array.from({ length: this.totalPages() }, (_, index) => index + 1));

  readonly rows = computed<ClientView[]>(() => {
    const basePalette: ClientView['avatarTone'][] = ['teal', 'blue', 'emerald', 'orange', 'pink', 'cyan'];

    return this.paginated().items.map((client, index) => {
      const name = this.getDisplayName(client);
      return {
        id: client.id,
        initial: name[0]?.toUpperCase() ?? 'C',
        avatarTone: basePalette[(client.id + index) % basePalette.length],
        nomAffiche: name,
        contact: client.email || '-',
        telephone: client.telephone,
        ville: client.ville,
        statut: client.statut,
        solde: this.resolveClientBalance(client)
      };
    });
  });
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
      this.ensureDemoClients();
      this.clients.set(this.db.getCollection('clients'));
    } catch {
      this.errorMessage.set('Impossible de charger les clients.');
    } finally {
      this.loading.set(false);
    }
  }

  onSearch(value: string): void {
    this.search.set(value);
    this.page.set(1);
  }

  onStatusFilter(value: string): void {
    this.statusFilter.set((value as 'tous' | Client['statut']) ?? 'tous');
    this.page.set(1);
  }

  onTypeFilter(value: string): void {
    this.typeFilter.set((value as 'tous' | Client['type_client']) ?? 'tous');
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
    this.typeFilter.set('tous');
    this.cityFilter.set('toutes');
    this.page.set(1);
  }

  openCreateModal(): void {
    this.editingId.set(null);
    this.form.reset({
      code_client: `CLI-${String(Date.now()).slice(-4)}`,
      type_client: 'particulier',
      nom: '',
      prenom: '',
      raison_sociale: '',
      telephone: '',
      email: '',
      adresse: '',
      ville: 'Dakar',
      region: 'Dakar',
      ninea: '',
      plafond_credit: 0,
      statut: 'actif'
    });
    this.isModalOpen.set(true);
  }

  openEditModal(client: Client): void {
    this.editingId.set(client.id);
    this.form.reset({ ...client });
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

    if (values.type_client === 'particulier') {
      values.raison_sociale = '';
    } else {
      values.nom = '';
      values.prenom = '';
    }

    if (this.editingId()) {
      this.db.update('clients', this.editingId() as number, values);
    } else {
      this.db.create('clients', values);
    }

    this.closeModal();
    this.loadData();
  }

  view(clientView: ClientView): void {
    const source = this.clients().find((item) => item.id === clientView.id);
    if (!source) {
      return;
    }

    const details = [
      `Client: ${this.getDisplayName(source)}`,
      `Code: ${source.code_client}`,
      `Type: ${source.type_client}`,
      `Email: ${source.email || '-'}`,
      `Téléphone: ${source.telephone}`,
      `Adresse: ${source.adresse}, ${source.ville}`,
      `NINEA: ${source.ninea || '-'}`
    ].join('\n');

    this.openDetailsModal('Details', details);
  }

  removeByView(clientView: ClientView): void {
    const source = this.clients().find((item) => item.id === clientView.id);
    if (!source) {
      return;
    }

    const label = this.getDisplayName(source);
    if (!window.confirm(`Supprimer le client ${label} ?`)) {
      return;
    }

    this.db.delete('clients', source.id);
    this.loadData();
  }

  remove(client: Client): void {
    const label = this.getDisplayName(client);
    if (!window.confirm(`Supprimer le client ${label} ?`)) {
      return;
    }

    this.db.delete('clients', client.id);
    this.loadData();
  }

  exportClients(): void {
    const header = 'code_client,type_client,nom_affiche,email,telephone,ville,region,statut';
    const lines = this.filtered().map((client) =>
      [
        client.code_client,
        client.type_client,
        this.getDisplayName(client),
        client.email,
        client.telephone,
        client.ville,
        client.region,
        client.statut
      ]
        .map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`)
        .join(',')
    );

    const csv = [header, ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `senbusiness-clients-${new Date().toISOString().slice(0, 10)}.csv`;
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

  hasFiltersApplied(): boolean {
    return (
      !!this.search().trim() ||
      this.statusFilter() !== 'tous' ||
      this.typeFilter() !== 'tous' ||
      this.cityFilter() !== 'toutes'
    );
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

  displayClientById(id: number): Client | null {
    return this.clients().find((item) => item.id === id) ?? null;
  }

  formatBalance(value: number): string {
    const formatter = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
    if (value > 0) {
      return `+${formatter.format(value)} XOF`;
    }

    if (value < 0) {
      return `-${formatter.format(Math.abs(value))} XOF`;
    }

    return '0 XOF';
  }

  balanceClass(value: number): 'positive' | 'negative' | 'neutral' {
    if (value > 0) {
      return 'positive';
    }
    if (value < 0) {
      return 'negative';
    }
    return 'neutral';
  }
  private resolveClientBalance(client: Client): number {
    const fallbackValues = [450000, -1200000, 0, 780000, 95000, 320000, -250000, 140000];
    const fallback = fallbackValues[(client.id - 1) % fallbackValues.length];

    const factures = this.db.getCollection('factures').filter((item) => item.client_id === client.id);
    const paiementsValides = this.db
      .getCollection('paiements')
      .filter((item) => item.statut === 'valide' && factures.some((facture) => facture.id === item.facture_id));

    if (!factures.length) {
      return fallback;
    }

    const totalFacture = factures.reduce((sum, facture) => sum + facture.total_ttc, 0);
    const totalPaye = paiementsValides.reduce((sum, paiement) => sum + paiement.montant, 0);
    const solde = Math.round((totalFacture - totalPaye) * 100) / 100;

    return solde === 0 ? fallback : solde;
  }
  private getDisplayName(client: Client): string {
    if (client.type_client === 'entreprise') {
      return client.raison_sociale;
    }

    return `${client.prenom} ${client.nom}`.trim();
  }
  private ensureDemoClients(): void {
    const existing = this.db.getCollection('clients');
    const existingByName = new Set(existing.map((client) => client.raison_sociale.toLowerCase()).filter(Boolean));

    const demoClients: Array<Omit<Client, 'id'>> = [
      {
        code_client: 'CLI-1001',
        type_client: 'entreprise',
        nom: '',
        prenom: '',
        raison_sociale: 'Diallo & Freres SARL',
        telephone: '+221 77 123 45 67',
        email: 'mamadou.diallo@diallofreres.sn',
        adresse: 'Avenue Bourguiba',
        ville: 'Dakar',
        region: 'Dakar',
        ninea: 'SN-DKR-2024-B-45001',
        plafond_credit: 1200000,
        statut: 'actif'
      },
      {
        code_client: 'CLI-1002',
        type_client: 'entreprise',
        nom: '',
        prenom: '',
        raison_sociale: 'Groupe Ndiaye Commerce',
        telephone: '+221 76 234 56 78',
        email: 'a.ndiaye@groupendiaye.sn',
        adresse: 'Rue Tolbiac',
        ville: 'Thies',
        region: 'Thies',
        ninea: 'SN-THS-2024-B-12008',
        plafond_credit: 1800000,
        statut: 'actif'
      },
      {
        code_client: 'CLI-1003',
        type_client: 'entreprise',
        nom: '',
        prenom: '',
        raison_sociale: 'Sow Electronique',
        telephone: '+221 70 345 67 89',
        email: 'ibrahim@sowelectro.sn',
        adresse: 'Rond-point Nord',
        ville: 'Saint-Louis',
        region: 'Saint-Louis',
        ninea: 'SN-STL-2024-C-88210',
        plafond_credit: 900000,
        statut: 'actif'
      },
      {
        code_client: 'CLI-1004',
        type_client: 'entreprise',
        nom: '',
        prenom: '',
        raison_sociale: 'Mbaye Distribution',
        telephone: '+221 78 456 78 90',
        email: 'o.mbaye@mbayedist.sn',
        adresse: 'Quartier Boucotte',
        ville: 'Ziguinchor',
        region: 'Ziguinchor',
        ninea: 'SN-ZIG-2024-B-62012',
        plafond_credit: 1400000,
        statut: 'inactif'
      },
      {
        code_client: 'CLI-1005',
        type_client: 'entreprise',
        nom: '',
        prenom: '',
        raison_sociale: 'Fatou Textiles',
        telephone: '+221 77 567 89 01',
        email: 'fatou.ba@fatoutextiles.sn',
        adresse: 'Route nationale 1',
        ville: 'Kaolack',
        region: 'Kaolack',
        ninea: 'SN-KLK-2024-A-90111',
        plafond_credit: 760000,
        statut: 'actif'
      },
      {
        code_client: 'CLI-1006',
        type_client: 'entreprise',
        nom: '',
        prenom: '',
        raison_sociale: 'Konate Agro-Alimentaire',
        telephone: '+221 76 678 90 12',
        email: 's.konate@konateagro.sn',
        adresse: 'VDN 3',
        ville: 'Dakar',
        region: 'Dakar',
        ninea: 'SN-DKR-2024-A-33322',
        plafond_credit: 1600000,
        statut: 'actif'
      },
      {
        code_client: 'CLI-1007',
        type_client: 'entreprise',
        nom: '',
        prenom: '',
        raison_sociale: 'Traore & Associes',
        telephone: '+221 77 998 80 10',
        email: 'traore@traoreassocies.sn',
        adresse: 'Zone de captage',
        ville: 'Dakar',
        region: 'Dakar',
        ninea: 'SN-DKR-2023-C-21099',
        plafond_credit: 1100000,
        statut: 'actif'
      },
      {
        code_client: 'CLI-1008',
        type_client: 'entreprise',
        nom: '',
        prenom: '',
        raison_sociale: 'Sarr Import-Export',
        telephone: '+221 78 440 77 54',
        email: 'contact@sarrimport.sn',
        adresse: 'Port autonome',
        ville: 'Dakar',
        region: 'Dakar',
        ninea: 'SN-DKR-2022-B-00911',
        plafond_credit: 1350000,
        statut: 'actif'
      }
    ];

    for (const client of demoClients) {
      if (!existingByName.has(client.raison_sociale.toLowerCase())) {
        this.db.create('clients', client);
      }
    }
  }
}



