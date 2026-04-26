import { CommonModule, CurrencyPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { FeatureKey } from '../../core/constants/permissions';
import { Categorie, Fournisseur, Produit } from '../../core/models/entities';
import { AuthService } from '../../core/services/auth.service';
import { MockDbService } from '../../core/services/mock-db.service';
import { FormModalComponent } from '../../shared/components/form-modal/form-modal.component';
import { paginate } from '../../shared/utils/list-helpers';

type StockTone = 'ok' | 'low' | 'out';

interface ProduitRow {
  id: number;
  nom: string;
  unite: string;
  reference: string;
  categorie: string;
  prix_achat: number;
  prix_vente: number;
  stock_actuel: number;
  stock_tone: StockTone;
  statut: Produit['statut'];
}

const DEMO_ORDER = [
  'RIZ-25KG-001',
  'HUI-5L-002',
  'SUC-50KG-003',
  'FAR-25KG-004',
  'LAIT-2KG-005',
  'COC-33CL-006',
  'EAU-1.5L-007',
  'TEL-SAM-A14',
  'LAP-HP-008',
  'IMP-CAN-009',
  'HDM-2M-010',
  'ECO-BLU-011'
];

@Component({
  selector: 'app-produits-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, CurrencyPipe, FormModalComponent],
  templateUrl: './produits.page.html',
  styleUrl: './produits.page.scss'
})
export class ProduitsPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly db = inject(MockDbService);
  private readonly auth = inject(AuthService);
  private readonly featureKey: FeatureKey = 'produits';

  readonly loading = signal(false);
  readonly errorMessage = signal('');
  readonly actionMessage = signal('');

  readonly search = signal('');
  readonly categoryFilter = signal<'toutes' | number>('toutes');
  readonly statusFilter = signal<'tous' | Produit['statut']>('tous');
  readonly stockFilter = signal<'tous' | 'stock_faible' | 'rupture'>('tous');
  readonly showFilters = signal(false);

  readonly page = signal(1);
  readonly pageSize = 8;

  readonly categories = signal<Categorie[]>([]);
  readonly fournisseurs = signal<Fournisseur[]>([]);
  readonly produits = signal<Produit[]>([]);

  readonly isModalOpen = signal(false);
  readonly editingId = signal<number | null>(null);

  readonly form = this.fb.group({
    sku: ['', [Validators.required]],
    code_barre: [''],
    nom: ['', [Validators.required]],
    description: [''],
    categorie_id: [0, [Validators.required, Validators.min(1)]],
    fournisseur_id: [0, [Validators.required, Validators.min(1)]],
    prix_achat: [0, [Validators.required, Validators.min(0)]],
    prix_vente: [0, [Validators.required, Validators.min(0)]],
    tva_pourcentage: [18, [Validators.required, Validators.min(0)]],
    unite: ['piece', [Validators.required]],
    stock_actuel: [0, [Validators.required, Validators.min(0)]],
    stock_minimum: [1, [Validators.required, Validators.min(0)]],
    statut: ['actif', Validators.required]
  });

  readonly canCreate = computed(() => this.auth.can(this.featureKey, 'can_create'));
  readonly canEdit = computed(() => this.auth.can(this.featureKey, 'can_edit'));
  readonly canDelete = computed(() => this.auth.can(this.featureKey, 'can_delete'));

  readonly categoriesMap = computed(() => new Map(this.categories().map((item) => [item.id, item.nom])));
  readonly fournisseursMap = computed(() => new Map(this.fournisseurs().map((item) => [item.id, item.raison_sociale])));

  readonly stats = computed(() => {
    const rows = this.produits();
    const total = rows.length;
    const actifs = rows.filter((item) => item.statut === 'actif').length;
    const stockFaible = rows.filter((item) => item.stock_actuel > 0 && item.stock_actuel <= item.stock_minimum).length;
    const rupture = rows.filter((item) => item.stock_actuel === 0).length;
    const valeurStock = rows.reduce((sum, item) => sum + item.stock_actuel * item.prix_achat, 0);

    return {
      total,
      actifs,
      stockFaible,
      rupture,
      valeurStock
    };
  });

  readonly filtered = computed(() => {
    const query = this.search().trim().toLowerCase();

    const filtered = this.produits().filter((item) => {
      const category = this.categoriesMap().get(item.categorie_id) ?? '';

      const matchesSearch =
        !query ||
        `${item.sku} ${item.code_barre} ${item.nom} ${item.description} ${item.unite} ${category}`
          .toLowerCase()
          .includes(query);

      const matchesCategory = this.categoryFilter() === 'toutes' || item.categorie_id === this.categoryFilter();
      const matchesStatus = this.statusFilter() === 'tous' || item.statut === this.statusFilter();

      let matchesStock = true;
      if (this.stockFilter() === 'stock_faible') {
        matchesStock = item.stock_actuel > 0 && item.stock_actuel <= item.stock_minimum;
      }
      if (this.stockFilter() === 'rupture') {
        matchesStock = item.stock_actuel === 0;
      }

      return matchesSearch && matchesCategory && matchesStatus && matchesStock;
    });

    const rank = new Map(DEMO_ORDER.map((sku, index) => [sku.toLowerCase(), index]));

    return filtered.sort((a, b) => {
      const rankA = rank.get(a.sku.toLowerCase());
      const rankB = rank.get(b.sku.toLowerCase());

      if (rankA !== undefined && rankB !== undefined) {
        return rankA - rankB;
      }
      if (rankA !== undefined) {
        return -1;
      }
      if (rankB !== undefined) {
        return 1;
      }

      return a.nom.localeCompare(b.nom, 'fr');
    });
  });

  readonly paginated = computed(() => paginate(this.filtered(), this.page(), this.pageSize));

  readonly rows = computed<ProduitRow[]>(() =>
    this.paginated().items.map((item) => ({
      id: item.id,
      nom: item.nom,
      unite: item.unite,
      reference: item.sku,
      categorie: this.categoriesMap().get(item.categorie_id) ?? '-',
      prix_achat: item.prix_achat,
      prix_vente: item.prix_vente,
      stock_actuel: item.stock_actuel,
      stock_tone: this.stockTone(item),
      statut: item.statut
    }))
  );

  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.pageSize)));
  readonly pages = computed(() => Array.from({ length: this.totalPages() }, (_, index) => index + 1));
  private readonly xofFormatter = new Intl.NumberFormat('fr-FR');

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

      this.categories.set(this.db.getCollection('categories'));
      this.fournisseurs.set(this.db.getCollection('fournisseurs'));
      this.produits.set(this.db.getCollection('produits'));
    } catch {
      this.errorMessage.set('Impossible de charger les produits.');
    } finally {
      this.loading.set(false);
    }
  }

  onSearch(value: string): void {
    this.search.set(value);
    this.page.set(1);
  }

  onCategoryFilter(value: string): void {
    this.categoryFilter.set(value === 'toutes' ? 'toutes' : Number(value));
    this.page.set(1);
  }

  onStatusFilter(value: string): void {
    this.statusFilter.set((value as 'tous' | Produit['statut']) ?? 'tous');
    this.page.set(1);
  }

  onStockFilter(value: string): void {
    this.stockFilter.set((value as 'tous' | 'stock_faible' | 'rupture') ?? 'tous');
    this.page.set(1);
  }

  toggleFilters(): void {
    this.showFilters.update((state) => !state);
  }

  resetFilters(): void {
    this.search.set('');
    this.categoryFilter.set('toutes');
    this.statusFilter.set('tous');
    this.stockFilter.set('tous');
    this.page.set(1);
  }

  openCreateModal(): void {
    this.editingId.set(null);

    this.form.reset({
      sku: `PRD-${String(Date.now()).slice(-4)}`,
      code_barre: '',
      nom: '',
      description: '',
      categorie_id: this.categories()[0]?.id ?? 0,
      fournisseur_id: this.fournisseurs()[0]?.id ?? 0,
      prix_achat: 0,
      prix_vente: 0,
      tva_pourcentage: 18,
      unite: 'piece',
      stock_actuel: 0,
      stock_minimum: 1,
      statut: 'actif'
    });

    this.isModalOpen.set(true);
  }

  openEditModalById(id: number): void {
    const item = this.produits().find((entry) => entry.id === id);
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
      this.db.update('produits', this.editingId() as number, values);
    } else {
      this.db.create('produits', values);
    }

    this.closeModal();
    this.loadData();
  }

  removeById(id: number): void {
    const item = this.produits().find((entry) => entry.id === id);
    if (!item) {
      return;
    }

    if (!window.confirm(`Supprimer le produit ${item.nom} ?`)) {
      return;
    }

    this.db.delete('produits', item.id);
    this.loadData();
  }

  exportProduits(): void {
    const header = 'sku,nom,categorie,prix_achat,prix_vente,stock_actuel,stock_minimum,statut';
    const lines = this.filtered().map((item) => {
      const category = this.categoriesMap().get(item.categorie_id) ?? '-';
      return [
        item.sku,
        item.nom,
        category,
        item.prix_achat,
        item.prix_vente,
        item.stock_actuel,
        item.stock_minimum,
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
    link.download = `senbusiness-produits-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  stockLabel(tone: StockTone): string {
    switch (tone) {
      case 'out':
        return 'Rupture';
      case 'low':
        return 'Faible';
      default:
        return 'OK';
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

  formatXof(value: number): string {
    const amount = this.xofFormatter.format(Math.round(value)).replace(/[\u00a0\u202f]/g, ' ');
    return `${amount} FCFA`;
  }

  private stockTone(item: Produit): StockTone {
    if (item.stock_actuel === 0) {
      return 'out';
    }
    if (item.stock_actuel <= item.stock_minimum) {
      return 'low';
    }
    return 'ok';
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
    const existingKeys = new Set(existing.map((item) => this.slugify(item.nom)));

    const demo: Array<Omit<Categorie, 'id'>> = [
      { nom: 'Alimentation', description: 'Produits alimentaires de base', statut: 'actif' },
      { nom: 'Boissons', description: 'Boissons et liquides', statut: 'actif' },
      { nom: 'Electronique', description: 'Appareils electroniques et accessoires', statut: 'actif' },
      { nom: 'Textile', description: 'Vetements et tissus', statut: 'actif' }
    ];

    for (const category of demo) {
      const key = this.slugify(category.nom);
      if (!existingKeys.has(key)) {
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
        description: 'Riz blanc de qualite',
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
        nom: 'Huile Vegetale 5L',
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
        nom: 'Sucre Cristallise 50kg',
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
        nom: 'Farine de Ble 25kg',
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
        description: 'Eau minerale pack 6 bouteilles',
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
        nom: 'Telephone Portable Samsung A14',
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
        sku: 'LAP-HP-008',
        code_barre: '6190011000096',
        nom: 'Ordinateur Portable HP ProBook',
        description: 'Portable professionnel HP',
        categorie_id: categoryBySlug.get('electronique') ?? defaultCategoryId,
        fournisseur_id: defaultFournisseurId,
        prix_achat: 280000,
        prix_vente: 335000,
        tva_pourcentage: 18,
        unite: 'unite',
        stock_actuel: 14,
        stock_minimum: 6,
        statut: 'actif'
      },
      {
        sku: 'IMP-CAN-009',
        code_barre: '6190011000102',
        nom: 'Imprimante Laser Canon LBP',
        description: 'Imprimante laser bureautique',
        categorie_id: categoryBySlug.get('electronique') ?? defaultCategoryId,
        fournisseur_id: defaultFournisseurId,
        prix_achat: 115000,
        prix_vente: 145000,
        tva_pourcentage: 18,
        unite: 'unite',
        stock_actuel: 4,
        stock_minimum: 6,
        statut: 'actif'
      },
      {
        sku: 'HDM-2M-010',
        code_barre: '6190011000119',
        nom: 'Cable HDMI 2m',
        description: 'Cable HDMI haute vitesse',
        categorie_id: categoryBySlug.get('electronique') ?? defaultCategoryId,
        fournisseur_id: defaultFournisseurId,
        prix_achat: 2200,
        prix_vente: 3500,
        tva_pourcentage: 18,
        unite: 'unite',
        stock_actuel: 0,
        stock_minimum: 10,
        statut: 'actif'
      },
      {
        sku: 'ECO-BLU-011',
        code_barre: '6190011000126',
        nom: 'Ecouteurs Bluetooth Pro',
        description: 'Ecouteurs sans fil avec boitier',
        categorie_id: categoryBySlug.get('electronique') ?? defaultCategoryId,
        fournisseur_id: defaultFournisseurId,
        prix_achat: 9500,
        prix_vente: 13500,
        tva_pourcentage: 18,
        unite: 'unite',
        stock_actuel: 0,
        stock_minimum: 8,
        statut: 'actif'
      }
    ];

    for (const produit of demoProduits) {
      if (!existingBySku.has(produit.sku.toLowerCase())) {
        this.db.create('produits', produit);
      }
    }
  }
}
