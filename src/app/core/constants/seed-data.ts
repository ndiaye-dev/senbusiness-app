import { DatabaseState } from '../models/entities';

export const STORAGE_KEY = 'senbusiness_db_v1';
export const AUTH_KEY = 'senbusiness_auth_v1';

export const SEED_DATA: DatabaseState = {
  utilisateurs: [
    {
      id: 1,
      nom_complet: 'Aissatou Ndiaye',
      email: 'admin@senbusiness.sn',
      telephone: '+221 77 123 45 67',
      role: 'administrateur',
      mot_de_passe: 'admin123',
      statut: 'actif',
      derniere_connexion: '2026-04-24T10:12:00.000Z'
    },
    {
      id: 2,
      nom_complet: 'Mamadou Ba',
      email: 'manager@senbusiness.sn',
      telephone: '+221 76 456 78 90',
      role: 'gestionnaire_commercial',
      mot_de_passe: 'manager123',
      statut: 'actif',
      derniere_connexion: '2026-04-24T08:02:00.000Z'
    },
    {
      id: 3,
      nom_complet: 'Fatou Seck',
      email: 'caissier@senbusiness.sn',
      telephone: '+221 78 555 19 23',
      role: 'caissier',
      mot_de_passe: 'caissier123',
      statut: 'actif',
      derniere_connexion: '2026-04-23T16:45:00.000Z'
    },
    {
      id: 4,
      nom_complet: 'Ibrahima Faye',
      email: 'magasin@senbusiness.sn',
      telephone: '+221 75 991 20 44',
      role: 'magasinier',
      mot_de_passe: 'magasin123',
      statut: 'actif',
      derniere_connexion: '2026-04-24T06:30:00.000Z'
    }
  ],
  clients: [
    {
      id: 1,
      code_client: 'CLI-0001',
      type_client: 'entreprise',
      nom: '',
      prenom: '',
      raison_sociale: 'Sunu Market SARL',
      telephone: '+221 33 889 10 20',
      email: 'achats@sunumarket.sn',
      adresse: 'Avenue Cheikh Anta Diop',
      ville: 'Dakar',
      region: 'Dakar',
      ninea: 'SN-DKR-2022-B-10234',
      plafond_credit: 2500000,
      statut: 'actif'
    },
    {
      id: 2,
      code_client: 'CLI-0002',
      type_client: 'particulier',
      nom: 'Diop',
      prenom: 'Khadija',
      raison_sociale: '',
      telephone: '+221 77 301 11 90',
      email: 'khadija.diop@gmail.com',
      adresse: 'Cite Keur Gorgui',
      ville: 'Dakar',
      region: 'Dakar',
      ninea: '',
      plafond_credit: 150000,
      statut: 'actif'
    },
    {
      id: 3,
      code_client: 'CLI-0003',
      type_client: 'entreprise',
      nom: '',
      prenom: '',
      raison_sociale: 'Thies Distribution',
      telephone: '+221 33 951 20 30',
      email: 'contact@thiesdistribution.sn',
      adresse: 'Quartier Escale',
      ville: 'Thies',
      region: 'Thies',
      ninea: 'SN-THS-2021-A-56332',
      plafond_credit: 1200000,
      statut: 'actif'
    },
    {
      id: 4,
      code_client: 'CLI-0004',
      type_client: 'entreprise',
      nom: '',
      prenom: '',
      raison_sociale: 'Sahel BTP',
      telephone: '+221 33 961 70 02',
      email: 'finance@sahelbtp.sn',
      adresse: 'Route de Mbour',
      ville: 'Thies',
      region: 'Thies',
      ninea: 'SN-THS-2020-B-30012',
      plafond_credit: 3200000,
      statut: 'actif'
    },
    {
      id: 5,
      code_client: 'CLI-0005',
      type_client: 'particulier',
      nom: 'Ndao',
      prenom: 'Cheikh',
      raison_sociale: '',
      telephone: '+221 78 406 11 22',
      email: 'cheikh.ndao@yahoo.fr',
      adresse: 'Ndar Toute',
      ville: 'Saint-Louis',
      region: 'Saint-Louis',
      ninea: '',
      plafond_credit: 100000,
      statut: 'actif'
    }
  ],
  fournisseurs: [
    {
      id: 1,
      code_fournisseur: 'FRN-0001',
      raison_sociale: 'Africa Import Trading',
      contact_nom: 'Pape Sarr',
      telephone: '+221 33 864 22 11',
      email: 'commercial@africaimport.sn',
      adresse: 'Zone industrielle Mbao',
      ville: 'Dakar',
      ninea: 'SN-DKR-2019-B-19002',
      delai_paiement_jours: 30,
      statut: 'actif'
    },
    {
      id: 2,
      code_fournisseur: 'FRN-0002',
      raison_sociale: 'Casamance Agro',
      contact_nom: 'Awa Coly',
      telephone: '+221 33 991 45 18',
      email: 'ventes@casamanceagro.sn',
      adresse: 'Boudody',
      ville: 'Ziguinchor',
      ninea: 'SN-ZIG-2020-A-33020',
      delai_paiement_jours: 21,
      statut: 'actif'
    },
    {
      id: 3,
      code_fournisseur: 'FRN-0003',
      raison_sociale: 'Senelec Equipements',
      contact_nom: 'Modou Fall',
      telephone: '+221 33 867 03 90',
      email: 'pro@senelecequipements.sn',
      adresse: 'Hann Maristes',
      ville: 'Dakar',
      ninea: 'SN-DKR-2018-B-00887',
      delai_paiement_jours: 45,
      statut: 'actif'
    },
    {
      id: 4,
      code_fournisseur: 'FRN-0004',
      raison_sociale: 'Teranga Office Supplies',
      contact_nom: 'Binta Sy',
      telephone: '+221 76 899 12 33',
      email: 'commandes@terangaoffice.sn',
      adresse: 'Grand Yoff',
      ville: 'Dakar',
      ninea: 'SN-DKR-2021-C-45112',
      delai_paiement_jours: 15,
      statut: 'actif'
    }
  ],
  categories: [
    { id: 1, nom: 'Informatique', description: 'Materiels et accessoires IT', statut: 'actif' },
    { id: 2, nom: 'Bureautique', description: 'Fournitures de bureau', statut: 'actif' },
    { id: 3, nom: 'Electricite', description: 'Composants et equipements electriques', statut: 'actif' },
    { id: 4, nom: 'Agroalimentaire', description: 'Produits alimentaires conditionnes', statut: 'actif' }
  ],
  produits: [
    {
      id: 1,
      sku: 'SB-IT-001',
      code_barre: '6190010010012',
      nom: 'Onduleur 1200VA',
      description: 'Onduleur line interactive pour PME',
      categorie_id: 1,
      fournisseur_id: 3,
      prix_achat: 42000,
      prix_vente: 58000,
      tva_pourcentage: 18,
      unite: 'piece',
      stock_actuel: 14,
      stock_minimum: 8,
      statut: 'actif'
    },
    {
      id: 2,
      sku: 'SB-IT-002',
      code_barre: '6190010010029',
      nom: 'Routeur WiFi Pro',
      description: 'Routeur dual-band entreprise',
      categorie_id: 1,
      fournisseur_id: 1,
      prix_achat: 28000,
      prix_vente: 39000,
      tva_pourcentage: 18,
      unite: 'piece',
      stock_actuel: 7,
      stock_minimum: 10,
      statut: 'actif'
    },
    {
      id: 3,
      sku: 'SB-BR-001',
      code_barre: '6190010010036',
      nom: 'Ramette A4 80g',
      description: 'Papier A4 500 feuilles',
      categorie_id: 2,
      fournisseur_id: 4,
      prix_achat: 2200,
      prix_vente: 3200,
      tva_pourcentage: 18,
      unite: 'ramette',
      stock_actuel: 124,
      stock_minimum: 60,
      statut: 'actif'
    },
    {
      id: 4,
      sku: 'SB-BR-002',
      code_barre: '6190010010043',
      nom: 'Toner Laser Noir',
      description: 'Cartouche compatible HP',
      categorie_id: 2,
      fournisseur_id: 4,
      prix_achat: 11000,
      prix_vente: 17000,
      tva_pourcentage: 18,
      unite: 'piece',
      stock_actuel: 21,
      stock_minimum: 12,
      statut: 'actif'
    },
    {
      id: 5,
      sku: 'SB-EL-001',
      code_barre: '6190010010050',
      nom: 'Multiprise securisee 5 ports',
      description: 'Multiprise avec protection surtension',
      categorie_id: 3,
      fournisseur_id: 3,
      prix_achat: 5200,
      prix_vente: 8500,
      tva_pourcentage: 18,
      unite: 'piece',
      stock_actuel: 9,
      stock_minimum: 15,
      statut: 'actif'
    },
    {
      id: 6,
      sku: 'SB-AG-001',
      code_barre: '6190010010067',
      nom: 'Huile vegetale 5L',
      description: 'Bidon d\'huile vegetale premium',
      categorie_id: 4,
      fournisseur_id: 2,
      prix_achat: 7800,
      prix_vente: 9800,
      tva_pourcentage: 18,
      unite: 'bidon',
      stock_actuel: 48,
      stock_minimum: 25,
      statut: 'actif'
    }
  ],
  mouvements_stock: [
    {
      id: 1,
      produit_id: 2,
      type_mouvement: 'sortie',
      quantite: 3,
      date_mouvement: '2026-04-20',
      reference_document: 'FAC-2026-0041',
      commentaire: 'Vente client Sunu Market'
    },
    {
      id: 2,
      produit_id: 5,
      type_mouvement: 'sortie',
      quantite: 4,
      date_mouvement: '2026-04-21',
      reference_document: 'FAC-2026-0043',
      commentaire: 'Vente comptoir'
    },
    {
      id: 3,
      produit_id: 3,
      type_mouvement: 'entree',
      quantite: 50,
      date_mouvement: '2026-04-19',
      reference_document: 'ACH-2026-0018',
      commentaire: 'Reception achat'
    }
  ],
  devis: [
    {
      id: 1,
      client_id: 1,
      numero_devis: 'DEV-2026-0001',
      date_devis: '2026-04-18',
      date_expiration: '2026-05-03',
      statut: 'accepte',
      remise_globale: 5,
      total_ht: 383000,
      total_tva: 68940,
      total_ttc: 451940
    },
    {
      id: 2,
      client_id: 3,
      numero_devis: 'DEV-2026-0002',
      date_devis: '2026-04-22',
      date_expiration: '2026-05-06',
      statut: 'envoye',
      remise_globale: 0,
      total_ht: 124000,
      total_tva: 22320,
      total_ttc: 146320
    }
  ],
  devis_lignes: [
    {
      id: 1,
      devis_id: 1,
      produit_id: 1,
      quantite: 4,
      prix_unitaire: 58000,
      remise_ligne: 0,
      tva_pourcentage: 18,
      sous_total: 232000
    },
    {
      id: 2,
      devis_id: 1,
      produit_id: 2,
      quantite: 5,
      prix_unitaire: 39000,
      remise_ligne: 2,
      tva_pourcentage: 18,
      sous_total: 191100
    },
    {
      id: 3,
      devis_id: 2,
      produit_id: 4,
      quantite: 4,
      prix_unitaire: 17000,
      remise_ligne: 0,
      tva_pourcentage: 18,
      sous_total: 68000
    },
    {
      id: 4,
      devis_id: 2,
      produit_id: 5,
      quantite: 8,
      prix_unitaire: 8500,
      remise_ligne: 0,
      tva_pourcentage: 18,
      sous_total: 68000
    }
  ],
  factures: [
    {
      id: 1,
      client_id: 1,
      devis_id: 1,
      numero_facture: 'FAC-2026-0041',
      date_facture: '2026-04-20',
      date_echeance: '2026-05-05',
      statut: 'partiellement_payee',
      total_ht: 383000,
      total_tva: 68940,
      total_ttc: 451940,
      montant_paye: 200000,
      reste_a_payer: 251940,
      mode_paiement: 'virement'
    },
    {
      id: 2,
      client_id: 2,
      devis_id: null,
      numero_facture: 'FAC-2026-0043',
      date_facture: '2026-04-21',
      date_echeance: '2026-04-28',
      statut: 'emise',
      total_ht: 34000,
      total_tva: 6120,
      total_ttc: 40120,
      montant_paye: 0,
      reste_a_payer: 40120,
      mode_paiement: 'especes'
    }
  ],
  facture_lignes: [
    {
      id: 1,
      facture_id: 1,
      produit_id: 1,
      quantite: 4,
      prix_unitaire: 58000,
      remise_ligne: 0,
      tva_pourcentage: 18,
      sous_total: 232000
    },
    {
      id: 2,
      facture_id: 1,
      produit_id: 2,
      quantite: 5,
      prix_unitaire: 39000,
      remise_ligne: 2,
      tva_pourcentage: 18,
      sous_total: 191100
    },
    {
      id: 3,
      facture_id: 2,
      produit_id: 5,
      quantite: 4,
      prix_unitaire: 8500,
      remise_ligne: 0,
      tva_pourcentage: 18,
      sous_total: 34000
    }
  ],
  paiements: [
    {
      id: 1,
      facture_id: 1,
      date_paiement: '2026-04-21',
      montant: 200000,
      mode_paiement: 'virement',
      reference_paiement: 'VRM-DBK-240421',
      statut: 'valide'
    }
  ],
  achats: [
    {
      id: 1,
      fournisseur_id: 4,
      numero_achat: 'ACH-2026-0018',
      date_achat: '2026-04-19',
      statut: 'recu',
      total_ht: 110000,
      total_tva: 19800,
      total_ttc: 129800
    }
  ],
  achat_lignes: [
    {
      id: 1,
      achat_id: 1,
      produit_id: 3,
      quantite: 50,
      prix_achat: 2200,
      tva_pourcentage: 18,
      sous_total: 110000
    }
  ],
  depenses: [
    {
      id: 1,
      libelle: 'Carburant livraison Dakar',
      categorie_depense: 'Logistique',
      montant: 45000,
      date_depense: '2026-04-22',
      mode_paiement: 'mobile_money',
      justificatif: 'Recu station Total Liberté 6',
      statut: 'validee'
    },
    {
      id: 2,
      libelle: 'Abonnement internet bureau',
      categorie_depense: 'Services',
      montant: 65000,
      date_depense: '2026-04-05',
      mode_paiement: 'virement',
      justificatif: 'Facture Sonatel Avril',
      statut: 'validee'
    }
  ]
};
