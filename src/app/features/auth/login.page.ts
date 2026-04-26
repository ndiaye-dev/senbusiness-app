import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { MockDbService } from '../../core/services/mock-db.service';

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

  readonly errorMessage = signal('');
  readonly loading = signal(false);

  readonly form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    mot_de_passe: ['', [Validators.required, Validators.minLength(6)]]
  });

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.errorMessage.set('');

    const email = this.form.controls.email.value ?? '';
    const motDePasse = this.form.controls.mot_de_passe.value ?? '';
    const result = this.authService.login(email, motDePasse);

    if (!result.success) {
      this.loading.set(false);
      this.errorMessage.set(result.error ?? 'Échec de connexion');
      return;
    }

    this.loading.set(false);
    void this.router.navigate(['/dashboard']);
  }

  resetDemoData(): void {
    this.db.resetSeed();
    this.errorMessage.set('Base de démonstration réinitialisée.');
  }
}
