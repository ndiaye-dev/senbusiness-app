# SenBusiness Frontend

Application Angular de gestion commerciale pour PME/TPE au Senegal.
Langue UI: francais. Devise principale: XOF.

## Stack

- Angular 21+ (standalone components)
- TypeScript strict
- Routing lazy loading
- Donnees mock locales via localStorage
- Architecture: core / shared / features

## Installation

```bash
npm install
```

## Lancement local

```bash
npm start
```

Alternative:

```bash
ng serve
```

URL locale par defaut: `http://localhost:4200`

## Build

```bash
npm run build
```

Sortie:

```text
dist/gestion-commerciale-frontend
```

## Comptes de demo

- `admin@senbusiness.sn / admin123` (administrateur)
- `manager@senbusiness.sn / manager123` (gestionnaire_commercial)
- `caissier@senbusiness.sn / caissier123` (caissier)
- `magasin@senbusiness.sn / magasin123` (magasinier)

## Roles et permissions

- `administrateur`: acces total
- `gestionnaire_commercial`: dashboard, clients, produits, devis, factures, paiements, depenses
- `caissier`: factures, paiements, lecture clients/produits
- `magasinier`: fournisseurs, categories, produits, stock, achats

## Fonctionnalites V1

- Auth mock locale (login/logout) + roles
- Guards: auth guard + role guard
- Layout principal responsive (sidebar + header + recherche globale)
- Pages: Login, Dashboard, Clients, Fournisseurs, Categories, Produits, Stock, Devis, Factures, Paiements, Achats, Depenses, Utilisateurs, Profil
- CRUD UI complet sur les entites metier
- Recherche + filtres + pagination
- Validation des formulaires
- Calculs automatiques HT/TVA/TTC/remises
- Conversion Devis -> Facture
- Paiements qui mettent a jour reste_a_payer / statut facture
- Mouvements de stock qui mettent a jour stock_actuel
- Etats de chargement et erreurs UI
- Seed local realist Senegal (noms, villes, telephones, NINEA)

## Structure du projet

```text
src/app/
  core/
    constants/
    guards/
    layout/
    models/
    services/
  shared/
    components/
      data-table/
      form-modal/
      kpi-card/
      pagination/
      status-badge/
    utils/
  features/
    auth/
    dashboard/
    profil/
    clients/
    fournisseurs/
    categories/
    produits/
    stock/
    devis/
    factures/
    paiements/
    achats/
    depenses/
    utilisateurs/
```

## Deploiement Vercel (SPA Angular)

1. Verifier le build local:

```bash
npm run build
```

2. Pousser le projet sur GitHub/GitLab.
3. Importer le repository dans Vercel.
4. Parametres build:
   - Build Command: `npm run build`
   - Output Directory: `dist/gestion-commerciale-frontend/browser`
5. Le fichier `vercel.json` force la rewrite SPA vers `index.html`.
6. Lancer le deploiement.

## Notes techniques

- Base locale: `senbusiness_db_v1`
- Reinitialisation des donnees de demo depuis la page Login
- Aucun backend reel requis pour cette V1
