import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { FeatureKey } from '../../core/constants/permissions';
import { Categorie, Produit } from '../../core/models/entities';
import { AuthService } from '../../core/services/auth.service';
import { MockDbService } from '../../core/services/mock-db.service';
import { FormModalComponent } from '../../shared/components/form-modal/form-modal.component';
import { paginate } from '../../shared/utils/list-helpers';

type CategoryTone = 'orange' | 'blue' | 'purple' | 'pink' | 'slate' | 'teal' | 'rose' | 'emerald';

interface CategoryVisual {
  icon: string;
  tone: CategoryTone;
  produits: number;
}

interface CategoryRow {
  id: number;
  nom: string;
  description: string;
  statut: Categorie['statut'];
  produits: number;
  icon: string;
  tone: CategoryTone;
}

const CATEGORY_META: Record<string, CategoryVisual> = {
  alimentation: { icon: 'restaurant', tone: 'orange', produits: 45 },
  boissons: { icon: 'local_bar', tone: 'blue', produits: 23 },
  electronique: { icon: 'devices', tone: 'purple', produits: 18 },
  textile: { icon: 'checkroom', tone: 'pink', produits: 32 },
  fournitures_bureau: { icon: 'content_cut', tone: 'slate', produits: 56 },
  materiel_industriel: { icon: 'construction', tone: 'slate', produits: 12 },
  emballages: { icon: 'deployed_code', tone: 'teal', produits: 28 },
  cosmetiques: { icon: 'spa', tone: 'rose', produits: 15 }
};

const CATEGORY_ORDER = [
  'alimentation',
  'boissons',
  'electronique',
  'textile',
  'fournitures_bureau',
  'materiel_industriel',
  'emballages',
  'cosmetiques'
];

@Component({
  selector: 'app-categories-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormModalComponent],
  templateUrl: './categories.page.html',
  styleUrl: './categories.page.scss'
})
export class CategoriesPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly db = inject(MockDbService);
  private readonly auth = inject(AuthService);
  private readonly featureKey: FeatureKey = 'categories';

  readonly loading = signal(false);
  readonly errorMessage = signal('');
  readonly search = signal('');
  readonly statusFilter = signal<'tous' | Categorie['statut']>('tous');

  readonly page = signal(1);
  readonly pageSize = 8;

  readonly categories = signal<Categorie[]>([]);
  readonly produits = signal<Produit[]>([]);

  readonly isModalOpen = signal(false);
  readonly editingId = signal<number | null>(null);

  readonly form = this.fb.group({
    nom: ['', [Validators.required, Validators.minLength(2)]],
    description: [''],
    statut: ['actif', Validators.required]
  });

  readonly canCreate = computed(() => this.auth.can(this.featureKey, 'can_create'));
  readonly canEdit = computed(() => this.auth.can(this.featureKey, 'can_edit'));
  readonly canDelete = computed(() => this.auth.can(this.featureKey, 'can_delete'));

  readonly filtered = computed(() => {
    const query = this.search().trim().toLowerCase();

    const filtered = this.categories().filter((item) => {
      const matchesSearch =
        !query || `${item.nom} ${item.description} ${item.statut}`.toLowerCase().includes(query);

      const matchesStatus = this.statusFilter() === 'tous' || item.statut === this.statusFilter();
      return matchesSearch && matchesStatus;
    });

    const rank = new Map(CATEGORY_ORDER.map((name, index) => [name, index]));

    return filtered.sort((a, b) => {
      const slugA = this.slugify(a.nom);
      const slugB = this.slugify(b.nom);
      const rankA = rank.get(slugA);
      const rankB = rank.get(slugB);

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

  readonly rows = computed<CategoryRow[]>(() =>
    this.paginated().items.map((item) => {
      const visual = this.resolveVisual(item);
      return {
        id: item.id,
        nom: item.nom,
        description: item.description,
        statut: item.statut,
        produits: visual.produits,
        icon: visual.icon,
        tone: visual.tone
      };
    })
  );

  readonly stats = computed(() => {
    const all = this.categories();
    const actifs = all.filter((item) => item.statut === 'actif').length;
    const inactifs = all.filter((item) => item.statut === 'inactif').length;

    const totalProduits = all.reduce((sum, item) => sum + this.resolveVisual(item).produits, 0);

    return {
      total: all.length,
      actifs,
      inactifs,
      totalProduits
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
      this.categories.set(this.db.getCollection('categories'));
      this.produits.set(this.db.getCollection('produits'));
    } catch {
      this.errorMessage.set('Impossible de charger les catégories.');
    } finally {
      this.loading.set(false);
    }
  }

  onSearch(value: string): void {
    this.search.set(value);
    this.page.set(1);
  }

  onStatusFilter(value: string): void {
    this.statusFilter.set((value as 'tous' | Categorie['statut']) ?? 'tous');
    this.page.set(1);
  }

  openCreateModal(): void {
    this.editingId.set(null);
    this.form.reset({ nom: '', description: '', statut: 'actif' });
    this.isModalOpen.set(true);
  }

  openEditModalById(id: number): void {
    const category = this.categories().find((item) => item.id === id);
    if (!category) {
      return;
    }

    this.editingId.set(category.id);
    this.form.reset({
      nom: category.nom,
      description: category.description,
      statut: category.statut
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

    if (this.editingId()) {
      this.db.update('categories', this.editingId() as number, values);
    } else {
      this.db.create('categories', values);
    }

    this.closeModal();
    this.loadData();
  }

  removeById(id: number): void {
    const category = this.categories().find((item) => item.id === id);
    if (!category) {
      return;
    }

    const ok = window.confirm(`Supprimer la catégorie ${category.nom} ?`);
    if (!ok) {
      return;
    }

    this.db.delete('categories', category.id);
    this.loadData();
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

  private resolveVisual(category: Categorie): CategoryVisual {
    const key = this.slugify(category.nom);
    const meta = CATEGORY_META[key];
    const produitsReels = this.produits().filter((produit) => produit.categorie_id === category.id).length;

    if (meta) {
      return {
        icon: meta.icon,
        tone: meta.tone,
        produits: Math.max(meta.produits, produitsReels)
      };
    }

    const tones: CategoryTone[] = ['emerald', 'blue', 'orange', 'purple', 'teal', 'rose', 'pink', 'slate'];
    return {
      icon: 'category',
      tone: tones[category.id % tones.length],
      produits: produitsReels
    };
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
    const current = this.db.getCollection('categories');
    const byName = new Map(current.map((category) => [this.slugify(category.nom), category]));

    const legacyMap: Array<{ legacy: string; replacement: Omit<Categorie, 'id'> }> = [
      {
        legacy: 'informatique',
        replacement: { nom: 'Alimentation', description: 'Produits alimentaires de base', statut: 'actif' }
      },
      {
        legacy: 'bureautique',
        replacement: { nom: 'Boissons', description: 'Boissons et liquides', statut: 'actif' }
      },
      {
        legacy: 'electricite',
        replacement: { nom: 'Electronique', description: 'Appareils electroniques et accessoires', statut: 'actif' }
      },
      {
        legacy: 'agroalimentaire',
        replacement: { nom: 'Textile', description: 'Vetements et tissus', statut: 'actif' }
      }
    ];

    for (const mapItem of legacyMap) {
      const legacy = byName.get(mapItem.legacy);
      const replacementKey = this.slugify(mapItem.replacement.nom);
      const replacementExists = byName.get(replacementKey);

      if (legacy && !replacementExists) {
        this.db.update('categories', legacy.id, mapItem.replacement);
      }
    }

    const refresh = this.db.getCollection('categories');
    const refreshedByName = new Set(refresh.map((item) => this.slugify(item.nom)));

    const demoCategories: Array<Omit<Categorie, 'id'>> = [
      { nom: 'Alimentation', description: 'Produits alimentaires de base', statut: 'actif' },
      { nom: 'Boissons', description: 'Boissons et liquides', statut: 'actif' },
      { nom: 'Electronique', description: 'Appareils electroniques et accessoires', statut: 'actif' },
      { nom: 'Textile', description: 'Vetements et tissus', statut: 'actif' },
      { nom: 'Fournitures Bureau', description: 'Papeterie et fournitures de bureau', statut: 'actif' },
      { nom: 'Materiel Industriel', description: 'Equipements et outils industriels', statut: 'inactif' },
      { nom: 'Emballages', description: 'Emballages et conditionnement', statut: 'actif' },
      { nom: 'Cosmetiques', description: 'Produits de beaute et soins', statut: 'actif' }
    ];

    for (const category of demoCategories) {
      const key = this.slugify(category.nom);
      if (!refreshedByName.has(key)) {
        this.db.create('categories', category);
      }
    }
  }
}
