import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { FeatureKey } from '../../core/constants/permissions';
import { Client, Facture, Paiement } from '../../core/models/entities';
import { AuthService } from '../../core/services/auth.service';
import { MockDbService } from '../../core/services/mock-db.service';
import { FormModalComponent } from '../../shared/components/form-modal/form-modal.component';
import { paginate } from '../../shared/utils/list-helpers';

type UiPaymentMode = 'virement' | 'especes' | 'cheque' | 'mobile_money' | 'carte_bancaire' | 'autre';

interface PaiementView {
  id: number;
  date_paiement: string;
  numero_facture: string;
  client_nom: string;
  montant: number;
  mode_paiement: string;
  reference_paiement: string;
  statut: Paiement['statut'];
}

@Component({
  selector: 'app-paiements-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, CurrencyPipe, DatePipe, FormModalComponent],
  templateUrl: './paiements.page.html',
  styleUrl: './paiements.page.scss'
})
export class PaiementsPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly db = inject(MockDbService);
  private readonly auth = inject(AuthService);
  private readonly featureKey: FeatureKey = 'paiements';

  readonly loading = signal(false);
  readonly errorMessage = signal('');
  readonly actionMessage = signal('');

  readonly search = signal('');
  readonly modeFilter = signal<'tous' | string>('tous');
  readonly statusFilter = signal<'tous' | Paiement['statut']>('tous');
  readonly showFilters = signal(false);

  readonly page = signal(1);
  readonly pageSize = 8;

  readonly clients = signal<Client[]>([]);
  readonly factures = signal<Facture[]>([]);
  readonly paiements = signal<Paiement[]>([]);

  readonly isModalOpen = signal(false);
  readonly isDetailsModalOpen = signal(false);
  readonly detailsTitle = signal('Details');
  readonly detailsLines = signal<string[]>([]);
  readonly form = this.fb.group({
    facture_id: [0, [Validators.required, Validators.min(1)]],
    date_paiement: [new Date().toISOString().slice(0, 10), Validators.required],
    montant: [0, [Validators.required, Validators.min(1)]],
    mode_paiement: ['virement', Validators.required],
    reference_paiement: ['', [Validators.required]],
    statut: ['valide', Validators.required]
  });

  readonly canView = computed(() => this.auth.can(this.featureKey, 'can_view'));
  readonly canCreate = computed(() => this.auth.can(this.featureKey, 'can_create'));
  readonly canDelete = computed(() => this.auth.can(this.featureKey, 'can_delete'));

  readonly clientsMap = computed(() => new Map(this.clients().map((item) => [item.id, item])));
  readonly facturesMap = computed(() => new Map(this.factures().map((item) => [item.id, item])));

  readonly stats = computed(() => {
    const rows = this.paiements();
    const total = rows.length;
    const montantTotal = rows.reduce((sum, item) => sum + item.montant, 0);
    const especes = rows.filter((item) => this.toUiMode(item.mode_paiement) === 'especes').length;
    const cheques = rows.filter((item) => this.toUiMode(item.mode_paiement) === 'cheque').length;
    const virements = rows.filter((item) => this.toUiMode(item.mode_paiement) === 'virement').length;
    const mobileMoney = rows.filter((item) => this.toUiMode(item.mode_paiement) === 'mobile_money').length;
    const cartes = rows.filter((item) => this.toUiMode(item.mode_paiement) === 'carte_bancaire').length;

    return {
      total,
      montantTotal,
      especes,
      cheques,
      virements,
      mobileMoney,
      cartes
    };
  });

  readonly filtered = computed(() => {
    const query = this.search().trim().toLowerCase();

    const filtered = this.paiements().filter((item) => {
      const facture = this.facturesMap().get(item.facture_id);
      const client = facture ? this.clientsMap().get(facture.client_id) : null;
      const clientName = this.clientLabel(client ?? null);

      const matchesSearch =
        !query ||
        `${item.reference_paiement} ${item.mode_paiement} ${facture?.numero_facture ?? ''} ${clientName}`
          .toLowerCase()
          .includes(query);

      const matchesMode = this.modeFilter() === 'tous' || this.toUiMode(item.mode_paiement) === this.modeFilter();
      const matchesStatus = this.statusFilter() === 'tous' || item.statut === this.statusFilter();

      return matchesSearch && matchesMode && matchesStatus;
    });

    return filtered.sort((a, b) => {
      const dateDiff = b.date_paiement.localeCompare(a.date_paiement);
      if (dateDiff !== 0) {
        return dateDiff;
      }
      return b.id - a.id;
    });
  });

  readonly paginated = computed(() => paginate(this.filtered(), this.page(), this.pageSize));

  readonly rows = computed<PaiementView[]>(() =>
    this.paginated().items.map((item) => {
      const facture = this.facturesMap().get(item.facture_id) ?? null;
      const client = facture ? this.clientsMap().get(facture.client_id) ?? null : null;

      return {
        id: item.id,
        date_paiement: item.date_paiement,
        numero_facture: facture?.numero_facture ?? '-',
        client_nom: this.clientLabel(client),
        montant: item.montant,
        mode_paiement: item.mode_paiement,
        reference_paiement: item.reference_paiement,
        statut: item.statut
      };
    })
  );

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
      this.ensureDemoClients();
      this.ensureDemoFactures();
      this.ensureDemoPaiements();

      this.clients.set(this.db.getCollection('clients'));
      this.factures.set(this.db.getCollection('factures'));
      this.paiements.set(this.db.getCollection('paiements'));
    } catch {
      this.errorMessage.set('Impossible de charger les paiements.');
    } finally {
      this.loading.set(false);
    }
  }

  clientLabel(client: Client | null): string {
    if (!client) {
      return 'Client inconnu';
    }

    return client.type_client === 'entreprise' ? client.raison_sociale : `${client.prenom} ${client.nom}`.trim();
  }

  onSearch(value: string): void {
    this.search.set(value);
    this.page.set(1);
  }

  onModeFilter(value: string): void {
    this.modeFilter.set((value as 'tous' | string) ?? 'tous');
    this.page.set(1);
  }

  onStatusFilter(value: string): void {
    this.statusFilter.set((value as 'tous' | Paiement['statut']) ?? 'tous');
    this.page.set(1);
  }

  toggleFilters(): void {
    this.showFilters.update((state) => !state);
  }

  resetFilters(): void {
    this.search.set('');
    this.modeFilter.set('tous');
    this.statusFilter.set('tous');
    this.page.set(1);
  }

  openCreateModal(): void {
    this.actionMessage.set('');
    const defaultFacture = this.factures().find((item) => item.reste_a_payer > 0)?.id ?? this.factures()[0]?.id ?? 0;

    this.form.reset({
      facture_id: defaultFacture,
      date_paiement: new Date().toISOString().slice(0, 10),
      montant: 0,
      mode_paiement: 'virement',
      reference_paiement: `PAY-${String(Date.now()).slice(-6)}`,
      statut: 'valide'
    });

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

    try {
      this.db.addPaiement(values);
      this.closeModal();
      this.loadData();
      this.actionMessage.set('Paiement enregistré avec succès.');
    } catch (error) {
      this.actionMessage.set(error instanceof Error ? error.message : 'Operation impossible');
    }
  }

  viewById(id: number): void {
    const item = this.paiements().find((entry) => entry.id === id);
    if (!item) {
      return;
    }

    const facture = this.facturesMap().get(item.facture_id) ?? null;
    const client = facture ? this.clientsMap().get(facture.client_id) ?? null : null;

    const details = [
      `Paiement: ${item.reference_paiement}`,
      `Facture: ${facture?.numero_facture ?? '-'}`,
      `Client: ${this.clientLabel(client)}`,
      `Date: ${item.date_paiement}`,
      `Montant: ${item.montant.toLocaleString('fr-FR')} XOF`,
      `Mode: ${this.modeLabel(item.mode_paiement)}`,
      `Statut: ${this.statusLabel(item.statut)}`
    ].join('\n');

    this.openDetailsModal('Details', details);
  }

  removeById(id: number): void {
    const item = this.paiements().find((entry) => entry.id === id);
    if (!item) {
      return;
    }

    if (!window.confirm(`Supprimer le paiement ${item.reference_paiement} ?`)) {
      return;
    }

    this.db.deletePaiement(item.id);
    this.actionMessage.set('Paiement supprimé avec succès.');
    this.loadData();
  }

  exportPaiements(): void {
    const header = 'date_paiement,facture,client,montant,mode_paiement,reference,statut';
    const lines = this.filtered().map((item) => {
      const facture = this.facturesMap().get(item.facture_id) ?? null;
      const client = facture ? this.clientsMap().get(facture.client_id) ?? null : null;

      return [
        item.date_paiement,
        facture?.numero_facture ?? '-',
        this.clientLabel(client),
        item.montant,
        item.mode_paiement,
        item.reference_paiement,
        item.statut
      ]
        .map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`)
        .join(',');
    });

    const csv = [header, ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `senbusiness-paiements-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  modeLabel(mode: string): string {
    switch (this.toUiMode(mode)) {
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
        return mode;
    }
  }

  modeTone(mode: string): 'virement' | 'especes' | 'cheque' | 'mobile_money' | 'carte_bancaire' | 'autre' {
    return this.toUiMode(mode);
  }

  modeIcon(mode: string): string {
    switch (this.toUiMode(mode)) {
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

  statusLabel(status: Paiement['statut']): string {
    switch (status) {
      case 'valide':
        return 'Valide';
      case 'en_attente':
        return 'En attente';
      default:
        return 'Annulé';
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
  private toUiMode(mode: string): UiPaymentMode {
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
  private ensureDemoFactures(): void {
    const clients = this.db.getCollection('clients');
    const clientByName = new Map(
      clients
        .filter((client) => client.type_client === 'entreprise')
        .map((client) => [client.raison_sociale.toLowerCase(), client.id])
    );

    const existing = this.db.getCollection('factures');
    const existingByNumero = new Set(existing.map((item) => item.numero_facture.toLowerCase()));

    const demoFactures: Array<{
      numero_facture: string;
      client_nom: string;
      date_facture: string;
      date_echeance: string;
      montant: number;
      statut: Facture['statut'];
      mode_paiement: string;
    }> = [
      {
        numero_facture: 'FAC-2024-089',
        client_nom: 'Diallo & Freres SARL',
        date_facture: '2026-04-24',
        date_echeance: '2026-05-24',
        montant: 450000,
        statut: 'emise',
        mode_paiement: 'virement'
      },
      {
        numero_facture: 'FAC-2024-087',
        client_nom: 'Sow Electronique',
        date_facture: '2026-04-23',
        date_echeance: '2026-05-23',
        montant: 320000,
        statut: 'emise',
        mode_paiement: 'especes'
      },
      {
        numero_facture: 'FAC-2024-084',
        client_nom: 'Konate Agro-Alimentaire',
        date_facture: '2026-04-22',
        date_echeance: '2026-05-22',
        montant: 2100000,
        statut: 'emise',
        mode_paiement: 'cheque'
      },
      {
        numero_facture: 'FAC-2024-082',
        client_nom: 'Sarr Import-Export',
        date_facture: '2026-04-21',
        date_echeance: '2026-05-21',
        montant: 670000,
        statut: 'emise',
        mode_paiement: 'mobile_money'
      },
      {
        numero_facture: 'FAC-2024-080',
        client_nom: 'Groupe Ndiaye Commerce',
        date_facture: '2026-04-20',
        date_echeance: '2026-05-20',
        montant: 320000,
        statut: 'emise',
        mode_paiement: 'carte_bancaire'
      },
      {
        numero_facture: 'FAC-2024-076',
        client_nom: 'Diallo & Freres SARL',
        date_facture: '2026-04-19',
        date_echeance: '2026-05-19',
        montant: 1250000,
        statut: 'emise',
        mode_paiement: 'virement'
      },
      {
        numero_facture: 'FAC-2024-074',
        client_nom: 'Mbaye Distribution',
        date_facture: '2026-04-18',
        date_echeance: '2026-05-18',
        montant: 780000,
        statut: 'emise',
        mode_paiement: 'especes'
      },
      {
        numero_facture: 'FAC-2024-072',
        client_nom: 'Fatou Textiles',
        date_facture: '2026-04-17',
        date_echeance: '2026-05-17',
        montant: 95000,
        statut: 'emise',
        mode_paiement: 'mobile_money'
      }
    ];

    for (const item of demoFactures) {
      if (existingByNumero.has(item.numero_facture.toLowerCase())) {
        continue;
      }

      const clientId = clientByName.get(item.client_nom.toLowerCase());
      if (!clientId) {
        continue;
      }

      this.db.create('factures', {
        client_id: clientId,
        devis_id: null,
        numero_facture: item.numero_facture,
        date_facture: item.date_facture,
        date_echeance: item.date_echeance,
        statut: item.statut,
        total_ht: item.montant,
        total_tva: 0,
        total_ttc: item.montant,
        montant_paye: 0,
        reste_a_payer: item.montant,
        mode_paiement: item.mode_paiement
      });
    }
  }
  private ensureDemoPaiements(): void {
    const factures = this.db.getCollection('factures');
    const factureByNumero = new Map(factures.map((item) => [item.numero_facture.toLowerCase(), item.id]));

    const existing = this.db.getCollection('paiements');
    const existingByRef = new Set(existing.map((item) => item.reference_paiement.toLowerCase()));

    const demoPaiements: Array<Omit<Paiement, 'id' | 'facture_id'> & { numero_facture: string }> = [
      {
        numero_facture: 'FAC-2024-089',
        date_paiement: '2026-04-24',
        montant: 450000,
        mode_paiement: 'virement',
        reference_paiement: 'VIR-2026-089',
        statut: 'valide'
      },
      {
        numero_facture: 'FAC-2024-087',
        date_paiement: '2026-04-23',
        montant: 320000,
        mode_paiement: 'especes',
        reference_paiement: 'ESP-2026-087',
        statut: 'valide'
      },
      {
        numero_facture: 'FAC-2024-084',
        date_paiement: '2026-04-22',
        montant: 2100000,
        mode_paiement: 'cheque',
        reference_paiement: 'CHQ-2026-084',
        statut: 'valide'
      },
      {
        numero_facture: 'FAC-2024-082',
        date_paiement: '2026-04-21',
        montant: 670000,
        mode_paiement: 'mobile_money',
        reference_paiement: 'MM-2026-082',
        statut: 'valide'
      },
      {
        numero_facture: 'FAC-2024-080',
        date_paiement: '2026-04-20',
        montant: 320000,
        mode_paiement: 'carte_bancaire',
        reference_paiement: 'CB-2026-080',
        statut: 'valide'
      },
      {
        numero_facture: 'FAC-2024-076',
        date_paiement: '2026-04-19',
        montant: 1250000,
        mode_paiement: 'virement',
        reference_paiement: 'VIR-2026-076',
        statut: 'valide'
      },
      {
        numero_facture: 'FAC-2024-074',
        date_paiement: '2026-04-18',
        montant: 780000,
        mode_paiement: 'especes',
        reference_paiement: 'ESP-2026-074',
        statut: 'valide'
      },
      {
        numero_facture: 'FAC-2024-072',
        date_paiement: '2026-04-17',
        montant: 95000,
        mode_paiement: 'mobile_money',
        reference_paiement: 'MM-2026-072',
        statut: 'valide'
      }
    ];

    for (const item of demoPaiements) {
      if (existingByRef.has(item.reference_paiement.toLowerCase())) {
        continue;
      }

      const factureId = factureByNumero.get(item.numero_facture.toLowerCase());
      if (!factureId) {
        continue;
      }

      this.db.create('paiements', {
        facture_id: factureId,
        date_paiement: item.date_paiement,
        montant: item.montant,
        mode_paiement: item.mode_paiement,
        reference_paiement: item.reference_paiement,
        statut: item.statut
      });
    }
  }
}


