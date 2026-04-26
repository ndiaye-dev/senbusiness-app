import { CommonModule } from '@angular/common';
import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { NAV_ITEMS } from '../constants/navigation';
import { ROLE_LABELS } from '../constants/roles';
import { AuthService } from '../services/auth.service';
import { MockDbService } from '../services/mock-db.service';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './main-layout.component.html',
  styleUrl: './main-layout.component.scss'
})
export class MainLayoutComponent {
  private readonly authService = inject(AuthService);
  private readonly db = inject(MockDbService);
  private readonly router = inject(Router);

  readonly sectionLabels: Record<string, string> = {
    principal: 'PRINCIPAL',
    ventes: 'VENTES',
    catalogue: 'CATALOGUE',
    achats: 'ACHATS',
    administration: 'ADMINISTRATION'
  };

  readonly isSidebarOpen = signal(false);
  readonly isUserMenuOpen = signal(false);
  readonly isHelpOpen = signal(false);
  readonly globalQuery = signal('');
  readonly currentRoute = signal('/dashboard');

  readonly currentUser = this.authService.currentUser;

  readonly navItems = computed(() => {
    const role = this.authService.role();
    if (!role) {
      return [];
    }

    return NAV_ITEMS.filter((item) => item.roles.includes(role));
  });

  readonly navSections = computed(() =>
    ['principal', 'ventes', 'catalogue', 'achats', 'administration']
      .map((section) => ({
        key: section,
        label: this.sectionLabels[section],
        items: this.navItems().filter((item) => item.section === section)
      }))
      .filter((section) => section.items.length > 0)
  );

  readonly activePageTitle = computed(() => {
    if (this.currentRoute().startsWith('/profil')) {
      return 'Mon profil';
    }

    const match = this.navItems().find((item) => this.currentRoute().startsWith(item.route));
    return match?.label ?? 'SenBusiness';
  });

  readonly notificationCount = computed(() => {
    const facturesImpayees = this.db.getCollection('factures').filter((item) => item.reste_a_payer > 0).length;
    const stockFaible = this.db.getCollection('produits').filter((item) => item.stock_actuel <= item.stock_minimum).length;
    return facturesImpayees + stockFaible;
  });

  readonly badgesByRoute = computed(() => ({
    '/devis': this.db.getCollection('devis').filter((item) => ['brouillon', 'envoye'].includes(item.statut)).length,
    '/factures': this.db.getCollection('factures').filter((item) => item.reste_a_payer > 0).length,
    '/stock': this.db.getCollection('produits').filter((item) => item.stock_actuel <= item.stock_minimum).length
  }));

  readonly searchResults = computed(() => this.db.globalSearch(this.globalQuery()));

  readonly userRoleLabel = computed(() => {
    const role = this.currentUser()?.role;
    return role ? ROLE_LABELS[role] : '';
  });

  readonly userInitials = computed(() => {
    const userName = this.currentUser()?.nom_complet ?? '';
    return userName
      .split(' ')
      .map((word) => word[0] ?? '')
      .join('')
      .slice(0, 2)
      .toUpperCase();
  });

  constructor() {
    this.currentRoute.set(this.router.url || '/dashboard');
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed()
      )
      .subscribe((event) => {
        this.currentRoute.set(event.urlAfterRedirects);
        this.isUserMenuOpen.set(false);
        this.isHelpOpen.set(false);
      });
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (!target) {
      this.isUserMenuOpen.set(false);
      this.isHelpOpen.set(false);
      return;
    }

    if (!target.closest('.user-menu')) {
      this.isUserMenuOpen.set(false);
    }
    if (!target.closest('.help-menu')) {
      this.isHelpOpen.set(false);
    }
  }

  toggleSidebar(): void {
    this.isSidebarOpen.update((isOpen) => !isOpen);
  }

  closeSidebar(): void {
    this.isSidebarOpen.set(false);
  }

  onSearchChange(query: string): void {
    this.globalQuery.set(query);
  }

  goToResult(route: string): void {
    this.globalQuery.set('');
    this.isHelpOpen.set(false);
    this.isUserMenuOpen.set(false);
    this.closeSidebar();
    void this.router.navigate([route]);
  }

  openHelp(): void {
    this.isUserMenuOpen.set(false);
    this.isHelpOpen.update((state) => !state);
  }

  goToNotifications(): void {
    this.isHelpOpen.set(false);
    this.isUserMenuOpen.set(false);

    const facturesRoute = this.navItems().find((item) => item.route === '/factures');
    const stockRoute = this.navItems().find((item) => item.route === '/stock');

    if (facturesRoute && this.badgesByRoute()['/factures'] > 0) {
      void this.router.navigate(['/factures']);
      return;
    }

    if (stockRoute && this.badgesByRoute()['/stock'] > 0) {
      void this.router.navigate(['/stock']);
      return;
    }

    void this.router.navigate(['/dashboard']);
  }

  badgeFor(route: string): number | null {
    const badge = this.badgesByRoute()[route as keyof ReturnType<typeof this.badgesByRoute>];
    return badge && badge > 0 ? badge : null;
  }

  logout(): void {
    this.authService.logout();
  }

  toggleUserMenu(): void {
    this.isHelpOpen.set(false);
    this.isUserMenuOpen.update((state) => !state);
  }

  goToProfile(): void {
    this.goToResult('/profil');
  }
}
