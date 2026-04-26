import { Injectable, computed, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AUTH_KEY } from '../constants/seed-data';
import { FeatureKey, PERMISSIONS_BY_ROLE } from '../constants/permissions';
import { Role, Utilisateur } from '../models/entities';
import { LocalStorageService } from './local-storage.service';
import { MockDbService } from './mock-db.service';

interface AuthSession {
  utilisateur_id: number;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly _currentUser = signal<Utilisateur | null>(null);
  readonly currentUser = computed(() => this._currentUser());
  readonly isAuthenticated = computed(() => this._currentUser() !== null);

  constructor(
    private readonly storage: LocalStorageService,
    private readonly db: MockDbService,
    private readonly router: Router
  ) {
    this.restoreSession();
  }

  private restoreSession(): void {
    const session = this.storage.getItem<AuthSession>(AUTH_KEY);
    if (!session) {
      return;
    }

    const user = this.db.getById('utilisateurs', session.utilisateur_id);
    if (!user || user.statut !== 'actif') {
      this.logout(false);
      return;
    }

    this._currentUser.set(user);
  }

  login(email: string, motDePasse: string): { success: boolean; error?: string } {
    const users = this.db.getCollection('utilisateurs');
    const user = users.find(
      (candidate) =>
        candidate.email.toLowerCase() === email.toLowerCase() &&
        candidate.mot_de_passe === motDePasse &&
        candidate.statut === 'actif'
    );

    if (!user) {
      return { success: false, error: 'Identifiants invalides ou compte inactif.' };
    }

    this._currentUser.set(user);
    this.storage.setItem<AuthSession>(AUTH_KEY, { utilisateur_id: user.id });
    this.db.updateUtilisateurConnection(user);
    return { success: true };
  }

  logout(navigate = true): void {
    this._currentUser.set(null);
    this.storage.removeItem(AUTH_KEY);
    if (navigate) {
      void this.router.navigate(['/login']);
    }
  }

  refreshCurrentUser(): void {
    const user = this._currentUser();
    if (!user) {
      return;
    }

    const latest = this.db.getById('utilisateurs', user.id);
    if (!latest || latest.statut !== 'actif') {
      this.logout(false);
      return;
    }

    this._currentUser.set(latest);
  }

  updateCurrentUserProfile(payload: Partial<Pick<Utilisateur, 'nom_complet' | 'email' | 'telephone' | 'mot_de_passe'>>): {
    success: boolean;
    error?: string;
  } {
    const current = this._currentUser();
    if (!current) {
      return { success: false, error: 'Aucun utilisateur connecte.' };
    }

    const nextEmail = String(payload.email ?? current.email).trim().toLowerCase();
    const emailExists = this.db
      .getCollection('utilisateurs')
      .some((user) => user.id !== current.id && user.email.trim().toLowerCase() === nextEmail);

    if (emailExists) {
      return { success: false, error: 'Cet email est deja utilise par un autre compte.' };
    }

    this.db.update('utilisateurs', current.id, {
      nom_complet: String(payload.nom_complet ?? current.nom_complet).trim(),
      email: nextEmail,
      telephone: String(payload.telephone ?? current.telephone).trim(),
      mot_de_passe: payload.mot_de_passe ? String(payload.mot_de_passe) : current.mot_de_passe
    });

    this.refreshCurrentUser();
    return { success: true };
  }

  hasRole(roles: Role[]): boolean {
    const user = this._currentUser();
    if (!user) {
      return false;
    }

    return roles.includes(user.role);
  }

  can(feature: FeatureKey, permission: 'can_view' | 'can_create' | 'can_edit' | 'can_delete'): boolean {
    const user = this._currentUser();
    if (!user) {
      return false;
    }

    return PERMISSIONS_BY_ROLE[user.role][feature][permission];
  }

  role(): Role | null {
    return this._currentUser()?.role ?? null;
  }
}
