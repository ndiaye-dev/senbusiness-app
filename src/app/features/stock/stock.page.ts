import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { FeatureKey } from '../../core/constants/permissions';
import { Categorie, Fournisseur, MouvementStock, Produit } from '../../core/models/entities';
import { AuthService } from '../../core/services/auth.service';
import { MockDbService } from '../../core/services/mock-db.service';
import { FormModalComponent } from '../../shared/components/form-modal/form-modal.component';
import { paginate } from '../../shared/utils/list-helpers';

type MovementFilter = 'tous' | MouvementStock['type_mouvement'];
type PeriodFilter = '7j' | '30j' | 'tous';

type MovementTone = 'entree' | 'sortie' | 'ajustement';

interface StockRow {
  id: number;
  date_mouvement: string;
  type_mouvement: MouvementStock['type_mouvement'];
  produit_nom: string;
  quantite: number;
  entrepot: string;
  utilisateur: string;
  reference_document: string;
}

@Component({
  selector: 'app-stock-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, CurrencyPipe, DatePipe, FormModalComponent],
  templateUrl: './stock.page.html',
  styleUrl: './stock.page.scss'
})
export class StockPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly db = inject(MockDbService);
  private readonly auth = inject(AuthService);
  private readonly featureKey: FeatureKey = 'stock';

  readonly loading = signal(false);
  readonly errorMessage = signal('');
  readonly actionMessage = signal('');

  readonly search = signal('');
  readonly movementFilter = signal<MovementFilter>('tous');
  readonly periodFilter = signal<PeriodFilter>('30j');

  readonly page = signal(1);
  readonly pageSize = 10;

  readonly produits = signal<Produit[]>([]);
  readonly mouvements = signal<MouvementStock[]>([]);

  readonly isModalOpen = signal(false);

  readonly form = this.fb.group({
    produit_id: [0, [Validators.required, Validators.min(1)]],
    type_mouvement: ['entree', Validators.required],
    quantite: [1, [Validators.required, Validators.min(1)]],
    date_mouvement: [new Date().toISOString().slice(0, 10), Validators.required],
    reference_document: ['', [Validators.required]],
    commentaire: ['']
  });

  readonly canCreate = computed(() => this.auth.can(this.featureKey, 'can_create'));

  readonly produitsMap = computed(() => new Map(this.produits().map((item) => [item.id, item])));

  readonly latestMovementDate = computed(() => {
    const list = this.mouvements();
    if (!list.length) {
      return new Date();
    }

    const latest = list
      .map((item) => new Date(item.date_mouvement))
      .sort((a, b) => b.getTime() - a.getTime())[0];

    return Number.isNaN(latest.getTime()) ? new Date() : latest;
  });

  readonly periodScoped = computed(() => {
    const baseDate = this.latestMovementDate();
    const period = this.periodFilter();

    if (period === 'tous') {
      return this.mouvements();
    }

    const days = period === '7j' ? 7 : 30;
    const minTime = baseDate.getTime() - days * 24 * 60 * 60 * 1000;

    return this.mouvements().filter((item) => {
      const t = new Date(item.date_mouvement).getTime();
      return !Number.isNaN(t) && t >= minTime;
    });
  });

  readonly tabCounts = computed(() => {
    const list = this.periodScoped();
    return {
      tous: list.length,
      entree: list.filter((item) => item.type_mouvement === 'entree').length,
      sortie: list.filter((item) => item.type_mouvement === 'sortie').length,
      ajustement: list.filter((item) => item.type_mouvement === 'ajustement').length
    };
  });

  readonly filtered = computed(() => {
    const query = this.search().trim().toLowerCase();

    const rows = this.periodScoped().filter((item) => {
      const produit = this.produitsMap().get(item.produit_id);
      const matchesSearch =
        !query ||
        `${item.reference_document} ${item.commentaire} ${produit?.nom ?? ''}`
          .toLowerCase()
          .includes(query);

      const matchesType = this.movementFilter() === 'tous' || item.type_mouvement === this.movementFilter();
      return matchesSearch && matchesType;
    });

    return rows.sort((a, b) => {
      const ad = new Date(a.date_mouvement).getTime();
      const bd = new Date(b.date_mouvement).getTime();
      return bd - ad;
    });
  });

  readonly paginated = computed(() => paginate(this.filtered(), this.page(), this.pageSize));

  readonly rows = computed<StockRow[]>(() =>
    this.paginated().items.map((item) => ({
      id: item.id,
      date_mouvement: item.date_mouvement,
      type_mouvement: item.type_mouvement,
      produit_nom: this.produitsMap().get(item.produit_id)?.nom ?? 'Produit inconnu',
      quantite: item.quantite,
      entrepot: 'Principal Dakar',
      utilisateur: this.resolveUtilisateur(item.reference_document),
      reference_document: item.reference_document
    }))
  );

  readonly stats = computed(() => {
    const produits = this.produits();
    const mouvements = this.periodScoped();

    const valeurStockTotal = produits.reduce((sum, item) => sum + item.prix_achat * item.stock_actuel, 0);
    const entreesMois = mouvements
      .filter((item) => item.type_mouvement === 'entree')
      .reduce((sum, item) => sum + item.quantite, 0);
    const sortiesMois = mouvements
      .filter((item) => item.type_mouvement === 'sortie')
      .reduce((sum, item) => sum + item.quantite, 0);
    const ajustements = mouvements.filter((item) => item.type_mouvement === 'ajustement').length;

    return {
      valeurStockTotal,
      entreesMois,
      sortiesMois,
      ajustements
    };
  });

  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.pageSize)));
  readonly pages = computed(() => Array.from({ length: this.totalPages() }, (_, index) => index + 1));

  constructor() {
    this.loadData();
  }

  loadData(): void {
    this.loading.set(true);
    this.errorMessage.set('');

    try {
      this.ensureDemoCategories();
      this.ensureDemoFournisseurs();
      this.ensureDemoProduits();
      this.ensureDemoMouvements();

      this.produits.set(this.db.getCollection('produits'));
      this.mouvements.set(this.db.getCollection('mouvements_stock'));
    } catch {
      this.errorMessage.set('Impossible de charger les mouvements de stock.');
    } finally {
      this.loading.set(false);
    }
  }

  selectMovementFilter(filter: MovementFilter): void {
    this.movementFilter.set(filter);
    this.page.set(1);
  }

  onPeriodFilter(value: string): void {
    this.periodFilter.set((value as PeriodFilter) ?? '30j');
    this.page.set(1);
  }

  onSearch(value: string): void {
    this.search.set(value);
    this.page.set(1);
  }

  openCreateModal(): void {
    this.actionMessage.set('');
    this.form.reset({
      produit_id: this.produits()[0]?.id ?? 0,
      type_mouvement: 'entree',
      quantite: 1,
      date_mouvement: new Date().toISOString().slice(0, 10),
      reference_document: `MVT-${String(Date.now()).slice(-6)}`,
      commentaire: ''
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
      this.db.addMouvementStock(values);
      this.closeModal();
      this.loadData();
      this.actionMessage.set('Mouvement enregistré avec succès.');
    } catch (error) {
      this.actionMessage.set(error instanceof Error ? error.message : 'Opération impossible');
    }
  }

  exportMouvements(): void {
    const header = 'date_heure,type,produit,quantite,entrepot,utilisateur,reference';
    const lines = this.filtered().map((item) => {
      const produit = this.produitsMap().get(item.produit_id)?.nom ?? '-';
      return [
        item.date_mouvement,
        item.type_mouvement,
        produit,
        item.quantite,
        'Principal Dakar',
        this.resolveUtilisateur(item.reference_document),
        item.reference_document
      ]
        .map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`)
        .join(',');
    });

    const csv = [header, ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `senbusiness-stock-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  typeLabel(type: MouvementStock['type_mouvement']): string {
    switch (type) {
      case 'entree':
        return 'Entrée';
      case 'sortie':
        return 'Sortie';
      default:
        return 'Ajustement';
    }
  }

  typeTone(type: MouvementStock['type_mouvement']): MovementTone {
    return type;
  }

  typeIcon(type: MouvementStock['type_mouvement']): string {
    switch (type) {
      case 'entree':
        return 'add_circle';
      case 'sortie':
        return 'remove_circle';
      default:
        return 'tune';
    }
  }

  quantiteDisplay(row: StockRow): string {
    if (row.type_mouvement === 'sortie') {
      return `-${row.quantite}`;
    }

    if (row.type_mouvement === 'ajustement') {
      return `±${row.quantite}`;
    }

    return `+${row.quantite}`;
  }

  quantiteTone(row: StockRow): 'positive' | 'negative' | 'neutral' {
    if (row.type_mouvement === 'sortie') {
      return 'negative';
    }
    if (row.type_mouvement === 'ajustement') {
      return 'neutral';
    }
    return 'positive';
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

  private resolveUtilisateur(reference: string): string {
    const ref = reference.toUpperCase();

    if (ref.includes('FAC-2024-088') || ref.includes('FAC-2024-086') || ref.includes('INV-2024-012')) {
      return 'Mariam Traoré';
    }

    if (ref.includes('FAC-2024-087') || ref.includes('FAC-2024-085')) {
      return 'Cheikh Sarr';
    }

    return 'Admin Diallo';
  }

  private slugify(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  private ensureDemoCategories(): void {
    const existing = this.db.getCollection('categories');
    const keys = new Set(existing.map((item) => this.slugify(item.nom)));

    const demo: Array<Omit<Categorie, 'id'>> = [
      { nom: 'Alimentation', description: 'Produits alimentaires de base', statut: 'actif' },
      { nom: 'Boissons', description: 'Boissons et liquides', statut: 'actif' },
      { nom: 'Électronique', description: 'Appareils électroniques et accessoires', statut: 'actif' },
      { nom: 'Textile', description: 'Vêtements et tissus', statut: 'actif' }
    ];

    for (const category of demo) {
      if (!keys.has(this.slugify(category.nom))) {
        this.db.create('categories', category);
      }
    }
  }

  private ensureDemoFournisseurs(): void {
    const existing = this.db.getCollection('fournisseurs');
    if (existing.length) {
      return;
    }

    this.db.create('fournisseurs', {
      code_fournisseur: 'FRN-1001',
      raison_sociale: 'Sunu Distribution',
      contact_nom: 'Mamadou Seck',
      telephone: '+221 77 443 22 11',
      email: 'contact@sunudistribution.sn',
      adresse: 'Zone industrielle',
      ville: 'Dakar',
      ninea: 'SN-DKR-2021-B-99881',
      delai_paiement_jours: 30,
      statut: 'actif'
    });
  }

  private ensureDemoProduits(): void {
    const categories = this.db.getCollection('categories');
    const fournisseurs = this.db.getCollection('fournisseurs');

    const categoryBySlug = new Map(categories.map((item) => [this.slugify(item.nom), item.id]));
    const defaultCategoryId = categories[0]?.id ?? 1;
    const defaultFournisseurId = fournisseurs[0]?.id ?? 1;

    const existing = this.db.getCollection('produits');
    const existingBySku = new Set(existing.map((item) => item.sku.toLowerCase()));

    const demoProduits: Array<Omit<Produit, 'id'>> = [
      {
        sku: 'RIZ-25KG-001',
        code_barre: '6190011000010',
        nom: 'Riz Brise 25kg',
        description: 'Riz blanc de qualité',
        categorie_id: categoryBySlug.get('alimentation') ?? defaultCategoryId,
        fournisseur_id: defaultFournisseurId,
        prix_achat: 8500,
        prix_vente: 10500,
        tva_pourcentage: 18,
        unite: 'sac',
        stock_actuel: 342,
        stock_minimum: 80,
        statut: 'actif'
      },
      {
        sku: 'HUI-5L-002',
        code_barre: '6190011000027',
        nom: 'Huile Végétale 5L',
        description: 'Huile vegetale raffinee',
        categorie_id: categoryBySlug.get('alimentation') ?? defaultCategoryId,
        fournisseur_id: defaultFournisseurId,
        prix_achat: 3200,
        prix_vente: 4200,
        tva_pourcentage: 18,
        unite: 'bidon',
        stock_actuel: 289,
        stock_minimum: 60,
        statut: 'actif'
      },
      {
        sku: 'SUC-50KG-003',
        code_barre: '6190011000034',
        nom: 'Sucre Cristallisé 50kg',
        description: 'Sucre cristallise en sac',
        categorie_id: categoryBySlug.get('alimentation') ?? defaultCategoryId,
        fournisseur_id: defaultFournisseurId,
        prix_achat: 18000,
        prix_vente: 22500,
        tva_pourcentage: 18,
        unite: 'sac',
        stock_actuel: 215,
        stock_minimum: 50,
        statut: 'actif'
      },
      {
        sku: 'FAR-25KG-004',
        code_barre: '6190011000041',
        nom: 'Farine de Blé 25kg',
        description: 'Farine boulangere premium',
        categorie_id: categoryBySlug.get('alimentation') ?? defaultCategoryId,
        fournisseur_id: defaultFournisseurId,
        prix_achat: 7200,
        prix_vente: 9000,
        tva_pourcentage: 18,
        unite: 'sac',
        stock_actuel: 178,
        stock_minimum: 40,
        statut: 'actif'
      },
      {
        sku: 'LAIT-2KG-005',
        code_barre: '6190011000058',
        nom: 'Lait en Poudre 2kg',
        description: 'Lait en poudre enrichi',
        categorie_id: categoryBySlug.get('alimentation') ?? defaultCategoryId,
        fournisseur_id: defaultFournisseurId,
        prix_achat: 4500,
        prix_vente: 5800,
        tva_pourcentage: 18,
        unite: 'boite',
        stock_actuel: 12,
        stock_minimum: 20,
        statut: 'actif'
      },
      {
        sku: 'COC-33CL-006',
        code_barre: '6190011000065',
        nom: 'Coca-Cola 33cl (pack 24)',
        description: 'Boisson gazeuse pack 24',
        categorie_id: categoryBySlug.get('boissons') ?? defaultCategoryId,
        fournisseur_id: defaultFournisseurId,
        prix_achat: 4800,
        prix_vente: 6500,
        tva_pourcentage: 18,
        unite: 'pack',
        stock_actuel: 89,
        stock_minimum: 30,
        statut: 'actif'
      },
      {
        sku: 'EAU-1.5L-007',
        code_barre: '6190011000072',
        nom: 'Eau Minerale 1.5L (pack 6)',
        description: 'Eau minérale pack 6 bouteilles',
        categorie_id: categoryBySlug.get('boissons') ?? defaultCategoryId,
        fournisseur_id: defaultFournisseurId,
        prix_achat: 1200,
        prix_vente: 1800,
        tva_pourcentage: 18,
        unite: 'pack',
        stock_actuel: 156,
        stock_minimum: 40,
        statut: 'actif'
      },
      {
        sku: 'TEL-SAM-A14',
        code_barre: '6190011000089',
        nom: 'Téléphone Portable Samsung A14',
        description: 'Smartphone Samsung A14',
        categorie_id: categoryBySlug.get('electronique') ?? defaultCategoryId,
        fournisseur_id: defaultFournisseurId,
        prix_achat: 85000,
        prix_vente: 105000,
        tva_pourcentage: 18,
        unite: 'unite',
        stock_actuel: 8,
        stock_minimum: 5,
        statut: 'actif'
      },
      {
        sku: 'PAG-WAX-6Y',
        code_barre: '6190011000201',
        nom: 'Pagne Wax Premium 6 yards',
        description: 'Tissu wax premium',
        categorie_id: categoryBySlug.get('textile') ?? defaultCategoryId,
        fournisseur_id: defaultFournisseurId,
        prix_achat: 12000,
        prix_vente: 16500,
        tva_pourcentage: 18,
        unite: 'piece',
        stock_actuel: 60,
        stock_minimum: 20,
        statut: 'actif'
      },
      {
        sku: 'CHR-USBC-20W',
        code_barre: '6190011000202',
        nom: 'Chargeur USB-C 20W',
        description: 'Chargeur rapide USB-C',
        categorie_id: categoryBySlug.get('electronique') ?? defaultCategoryId,
        fournisseur_id: defaultFournisseurId,
        prix_achat: 3200,
        prix_vente: 4500,
        tva_pourcentage: 18,
        unite: 'unite',
        stock_actuel: 110,
        stock_minimum: 25,
        statut: 'actif'
      }
    ];

    for (const produit of demoProduits) {
      if (!existingBySku.has(produit.sku.toLowerCase())) {
        this.db.create('produits', produit);
      }
    }
  }

  private ensureDemoMouvements(): void {
    const produits = this.db.getCollection('produits');
    const idByName = new Map(produits.map((item) => [item.nom.toLowerCase(), item.id]));

    const existing = this.db.getCollection('mouvements_stock');
    const existingRefs = new Set(existing.map((item) => `${item.reference_document}|${item.produit_id}`.toLowerCase()));

    const demoMoves: Array<Omit<MouvementStock, 'id'>> = [
      {
        produit_id: idByName.get('riz brise 25kg') ?? 0,
        type_mouvement: 'sortie',
        quantite: 50,
        date_mouvement: '2026-04-24T14:30:00',
        reference_document: 'FAC-2024-089',
        commentaire: 'Sortie vente'
      },
      {
        produit_id: idByName.get('huile végétale 5l') ?? idByName.get('huile vegetale 5l') ?? 0,
        type_mouvement: 'entree',
        quantite: 120,
        date_mouvement: '2026-04-24T11:15:00',
        reference_document: 'ACH-2024-045',
        commentaire: 'Réception achat'
      },
      {
        produit_id: idByName.get('sucre cristallisé 50kg') ?? idByName.get('sucre cristallise 50kg') ?? 0,
        type_mouvement: 'sortie',
        quantite: 25,
        date_mouvement: '2026-04-23T16:45:00',
        reference_document: 'FAC-2024-088',
        commentaire: 'Sortie vente'
      },
      {
        produit_id: idByName.get('farine de blé 25kg') ?? idByName.get('farine de ble 25kg') ?? 0,
        type_mouvement: 'entree',
        quantite: 80,
        date_mouvement: '2026-04-23T09:00:00',
        reference_document: 'ACH-2024-044',
        commentaire: 'Réception achat'
      },
      {
        produit_id: idByName.get('lait en poudre 2kg') ?? 0,
        type_mouvement: 'ajustement',
        quantite: 3,
        date_mouvement: '2026-04-22T15:20:00',
        reference_document: 'INV-2024-012',
        commentaire: 'Ajustement inventaire'
      },
      {
        produit_id: idByName.get('coca-cola 33cl (pack 24)') ?? 0,
        type_mouvement: 'sortie',
        quantite: 15,
        date_mouvement: '2026-04-22T10:30:00',
        reference_document: 'FAC-2024-087',
        commentaire: 'Sortie vente'
      },
      {
        produit_id: idByName.get('téléphone portable samsung a14') ?? idByName.get('telephone portable samsung a14') ?? 0,
        type_mouvement: 'entree',
        quantite: 20,
        date_mouvement: '2026-04-21T14:00:00',
        reference_document: 'ACH-2024-043',
        commentaire: 'Réception achat'
      },
      {
        produit_id: idByName.get('pagne wax premium 6 yards') ?? 0,
        type_mouvement: 'sortie',
        quantite: 8,
        date_mouvement: '2026-04-21T08:45:00',
        reference_document: 'FAC-2024-086',
        commentaire: 'Sortie vente'
      },
      {
        produit_id: idByName.get('chargeur usb-c 20w') ?? 0,
        type_mouvement: 'entree',
        quantite: 50,
        date_mouvement: '2026-04-20T16:00:00',
        reference_document: 'ACH-2024-042',
        commentaire: 'Réception achat'
      },
      {
        produit_id: idByName.get('eau minérale 1.5l (pack 6)') ?? idByName.get('eau minerale 1.5l (pack 6)') ?? 0,
        type_mouvement: 'sortie',
        quantite: 30,
        date_mouvement: '2026-04-20T11:30:00',
        reference_document: 'FAC-2024-085',
        commentaire: 'Sortie vente'
      }
    ];

    for (const move of demoMoves) {
      if (!move.produit_id) {
        continue;
      }

      const key = `${move.reference_document}|${move.produit_id}`.toLowerCase();
      if (existingRefs.has(key)) {
        continue;
      }

      this.db.addMouvementStock(move);
    }
  }
}
