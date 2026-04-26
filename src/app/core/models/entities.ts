export type Role = 'administrateur' | 'gestionnaire_commercial' | 'caissier' | 'magasinier';

export interface Utilisateur {
  id: number;
  nom_complet: string;
  email: string;
  telephone: string;
  role: Role;
  mot_de_passe: string;
  statut: 'actif' | 'inactif';
  derniere_connexion: string | null;
}

export interface Client {
  id: number;
  code_client: string;
  type_client: 'particulier' | 'entreprise';
  nom: string;
  prenom: string;
  raison_sociale: string;
  telephone: string;
  email: string;
  adresse: string;
  ville: string;
  region: string;
  ninea: string;
  plafond_credit: number;
  statut: 'actif' | 'inactif';
}

export interface Fournisseur {
  id: number;
  code_fournisseur: string;
  raison_sociale: string;
  contact_nom: string;
  telephone: string;
  email: string;
  adresse: string;
  ville: string;
  ninea: string;
  delai_paiement_jours: number;
  statut: 'actif' | 'inactif';
}

export interface Categorie {
  id: number;
  nom: string;
  description: string;
  statut: 'actif' | 'inactif';
}

export interface Produit {
  id: number;
  sku: string;
  code_barre: string;
  nom: string;
  description: string;
  categorie_id: number;
  fournisseur_id: number;
  prix_achat: number;
  prix_vente: number;
  tva_pourcentage: number;
  unite: string;
  stock_actuel: number;
  stock_minimum: number;
  statut: 'actif' | 'inactif';
}

export interface MouvementStock {
  id: number;
  produit_id: number;
  type_mouvement: 'entree' | 'sortie' | 'ajustement';
  quantite: number;
  date_mouvement: string;
  reference_document: string;
  commentaire: string;
}

export interface Devis {
  id: number;
  client_id: number;
  numero_devis: string;
  date_devis: string;
  date_expiration: string;
  statut: 'brouillon' | 'envoye' | 'accepte' | 'refuse' | 'expire';
  remise_globale: number;
  total_ht: number;
  total_tva: number;
  total_ttc: number;
}

export interface DevisLigne {
  id: number;
  devis_id: number;
  produit_id: number;
  quantite: number;
  prix_unitaire: number;
  remise_ligne: number;
  tva_pourcentage: number;
  sous_total: number;
}

export interface Facture {
  id: number;
  client_id: number;
  devis_id: number | null;
  numero_facture: string;
  date_facture: string;
  date_echeance: string;
  statut: 'brouillon' | 'emise' | 'partiellement_payee' | 'payee' | 'annulee';
  total_ht: number;
  total_tva: number;
  total_ttc: number;
  montant_paye: number;
  reste_a_payer: number;
  mode_paiement: string;
}

export interface FactureLigne {
  id: number;
  facture_id: number;
  produit_id: number;
  quantite: number;
  prix_unitaire: number;
  remise_ligne: number;
  tva_pourcentage: number;
  sous_total: number;
}

export interface Paiement {
  id: number;
  facture_id: number;
  date_paiement: string;
  montant: number;
  mode_paiement: string;
  reference_paiement: string;
  statut: 'valide' | 'en_attente' | 'annule';
}

export interface Achat {
  id: number;
  fournisseur_id: number;
  numero_achat: string;
  date_achat: string;
  statut: 'brouillon' | 'commande' | 'reception_partielle' | 'recu' | 'annule';
  total_ht: number;
  total_tva: number;
  total_ttc: number;
}

export interface AchatLigne {
  id: number;
  achat_id: number;
  produit_id: number;
  quantite: number;
  prix_achat: number;
  tva_pourcentage: number;
  sous_total: number;
}

export interface Depense {
  id: number;
  libelle: string;
  categorie_depense: string;
  montant: number;
  date_depense: string;
  mode_paiement: string;
  justificatif: string;
  statut: 'validee' | 'en_attente' | 'annulee';
}

export interface DatabaseState {
  utilisateurs: Utilisateur[];
  clients: Client[];
  fournisseurs: Fournisseur[];
  categories: Categorie[];
  produits: Produit[];
  mouvements_stock: MouvementStock[];
  devis: Devis[];
  devis_lignes: DevisLigne[];
  factures: Facture[];
  facture_lignes: FactureLigne[];
  paiements: Paiement[];
  achats: Achat[];
  achat_lignes: AchatLigne[];
  depenses: Depense[];
}

export type CollectionName = keyof DatabaseState;

export type CollectionItem<K extends CollectionName> = DatabaseState[K] extends Array<infer T>
  ? T & { id: number }
  : never;
