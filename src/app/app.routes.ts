import { Routes } from '@angular/router';
import { MainLayoutComponent } from './core/layout/main-layout.component';
import { authGuard } from './core/guards/auth.guard';
import { roleGuard } from './core/guards/role.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login.page').then((m) => m.LoginPageComponent)
  },
  {
    path: '',
    component: MainLayoutComponent,
    canActivate: [authGuard],
    children: [
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'dashboard'
      },
      {
        path: 'dashboard',
        canActivate: [roleGuard],
        data: { roles: ['administrateur', 'gestionnaire_commercial'] },
        loadComponent: () => import('./features/dashboard/dashboard.page').then((m) => m.DashboardPageComponent)
      },
      {
        path: 'profil',
        loadComponent: () => import('./features/profil/profil.page').then((m) => m.ProfilPageComponent)
      },
      {
        path: 'clients',
        canActivate: [roleGuard],
        data: { roles: ['administrateur', 'gestionnaire_commercial', 'caissier'] },
        loadComponent: () => import('./features/clients/clients.page').then((m) => m.ClientsPageComponent)
      },
      {
        path: 'fournisseurs',
        canActivate: [roleGuard],
        data: { roles: ['administrateur', 'magasinier'] },
        loadComponent: () => import('./features/fournisseurs/fournisseurs.page').then((m) => m.FournisseursPageComponent)
      },
      {
        path: 'categories',
        canActivate: [roleGuard],
        data: { roles: ['administrateur', 'magasinier', 'gestionnaire_commercial'] },
        loadComponent: () => import('./features/categories/categories.page').then((m) => m.CategoriesPageComponent)
      },
      {
        path: 'produits',
        canActivate: [roleGuard],
        data: { roles: ['administrateur', 'gestionnaire_commercial', 'caissier', 'magasinier'] },
        loadComponent: () => import('./features/produits/produits.page').then((m) => m.ProduitsPageComponent)
      },
      {
        path: 'stock',
        canActivate: [roleGuard],
        data: { roles: ['administrateur', 'magasinier'] },
        loadComponent: () => import('./features/stock/stock.page').then((m) => m.StockPageComponent)
      },
      {
        path: 'devis',
        canActivate: [roleGuard],
        data: { roles: ['administrateur', 'gestionnaire_commercial'] },
        loadComponent: () => import('./features/devis/devis.page').then((m) => m.DevisPageComponent)
      },
      {
        path: 'factures',
        canActivate: [roleGuard],
        data: { roles: ['administrateur', 'gestionnaire_commercial', 'caissier'] },
        loadComponent: () => import('./features/factures/factures.page').then((m) => m.FacturesPageComponent)
      },
      {
        path: 'paiements',
        canActivate: [roleGuard],
        data: { roles: ['administrateur', 'gestionnaire_commercial', 'caissier'] },
        loadComponent: () => import('./features/paiements/paiements.page').then((m) => m.PaiementsPageComponent)
      },
      {
        path: 'achats',
        canActivate: [roleGuard],
        data: { roles: ['administrateur', 'magasinier'] },
        loadComponent: () => import('./features/achats/achats.page').then((m) => m.AchatsPageComponent)
      },
      {
        path: 'depenses',
        canActivate: [roleGuard],
        data: { roles: ['administrateur', 'gestionnaire_commercial'] },
        loadComponent: () => import('./features/depenses/depenses.page').then((m) => m.DepensesPageComponent)
      },
      {
        path: 'utilisateurs',
        canActivate: [roleGuard],
        data: { roles: ['administrateur'] },
        loadComponent: () => import('./features/utilisateurs/utilisateurs.page').then((m) => m.UtilisateursPageComponent)
      }
    ]
  },
  {
    path: '**',
    redirectTo: '/dashboard'
  }
];
