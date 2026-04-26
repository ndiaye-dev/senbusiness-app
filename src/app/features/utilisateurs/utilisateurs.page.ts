import { CommonModule, DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { FeatureKey } from '../../core/constants/permissions';
import { Role, Utilisateur } from '../../core/models/entities';
import { AuthService } from '../../core/services/auth.service';
import { MockDbService } from '../../core/services/mock-db.service';
import { FormModalComponent } from '../../shared/components/form-modal/form-modal.component';
import { paginate } from '../../shared/utils/list-helpers';

type RoleUiTone = 'admin' | 'manager' | 'vendeur' | 'comptable';

interface UserRow {
  id: number;
  nom_complet: string;
  email: string;
  telephone: string;
  role: Role;
  role_label: string;
  role_tone: RoleUiTone;
  role_icon: string;
  statut: Utilisateur['statut'];
  initiales: string;
  avatar_tone: 'teal' | 'blue' | 'emerald' | 'orange' | 'pink';
  derniere_connexion: string | null;
}

@Component({
  selector: 'app-utilisateurs-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DatePipe, FormModalComponent],
  templateUrl: './utilisateurs.page.html',
  styleUrl: './utilisateurs.page.scss'
})
export class UtilisateursPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly db = inject(MockDbService);
  private readonly auth = inject(AuthService);
  private readonly featureKey: FeatureKey = 'utilisateurs';

  readonly loading = signal(false);
  readonly errorMessage = signal('');
  readonly actionMessage = signal('');

  readonly search = signal('');
  readonly roleFilter = signal<'tous' | Role>('tous');
  readonly statusFilter = signal<'tous' | Utilisateur['statut']>('tous');
  readonly connexionFilter = signal<'toutes' | '7j' | '30j'>('toutes');
  readonly showFilters = signal(false);

  readonly page = signal(1);
  readonly pageSize = 8;

  readonly isDetailsModalOpen = signal(false);
  readonly detailsTitle = signal('Détails');
  readonly detailsLines = signal<string[]>([]);

  readonly users = signal<Utilisateur[]>([]);

  readonly isModalOpen = signal(false);  readonly editingId = signal<number | null>(null);

  readonly form = this.fb.group({
    nom_complet: ['', [Validators.required]],
    email: ['', [Validators.required, Validators.email]],
    telephone: ['', [Validators.required]],
    role: ['gestionnaire_commercial' as Role, Validators.required],
    mot_de_passe: ['', [Validators.required, Validators.minLength(6)]],
    statut: ['actif' as Utilisateur['statut'], Validators.required],
    derniere_connexion: ['']
  });

  readonly canView = computed(() => this.auth.can(this.featureKey, 'can_view'));
  readonly canCreate = computed(() => this.auth.can(this.featureKey, 'can_create'));
  readonly canEdit = computed(() => this.auth.can(this.featureKey, 'can_edit'));
  readonly canDelete = computed(() => this.auth.can(this.featureKey, 'can_delete'));

  readonly stats = computed(() => {
    const all = this.users();
    const total = all.length;
    const actifs = all.filter((item) => item.statut === 'actif').length;
    const inactifs = all.filter((item) => item.statut === 'inactif').length;
    const admins = all.filter((item) => item.role === 'administrateur').length;
    const vendeurs = all.filter((item) => item.role === 'magasinier').length;

    return { total, actifs, inactifs, admins, vendeurs };
  });

  readonly filtered = computed(() => {
    const query = this.search().trim().toLowerCase();

    const now = new Date();
    const withinDays = (iso: string | null, days: number): boolean => {
      if (!iso) {
        return false;
      }

      const date = new Date(iso);
      const diff = now.getTime() - date.getTime();
      return diff >= 0 && diff <= days * 24 * 60 * 60 * 1000;
    };

    const filtered = this.users().filter((item) => {
      const matchesSearch =
        !query ||
        `${item.nom_complet} ${item.email} ${item.telephone} ${this.roleLabel(item.role)}`.toLowerCase().includes(query);

      const matchesRole = this.roleFilter() === 'tous' || item.role === this.roleFilter();
      const matchesStatus = this.statusFilter() === 'tous' || item.statut === this.statusFilter();

      const matchesConnexion =
        this.connexionFilter() === 'toutes' ||
        (this.connexionFilter() === '7j' && withinDays(item.derniere_connexion, 7)) ||
        (this.connexionFilter() === '30j' && withinDays(item.derniere_connexion, 30));

      return matchesSearch && matchesRole && matchesStatus && matchesConnexion;
    });

    return filtered.sort((a, b) => {
      if (a.derniere_connexion && b.derniere_connexion) {
        return b.derniere_connexion.localeCompare(a.derniere_connexion);
      }
      if (a.derniere_connexion) {
        return -1;
      }
      if (b.derniere_connexion) {
        return 1;
      }
      return a.nom_complet.localeCompare(b.nom_complet, 'fr');
    });
  });

  readonly paginated = computed(() => paginate(this.filtered(), this.page(), this.pageSize));

  readonly rows = computed<UserRow[]>(() => {
    const tones: UserRow['avatar_tone'][] = ['teal', 'blue', 'emerald', 'orange', 'pink'];

    return this.paginated().items.map((item, index) => ({
      id: item.id,
      nom_complet: item.nom_complet,
      email: item.email,
      telephone: item.telephone,
      role: item.role,
      role_label: this.roleLabel(item.role),
      role_tone: this.roleTone(item.role),
      role_icon: this.roleIcon(item.role),
      statut: item.statut,
      initiales: this.initiales(item.nom_complet),
      avatar_tone: tones[(item.id + index) % tones.length],
      derniere_connexion: item.derniere_connexion
    }));
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
      this.ensureDemoUsers();
      this.users.set(this.db.getCollection('utilisateurs'));
    } catch {
      this.errorMessage.set('Impossible de charger les utilisateurs.');
    } finally {
      this.loading.set(false);
    }
  }

  onSearch(value: string): void {
    this.search.set(value);
    this.page.set(1);
  }

  onRoleFilter(value: string): void {
    this.roleFilter.set((value as 'tous' | Role) ?? 'tous');
    this.page.set(1);
  }

  onStatusFilter(value: string): void {
    this.statusFilter.set((value as 'tous' | Utilisateur['statut']) ?? 'tous');
    this.page.set(1);
  }

  onConnexionFilter(value: string): void {
    this.connexionFilter.set((value as 'toutes' | '7j' | '30j') ?? 'toutes');
    this.page.set(1);
  }

  toggleFilters(): void {
    this.showFilters.update((state) => !state);
  }

  resetFilters(): void {
    this.search.set('');
    this.roleFilter.set('tous');
    this.statusFilter.set('tous');
    this.connexionFilter.set('toutes');
    this.page.set(1);
  }

  openCreateModal(): void {
    this.editingId.set(null);
    this.actionMessage.set('');

    this.form.reset({
      nom_complet: '',
      email: '',
      telephone: '',
      role: 'gestionnaire_commercial',
      mot_de_passe: '',
      statut: 'actif',
      derniere_connexion: ''
    });

    this.isModalOpen.set(true);
  }

  openEditModalById(id: number): void {
    const item = this.users().find((entry) => entry.id === id);
    if (!item) {
      return;
    }

    this.editingId.set(item.id);
    this.actionMessage.set('');
    this.form.reset({
      nom_complet: item.nom_complet,
      email: item.email,
      telephone: item.telephone,
      role: item.role,
      mot_de_passe: item.mot_de_passe,
      statut: item.statut,
      derniere_connexion: item.derniere_connexion ? item.derniere_connexion.slice(0, 16) : ''
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
    const payload = {
      nom_complet: values.nom_complet,
      email: values.email,
      telephone: values.telephone,
      role: values.role as Role,
      mot_de_passe: values.mot_de_passe,
      statut: values.statut as Utilisateur['statut'],
      derniere_connexion: values.derniere_connexion ? new Date(values.derniere_connexion).toISOString() : null
    };

    if (this.editingId()) {
      this.db.update('utilisateurs', this.editingId() as number, payload);
      this.actionMessage.set('Utilisateur mis à jour avec succès.');
    } else {
      this.db.create('utilisateurs', payload);
      this.actionMessage.set('Utilisateur créé avec succès.');
    }

    this.closeModal();
    this.loadData();
  }

  viewById(id: number): void {
    const item = this.users().find((entry) => entry.id === id);
    if (!item) {
      return;
    }

    const details = [
      `Utilisateur: ${item.nom_complet}`,
      `Email: ${item.email}`,
      `Téléphone: ${item.telephone}`,
      `Rôle: ${this.roleLabel(item.role)}`,
      `Statut: ${item.statut === 'actif' ? 'Actif' : 'Inactif'}`,
      `Dernière connexion: ${item.derniere_connexion ? new Date(item.derniere_connexion).toLocaleString('fr-FR') : '-'}`
    ].join('\n');

    this.openDetailsModal('Détails', details);
  }

  removeById(id: number): void {
    const item = this.users().find((entry) => entry.id === id);
    if (!item) {
      return;
    }

    if (!window.confirm(`Supprimer l'utilisateur ${item.nom_complet} ?`)) {
      return;
    }

    this.db.delete('utilisateurs', item.id);
    this.actionMessage.set('Utilisateur supprimé avec succès.');
    this.loadData();
  }

  exportUsers(): void {
    const header = 'nom_complet,email,telephone,role,statut,derniere_connexion';
    const lines = this.filtered().map((item) =>
      [
        item.nom_complet,
        item.email,
        item.telephone,
        this.roleLabel(item.role),
        item.statut,
        item.derniere_connexion ?? ''
      ]
        .map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`)
        .join(',')
    );

    const csv = [header, ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `senbusiness-utilisateurs-${new Date().toISOString().slice(0, 10)}.csv`;
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

  roleLabel(role: Role): string {
    switch (role) {
      case 'administrateur':
        return 'Administrateur';
      case 'gestionnaire_commercial':
        return 'Manager';
      case 'caissier':
        return 'Comptable';
      default:
        return 'Vendeur';
    }
  }
  private roleTone(role: Role): RoleUiTone {
    switch (role) {
      case 'administrateur':
        return 'admin';
      case 'gestionnaire_commercial':
        return 'manager';
      case 'caissier':
        return 'comptable';
      default:
        return 'vendeur';
    }
  }
  private roleIcon(role: Role): string {
    switch (role) {
      case 'administrateur':
        return 'admin_panel_settings';
      case 'gestionnaire_commercial':
        return 'manage_accounts';
      case 'caissier':
        return 'point_of_sale';
      default:
        return 'person';
    }
  }
  private initiales(nomComplet: string): string {
    const parts = nomComplet.split(' ').filter(Boolean);
    return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('') || 'US';
  }
  private ensureDemoUsers(): void {
    const existing = this.db.getCollection('utilisateurs');
    const byEmail = new Map(existing.map((item) => [item.email.toLowerCase(), item]));

    const demo: Array<Omit<Utilisateur, 'id'>> = [
      {
        nom_complet: 'Amadou Diallo',
        email: 'admin@senbusiness.sn',
        telephone: '+221 77 123 45 67',
        role: 'administrateur',
        mot_de_passe: 'admin123',
        statut: 'actif',
        derniere_connexion: '2026-04-24T08:30:00.000Z'
      },
      {
        nom_complet: 'Mariam Traoré',
        email: 'manager@senbusiness.sn',
        telephone: '+221 76 234 56 78',
        role: 'gestionnaire_commercial',
        mot_de_passe: 'manager123',
        statut: 'actif',
        derniere_connexion: '2026-04-24T09:15:00.000Z'
      },
      {
        nom_complet: 'Cheikh Sarr',
        email: 'magasin@senbusiness.sn',
        telephone: '+221 70 345 67 89',
        role: 'magasinier',
        mot_de_passe: 'magasin123',
        statut: 'actif',
        derniere_connexion: '2026-04-23T16:45:00.000Z'
      },
      {
        nom_complet: 'Fatou Ba',
        email: 'caissier@senbusiness.sn',
        telephone: '+221 78 456 78 90',
        role: 'caissier',
        mot_de_passe: 'caissier123',
        statut: 'actif',
        derniere_connexion: '2026-04-24T10:00:00.000Z'
      },
      {
        nom_complet: 'Ibrahim Sow',
        email: 'ibrahim.sow@senbusiness.sn',
        telephone: '+221 77 567 89 01',
        role: 'magasinier',
        mot_de_passe: 'ibrahim123',
        statut: 'inactif',
        derniere_connexion: '2026-04-15T14:20:00.000Z'
      }
    ];

    for (const user of demo) {
      const existingUser = byEmail.get(user.email.toLowerCase());
      if (existingUser) {
        this.db.update('utilisateurs', existingUser.id, user);
      } else {
        this.db.create('utilisateurs', user);
      }
    }
  }
}


