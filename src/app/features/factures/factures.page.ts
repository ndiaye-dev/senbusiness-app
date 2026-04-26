import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { FeatureKey } from '../../core/constants/permissions';
import { Client, Devis, Facture, Produit } from '../../core/models/entities';
import { AuthService } from '../../core/services/auth.service';
import { MockDbService } from '../../core/services/mock-db.service';
import { FormModalComponent } from '../../shared/components/form-modal/form-modal.component';
import { paginate } from '../../shared/utils/list-helpers';

interface FactureLineFormValue {
  produit_id: number;
  quantite: number;
  prix_unitaire: number;
  remise_ligne: number;
  tva_pourcentage: number;
}

type UiFactureStatus = 'payee' | 'impayee' | 'en_attente' | 'annulee' | 'brouillon';

interface FactureView {
  id: number;
  numero_facture: string;
  client_nom: string;
  date_facture: string;
  date_echeance: string;
  montant: number;
  reste_a_payer: number;
  mode_paiement: string;
  statut: Facture['statut'];
  ui_status: UiFactureStatus;
}

@Component({
  selector: 'app-factures-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, CurrencyPipe, DatePipe, FormModalComponent],
  templateUrl: './factures.page.html',
  styleUrl: './factures.page.scss'
})
export class FacturesPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly db = inject(MockDbService);
  private readonly auth = inject(AuthService);
  private readonly featureKey: FeatureKey = 'factures';

  readonly loading = signal(false);
  readonly errorMessage = signal('');
  readonly actionMessage = signal('');
  readonly search = signal('');
  readonly statusFilter = signal<'tous' | UiFactureStatus>('tous');
  readonly modeFilter = signal<'tous' | 'virement' | 'especes' | 'mobile_money' | 'cheque'>('tous');
  readonly showFilters = signal(false);

  readonly page = signal(1);
  readonly pageSize = 8;

  readonly isDetailsModalOpen = signal(false);
  readonly detailsTitle = signal('Details');
  readonly detailsLines = signal<string[]>([]);

  readonly clients = signal<Client[]>([]);
  readonly produits = signal<Produit[]>([]);
  readonly devis = signal<Devis[]>([]);
  readonly factures = signal<Facture[]>([]);

  readonly isModalOpen = signal(false);  readonly editingId = signal<number | null>(null);

  readonly form = this.fb.group({
    client_id: [0, [Validators.required, Validators.min(1)]],
    devis_id: [0],
    numero_facture: ['', [Validators.required]],
    date_facture: [new Date().toISOString().slice(0, 10), Validators.required],
    date_echeance: [new Date(Date.now() + 15 * 24 * 3600000).toISOString().slice(0, 10), Validators.required],
    statut: ['emise', Validators.required],
    mode_paiement: ['virement', Validators.required],
    lignes: this.fb.array([])
  });

  readonly canView = computed(() => this.auth.can(this.featureKey, 'can_view'));
  readonly canCreate = computed(() => this.auth.can(this.featureKey, 'can_create'));
  readonly canEdit = computed(() => this.auth.can(this.featureKey, 'can_edit'));
  readonly canDelete = computed(() => this.auth.can(this.featureKey, 'can_delete'));

  readonly clientsMap = computed(() => new Map(this.clients().map((item) => [item.id, item])));

  readonly stats = computed(() => {
    const rows = this.factures();
    const total = rows.length;
    const payees = rows.filter((item) => this.uiStatusFromFacture(item) === 'payee').length;
    const impayees = rows.filter((item) => ['impayee', 'en_attente'].includes(this.uiStatusFromFacture(item))).length;
    const annulees = rows.filter((item) => this.uiStatusFromFacture(item) === 'annulee').length;
    const montantImpayee = rows
      .filter((item) => this.uiStatusFromFacture(item) !== 'annulee')
      .reduce((sum, item) => sum + item.reste_a_payer, 0);

    return {
      total,
      payees,
      impayees,
      annulees,
      montantImpayee
    };
  });

  readonly filtered = computed(() => {
    const query = this.search().trim().toLowerCase();

    const filtered = this.factures().filter((item) => {
      const client = this.clientsMap().get(item.client_id);
      const clientName = client ? this.clientLabel(client) : '';
      const uiStatus = this.uiStatusFromFacture(item);

      const matchesSearch =
        !query ||
        `${item.numero_facture} ${clientName} ${item.mode_paiement} ${this.statusLabel(uiStatus)}`.toLowerCase().includes(query);

      const matchesStatus = this.statusFilter() === 'tous' || uiStatus === this.statusFilter();
      const matchesMode = this.modeFilter() === 'tous' || item.mode_paiement === this.modeFilter();

      return matchesSearch && matchesStatus && matchesMode;
    });

    const orderByNumero = (numero: string): number => {
      const lastPart = numero.split('-').pop() ?? '0';
      const parsed = Number(lastPart);
      return Number.isFinite(parsed) ? parsed : 0;
    };

    return filtered.sort((a, b) => {
      const diff = orderByNumero(b.numero_facture) - orderByNumero(a.numero_facture);
      if (diff !== 0) {
        return diff;
      }
      return b.date_facture.localeCompare(a.date_facture);
    });
  });

  readonly paginated = computed(() => paginate(this.filtered(), this.page(), this.pageSize));
  private readonly xofFormatter = new Intl.NumberFormat('fr-FR');

  readonly rows = computed<FactureView[]>(() =>
    this.paginated().items.map((item) => {
      const uiStatus = this.uiStatusFromFacture(item);
      return {
        id: item.id,
        numero_facture: item.numero_facture,
        client_nom: this.clientLabel(this.clientsMap().get(item.client_id) ?? null),
        date_facture: item.date_facture,
        date_echeance: item.date_echeance,
        montant: item.total_ttc,
        reste_a_payer: item.reste_a_payer,
        mode_paiement: item.mode_paiement,
        statut: item.statut,
        ui_status: uiStatus
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

  get linesFormArray(): FormArray {
    return this.form.controls.lignes as FormArray;
  }

  loadData(): void {
    this.loading.set(true);
    this.errorMessage.set('');

    try {
      this.ensureDemoClients();
      this.ensureDemoFactures();
      this.clients.set(this.db.getCollection('clients'));
      this.produits.set(this.db.getCollection('produits'));
      this.devis.set(this.db.getCollection('devis'));
      this.factures.set(this.db.getCollection('factures'));
    } catch {
      this.errorMessage.set('Impossible de charger les factures.');
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

  statusLabel(status: UiFactureStatus): string {
    switch (status) {
      case 'payee':
        return 'Payée';
      case 'impayee':
        return 'Impaye';
      case 'en_attente':
        return 'En attente';
      case 'annulee':
        return 'Annulée';
      default:
        return 'Brouillon';
    }
  }

  statusTone(status: UiFactureStatus): 'success' | 'danger' | 'warning' | 'neutral' | 'draft' {
    switch (status) {
      case 'payee':
        return 'success';
      case 'impayee':
        return 'danger';
      case 'en_attente':
        return 'warning';
      case 'annulee':
        return 'neutral';
      default:
        return 'draft';
    }
  }

  lineGroup(value?: Partial<FactureLineFormValue>) {
    return this.fb.group({
      produit_id: [value?.produit_id ?? this.produits()[0]?.id ?? 0, [Validators.required, Validators.min(1)]],
      quantite: [value?.quantite ?? 1, [Validators.required, Validators.min(1)]],
      prix_unitaire: [value?.prix_unitaire ?? 0, [Validators.required, Validators.min(0)]],
      remise_ligne: [value?.remise_ligne ?? 0, [Validators.required, Validators.min(0), Validators.max(100)]],
      tva_pourcentage: [value?.tva_pourcentage ?? 18, [Validators.required, Validators.min(0)]]
    });
  }

  addLine(value?: Partial<FactureLineFormValue>): void {
    this.linesFormArray.push(this.lineGroup(value));
  }

  removeLine(index: number): void {
    if (this.linesFormArray.length === 1) {
      return;
    }

    this.linesFormArray.removeAt(index);
  }

  onProductChange(index: number): void {
    const group = this.linesFormArray.at(index);
    const produitId = Number(group.get('produit_id')?.value);
    const produit = this.produits().find((item) => item.id === produitId);
    if (!produit) {
      return;
    }

    group.patchValue({
      prix_unitaire: produit.prix_vente,
      tva_pourcentage: produit.tva_pourcentage
    });
  }

  loadLinesFromDevis(): void {
    const devisId = Number(this.form.controls.devis_id.value || 0);
    if (!devisId) {
      return;
    }

    const devis = this.devis().find((item) => item.id === devisId);
    if (!devis) {
      return;
    }

    this.form.patchValue({ client_id: devis.client_id });
    const lines = this.db.getDevisLignes(devisId);
    this.linesFormArray.clear();
    for (const line of lines) {
      this.addLine({
        produit_id: line.produit_id,
        quantite: line.quantite,
        prix_unitaire: line.prix_unitaire,
        remise_ligne: line.remise_ligne,
        tva_pourcentage: line.tva_pourcentage
      });
    }

    if (!lines.length) {
      this.addLine();
    }
  }

  onSearch(value: string): void {
    this.search.set(value);
    this.page.set(1);
  }

  onStatusFilter(value: string): void {
    this.statusFilter.set((value as 'tous' | UiFactureStatus) ?? 'tous');
    this.page.set(1);
  }

  onModeFilter(value: string): void {
    this.modeFilter.set((value as 'tous' | 'virement' | 'especes' | 'mobile_money' | 'cheque') ?? 'tous');
    this.page.set(1);
  }

  toggleFilters(): void {
    this.showFilters.update((state) => !state);
  }

  resetFilters(): void {
    this.search.set('');
    this.statusFilter.set('tous');
    this.modeFilter.set('tous');
    this.page.set(1);
  }

  openCreateModal(): void {
    this.actionMessage.set('');
    this.editingId.set(null);
    this.form.reset({
      client_id: this.clients()[0]?.id ?? 0,
      devis_id: 0,
      numero_facture: `FAC-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`,
      date_facture: new Date().toISOString().slice(0, 10),
      date_echeance: new Date(Date.now() + 15 * 24 * 3600000).toISOString().slice(0, 10),
      statut: 'emise',
      mode_paiement: 'virement',
      lignes: []
    });
    this.linesFormArray.clear();
    this.addLine();
    this.isModalOpen.set(true);
  }

  openEditModal(item: Facture): void {
    this.actionMessage.set('');
    this.editingId.set(item.id);

    this.form.reset({
      client_id: item.client_id,
      devis_id: item.devis_id ?? 0,
      numero_facture: item.numero_facture,
      date_facture: item.date_facture,
      date_echeance: item.date_echeance,
      statut: item.statut,
      mode_paiement: item.mode_paiement,
      lignes: []
    });

    this.linesFormArray.clear();
    const lines = this.db.getFactureLignes(item.id);
    for (const line of lines) {
      this.addLine({
        produit_id: line.produit_id,
        quantite: line.quantite,
        prix_unitaire: line.prix_unitaire,
        remise_ligne: line.remise_ligne,
        tva_pourcentage: line.tva_pourcentage
      });
    }

    if (!lines.length) {
      this.addLine();
    }

    this.isModalOpen.set(true);
  }

  closeModal(): void {
    this.isModalOpen.set(false);
  }

  totals(): { ht: number; tva: number; ttc: number } {
    const lines = this.linesFormArray.controls.map((control) => ({
      quantite: Number(control.get('quantite')?.value) || 0,
      prix_unitaire: Number(control.get('prix_unitaire')?.value) || 0,
      remise_ligne: Number(control.get('remise_ligne')?.value) || 0,
      tva_pourcentage: Number(control.get('tva_pourcentage')?.value) || 0
    }));

    const ht = lines.reduce((sum, line) => sum + line.quantite * line.prix_unitaire * (1 - line.remise_ligne / 100), 0);
    const tva = lines.reduce(
      (sum, line) => sum + line.quantite * line.prix_unitaire * (1 - line.remise_ligne / 100) * (line.tva_pourcentage / 100),
      0
    );

    return {
      ht,
      tva,
      ttc: ht + tva
    };
  }

  save(): void {
    if (this.form.invalid || this.linesFormArray.invalid || !this.linesFormArray.length) {
      this.form.markAllAsTouched();
      this.linesFormArray.markAllAsTouched();
      return;
    }

    const values = this.form.getRawValue();
    const payload = {
      client_id: Number(values.client_id),
      devis_id: Number(values.devis_id) || null,
      numero_facture: values.numero_facture,
      date_facture: values.date_facture,
      date_echeance: values.date_echeance,
      statut: values.statut,
      mode_paiement: values.mode_paiement
    };

    const lines = this.linesFormArray.controls.map((control) => ({
      produit_id: Number(control.get('produit_id')?.value),
      quantite: Number(control.get('quantite')?.value),
      prix_unitaire: Number(control.get('prix_unitaire')?.value),
      remise_ligne: Number(control.get('remise_ligne')?.value),
      tva_pourcentage: Number(control.get('tva_pourcentage')?.value)
    }));

    try {
      if (this.editingId()) {
        this.db.updateFacture(this.editingId() as number, payload, lines);
        this.actionMessage.set('Facture mise à jour avec succès.');
      } else {
        this.db.createFacture(payload, lines);
        this.actionMessage.set('Facture créée avec succès.');
      }

      this.closeModal();
      this.loadData();
    } catch (error) {
      this.actionMessage.set(error instanceof Error ? error.message : 'Enregistrement impossible');
    }
  }

  view(item: Facture): void {
    const clientName = this.clientLabel(this.clientsMap().get(item.client_id) ?? null);
    const details = [
      `Facture: ${item.numero_facture}`,
      `Client: ${clientName}`,
      `Date: ${item.date_facture}`,
      `Échéance: ${item.date_echeance}`,
      `Montant TTC: ${item.total_ttc.toLocaleString('fr-FR')} XOF`,
      `Reste a payer: ${item.reste_a_payer.toLocaleString('fr-FR')} XOF`,
      `Statut: ${this.statusLabel(this.uiStatusFromFacture(item))}`
    ].join('\n');

    this.openDetailsModal('Details', details);
  }

  download(item: Facture): void {
    const clientName = this.clientLabel(this.clientsMap().get(item.client_id) ?? null);
    const lines = this.db.getFactureLignes(item.id);
    const productsMap = new Map(this.produits().map((product) => [product.id, product]));

    const content = [
      `Facture ${item.numero_facture}`,
      `Client: ${clientName}`,
      `Date facture: ${item.date_facture}`,
      `Date echeance: ${item.date_echeance}`,
      '',
      'Lignes:',
      ...lines.map((line) => {
        const produitName = productsMap.get(line.produit_id)?.nom ?? `Produit ${line.produit_id}`;
        return `${produitName} | qte ${line.quantite} | PU ${line.prix_unitaire} | total ${line.sous_total}`;
      }),
      '',
      `Total HT: ${item.total_ht}`,
      `Total TVA: ${item.total_tva}`,
      `Total TTC: ${item.total_ttc}`,
      `Montant paye: ${item.montant_paye}`,
      `Reste a payer: ${item.reste_a_payer}`
    ].join('\n');

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${item.numero_facture}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }

  remove(item: Facture): void {
    if (!window.confirm(`Supprimer la facture ${item.numero_facture} ?`)) {
      return;
    }

    this.db.deleteFacture(item.id);
    this.actionMessage.set('Facture supprimée avec succès.');
    this.loadData();
  }

  exportFactures(): void {
    const header = 'numero_facture,client,date_facture,date_echeance,statut,total_ttc,montant_paye,reste_a_payer';
    const lines = this.filtered().map((item) => {
      const client = this.clientLabel(this.clientsMap().get(item.client_id) ?? null);
      return [
        item.numero_facture,
        client,
        item.date_facture,
        item.date_echeance,
        item.statut,
        item.total_ttc,
        item.montant_paye,
        item.reste_a_payer
      ]
        .map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`)
        .join(',');
    });

    const csv = [header, ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `senbusiness-factures-${new Date().toISOString().slice(0, 10)}.csv`;
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

  displayFactureById(id: number): Facture | null {
    return this.factures().find((item) => item.id === id) ?? null;
  }

  formatXof(value: number): string {
    const amount = this.xofFormatter.format(Math.round(value)).replace(/[\u00a0\u202f]/g, ' ');
    return `${amount} FCFA`;
  }
  private uiStatusFromFacture(item: Facture): UiFactureStatus {
    if (item.statut === 'annulee') {
      return 'annulee';
    }
    if (item.statut === 'payee') {
      return 'payee';
    }
    if (item.statut === 'partiellement_payee') {
      return 'en_attente';
    }
    if (item.statut === 'brouillon') {
      return 'brouillon';
    }
    return 'impayee';
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
      total_ttc: number;
      statut: Facture['statut'];
      montant_paye: number;
      mode_paiement: Facture['mode_paiement'];
    }> = [
      {
        numero_facture: 'FAC-2024-089',
        client_nom: 'Diallo & Freres SARL',
        date_facture: '2026-04-24',
        date_echeance: '2026-05-24',
        total_ttc: 450000,
        statut: 'payee',
        montant_paye: 450000,
        mode_paiement: 'virement'
      },
      {
        numero_facture: 'FAC-2024-088',
        client_nom: 'Groupe Ndiaye Commerce',
        date_facture: '2026-04-23',
        date_echeance: '2026-05-23',
        total_ttc: 1200000,
        statut: 'emise',
        montant_paye: 0,
        mode_paiement: 'virement'
      },
      {
        numero_facture: 'FAC-2024-087',
        client_nom: 'Sow Electronique',
        date_facture: '2026-04-22',
        date_echeance: '2026-05-22',
        total_ttc: 320000,
        statut: 'payee',
        montant_paye: 320000,
        mode_paiement: 'mobile_money'
      },
      {
        numero_facture: 'FAC-2024-086',
        client_nom: 'Mbaye Distribution',
        date_facture: '2026-04-21',
        date_echeance: '2026-05-21',
        total_ttc: 780000,
        statut: 'partiellement_payee',
        montant_paye: 200000,
        mode_paiement: 'especes'
      },
      {
        numero_facture: 'FAC-2024-085',
        client_nom: 'Fatou Textiles',
        date_facture: '2026-04-20',
        date_echeance: '2026-05-20',
        total_ttc: 95000,
        statut: 'emise',
        montant_paye: 0,
        mode_paiement: 'especes'
      },
      {
        numero_facture: 'FAC-2024-084',
        client_nom: 'Konate Agro-Alimentaire',
        date_facture: '2026-04-19',
        date_echeance: '2026-05-19',
        total_ttc: 2100000,
        statut: 'payee',
        montant_paye: 2100000,
        mode_paiement: 'virement'
      },
      {
        numero_facture: 'FAC-2024-083',
        client_nom: 'Traore & Associes',
        date_facture: '2026-04-18',
        date_echeance: '2026-05-18',
        total_ttc: 430000,
        statut: 'annulee',
        montant_paye: 0,
        mode_paiement: 'cheque'
      },
      {
        numero_facture: 'FAC-2024-082',
        client_nom: 'Sarr Import-Export',
        date_facture: '2026-04-17',
        date_echeance: '2026-05-17',
        total_ttc: 670000,
        statut: 'payee',
        montant_paye: 670000,
        mode_paiement: 'virement'
      },
      {
        numero_facture: 'FAC-2024-081',
        client_nom: 'Diallo & Freres SARL',
        date_facture: '2026-04-16',
        date_echeance: '2026-05-16',
        total_ttc: 385000,
        statut: 'emise',
        montant_paye: 0,
        mode_paiement: 'mobile_money'
      },
      {
        numero_facture: 'FAC-2024-080',
        client_nom: 'Groupe Ndiaye Commerce',
        date_facture: '2026-04-15',
        date_echeance: '2026-05-15',
        total_ttc: 540000,
        statut: 'partiellement_payee',
        montant_paye: 120000,
        mode_paiement: 'cheque'
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

      const montantPaye = Math.max(0, Math.min(item.montant_paye, item.total_ttc));

      this.db.create('factures', {
        client_id: clientId,
        devis_id: null,
        numero_facture: item.numero_facture,
        date_facture: item.date_facture,
        date_echeance: item.date_echeance,
        statut: item.statut,
        total_ht: item.total_ttc,
        total_tva: 0,
        total_ttc: item.total_ttc,
        montant_paye: montantPaye,
        reste_a_payer: Math.max(0, item.total_ttc - montantPaye),
        mode_paiement: item.mode_paiement
      });
    }
  }
}


