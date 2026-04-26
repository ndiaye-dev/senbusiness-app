import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { FeatureKey } from '../../core/constants/permissions';
import { Achat, Fournisseur, Produit } from '../../core/models/entities';
import { AuthService } from '../../core/services/auth.service';
import { MockDbService } from '../../core/services/mock-db.service';
import { FormModalComponent } from '../../shared/components/form-modal/form-modal.component';
import { paginate } from '../../shared/utils/list-helpers';

interface AchatLineFormValue {
  produit_id: number;
  quantite: number;
  prix_achat: number;
  tva_pourcentage: number;
}

type UiAchatStatus = 'commande' | 'recu' | 'paye' | 'annule' | 'brouillon';

interface AchatView {
  id: number;
  numero_achat: string;
  fournisseur_nom: string;
  date_achat: string;
  reception_prevue: string;
  montant: number;
  statut: Achat['statut'];
  ui_status: UiAchatStatus;
}

@Component({
  selector: 'app-achats-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, CurrencyPipe, DatePipe, FormModalComponent],
  templateUrl: './achats.page.html',
  styleUrl: './achats.page.scss'
})
export class AchatsPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly db = inject(MockDbService);
  private readonly auth = inject(AuthService);
  private readonly featureKey: FeatureKey = 'achats';

  readonly loading = signal(false);
  readonly errorMessage = signal('');
  readonly actionMessage = signal('');

  readonly search = signal('');
  readonly statusFilter = signal<'tous' | UiAchatStatus>('tous');
  readonly supplierFilter = signal<'tous' | number>('tous');
  readonly showFilters = signal(false);

  readonly page = signal(1);
  readonly pageSize = 8;

  readonly isDetailsModalOpen = signal(false);
  readonly detailsTitle = signal('Details');
  readonly detailsLines = signal<string[]>([]);

  readonly fournisseurs = signal<Fournisseur[]>([]);
  readonly produits = signal<Produit[]>([]);
  readonly achats = signal<Achat[]>([]);

  readonly isModalOpen = signal(false);  readonly editingId = signal<number | null>(null);

  readonly form = this.fb.group({
    fournisseur_id: [0, [Validators.required, Validators.min(1)]],
    numero_achat: ['', [Validators.required]],
    date_achat: [new Date().toISOString().slice(0, 10), Validators.required],
    statut: ['commande', Validators.required],
    lignes: this.fb.array([])
  });

  readonly canView = computed(() => this.auth.can(this.featureKey, 'can_view'));
  readonly canCreate = computed(() => this.auth.can(this.featureKey, 'can_create'));
  readonly canEdit = computed(() => this.auth.can(this.featureKey, 'can_edit'));
  readonly canDelete = computed(() => this.auth.can(this.featureKey, 'can_delete'));

  readonly fournisseursMap = computed(() => new Map(this.fournisseurs().map((item) => [item.id, item])));

  readonly stats = computed(() => {
    const rows = this.achats();
    const total = rows.length;
    const commandes = rows.filter((item) => this.uiStatusFromAchat(item) === 'commande').length;
    const recus = rows.filter((item) => this.uiStatusFromAchat(item) === 'recu').length;
    const payes = rows.filter((item) => this.uiStatusFromAchat(item) === 'paye').length;
    const annules = rows.filter((item) => this.uiStatusFromAchat(item) === 'annule').length;
    const totalMontant = rows.reduce((sum, item) => sum + item.total_ttc, 0);

    return {
      total,
      commandes,
      recus,
      payes,
      annules,
      totalMontant
    };
  });

  readonly filtered = computed(() => {
    const query = this.search().trim().toLowerCase();

    const filtered = this.achats().filter((item) => {
      const fournisseur = this.fournisseursMap().get(item.fournisseur_id);
      const fournisseurNom = fournisseur?.raison_sociale ?? '';
      const uiStatus = this.uiStatusFromAchat(item);

      const matchesSearch =
        !query ||
        `${item.numero_achat} ${fournisseurNom} ${this.statusLabel(uiStatus)}`.toLowerCase().includes(query);

      const matchesStatus = this.statusFilter() === 'tous' || uiStatus === this.statusFilter();
      const matchesSupplier = this.supplierFilter() === 'tous' || item.fournisseur_id === this.supplierFilter();

      return matchesSearch && matchesStatus && matchesSupplier;
    });

    const toRank = (numero: string): number => {
      const parsed = Number(numero.split('-').pop() ?? '0');
      return Number.isFinite(parsed) ? parsed : 0;
    };

    return filtered.sort((a, b) => {
      const rankDiff = toRank(b.numero_achat) - toRank(a.numero_achat);
      if (rankDiff !== 0) {
        return rankDiff;
      }

      return b.date_achat.localeCompare(a.date_achat);
    });
  });

  readonly paginated = computed(() => paginate(this.filtered(), this.page(), this.pageSize));

  readonly rows = computed<AchatView[]>(() =>
    this.paginated().items.map((item) => ({
      id: item.id,
      numero_achat: item.numero_achat,
      fournisseur_nom: this.fournisseursMap().get(item.fournisseur_id)?.raison_sociale ?? 'Fournisseur inconnu',
      date_achat: item.date_achat,
      reception_prevue: this.receptionPrevue(item),
      montant: item.total_ttc,
      statut: item.statut,
      ui_status: this.uiStatusFromAchat(item)
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
      this.ensureDemoFournisseurs();
      this.ensureDemoAchats();
      this.fournisseurs.set(this.db.getCollection('fournisseurs'));
      this.produits.set(this.db.getCollection('produits'));
      this.achats.set(this.db.getCollection('achats'));
    } catch {
      this.errorMessage.set('Impossible de charger les achats.');
    } finally {
      this.loading.set(false);
    }
  }

  lineGroup(value?: Partial<AchatLineFormValue>) {
    return this.fb.group({
      produit_id: [value?.produit_id ?? this.produits()[0]?.id ?? 0, [Validators.required, Validators.min(1)]],
      quantite: [value?.quantite ?? 1, [Validators.required, Validators.min(1)]],
      prix_achat: [value?.prix_achat ?? 0, [Validators.required, Validators.min(0)]],
      tva_pourcentage: [value?.tva_pourcentage ?? 18, [Validators.required, Validators.min(0)]]
    });
  }

  addLine(value?: Partial<AchatLineFormValue>): void {
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
      prix_achat: produit.prix_achat,
      tva_pourcentage: produit.tva_pourcentage
    });
  }

  onSearch(value: string): void {
    this.search.set(value);
    this.page.set(1);
  }

  onStatusFilter(value: string): void {
    this.statusFilter.set((value as 'tous' | UiAchatStatus) ?? 'tous');
    this.page.set(1);
  }

  onSupplierFilter(value: string): void {
    this.supplierFilter.set(value === 'tous' ? 'tous' : Number(value));
    this.page.set(1);
  }

  toggleFilters(): void {
    this.showFilters.update((state) => !state);
  }

  resetFilters(): void {
    this.search.set('');
    this.statusFilter.set('tous');
    this.supplierFilter.set('tous');
    this.page.set(1);
  }

  openCreateModal(): void {
    this.actionMessage.set('');
    this.editingId.set(null);
    this.form.reset({
      fournisseur_id: this.fournisseurs()[0]?.id ?? 0,
      numero_achat: `ACH-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`,
      date_achat: new Date().toISOString().slice(0, 10),
      statut: 'commande',
      lignes: []
    });

    this.linesFormArray.clear();
    this.addLine();
    this.isModalOpen.set(true);
  }

  openEditModalById(id: number): void {
    const item = this.achats().find((entry) => entry.id === id);
    if (!item) {
      return;
    }

    this.actionMessage.set('');
    this.editingId.set(item.id);

    this.form.reset({
      fournisseur_id: item.fournisseur_id,
      numero_achat: item.numero_achat,
      date_achat: item.date_achat,
      statut: item.statut,
      lignes: []
    });

    this.linesFormArray.clear();
    const lines = this.db.getAchatLignes(item.id);

    for (const line of lines) {
      this.addLine({
        produit_id: line.produit_id,
        quantite: line.quantite,
        prix_achat: line.prix_achat,
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
      prix_achat: Number(control.get('prix_achat')?.value) || 0,
      tva_pourcentage: Number(control.get('tva_pourcentage')?.value) || 0
    }));

    const ht = lines.reduce((sum, line) => sum + line.quantite * line.prix_achat, 0);
    const tva = lines.reduce((sum, line) => sum + line.quantite * line.prix_achat * (line.tva_pourcentage / 100), 0);

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
      fournisseur_id: Number(values.fournisseur_id),
      numero_achat: values.numero_achat,
      date_achat: values.date_achat,
      statut: values.statut
    };

    const lines = this.linesFormArray.controls.map((control) => ({
      produit_id: Number(control.get('produit_id')?.value),
      quantite: Number(control.get('quantite')?.value),
      prix_achat: Number(control.get('prix_achat')?.value),
      tva_pourcentage: Number(control.get('tva_pourcentage')?.value)
    }));

    try {
      if (this.editingId()) {
        this.db.updateAchat(this.editingId() as number, payload, lines);
        this.actionMessage.set('Achat mis à jour avec succès.');
      } else {
        this.db.createAchat(payload, lines);
        this.actionMessage.set('Achat créé avec succès.');
      }

      this.closeModal();
      this.loadData();
    } catch (error) {
      this.actionMessage.set(error instanceof Error ? error.message : 'Enregistrement impossible');
    }
  }

  viewById(id: number): void {
    const item = this.achats().find((entry) => entry.id === id);
    if (!item) {
      return;
    }

    const fournisseur = this.fournisseursMap().get(item.fournisseur_id)?.raison_sociale ?? 'Fournisseur inconnu';
    const lines = this.db.getAchatLignes(item.id);

    const details = [
      `Achat: ${item.numero_achat}`,
      `Fournisseur: ${fournisseur}`,
      `Date: ${item.date_achat}`,
      `Statut: ${this.statusLabel(this.uiStatusFromAchat(item))}`,
      `Total HT: ${item.total_ht.toLocaleString('fr-FR')} XOF`,
      `Total TVA: ${item.total_tva.toLocaleString('fr-FR')} XOF`,
      `Total TTC: ${item.total_ttc.toLocaleString('fr-FR')} XOF`,
      `Lignes: ${lines.length}`
    ].join('\n');

    this.openDetailsModal('Details', details);
  }

  removeById(id: number): void {
    const item = this.achats().find((entry) => entry.id === id);
    if (!item) {
      return;
    }

    if (!window.confirm(`Supprimer l'achat ${item.numero_achat} ?`)) {
      return;
    }

    try {
      this.db.deleteAchat(item.id);
      this.actionMessage.set('Achat supprimé avec succès.');
      this.loadData();
    } catch (error) {
      this.actionMessage.set(error instanceof Error ? error.message : 'Suppression impossible');
    }
  }

  exportAchats(): void {
    const header = 'numero_achat,fournisseur,date_achat,statut,total_ttc';
    const lines = this.filtered().map((item) => {
      const fournisseur = this.fournisseursMap().get(item.fournisseur_id)?.raison_sociale ?? 'Fournisseur inconnu';
      return [item.numero_achat, fournisseur, item.date_achat, item.statut, item.total_ttc]
        .map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`)
        .join(',');
    });

    const csv = [header, ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `senbusiness-achats-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  statusLabel(status: UiAchatStatus): string {
    switch (status) {
      case 'commande':
        return 'Commande';
      case 'recu':
        return 'Reçu';
      case 'paye':
        return 'Payé';
      case 'annule':
        return 'Annulé';
      default:
        return 'Brouillon';
    }
  }

  statusTone(status: UiAchatStatus): 'blue' | 'green' | 'teal' | 'slate' | 'gray' {
    switch (status) {
      case 'commande':
        return 'blue';
      case 'recu':
        return 'green';
      case 'paye':
        return 'teal';
      case 'annule':
        return 'slate';
      default:
        return 'gray';
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
  private receptionPrevue(item: Achat): string {
    if (item.statut === 'commande') {
      return '-';
    }

    return '-';
  }
  private uiStatusFromAchat(item: Achat): UiAchatStatus {
    switch (item.statut) {
      case 'commande':
        return 'commande';
      case 'recu':
        return 'recu';
      case 'reception_partielle':
        return 'paye';
      case 'annule':
        return 'annule';
      default:
        return 'brouillon';
    }
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
  private ensureDemoAchats(): void {
    const fournisseurs = this.db.getCollection('fournisseurs');
    const fournisseurByName = new Map(
      fournisseurs.map((item) => [this.stripAccents(item.raison_sociale).toLowerCase(), item.id])
    );

    const existing = this.db.getCollection('achats');
    const existingByNumero = new Set(existing.map((item) => item.numero_achat.toLowerCase()));

    const demo: Array<{
      numero_achat: string;
      fournisseur_nom: string;
      date_achat: string;
      statut: Achat['statut'];
      total_ttc: number;
    }> = [
      {
        numero_achat: 'ACH-2024-045',
        fournisseur_nom: 'Societe Senegal Import SARL',
        date_achat: '2026-04-24',
        statut: 'recu',
        total_ttc: 2500000
      },
      {
        numero_achat: 'ACH-2024-044',
        fournisseur_nom: 'Groupe Alimentaire du Senegal',
        date_achat: '2026-04-23',
        statut: 'commande',
        total_ttc: 1800000
      },
      {
        numero_achat: 'ACH-2024-043',
        fournisseur_nom: 'Sow Distribution SA',
        date_achat: '2026-04-22',
        statut: 'reception_partielle',
        total_ttc: 950000
      },
      {
        numero_achat: 'ACH-2024-042',
        fournisseur_nom: 'Konate Fournitures Bureau',
        date_achat: '2026-04-21',
        statut: 'annule',
        total_ttc: 320000
      },
      {
        numero_achat: 'ACH-2024-041',
        fournisseur_nom: 'Mbaye Materiel Industriel',
        date_achat: '2026-04-20',
        statut: 'recu',
        total_ttc: 4200000
      },
      {
        numero_achat: 'ACH-2024-040',
        fournisseur_nom: 'Ndiaye Emballages & Cie',
        date_achat: '2026-04-19',
        statut: 'commande',
        total_ttc: 780000
      },
      {
        numero_achat: 'ACH-2024-039',
        fournisseur_nom: 'Societe Senegal Import SARL',
        date_achat: '2026-04-18',
        statut: 'reception_partielle',
        total_ttc: 1450000
      },
      {
        numero_achat: 'ACH-2024-038',
        fournisseur_nom: 'Groupe Alimentaire du Senegal',
        date_achat: '2026-04-17',
        statut: 'recu',
        total_ttc: 2100000
      }
    ];

    for (const item of demo) {
      if (existingByNumero.has(item.numero_achat.toLowerCase())) {
        continue;
      }

      const fournisseurId = fournisseurByName.get(this.stripAccents(item.fournisseur_nom).toLowerCase());
      if (!fournisseurId) {
        continue;
      }

      this.db.create('achats', {
        fournisseur_id: fournisseurId,
        numero_achat: item.numero_achat,
        date_achat: item.date_achat,
        statut: item.statut,
        total_ht: item.total_ttc,
        total_tva: 0,
        total_ttc: item.total_ttc
      });
    }
  }
}


