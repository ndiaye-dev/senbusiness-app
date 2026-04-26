import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { FeatureKey } from '../../core/constants/permissions';
import { Client, Devis, Produit } from '../../core/models/entities';
import { AuthService } from '../../core/services/auth.service';
import { MockDbService } from '../../core/services/mock-db.service';
import { FormModalComponent } from '../../shared/components/form-modal/form-modal.component';
import { paginate } from '../../shared/utils/list-helpers';

interface DevisLineFormValue {
  produit_id: number;
  quantite: number;
  prix_unitaire: number;
  remise_ligne: number;
  tva_pourcentage: number;
}

interface DevisView {
  id: number;
  numero_devis: string;
  client_nom: string;
  date_devis: string;
  date_expiration: string;
  montant: number;
  statut: Devis['statut'];
}

@Component({
  selector: 'app-devis-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, CurrencyPipe, DatePipe, FormModalComponent],
  templateUrl: './devis.page.html',
  styleUrl: './devis.page.scss'
})
export class DevisPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly db = inject(MockDbService);
  private readonly auth = inject(AuthService);
  private readonly featureKey: FeatureKey = 'devis';

  readonly loading = signal(false);
  readonly errorMessage = signal('');
  readonly actionMessage = signal('');
  readonly search = signal('');
  readonly statusFilter = signal<'tous' | Devis['statut']>('tous');
  readonly showFilters = signal(false);

  readonly page = signal(1);
  readonly pageSize = 8;

  readonly isDetailsModalOpen = signal(false);
  readonly detailsTitle = signal('Details');
  readonly detailsLines = signal<string[]>([]);

  readonly clients = signal<Client[]>([]);
  readonly produits = signal<Produit[]>([]);
  readonly devis = signal<Devis[]>([]);

  readonly isModalOpen = signal(false);  readonly editingId = signal<number | null>(null);

  readonly form = this.fb.group({
    client_id: [0, [Validators.required, Validators.min(1)]],
    numero_devis: ['', [Validators.required]],
    date_devis: [new Date().toISOString().slice(0, 10), Validators.required],
    date_expiration: [new Date(Date.now() + 7 * 24 * 3600000).toISOString().slice(0, 10), Validators.required],
    statut: ['brouillon', Validators.required],
    remise_globale: [0, [Validators.required, Validators.min(0), Validators.max(100)]],
    lignes: this.fb.array([])
  });

  readonly canView = computed(() => this.auth.can(this.featureKey, 'can_view'));
  readonly canCreate = computed(() => this.auth.can(this.featureKey, 'can_create'));
  readonly canEdit = computed(() => this.auth.can(this.featureKey, 'can_edit'));
  readonly canDelete = computed(() => this.auth.can(this.featureKey, 'can_delete'));

  readonly clientsMap = computed(() => new Map(this.clients().map((item) => [item.id, item])));

  readonly stats = computed(() => {
    const rows = this.devis();
    const total = rows.length;
    const brouillons = rows.filter((item) => item.statut === 'brouillon').length;
    const envoyes = rows.filter((item) => item.statut === 'envoye').length;
    const acceptes = rows.filter((item) => item.statut === 'accepte').length;
    const refuses = rows.filter((item) => item.statut === 'refuse').length;
    const montantTotal = rows.reduce((sum, item) => sum + item.total_ttc, 0);

    return {
      total,
      brouillons,
      envoyes,
      acceptes,
      refuses,
      montantTotal
    };
  });

  readonly filtered = computed(() => {
    const query = this.search().trim().toLowerCase();

    const filtered = this.devis().filter((item) => {
      const client = this.clientsMap().get(item.client_id);
      const clientName = client ? this.clientLabel(client) : '';
      const matchesSearch =
        !query || `${item.numero_devis} ${clientName} ${item.statut}`.toLowerCase().includes(query);

      const matchesStatus = this.statusFilter() === 'tous' || item.statut === this.statusFilter();

      return matchesSearch && matchesStatus;
    });

    const orderByNumero = (numero: string): number => {
      const lastPart = numero.split('-').pop() ?? '0';
      const parsed = Number(lastPart);
      return Number.isFinite(parsed) ? parsed : 0;
    };

    return filtered.sort((a, b) => {
      const diff = orderByNumero(b.numero_devis) - orderByNumero(a.numero_devis);
      if (diff !== 0) {
        return diff;
      }
      return b.date_devis.localeCompare(a.date_devis);
    });
  });

  readonly paginated = computed(() => paginate(this.filtered(), this.page(), this.pageSize));

  readonly rows = computed<DevisView[]>(() =>
    this.paginated().items.map((item) => ({
      id: item.id,
      numero_devis: item.numero_devis,
      client_nom: this.clientLabel(this.clientsMap().get(item.client_id) ?? null),
      date_devis: item.date_devis,
      date_expiration: item.date_expiration,
      montant: item.total_ttc,
      statut: item.statut
    }))
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
      this.ensureDemoDevis();
      this.clients.set(this.db.getCollection('clients'));
      this.produits.set(this.db.getCollection('produits'));
      this.devis.set(this.db.getCollection('devis'));
    } catch {
      this.errorMessage.set('Impossible de charger les devis.');
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

  statusLabel(statut: Devis['statut']): string {
    switch (statut) {
      case 'envoye':
        return 'Envoyé';
      case 'accepte':
        return 'Accepté';
      case 'refuse':
        return 'Refusé';
      case 'expire':
        return 'Expire';
      default:
        return 'Brouillon';
    }
  }

  statusTone(statut: Devis['statut']): 'draft' | 'sent' | 'accepted' | 'refused' | 'expired' {
    switch (statut) {
      case 'envoye':
        return 'sent';
      case 'accepte':
        return 'accepted';
      case 'refuse':
        return 'refused';
      case 'expire':
        return 'expired';
      default:
        return 'draft';
    }
  }

  lineGroup(value?: Partial<DevisLineFormValue>) {
    return this.fb.group({
      produit_id: [value?.produit_id ?? this.produits()[0]?.id ?? 0, [Validators.required, Validators.min(1)]],
      quantite: [value?.quantite ?? 1, [Validators.required, Validators.min(1)]],
      prix_unitaire: [value?.prix_unitaire ?? 0, [Validators.required, Validators.min(0)]],
      remise_ligne: [value?.remise_ligne ?? 0, [Validators.required, Validators.min(0), Validators.max(100)]],
      tva_pourcentage: [value?.tva_pourcentage ?? 18, [Validators.required, Validators.min(0)]]
    });
  }

  addLine(value?: Partial<DevisLineFormValue>): void {
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

  onSearch(value: string): void {
    this.search.set(value);
    this.page.set(1);
  }

  onStatusFilter(value: string): void {
    this.statusFilter.set((value as 'tous' | Devis['statut']) ?? 'tous');
    this.page.set(1);
  }

  toggleFilters(): void {
    this.showFilters.update((state) => !state);
  }

  resetFilters(): void {
    this.search.set('');
    this.statusFilter.set('tous');
    this.page.set(1);
  }

  openCreateModal(): void {
    this.actionMessage.set('');
    this.editingId.set(null);
    this.form.reset({
      client_id: this.clients()[0]?.id ?? 0,
      numero_devis: `DEV-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`,
      date_devis: new Date().toISOString().slice(0, 10),
      date_expiration: new Date(Date.now() + 15 * 24 * 3600000).toISOString().slice(0, 10),
      statut: 'brouillon',
      remise_globale: 0,
      lignes: []
    });
    this.linesFormArray.clear();
    this.addLine();
    this.isModalOpen.set(true);
  }

  openEditModal(item: Devis): void {
    this.actionMessage.set('');
    this.editingId.set(item.id);

    this.form.reset({
      client_id: item.client_id,
      numero_devis: item.numero_devis,
      date_devis: item.date_devis,
      date_expiration: item.date_expiration,
      statut: item.statut,
      remise_globale: item.remise_globale,
      lignes: []
    });

    this.linesFormArray.clear();
    const lines = this.db.getDevisLignes(item.id);
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
    const remiseGlobale = Number(this.form.controls.remise_globale.value) || 0;
    const lines = this.linesFormArray.controls.map((control) => ({
      quantite: Number(control.get('quantite')?.value) || 0,
      prix_unitaire: Number(control.get('prix_unitaire')?.value) || 0,
      remise_ligne: Number(control.get('remise_ligne')?.value) || 0,
      tva_pourcentage: Number(control.get('tva_pourcentage')?.value) || 0
    }));

    const lineSums = lines.map((line) => {
      const ht = line.quantite * line.prix_unitaire * (1 - line.remise_ligne / 100);
      const tva = ht * (line.tva_pourcentage / 100);
      return { ht, tva };
    });

    const factor = Math.max(0, 1 - remiseGlobale / 100);
    const ht = lineSums.reduce((sum, line) => sum + line.ht, 0) * factor;
    const tva = lineSums.reduce((sum, line) => sum + line.tva, 0) * factor;
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
      numero_devis: values.numero_devis,
      date_devis: values.date_devis,
      date_expiration: values.date_expiration,
      statut: values.statut,
      remise_globale: Number(values.remise_globale)
    };

    const lines = this.linesFormArray.controls.map((control) => ({
      produit_id: Number(control.get('produit_id')?.value),
      quantite: Number(control.get('quantite')?.value),
      prix_unitaire: Number(control.get('prix_unitaire')?.value),
      remise_ligne: Number(control.get('remise_ligne')?.value),
      tva_pourcentage: Number(control.get('tva_pourcentage')?.value)
    }));

    if (this.editingId()) {
      this.db.updateDevis(this.editingId() as number, payload, lines);
      this.actionMessage.set('Devis mis à jour avec succès.');
    } else {
      this.db.createDevis(payload, lines);
      this.actionMessage.set('Devis créé avec succès.');
    }

    this.closeModal();
    this.loadData();
  }

  view(item: Devis): void {
    const lines = this.db.getDevisLignes(item.id);
    const clientName = this.clientLabel(this.clientsMap().get(item.client_id) ?? null);

    const detailLines = lines
      .map((line) => {
        const produit = this.produits().find((p) => p.id === line.produit_id);
        return `- ${produit?.nom ?? 'Produit'}: ${line.quantite} x ${line.prix_unitaire} XOF`;
      })
      .join('\n');

    const details = [
      `Devis: ${item.numero_devis}`,
      `Client: ${clientName}`,
      `Statut: ${this.statusLabel(item.statut)}`,
      `Montant TTC: ${item.total_ttc.toLocaleString('fr-FR')} XOF`,
      '',
      'Lignes:',
      detailLines || '- Aucune ligne'
    ].join('\n');

    this.openDetailsModal('Details', details);
  }

  duplicate(item: Devis): void {
    const lines = this.db.getDevisLignes(item.id);

    try {
      this.db.createDevis(
        {
          client_id: item.client_id,
          numero_devis: `DEV-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`,
          date_devis: new Date().toISOString().slice(0, 10),
          date_expiration: item.date_expiration,
          statut: 'brouillon',
          remise_globale: item.remise_globale
        },
        lines.map((line) => ({
          produit_id: line.produit_id,
          quantite: line.quantite,
          prix_unitaire: line.prix_unitaire,
          remise_ligne: line.remise_ligne,
          tva_pourcentage: line.tva_pourcentage
        }))
      );

      this.actionMessage.set('Devis dupliqué avec succès.');
      this.loadData();
    } catch (error) {
      this.actionMessage.set(error instanceof Error ? error.message : 'Duplication impossible');
    }
  }

  convertToFacture(item: Devis): void {
    if (!window.confirm(`Convertir le devis ${item.numero_devis} en facture ?`)) {
      return;
    }

    try {
      const facture = this.db.convertDevisToFacture(item.id);
      this.actionMessage.set(`Facture ${facture.numero_facture} créée avec succès.`);
      this.loadData();
    } catch (error) {
      this.actionMessage.set(error instanceof Error ? error.message : 'Conversion impossible');
    }
  }

  remove(item: Devis): void {
    if (!window.confirm(`Supprimer le devis ${item.numero_devis} ?`)) {
      return;
    }

    this.db.deleteDevis(item.id);
    this.actionMessage.set('Devis supprimé avec succès.');
    this.loadData();
  }

  exportDevis(): void {
    const header = 'numero_devis,client,date_devis,date_expiration,statut,total_ttc';
    const lines = this.filtered().map((item) => {
      const client = this.clientLabel(this.clientsMap().get(item.client_id) ?? null);
      return [
        item.numero_devis,
        client,
        item.date_devis,
        item.date_expiration,
        item.statut,
        item.total_ttc
      ]
        .map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`)
        .join(',');
    });

    const csv = [header, ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `senbusiness-devis-${new Date().toISOString().slice(0, 10)}.csv`;
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

  displayDevisById(id: number): Devis | null {
    return this.devis().find((item) => item.id === id) ?? null;
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
  private ensureDemoDevis(): void {
    const produits = this.db.getCollection('produits');
    const defaultProduit = produits[0];
    if (!defaultProduit) {
      return;
    }

    const clients = this.db.getCollection('clients');
    const clientByName = new Map(
      clients
        .filter((client) => client.type_client === 'entreprise')
        .map((client) => [client.raison_sociale.toLowerCase(), client.id])
    );

    const existing = this.db.getCollection('devis');
    const existingByNumero = new Set(existing.map((item) => item.numero_devis.toLowerCase()));

    const demoDevis: Array<{
      numero_devis: string;
      client_nom: string;
      date_devis: string;
      date_expiration: string;
      statut: Devis['statut'];
      montant: number;
    }> = [
      {
        numero_devis: 'DEV-2024-042',
        client_nom: 'Diallo & Freres SARL',
        date_devis: '2026-04-24',
        date_expiration: '2026-05-24',
        statut: 'envoye',
        montant: 450000
      },
      {
        numero_devis: 'DEV-2024-041',
        client_nom: 'Groupe Ndiaye Commerce',
        date_devis: '2026-04-23',
        date_expiration: '2026-05-23',
        statut: 'brouillon',
        montant: 1200000
      },
      {
        numero_devis: 'DEV-2024-040',
        client_nom: 'Sow Electronique',
        date_devis: '2026-04-22',
        date_expiration: '2026-05-22',
        statut: 'accepte',
        montant: 320000
      },
      {
        numero_devis: 'DEV-2024-039',
        client_nom: 'Mbaye Distribution',
        date_devis: '2026-04-21',
        date_expiration: '2026-05-21',
        statut: 'refuse',
        montant: 780000
      },
      {
        numero_devis: 'DEV-2024-038',
        client_nom: 'Fatou Textiles',
        date_devis: '2026-04-20',
        date_expiration: '2026-05-20',
        statut: 'brouillon',
        montant: 95000
      },
      {
        numero_devis: 'DEV-2024-037',
        client_nom: 'Konate Agro-Alimentaire',
        date_devis: '2026-04-19',
        date_expiration: '2026-05-19',
        statut: 'envoye',
        montant: 2100000
      },
      {
        numero_devis: 'DEV-2024-036',
        client_nom: 'Traore & Associes',
        date_devis: '2026-04-18',
        date_expiration: '2026-05-18',
        statut: 'accepte',
        montant: 430000
      },
      {
        numero_devis: 'DEV-2024-035',
        client_nom: 'Sarr Import-Export',
        date_devis: '2026-04-17',
        date_expiration: '2026-05-17',
        statut: 'brouillon',
        montant: 670000
      }
    ];

    for (const item of demoDevis) {
      if (existingByNumero.has(item.numero_devis.toLowerCase())) {
        continue;
      }

      const clientId = clientByName.get(item.client_nom.toLowerCase());
      if (!clientId) {
        continue;
      }

      this.db.createDevis(
        {
          client_id: clientId,
          numero_devis: item.numero_devis,
          date_devis: item.date_devis,
          date_expiration: item.date_expiration,
          statut: item.statut,
          remise_globale: 0
        },
        [
          {
            produit_id: defaultProduit.id,
            quantite: 1,
            prix_unitaire: item.montant,
            remise_ligne: 0,
            tva_pourcentage: 0
          }
        ]
      );
    }
  }
}


