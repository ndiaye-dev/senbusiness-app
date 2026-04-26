import { Role } from '../models/entities';

export const ALL_ROLES: Role[] = [
  'administrateur',
  'gestionnaire_commercial',
  'caissier',
  'magasinier'
];

export const ROLE_LABELS: Record<Role, string> = {
  administrateur: 'Administrateur',
  gestionnaire_commercial: 'Gestionnaire commercial',
  caissier: 'Caissier',
  magasinier: 'Magasinier'
};
