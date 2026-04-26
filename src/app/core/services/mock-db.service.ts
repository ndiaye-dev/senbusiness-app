import { Injectable, signal } from '@angular/core';
import { AUTH_KEY, SEED_DATA, STORAGE_KEY } from '../constants/seed-data';
import {
  Achat,
  AchatLigne,
  CollectionItem,
  CollectionName,
  DatabaseState,
  Devis,
  DevisLigne,
  Facture,
  FactureLigne,
  MouvementStock,
  Paiement,
  Produit,
  Utilisateur
} from '../models/entities';
import { LocalStorageService } from './local-storage.service';

interface SalesLineInput {
  produit_id: number;
  quantite: number;
  prix_unitaire: number;
  remise_ligne: number;
  tva_pourcentage: number;
}

interface PurchaseLineInput {
  produit_id: number;
  quantite: number;
  prix_achat: number;
  tva_pourcentage: number;
}

interface Totals {
  total_ht: number;
  total_tva: number;
  total_ttc: number;
}

@Injectable({ providedIn: 'root' })
export class MockDbService {
  private readonly state = signal<DatabaseState>(structuredClone(SEED_DATA));

  constructor(private readonly storage: LocalStorageService) {
    this.state.set(this.loadState());
  }

  private loadState(): DatabaseState {
    const storedState = this.storage.getItem<DatabaseState>(STORAGE_KEY);
    if (storedState) {
      return storedState;
    }

    const seededState = structuredClone(SEED_DATA);
    this.storage.setItem(STORAGE_KEY, seededState);
    this.storage.removeItem(AUTH_KEY);
    return seededState;
  }

  resetSeed(): void {
    const seededState = structuredClone(SEED_DATA);
    this.state.set(seededState);
    this.persistState();
    this.storage.removeItem(AUTH_KEY);
  }

  private persistState(): void {
    this.storage.setItem(STORAGE_KEY, this.state());
  }

  getCollection<K extends CollectionName>(collection: K): CollectionItem<K>[] {
    return structuredClone(this.state()[collection] as unknown) as CollectionItem<K>[];
  }

  getById<K extends CollectionName>(collection: K, id: number): CollectionItem<K> | undefined {
    const item = ((this.state()[collection] as unknown) as CollectionItem<K>[]).find((entry) => entry.id === id);
    return item ? (structuredClone(item) as CollectionItem<K>) : undefined;
  }

  create<K extends CollectionName>(collection: K, payload: Record<string, unknown>): CollectionItem<K> {
    const state = structuredClone(this.state());
    const nextId = this.nextId(state[collection] as Array<{ id: number }>);
    const created = { ...payload, id: nextId } as CollectionItem<K>;
    ((state[collection] as unknown) as CollectionItem<K>[]).push(created);
    this.state.set(state);
    this.persistState();
    return structuredClone(created);
  }

  update<K extends CollectionName>(
    collection: K,
    id: number,
    payload: Record<string, unknown>
  ): CollectionItem<K> | null {
    const state = structuredClone(this.state());
    const collectionState = (state[collection] as unknown) as CollectionItem<K>[];
    const index = collectionState.findIndex((entry) => entry.id === id);
    if (index === -1) {
      return null;
    }

    const current = collectionState[index];
    const updated = { ...current, ...payload, id } as CollectionItem<K>;
    collectionState[index] = updated;
    this.state.set(state);
    this.persistState();
    return structuredClone(updated);
  }

  delete<K extends CollectionName>(collection: K, id: number): boolean {
    const state = structuredClone(this.state());
    const collectionState = (state[collection] as unknown) as CollectionItem<K>[];
    const initialLength = collectionState.length;
    state[collection] = collectionState.filter((entry) => entry.id !== id) as unknown as DatabaseState[K];

    if (state[collection].length === initialLength) {
      return false;
    }

    this.state.set(state);
    this.persistState();
    return true;
  }

  updateUtilisateurConnection(utilisateur: Utilisateur): void {
    this.update('utilisateurs', utilisateur.id, {
      derniere_connexion: new Date().toISOString()
    });
  }

  addMouvementStock(payload: any): MouvementStock {
    const safePayload = this.normalizeMouvementPayload(payload);
    const state = structuredClone(this.state());
    const produit = state.produits.find((item) => item.id === safePayload.produit_id);

    if (!produit) {
      throw new Error('Produit introuvable');
    }

    const delta = this.resolveStockDelta(safePayload.type_mouvement, safePayload.quantite);
    const nextStock = produit.stock_actuel + delta;

    if (nextStock < 0) {
      throw new Error('Stock insuffisant pour ce mouvement');
    }

    produit.stock_actuel = nextStock;

    const mouvement: MouvementStock = {
      ...safePayload,
      id: this.nextId(state.mouvements_stock)
    };

    state.mouvements_stock.push(mouvement);
    this.state.set(state);
    this.persistState();

    return structuredClone(mouvement);
  }

  updateMouvementStock(id: number, payload: any): MouvementStock | null {
    const safePayload = this.normalizeMouvementPayload(payload);
    const state = structuredClone(this.state());
    const index = state.mouvements_stock.findIndex((item) => item.id === id);
    if (index === -1) {
      return null;
    }

    const previous = state.mouvements_stock[index];
    const previousProduit = state.produits.find((item) => item.id === previous.produit_id);
    const nextProduit = state.produits.find((item) => item.id === safePayload.produit_id);

    if (!previousProduit || !nextProduit) {
      throw new Error('Produit introuvable');
    }

    previousProduit.stock_actuel -= this.resolveStockDelta(previous.type_mouvement, previous.quantite);

    const nextStock = nextProduit.stock_actuel + this.resolveStockDelta(safePayload.type_mouvement, safePayload.quantite);
    if (nextStock < 0) {
      throw new Error('Stock insuffisant pour ce mouvement');
    }

    nextProduit.stock_actuel = nextStock;
    state.mouvements_stock[index] = { ...safePayload, id };

    this.state.set(state);
    this.persistState();

    return structuredClone(state.mouvements_stock[index]);
  }

  deleteMouvementStock(id: number): boolean {
    const state = structuredClone(this.state());
    const mouvement = state.mouvements_stock.find((item) => item.id === id);
    if (!mouvement) {
      return false;
    }

    const produit = state.produits.find((item) => item.id === mouvement.produit_id);
    if (!produit) {
      return false;
    }

    const reversedDelta = -this.resolveStockDelta(mouvement.type_mouvement, mouvement.quantite);
    if (produit.stock_actuel + reversedDelta < 0) {
      throw new Error('Suppression impossible: stock négatif détecté');
    }

    produit.stock_actuel += reversedDelta;
    state.mouvements_stock = state.mouvements_stock.filter((item) => item.id !== id);

    this.state.set(state);
    this.persistState();
    return true;
  }

  createDevis(payload: any, lines: SalesLineInput[]): Devis {
    const safeLines = this.normalizeSalesLines(lines);
    const safePayload = this.normalizeDevisPayload(payload);
    const totals = this.calculateSalesTotals(safeLines, safePayload.remise_globale);
    const state = structuredClone(this.state());

    const devisId = this.nextId(state.devis);
    const devis: Devis = {
      ...safePayload,
      ...totals,
      id: devisId
    };

    const newLines = safeLines.map((line) => {
      const base = line.quantite * line.prix_unitaire;
      const sousTotal = this.round(base * (1 - line.remise_ligne / 100));
      const devisLigne: DevisLigne = {
        id: this.nextId(state.devis_lignes),
        devis_id: devisId,
        produit_id: line.produit_id,
        quantite: line.quantite,
        prix_unitaire: line.prix_unitaire,
        remise_ligne: line.remise_ligne,
        tva_pourcentage: line.tva_pourcentage,
        sous_total: sousTotal
      };
      state.devis_lignes.push(devisLigne);
      return devisLigne;
    });

    if (!newLines.length) {
      throw new Error('Au moins une ligne est requise pour un devis');
    }

    state.devis.push(devis);
    this.state.set(state);
    this.persistState();

    return structuredClone(devis);
  }

  updateDevis(devisId: number, payload: any, lines: SalesLineInput[]): Devis | null {
    const safeLines = this.normalizeSalesLines(lines);
    const state = structuredClone(this.state());
    const devis = state.devis.find((entry) => entry.id === devisId);
    if (!devis) {
      return null;
    }

    const remise = Number(payload?.remise_globale ?? devis.remise_globale);
    const totals = this.calculateSalesTotals(safeLines, remise);

    devis.client_id = Number(payload?.client_id ?? devis.client_id);
    devis.numero_devis = String(payload?.numero_devis ?? devis.numero_devis);
    devis.date_devis = String(payload?.date_devis ?? devis.date_devis);
    devis.date_expiration = String(payload?.date_expiration ?? devis.date_expiration);
    devis.statut = (payload?.statut ?? devis.statut) as Devis['statut'];
    devis.remise_globale = remise;
    devis.total_ht = totals.total_ht;
    devis.total_tva = totals.total_tva;
    devis.total_ttc = totals.total_ttc;

    state.devis_lignes = state.devis_lignes.filter((line) => line.devis_id !== devisId);

    for (const line of safeLines) {
      const sousTotal = this.round(line.quantite * line.prix_unitaire * (1 - line.remise_ligne / 100));
      state.devis_lignes.push({
        id: this.nextId(state.devis_lignes),
        devis_id: devisId,
        produit_id: line.produit_id,
        quantite: line.quantite,
        prix_unitaire: line.prix_unitaire,
        remise_ligne: line.remise_ligne,
        tva_pourcentage: line.tva_pourcentage,
        sous_total: sousTotal
      });
    }

    this.state.set(state);
    this.persistState();
    return structuredClone(devis);
  }

  createFacture(payload: any, lines: SalesLineInput[]): Facture {
    const safePayload = this.normalizeFacturePayload(payload);
    const safeLines = this.normalizeSalesLines(lines);
    const totals = this.calculateSalesTotals(safeLines, 0);
    const state = structuredClone(this.state());
    const factureId = this.nextId(state.factures);

    const facture: Facture = {
      ...safePayload,
      ...totals,
      id: factureId,
      montant_paye: 0,
      reste_a_payer: totals.total_ttc
    };

    if (!safeLines.length) {
      throw new Error('Au moins une ligne est requise pour une facture');
    }

    for (const line of safeLines) {
      const produit = state.produits.find((item) => item.id === line.produit_id);
      if (!produit) {
        throw new Error('Produit introuvable');
      }
      if (produit.stock_actuel < line.quantite) {
        throw new Error(`Stock insuffisant pour ${produit.nom}`);
      }

      produit.stock_actuel -= line.quantite;
      state.mouvements_stock.push({
        id: this.nextId(state.mouvements_stock),
        produit_id: line.produit_id,
        type_mouvement: 'sortie',
        quantite: line.quantite,
        date_mouvement: safePayload.date_facture,
        reference_document: safePayload.numero_facture,
        commentaire: 'Sortie automatique liée à la facture'
      });

      state.facture_lignes.push({
        id: this.nextId(state.facture_lignes),
        facture_id: factureId,
        produit_id: line.produit_id,
        quantite: line.quantite,
        prix_unitaire: line.prix_unitaire,
        remise_ligne: line.remise_ligne,
        tva_pourcentage: line.tva_pourcentage,
        sous_total: this.round(line.quantite * line.prix_unitaire * (1 - line.remise_ligne / 100))
      });
    }

    state.factures.push(facture);
    this.state.set(state);
    this.persistState();

    return structuredClone(facture);
  }

  updateFacture(factureId: number, payload: any, lines: SalesLineInput[]): Facture | null {
    const safePayload = this.normalizeFacturePayload(payload);
    const safeLines = this.normalizeSalesLines(lines);
    const state = structuredClone(this.state());
    const facture = state.factures.find((entry) => entry.id === factureId);
    if (!facture) {
      return null;
    }

    const previousReference = facture.numero_facture;
    const previousLines = state.facture_lignes.filter((line) => line.facture_id === factureId);
    for (const line of previousLines) {
      const produit = state.produits.find((item) => item.id === line.produit_id);
      if (produit) {
        produit.stock_actuel += line.quantite;
      }
    }

    state.mouvements_stock = state.mouvements_stock.filter(
      (item) => !(item.reference_document === previousReference && item.type_mouvement === 'sortie')
    );

    const totals = this.calculateSalesTotals(safeLines, 0);
    facture.client_id = safePayload.client_id;
    facture.devis_id = safePayload.devis_id;
    facture.numero_facture = safePayload.numero_facture;
    facture.date_facture = safePayload.date_facture;
    facture.date_echeance = safePayload.date_echeance;
    facture.statut = safePayload.statut;
    facture.mode_paiement = safePayload.mode_paiement;
    facture.total_ht = totals.total_ht;
    facture.total_tva = totals.total_tva;
    facture.total_ttc = totals.total_ttc;
    facture.reste_a_payer = this.round(Math.max(0, facture.total_ttc - facture.montant_paye));
    if (facture.statut !== 'annulee') {
      this.syncFacturePaymentStatus(facture);
    }

    state.facture_lignes = state.facture_lignes.filter((line) => line.facture_id !== factureId);
    for (const line of safeLines) {
      const produit = state.produits.find((item) => item.id === line.produit_id);
      if (!produit) {
        throw new Error('Produit introuvable');
      }
      if (produit.stock_actuel < line.quantite) {
        throw new Error(`Stock insuffisant pour ${produit.nom}`);
      }

      produit.stock_actuel -= line.quantite;
      state.facture_lignes.push({
        id: this.nextId(state.facture_lignes),
        facture_id: factureId,
        produit_id: line.produit_id,
        quantite: line.quantite,
        prix_unitaire: line.prix_unitaire,
        remise_ligne: line.remise_ligne,
        tva_pourcentage: line.tva_pourcentage,
        sous_total: this.round(line.quantite * line.prix_unitaire * (1 - line.remise_ligne / 100))
      });

      state.mouvements_stock.push({
        id: this.nextId(state.mouvements_stock),
        produit_id: line.produit_id,
        type_mouvement: 'sortie',
        quantite: line.quantite,
        date_mouvement: facture.date_facture,
        reference_document: facture.numero_facture,
        commentaire: 'Sortie automatique liée à la facture'
      });
    }

    this.state.set(state);
    this.persistState();

    return structuredClone(facture);
  }

  convertDevisToFacture(devisId: number): Facture {
    const state = structuredClone(this.state());
    const devis = state.devis.find((item) => item.id === devisId);
    if (!devis) {
      throw new Error('Devis introuvable');
    }

    const lines = state.devis_lignes.filter((line) => line.devis_id === devisId);
    if (!lines.length) {
      throw new Error('Ce devis ne contient aucune ligne');
    }

    const numero = `FAC-${new Date().getFullYear()}-${String(this.nextId(state.factures)).padStart(4, '0')}`;

    const facture = this.createFacture(
      {
        client_id: devis.client_id,
        devis_id: devis.id,
        numero_facture: numero,
        date_facture: this.today(),
        date_echeance: this.addDays(this.today(), 15),
        statut: 'emise',
        mode_paiement: 'virement'
      },
      lines.map((line) => ({
        produit_id: line.produit_id,
        quantite: line.quantite,
        prix_unitaire: line.prix_unitaire,
        remise_ligne: line.remise_ligne,
        tva_pourcentage: line.tva_pourcentage
      }))
    );

    this.update('devis', devis.id, { statut: 'accepte' });
    return facture;
  }

  createAchat(payload: any, lines: PurchaseLineInput[]): Achat {
    const safePayload = this.normalizeAchatPayload(payload);
    const safeLines = this.normalizePurchaseLines(lines);
    if (!safeLines.length) {
      throw new Error('Au moins une ligne est requise pour un achat');
    }

    const totals = this.calculatePurchaseTotals(safeLines);
    const state = structuredClone(this.state());

    const achatId = this.nextId(state.achats);
    const achat: Achat = {
      ...safePayload,
      ...totals,
      id: achatId
    };

    for (const line of safeLines) {
      const produit = state.produits.find((item) => item.id === line.produit_id);
      if (!produit) {
        throw new Error('Produit introuvable');
      }

      produit.stock_actuel += line.quantite;
      produit.prix_achat = line.prix_achat;

      state.achat_lignes.push({
        id: this.nextId(state.achat_lignes),
        achat_id: achatId,
        produit_id: line.produit_id,
        quantite: line.quantite,
        prix_achat: line.prix_achat,
        tva_pourcentage: line.tva_pourcentage,
        sous_total: this.round(line.quantite * line.prix_achat)
      });

      state.mouvements_stock.push({
        id: this.nextId(state.mouvements_stock),
        produit_id: line.produit_id,
        type_mouvement: 'entree',
        quantite: line.quantite,
        date_mouvement: safePayload.date_achat,
        reference_document: safePayload.numero_achat,
        commentaire: 'Entrée automatique suite à un achat'
      });
    }

    state.achats.push(achat);
    this.state.set(state);
    this.persistState();

    return structuredClone(achat);
  }

  updateAchat(achatId: number, payload: any, lines: PurchaseLineInput[]): Achat | null {
    const safePayload = this.normalizeAchatPayload(payload);
    const safeLines = this.normalizePurchaseLines(lines);
    const state = structuredClone(this.state());
    const achat = state.achats.find((entry) => entry.id === achatId);
    if (!achat) {
      return null;
    }

    const previousReference = achat.numero_achat;
    const previousLines = state.achat_lignes.filter((line) => line.achat_id === achatId);
    for (const line of previousLines) {
      const produit = state.produits.find((item) => item.id === line.produit_id);
      if (!produit || produit.stock_actuel < line.quantite) {
        throw new Error('Mise à jour impossible: incohérence stock détectée');
      }
      produit.stock_actuel -= line.quantite;
    }

    state.mouvements_stock = state.mouvements_stock.filter(
      (item) => !(item.reference_document === previousReference && item.type_mouvement === 'entree')
    );

    const totals = this.calculatePurchaseTotals(safeLines);
    achat.fournisseur_id = safePayload.fournisseur_id;
    achat.numero_achat = safePayload.numero_achat;
    achat.date_achat = safePayload.date_achat;
    achat.statut = safePayload.statut;
    achat.total_ht = totals.total_ht;
    achat.total_tva = totals.total_tva;
    achat.total_ttc = totals.total_ttc;

    state.achat_lignes = state.achat_lignes.filter((line) => line.achat_id !== achatId);
    for (const line of safeLines) {
      const produit = state.produits.find((item) => item.id === line.produit_id);
      if (!produit) {
        throw new Error('Produit introuvable');
      }
      produit.stock_actuel += line.quantite;
      produit.prix_achat = line.prix_achat;

      state.achat_lignes.push({
        id: this.nextId(state.achat_lignes),
        achat_id: achatId,
        produit_id: line.produit_id,
        quantite: line.quantite,
        prix_achat: line.prix_achat,
        tva_pourcentage: line.tva_pourcentage,
        sous_total: this.round(line.quantite * line.prix_achat)
      });

      state.mouvements_stock.push({
        id: this.nextId(state.mouvements_stock),
        produit_id: line.produit_id,
        type_mouvement: 'entree',
        quantite: line.quantite,
        date_mouvement: achat.date_achat,
        reference_document: achat.numero_achat,
        commentaire: 'Entrée automatique suite à un achat'
      });
    }

    this.state.set(state);
    this.persistState();

    return structuredClone(achat);
  }

  deleteDevis(id: number): boolean {
    const state = structuredClone(this.state());
    const exists = state.devis.some((item) => item.id === id);
    if (!exists) {
      return false;
    }

    state.devis = state.devis.filter((item) => item.id !== id);
    state.devis_lignes = state.devis_lignes.filter((item) => item.devis_id !== id);
    this.state.set(state);
    this.persistState();
    return true;
  }

  deleteFacture(id: number): boolean {
    const state = structuredClone(this.state());
    const facture = state.factures.find((item) => item.id === id);
    if (!facture) {
      return false;
    }

    const lines = state.facture_lignes.filter((item) => item.facture_id === id);
    for (const line of lines) {
      const produit = state.produits.find((item) => item.id === line.produit_id);
      if (produit) {
        produit.stock_actuel += line.quantite;
      }
    }

    state.factures = state.factures.filter((item) => item.id !== id);
    state.facture_lignes = state.facture_lignes.filter((item) => item.facture_id !== id);
    state.paiements = state.paiements.filter((item) => item.facture_id !== id);
    state.mouvements_stock = state.mouvements_stock.filter(
      (item) => item.reference_document !== facture.numero_facture
    );

    this.state.set(state);
    this.persistState();
    return true;
  }

  deleteAchat(id: number): boolean {
    const state = structuredClone(this.state());
    const achat = state.achats.find((item) => item.id === id);
    if (!achat) {
      return false;
    }

    const lines = state.achat_lignes.filter((item) => item.achat_id === id);
    for (const line of lines) {
      const produit = state.produits.find((item) => item.id === line.produit_id);
      if (produit) {
        if (produit.stock_actuel < line.quantite) {
          throw new Error('Suppression impossible: stock négatif détecté');
        }
        produit.stock_actuel -= line.quantite;
      }
    }

    state.achats = state.achats.filter((item) => item.id !== id);
    state.achat_lignes = state.achat_lignes.filter((item) => item.achat_id !== id);
    state.mouvements_stock = state.mouvements_stock.filter(
      (item) => item.reference_document !== achat.numero_achat
    );

    this.state.set(state);
    this.persistState();
    return true;
  }

  addPaiement(payload: any): Paiement {
    const safePayload = this.normalizePaiementPayload(payload);
    const state = structuredClone(this.state());
    const facture = state.factures.find((item) => item.id === safePayload.facture_id);
    if (!facture) {
      throw new Error('Facture introuvable');
    }
    if (safePayload.statut === 'valide' && safePayload.montant > facture.reste_a_payer) {
      throw new Error('Montant supérieur au reste à payer');
    }

    const paiement: Paiement = {
      ...safePayload,
      id: this.nextId(state.paiements)
    };

    state.paiements.push(paiement);

    if (paiement.statut === 'valide') {
      facture.montant_paye = this.round(facture.montant_paye + paiement.montant);
      facture.reste_a_payer = this.round(Math.max(0, facture.total_ttc - facture.montant_paye));
      this.syncFacturePaymentStatus(facture);
    }

    this.state.set(state);
    this.persistState();

    return structuredClone(paiement);
  }

  updatePaiement(id: number, payload: any): Paiement | null {
    const current = this.getById('paiements', id);
    if (!current) {
      return null;
    }

    const safePayload = this.normalizePaiementPayload({ ...current, ...payload });
    const previousAmount = current.statut === 'valide' ? current.montant : 0;
    const previousFactureId = current.facture_id;

    if (safePayload.statut === 'valide') {
      const targetFacture = this.getById('factures', safePayload.facture_id);
      if (!targetFacture) {
        throw new Error('Facture introuvable');
      }
      if (safePayload.montant > targetFacture.reste_a_payer + (previousFactureId === safePayload.facture_id ? previousAmount : 0)) {
        throw new Error('Montant supérieur au reste à payer');
      }
    }

    const updated = this.update('paiements', id, safePayload);
    if (!updated) {
      return null;
    }

    const nextAmount = updated.statut === 'valide' ? updated.montant : 0;
    if (previousFactureId === updated.facture_id) {
      const diff = nextAmount - previousAmount;
      if (diff !== 0) {
        this.adjustFacturePayment(updated.facture_id, diff);
      }
    } else {
      if (current.statut === 'valide') {
        this.adjustFacturePayment(previousFactureId, -current.montant);
      }
      if (updated.statut === 'valide') {
        this.adjustFacturePayment(updated.facture_id, updated.montant);
      }
    }

    return updated;
  }

  deletePaiement(id: number): boolean {
    const paiement = this.getById('paiements', id);
    if (!paiement) {
      return false;
    }

    if (paiement.statut === 'valide') {
      this.adjustFacturePayment(paiement.facture_id, -paiement.montant);
    }

    return this.delete('paiements', id);
  }

  private adjustFacturePayment(factureId: number, delta: number): void {
    const state = structuredClone(this.state());
    const facture = state.factures.find((item) => item.id === factureId);
    if (!facture) {
      return;
    }

    facture.montant_paye = this.round(Math.max(0, facture.montant_paye + delta));
    facture.reste_a_payer = this.round(Math.max(0, facture.total_ttc - facture.montant_paye));
    this.syncFacturePaymentStatus(facture);

    this.state.set(state);
    this.persistState();
  }

  getDashboardData(): {
    ca_total: number;
    ventes_mois: number;
    factures_impayees: number;
    stock_faible: number;
    marge_estimee: number;
    alertes: string[];
    ventes_mensuelles: Array<{ label: string; valeur: number }>;
  } {
    const state = this.state();
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const caTotal = this.round(state.factures.reduce((sum, facture) => sum + facture.total_ttc, 0));

    const ventesMois = this.round(
      state.factures
        .filter((facture) => {
          const date = new Date(facture.date_facture);
          return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
        })
        .reduce((sum, facture) => sum + facture.total_ttc, 0)
    );

    const facturesImpayees = state.factures.filter((facture) => facture.reste_a_payer > 0).length;
    const stockFaible = state.produits.filter((produit) => produit.stock_actuel <= produit.stock_minimum).length;

    const margeEstimee = this.round(
      state.facture_lignes.reduce((sum, line) => {
        const produit = state.produits.find((item) => item.id === line.produit_id);
        if (!produit) {
          return sum;
        }

        return sum + (line.prix_unitaire - produit.prix_achat) * line.quantite;
      }, 0)
    );

    const alertes: string[] = [];

    for (const produit of state.produits.filter((item) => item.stock_actuel <= item.stock_minimum)) {
      alertes.push(`Stock bas: ${produit.nom} (${produit.stock_actuel} ${produit.unite})`);
    }

    for (const facture of state.factures.filter((item) => item.reste_a_payer > 0)) {
      const dueDate = new Date(facture.date_echeance);
      const dayDiff = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (dayDiff <= 5) {
        alertes.push(`Échéance proche: ${facture.numero_facture} (${dayDiff} jours)`);
      }
    }

    const ventesMensuelles = Array.from({ length: 6 }).map((_, index) => {
      const monthDate = new Date(currentYear, currentMonth - (5 - index), 1);
      const label = monthDate.toLocaleDateString('fr-FR', { month: 'short' });
      const valeur = this.round(
        state.factures
          .filter((facture) => {
            const date = new Date(facture.date_facture);
            return date.getMonth() === monthDate.getMonth() && date.getFullYear() === monthDate.getFullYear();
          })
          .reduce((sum, facture) => sum + facture.total_ttc, 0)
      );

      return { label, valeur };
    });

    return {
      ca_total: caTotal,
      ventes_mois: ventesMois,
      factures_impayees: facturesImpayees,
      stock_faible: stockFaible,
      marge_estimee: margeEstimee,
      alertes,
      ventes_mensuelles: ventesMensuelles
    };
  }

  globalSearch(term: string): Array<{ label: string; route: string; details: string }> {
    if (!term.trim()) {
      return [];
    }

    const query = term.toLowerCase();
    const state = this.state();
    const results: Array<{ label: string; route: string; details: string }> = [];

    for (const client of state.clients) {
      const label = client.type_client === 'entreprise' ? client.raison_sociale : `${client.prenom} ${client.nom}`.trim();
      if (label.toLowerCase().includes(query) || client.code_client.toLowerCase().includes(query)) {
        results.push({ label, route: '/clients', details: `Client: ${client.code_client}` });
      }
    }

    for (const produit of state.produits) {
      if (produit.nom.toLowerCase().includes(query) || produit.sku.toLowerCase().includes(query)) {
        results.push({ label: produit.nom, route: '/produits', details: `Produit: ${produit.sku}` });
      }
    }

    for (const facture of state.factures) {
      if (facture.numero_facture.toLowerCase().includes(query)) {
        results.push({ label: facture.numero_facture, route: '/factures', details: 'Facture' });
      }
    }

    return results.slice(0, 8);
  }

  getDevisLignes(devisId: number): DevisLigne[] {
    return this.getCollection('devis_lignes').filter((item) => item.devis_id === devisId);
  }

  getFactureLignes(factureId: number): FactureLigne[] {
    return this.getCollection('facture_lignes').filter((item) => item.facture_id === factureId);
  }

  getAchatLignes(achatId: number): AchatLigne[] {
    return this.getCollection('achat_lignes').filter((item) => item.achat_id === achatId);
  }

  private nextId(collection: Array<{ id: number }>): number {
    return collection.length ? Math.max(...collection.map((item) => item.id)) + 1 : 1;
  }

  private resolveStockDelta(type: MouvementStock['type_mouvement'], quantite: number): number {
    switch (type) {
      case 'entree':
        return quantite;
      case 'sortie':
        return -quantite;
      case 'ajustement':
        return quantite;
      default:
        return 0;
    }
  }

  private syncFacturePaymentStatus(facture: Facture): void {
    if (facture.statut === 'annulee') {
      return;
    }

    if (facture.reste_a_payer === 0) {
      facture.statut = 'payee';
    } else if (facture.montant_paye > 0) {
      facture.statut = 'partiellement_payee';
    } else {
      facture.statut = 'emise';
    }
  }

  private normalizeSalesLines(lines: SalesLineInput[]): SalesLineInput[] {
    return (lines ?? []).map((line) => ({
      produit_id: Number(line.produit_id),
      quantite: Number(line.quantite),
      prix_unitaire: Number(line.prix_unitaire),
      remise_ligne: Number(line.remise_ligne ?? 0),
      tva_pourcentage: Number(line.tva_pourcentage ?? 0)
    }));
  }

  private normalizePurchaseLines(lines: PurchaseLineInput[]): PurchaseLineInput[] {
    return (lines ?? []).map((line) => ({
      produit_id: Number(line.produit_id),
      quantite: Number(line.quantite),
      prix_achat: Number(line.prix_achat),
      tva_pourcentage: Number(line.tva_pourcentage ?? 0)
    }));
  }

  private normalizeMouvementPayload(payload: any): Omit<MouvementStock, 'id'> {
    return {
      produit_id: Number(payload?.produit_id),
      type_mouvement: String(payload?.type_mouvement ?? 'entree') as MouvementStock['type_mouvement'],
      quantite: Number(payload?.quantite ?? 0),
      date_mouvement: String(payload?.date_mouvement ?? this.today()),
      reference_document: String(payload?.reference_document ?? ''),
      commentaire: String(payload?.commentaire ?? '')
    };
  }

  private normalizeDevisPayload(payload: any): Omit<Devis, 'id' | 'total_ht' | 'total_tva' | 'total_ttc'> {
    return {
      client_id: Number(payload?.client_id),
      numero_devis: String(payload?.numero_devis ?? ''),
      date_devis: String(payload?.date_devis ?? this.today()),
      date_expiration: String(payload?.date_expiration ?? this.addDays(this.today(), 15)),
      statut: String(payload?.statut ?? 'brouillon') as Devis['statut'],
      remise_globale: Number(payload?.remise_globale ?? 0)
    };
  }

  private normalizeFacturePayload(
    payload: any
  ): Omit<Facture, 'id' | 'total_ht' | 'total_tva' | 'total_ttc' | 'montant_paye' | 'reste_a_payer'> {
    return {
      client_id: Number(payload?.client_id),
      devis_id: payload?.devis_id === null || payload?.devis_id === undefined ? null : Number(payload.devis_id),
      numero_facture: String(payload?.numero_facture ?? ''),
      date_facture: String(payload?.date_facture ?? this.today()),
      date_echeance: String(payload?.date_echeance ?? this.addDays(this.today(), 15)),
      statut: String(payload?.statut ?? 'emise') as Facture['statut'],
      mode_paiement: String(payload?.mode_paiement ?? 'virement')
    };
  }

  private normalizeAchatPayload(payload: any): Omit<Achat, 'id' | 'total_ht' | 'total_tva' | 'total_ttc'> {
    return {
      fournisseur_id: Number(payload?.fournisseur_id),
      numero_achat: String(payload?.numero_achat ?? ''),
      date_achat: String(payload?.date_achat ?? this.today()),
      statut: String(payload?.statut ?? 'commande') as Achat['statut']
    };
  }

  private normalizePaiementPayload(payload: any): Omit<Paiement, 'id'> {
    return {
      facture_id: Number(payload?.facture_id),
      date_paiement: String(payload?.date_paiement ?? this.today()),
      montant: Number(payload?.montant ?? 0),
      mode_paiement: String(payload?.mode_paiement ?? 'virement'),
      reference_paiement: String(payload?.reference_paiement ?? ''),
      statut: String(payload?.statut ?? 'valide') as Paiement['statut']
    };
  }

  private calculateSalesTotals(lines: SalesLineInput[], remiseGlobale: number): Totals {
    const lineTotals = lines.map((line) => {
      const base = line.quantite * line.prix_unitaire;
      const ht = base * (1 - line.remise_ligne / 100);
      const tva = ht * (line.tva_pourcentage / 100);
      return { ht, tva };
    });

    const factor = Math.max(0, 1 - remiseGlobale / 100);
    const totalHt = this.round(lineTotals.reduce((sum, line) => sum + line.ht, 0) * factor);
    const totalTva = this.round(lineTotals.reduce((sum, line) => sum + line.tva, 0) * factor);

    return {
      total_ht: totalHt,
      total_tva: totalTva,
      total_ttc: this.round(totalHt + totalTva)
    };
  }

  private calculatePurchaseTotals(lines: PurchaseLineInput[]): Totals {
    const totalHt = this.round(lines.reduce((sum, line) => sum + line.quantite * line.prix_achat, 0));
    const totalTva = this.round(
      lines.reduce((sum, line) => sum + line.quantite * line.prix_achat * (line.tva_pourcentage / 100), 0)
    );

    return {
      total_ht: totalHt,
      total_tva: totalTva,
      total_ttc: this.round(totalHt + totalTva)
    };
  }

  private round(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private addDays(dateIso: string, days: number): string {
    const date = new Date(dateIso);
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
  }
}
