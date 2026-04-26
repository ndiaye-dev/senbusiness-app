import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { MockDbService } from '../../core/services/mock-db.service';

type LoginFormControlName = 'email' | 'mot_de_passe';
type FeedbackTone = 'error' | 'success' | 'info';

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './login.page.html',
  styleUrl: './login.page.scss'
})
export class LoginPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly db = inject(MockDbService);

  readonly feedbackMessage = signal('');
  readonly feedbackTone = signal<FeedbackTone>('info');
  readonly loading = signal(false);
  readonly showPassword = signal(false);

  readonly form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    mot_de_passe: ['', [Validators.required, Validators.minLength(6)]]
  });

  isControlInvalid(controlName: LoginFormControlName): boolean {
    const control = this.form.controls[controlName];
    return Boolean(control.touched && control.invalid);
  }

  controlError(controlName: LoginFormControlName): string {
    const control = this.form.controls[controlName];
    if (!control.touched || !control.errors) {
      return '';
    }

    if (control.errors['required']) {
      return 'Ce champ est obligatoire.';
    }

    if (controlName === 'email' && control.errors['email']) {
      return 'Veuillez saisir une adresse email valide.';
    }

    if (controlName === 'mot_de_passe' && control.errors['minlength']) {
      return 'Le mot de passe doit contenir au moins 6 caractères.';
    }

    return 'Valeur invalide.';
  }

  fillDemoAccount(email: string, motDePasse: string): void {
    this.form.patchValue({ email, mot_de_passe: motDePasse });
    this.feedbackTone.set('info');
    this.feedbackMessage.set('Compte de démonstration chargé. Cliquez sur "Se connecter".');
  }

  togglePasswordVisibility(): void {
    this.showPassword.update((state) => !state);
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.feedbackTone.set('error');
      this.feedbackMessage.set('Veuillez corriger les champs obligatoires avant de continuer.');
      return;
    }

    this.loading.set(true);
    this.feedbackMessage.set('');

    const email = this.form.controls.email.value ?? '';
    const motDePasse = this.form.controls.mot_de_passe.value ?? '';
    const result = this.authService.login(email, motDePasse);

    if (!result.success) {
      this.loading.set(false);
      this.feedbackTone.set('error');
      this.feedbackMessage.set(result.error ?? 'Échec de connexion.');
      return;
    }

    this.feedbackMessage.set('');
    this.loading.set(false);
    void this.router.navigate(['/dashboard']);
  }

  resetDemoData(): void {
    this.db.resetSeed();
    this.feedbackTone.set('success');
    this.feedbackMessage.set('Base de démonstration réinitialisée.');
  }
}
