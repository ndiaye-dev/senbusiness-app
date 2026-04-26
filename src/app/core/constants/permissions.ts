import { Role } from '../models/entities';

export type FeatureKey =
  | 'dashboard'
  | 'clients'
  | 'fournisseurs'
  | 'categories'
  | 'produits'
  | 'stock'
  | 'devis'
  | 'factures'
  | 'paiements'
  | 'achats'
  | 'depenses'
  | 'utilisateurs';

export interface FeaturePermissions {
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
}

const none: FeaturePermissions = {
  can_view: false,
  can_create: false,
  can_edit: false,
  can_delete: false
};

export const PERMISSIONS_BY_ROLE: Record<Role, Record<FeatureKey, FeaturePermissions>> = {
  administrateur: {
    dashboard: { can_view: true, can_create: true, can_edit: true, can_delete: true },
    clients: { can_view: true, can_create: true, can_edit: true, can_delete: true },
    fournisseurs: { can_view: true, can_create: true, can_edit: true, can_delete: true },
    categories: { can_view: true, can_create: true, can_edit: true, can_delete: true },
    produits: { can_view: true, can_create: true, can_edit: true, can_delete: true },
    stock: { can_view: true, can_create: true, can_edit: true, can_delete: true },
    devis: { can_view: true, can_create: true, can_edit: true, can_delete: true },
    factures: { can_view: true, can_create: true, can_edit: true, can_delete: true },
    paiements: { can_view: true, can_create: true, can_edit: true, can_delete: true },
    achats: { can_view: true, can_create: true, can_edit: true, can_delete: true },
    depenses: { can_view: true, can_create: true, can_edit: true, can_delete: true },
    utilisateurs: { can_view: true, can_create: true, can_edit: true, can_delete: true }
  },
  gestionnaire_commercial: {
    dashboard: { can_view: true, can_create: false, can_edit: false, can_delete: false },
    clients: { can_view: true, can_create: true, can_edit: true, can_delete: false },
    fournisseurs: none,
    categories: { can_view: true, can_create: false, can_edit: false, can_delete: false },
    produits: { can_view: true, can_create: true, can_edit: true, can_delete: false },
    stock: none,
    devis: { can_view: true, can_create: true, can_edit: true, can_delete: false },
    factures: { can_view: true, can_create: true, can_edit: true, can_delete: false },
    paiements: { can_view: true, can_create: true, can_edit: true, can_delete: false },
    achats: none,
    depenses: { can_view: true, can_create: true, can_edit: true, can_delete: false },
    utilisateurs: none
  },
  caissier: {
    dashboard: none,
    clients: { can_view: true, can_create: false, can_edit: false, can_delete: false },
    fournisseurs: none,
    categories: none,
    produits: { can_view: true, can_create: false, can_edit: false, can_delete: false },
    stock: none,
    devis: none,
    factures: { can_view: true, can_create: true, can_edit: true, can_delete: false },
    paiements: { can_view: true, can_create: true, can_edit: true, can_delete: false },
    achats: none,
    depenses: none,
    utilisateurs: none
  },
  magasinier: {
    dashboard: none,
    clients: none,
    fournisseurs: { can_view: true, can_create: true, can_edit: true, can_delete: false },
    categories: { can_view: true, can_create: true, can_edit: true, can_delete: false },
    produits: { can_view: true, can_create: true, can_edit: true, can_delete: false },
    stock: { can_view: true, can_create: true, can_edit: true, can_delete: false },
    devis: none,
    factures: none,
    paiements: none,
    achats: { can_view: true, can_create: true, can_edit: true, can_delete: false },
    depenses: none,
    utilisateurs: none
  }
};

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  dashboard: 'Tableau de bord',
  clients: 'Clients',
  fournisseurs: 'Fournisseurs',
  categories: 'Catégories',
  produits: 'Produits',
  stock: 'Stock',
  devis: 'Devis',
  factures: 'Factures',
  paiements: 'Paiements',
  achats: 'Achats',
  depenses: 'Dépenses',
  utilisateurs: 'Utilisateurs'
};
