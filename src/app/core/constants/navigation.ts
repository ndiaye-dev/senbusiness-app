import { Role } from '../models/entities';

export interface NavItem {
  label: string;
  section: 'principal' | 'ventes' | 'catalogue' | 'achats' | 'administration';
  route: string;
  icon: string;
  roles: Role[];
}

export const NAV_ITEMS: NavItem[] = [
  {
    label: 'Tableau de bord',
    section: 'principal',
    route: '/dashboard',
    icon: 'space_dashboard',
    roles: ['administrateur', 'gestionnaire_commercial']
  },
  {
    label: 'Clients',
    section: 'ventes',
    route: '/clients',
    icon: 'person',
    roles: ['administrateur', 'gestionnaire_commercial', 'caissier']
  },
  {
    label: 'Devis',
    section: 'ventes',
    route: '/devis',
    icon: 'description',
    roles: ['administrateur', 'gestionnaire_commercial']
  },
  {
    label: 'Factures',
    section: 'ventes',
    route: '/factures',
    icon: 'receipt_long',
    roles: ['administrateur', 'gestionnaire_commercial', 'caissier']
  },
  {
    label: 'Paiements',
    section: 'ventes',
    route: '/paiements',
    icon: 'credit_card',
    roles: ['administrateur', 'gestionnaire_commercial', 'caissier']
  },
  {
    label: 'Catégories',
    section: 'catalogue',
    route: '/categories',
    icon: 'sell',
    roles: ['administrateur', 'magasinier', 'gestionnaire_commercial']
  },
  {
    label: 'Produits',
    section: 'catalogue',
    route: '/produits',
    icon: 'deployed_code',
    roles: ['administrateur', 'gestionnaire_commercial', 'caissier', 'magasinier']
  },
  {
    label: 'Stock',
    section: 'catalogue',
    route: '/stock',
    icon: 'inventory_2',
    roles: ['administrateur', 'magasinier']
  },
  {
    label: 'Fournisseurs',
    section: 'achats',
    route: '/fournisseurs',
    icon: 'local_shipping',
    roles: ['administrateur', 'magasinier']
  },
  {
    label: 'Achats',
    section: 'achats',
    route: '/achats',
    icon: 'shopping_cart',
    roles: ['administrateur', 'magasinier']
  },
  {
    label: 'Dépenses',
    section: 'achats',
    route: '/depenses',
    icon: 'account_balance_wallet',
    roles: ['administrateur', 'gestionnaire_commercial']
  },
  {
    label: 'Utilisateurs',
    section: 'administration',
    route: '/utilisateurs',
    icon: 'manage_accounts',
    roles: ['administrateur']
  }
];
