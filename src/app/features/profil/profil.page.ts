import { CommonModule, DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ROLE_LABELS } from '../../core/constants/roles';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-profil-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DatePipe],
  templateUrl: './profil.page.html',
  styleUrl: './profil.page.scss'
})
export class ProfilPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);

  readonly errorMessage = signal('');
  readonly successMessage = signal('');
  readonly currentUser = this.auth.currentUser;
  readonly roleLabel = computed(() => {
    const role = this.currentUser()?.role;
    return role ? ROLE_LABELS[role] : '-';
  });

  readonly form = this.fb.group({
    nom_complet: ['', [Validators.required, Validators.minLength(3)]],
    email: ['', [Validators.required, Validators.email]],
    telephone: ['', [Validators.required, Validators.minLength(9)]],
    mot_de_passe: [''],
    confirmation_mot_de_passe: ['']
  });

  constructor() {
    this.hydrateForm();
  }

  private hydrateForm(): void {
    const user = this.currentUser();
    if (!user) {
      return;
    }

    this.form.reset({
      nom_complet: user.nom_complet,
      email: user.email,
      telephone: user.telephone,
      mot_de_passe: '',
      confirmation_mot_de_passe: ''
    });
  }

  save(): void {
    this.errorMessage.set('');
    this.successMessage.set('');

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.errorMessage.set('Veuillez corriger les champs obligatoires.');
      return;
    }

    const values = this.form.getRawValue();
    const password = String(values.mot_de_passe ?? '').trim();
    const confirmation = String(values.confirmation_mot_de_passe ?? '').trim();

    if (password && password.length < 6) {
      this.errorMessage.set('Le mot de passe doit contenir au moins 6 caractères.');
      return;
    }

    if (password !== confirmation) {
      this.errorMessage.set('La confirmation du mot de passe ne correspond pas.');
      return;
    }

    const result = this.auth.updateCurrentUserProfile({
      nom_complet: String(values.nom_complet ?? '').trim(),
      email: String(values.email ?? '').trim(),
      telephone: String(values.telephone ?? '').trim(),
      mot_de_passe: password || undefined
    });

    if (!result.success) {
      this.errorMessage.set(result.error ?? 'Mise à jour impossible.');
      return;
    }

    this.successMessage.set('Profil mis à jour avec succès.');
    this.hydrateForm();
  }
}
