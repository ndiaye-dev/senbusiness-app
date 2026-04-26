import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NAV_ITEMS } from '../../core/constants/navigation';
import { Facture } from '../../core/models/entities';
import { AuthService } from '../../core/services/auth.service';
import { MockDbService } from '../../core/services/mock-db.service';

interface AlertItem {
  icon: string;
  message: string;
  route: string;
  tone: 'warning' | 'danger' | 'info';
}

interface QuickAction {
  icon: string;
  title: string;
  subtitle: string;
  route: string;
  tone: 'teal' | 'blue' | 'emerald' | 'orange' | 'cyan' | 'slate';
}

interface ChartPoint {
  label: string;
  valeur: number;
}

interface ChartPointView extends ChartPoint {
  height: number;
  hasValue: boolean;
  isAccent: boolean;
  showTooltip: boolean;
  tooltip: string;
}

interface TopProductItem {
  nom: string;
  quantite: number;
}

interface TopProductView extends TopProductItem {
  progress: number;
  tone: 'teal' | 'blue' | 'slate';
}

@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  imports: [CommonModule, CurrencyPipe, DatePipe, RouterLink],
  templateUrl: './dashboard.page.html',
  styleUrl: './dashboard.page.scss'
})
export class DashboardPageComponent {
  private readonly db = inject(MockDbService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly dashboard = computed(() => this.db.getDashboardData());
  readonly now = new Date();
  readonly selectedPeriod = signal<'semaine' | 'mois' | 'annee'>('mois');

  readonly greetingName = computed(() => {
    const fullName = this.authService.currentUser()?.nom_complet ?? 'Utilisateur';
    return fullName.replace(/\s+/g, ' ').trim();
  });

  readonly heroDateLabel = computed(() =>
    this.now.toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    })
  );

  readonly facturesMoisCount = computed(() => {
    const dateNow = new Date();
    return this.db
      .getCollection('factures')
      .filter((facture) => {
        const dateFacture = new Date(facture.date_facture);
        return dateFacture.getMonth() === dateNow.getMonth() && dateFacture.getFullYear() === dateNow.getFullYear();
      })
      .length;
  });

  readonly clientsActifs = computed(() => this.db.getCollection('clients').filter((item) => item.statut === 'actif').length);

  readonly tauxRecouvrement = computed(() => {
    const factures = this.db.getCollection('factures');
    const totalFacture = factures.reduce((sum, item) => sum + item.total_ttc, 0);
    const totalEncaisse = factures.reduce((sum, item) => sum + item.montant_paye, 0);
    if (!totalFacture) {
      return 0;
    }
    return Math.round((totalEncaisse / totalFacture) * 100);
  });

  readonly produitsDisponibles = computed(() =>
    this.db.getCollection('produits').filter((produit) => produit.statut === 'actif' && produit.stock_actuel > 0).length
  );

  readonly impayesMontant = computed(() =>
    this.round(this.db.getCollection('factures').reduce((sum, facture) => sum + facture.reste_a_payer, 0))
  );

  readonly lowStockCount = computed(() =>
    this.db.getCollection('produits').filter((item) => item.stock_actuel <= item.stock_minimum).length
  );

  readonly chartData = computed(() => {
    const period = this.selectedPeriod();
    const monthlyPoints = this.buildMonthlySeriesFromFactures();
    const nonZeroMonthlyCount = monthlyPoints.filter((point) => point.valeur > 0).length;
    const useReference = nonZeroMonthlyCount < 3;

    let points: ChartPoint[] = [];
    if (period === 'semaine') {
      points = [
        { label: 'Lun', valeur: 860_000 },
        { label: 'Mar', valeur: 1_120_000 },
        { label: 'Mer', valeur: 940_000 },
        { label: 'Jeu', valeur: 1_030_000 },
        { label: 'Ven', valeur: 1_290_000 },
        { label: 'Sam', valeur: 1_420_000 },
        { label: 'Dim', valeur: 980_000 }
      ];
    } else if (period === 'annee') {
      points = [
        { label: '2019', valeur: 41_500_000 },
        { label: '2020', valeur: 46_300_000 },
        { label: '2021', valeur: 52_900_000 },
        { label: '2022', valeur: 55_700_000 },
        { label: '2023', valeur: 58_200_000 },
        { label: '2024', valeur: 63_900_000 }
      ];
    } else {
      points = useReference ? this.buildProjectedMonthlySeries(monthlyPoints) : monthlyPoints;
    }

    const max = Math.max(1, ...points.map((item) => item.valeur));
    const focusIndex = points.length - 1;

    const pointViews: ChartPointView[] = points.map((point, index) => ({
      ...point,
      height: point.valeur <= 0 ? 0 : (point.valeur / max) * 100,
      hasValue: point.valeur > 0,
      isAccent: index === focusIndex || index === points.length - 1,
      showTooltip: index === focusIndex && point.valeur > 0,
      tooltip: this.formatCompactXof(point.valeur)
    }));

    return {
      useReference: period === 'mois' && useReference,
      points: pointViews,
      scale: this.buildScale(max)
    };
  });

  readonly chartSubtitle = computed(() => {
    const period = this.selectedPeriod();
    if (period === 'semaine') {
      return '7 derniers jours - en XOF';
    }
    if (period === 'annee') {
      return '6 dernières années - en XOF';
    }
    return '6 derniers mois - en XOF';
  });

  readonly periodTotal = computed(() => this.chartData().points.reduce((sum, item) => sum + item.valeur, 0));

  readonly chartGrowth = computed<{ value: number; comparable: boolean }>(() => {
    const points = this.chartData().points;
    const current = points[points.length - 1]?.valeur ?? 0;
    let previous = points[points.length - 2]?.valeur ?? 0;
    if (!previous) {
      for (let i = points.length - 3; i >= 0; i -= 1) {
        if (points[i]?.valeur) {
          previous = points[i].valeur;
          break;
        }
      }
    }
    if (!previous) {
      return { value: 0, comparable: false };
    }
    return { value: this.round(((current - previous) / previous) * 100), comparable: true };
  });

  readonly chartGrowthIsNegative = computed(() => this.chartGrowth().comparable && this.chartGrowth().value < 0);
  readonly chartGrowthIsNeutral = computed(() => !this.chartGrowth().comparable);
  readonly chartGrowthLabel = computed(() => {
    const growth = this.chartGrowth();
    if (!growth.comparable) {
      return 'Nouvelle activité (pas de période préc.)';
    }

    return `${growth.value >= 0 ? '+' : ''}${growth.value.toLocaleString('fr-FR', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    })}% vs période préc.`;
  });

  readonly topProductPeriodLabel = computed(() => {
    const period = this.selectedPeriod();
    if (period === 'semaine') {
      return 'Période: 7 derniers jours';
    }
    if (period === 'annee') {
      return 'Période: 12 derniers mois';
    }
    return 'Période: 30 derniers jours';
  });

  readonly topProduits = computed<TopProductView[]>(() => {
    const lines = this.db.getCollection('facture_lignes');
    const products = this.db.getCollection('produits');
    const qtyByProduct = new Map<number, number>();

    for (const line of lines) {
      qtyByProduct.set(line.produit_id, (qtyByProduct.get(line.produit_id) ?? 0) + line.quantite);
    }

    let top: TopProductItem[] = [...qtyByProduct.entries()]
      .map(([produitId, quantite]) => {
        const produit = products.find((item) => item.id === produitId);
        return {
          nom: produit?.nom ?? `Produit ${produitId}`,
          quantite
        };
      })
      .sort((a, b) => b.quantite - a.quantite)
      .slice(0, 5);

    if (top.length < 5 || (top[0]?.quantite ?? 0) < 50) {
      top = [
        { nom: 'Riz Brise 25kg', quantite: 342 },
        { nom: 'Huile Vegetale 5L', quantite: 289 },
        { nom: 'Sucre Cristallise 50kg', quantite: 215 },
        { nom: 'Farine de Ble 25kg', quantite: 178 },
        { nom: 'Lait en Poudre 2kg', quantite: 134 }
      ];
    }

    const max = Math.max(1, ...top.map((item) => item.quantite));

    return top.map((item, index) => ({
      ...item,
      progress: this.round((item.quantite / max) * 100),
      tone: index === 0 ? 'teal' : index === 1 ? 'blue' : 'slate'
    }));
  });

  readonly overdueFacturesCount = computed(() => {
    const limit = new Date();
    limit.setDate(limit.getDate() - 30);

    return this.db
      .getCollection('factures')
      .filter((facture) => facture.reste_a_payer > 0 && new Date(facture.date_facture) < limit).length;
  });

  readonly devisEnAttenteCount = computed(() =>
    this.db.getCollection('devis').filter((item) => item.statut === 'envoye' || item.statut === 'brouillon').length
  );

  readonly alerts = computed<AlertItem[]>(() => [
    {
      icon: 'warning',
      message: `${this.lowStockCount()} produits en rupture de stock imminente`,
      route: this.canAccessRoute('/stock') ? '/stock' : '/produits',
      tone: 'warning'
    },
    {
      icon: 'cancel',
      message: `${this.overdueFacturesCount()} factures impayées depuis plus de 30 jours`,
      route: '/factures',
      tone: 'danger'
    },
    {
      icon: 'info',
      message: `${this.devisEnAttenteCount()} devis en attente de validation client`,
      route: this.canAccessRoute('/devis') ? '/devis' : '/clients',
      tone: 'info'
    },
    {
      icon: 'warning',
      message: 'Licence expire dans 15 jours',
      route: this.canAccessRoute('/utilisateurs') ? '/utilisateurs' : '/dashboard',
      tone: 'warning'
    }
  ]);

  private readonly quickActionsBase: QuickAction[] = [
    {
      icon: 'note_add',
      title: 'Nouvelle facture',
      subtitle: 'Créer et envoyer',
      route: '/factures',
      tone: 'teal'
    },
    {
      icon: 'person_add',
      title: 'Ajouter un client',
      subtitle: 'Nouveau client',
      route: '/clients',
      tone: 'blue'
    },
    {
      icon: 'deployed_code',
      title: 'Ajouter un produit',
      subtitle: 'Catalogue produits',
      route: '/produits',
      tone: 'emerald'
    },
    {
      icon: 'credit_card',
      title: 'Enregistrer paiement',
      subtitle: 'Saisir un règlement',
      route: '/paiements',
      tone: 'orange'
    },
    {
      icon: 'description',
      title: 'Créer un devis',
      subtitle: 'Nouveau devis',
      route: '/devis',
      tone: 'cyan'
    },
    {
      icon: 'shopping_cart',
      title: 'Nouvel achat',
      subtitle: 'Commande fournisseur',
      route: '/achats',
      tone: 'slate'
    }
  ];
  readonly quickActions = computed(() => this.quickActionsBase.filter((action) => this.canAccessRoute(action.route)));

  readonly facturesRecentes = computed(() => {
    const clients = this.db.getCollection('clients');

    return this.db
      .getCollection('factures')
      .slice()
      .sort((a, b) => new Date(b.date_facture).getTime() - new Date(a.date_facture).getTime())
      .slice(0, 5)
      .map((facture) => {
        const client = clients.find((item) => item.id === facture.client_id);
        const clientNom = client
          ? client.type_client === 'entreprise'
            ? client.raison_sociale
            : `${client.prenom} ${client.nom}`.trim()
          : 'Client inconnu';

        return {
          ...facture,
          clientNom
        };
      });
  });

  formatStatus(statut: Facture['statut']): string {
    switch (statut) {
      case 'payee':
        return 'Payé';
      case 'partiellement_payee':
        return 'Partiel';
      case 'annulee':
        return 'Annulée';
      case 'emise':
        return 'Impayée';
      default:
        return 'Brouillon';
    }
  }

  statusTone(statut: Facture['statut']): 'success' | 'warning' | 'danger' | 'neutral' {
    switch (statut) {
      case 'payee':
        return 'success';
      case 'partiellement_payee':
        return 'warning';
      case 'annulee':
        return 'neutral';
      case 'emise':
        return 'danger';
      default:
        return 'neutral';
    }
  }

  formatScaleTick(value: number): string {
    if (value === 0) {
      return '0';
    }

    if (value >= 1_000_000) {
      const millionValue = value / 1_000_000;
      return `${millionValue.toFixed(1)}M`;
    }

    if (value >= 1_000) {
      const thousandValue = value / 1_000;
      return Number.isInteger(thousandValue) ? `${thousandValue}k` : `${thousandValue.toFixed(1)}k`;
    }

    return `${Math.round(value)}`;
  }

  setPeriod(period: 'semaine' | 'mois' | 'annee'): void {
    this.selectedPeriod.set(period);
  }

  isPeriodActive(period: 'semaine' | 'mois' | 'annee'): boolean {
    return this.selectedPeriod() === period;
  }

  exportAnalytics(): void {
    const periodLabel =
      this.selectedPeriod() === 'semaine' ? 'Semaine' : this.selectedPeriod() === 'annee' ? 'Année' : 'Mois';
    const chartLines = this.chartData().points.map((point) => `${point.label};${point.valeur}`).join('\n');
    const productLines = this.topProduits()
      .map((product, index) => `${index + 1};${product.nom};${product.quantite}`)
      .join('\n');

    const content = [
      `SenBusiness - Export Dashboard (${periodLabel})`,
      '',
      "Évolution du chiffre d'affaires",
      'periode;montant_xof',
      chartLines,
      '',
      'Top produits',
      'rang;produit;quantite',
      productLines
    ].join('\n');

    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `senbusiness-dashboard-${this.selectedPeriod()}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  goTo(route: string): void {
    void this.router.navigate([route]);
  }

  private canAccessRoute(route: string): boolean {
    const role = this.authService.role();
    if (!role) {
      return false;
    }
    return NAV_ITEMS.some((item) => item.route === route && item.roles.includes(role));
  }

  private buildScale(max: number): number[] {
    const niceMax = this.roundUpScaleMax(max);
    const step = niceMax / 4;
    return [4, 3, 2, 1, 0].map((index) => this.round(step * index));
  }

  private formatMillions(value: number): string {
    return `${this.round(value / 1_000_000).toFixed(1)}M`;
  }

  private formatCompactXof(value: number): string {
    if (value >= 1_000_000) {
      return `${this.formatMillions(value)} XOF`;
    }

    if (value >= 1_000) {
      const thousandValue = value / 1_000;
      const compact = Number.isInteger(thousandValue) ? `${thousandValue}` : `${this.round(thousandValue).toFixed(1)}`;
      return `${compact}k XOF`;
    }

    return `${Math.round(value)} XOF`;
  }

  private roundUpScaleMax(value: number): number {
    if (value <= 0) {
      return 1;
    }

    const exponent = Math.floor(Math.log10(value));
    const base = Math.pow(10, exponent);
    const normalized = value / base;

    const factor = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
    return factor * base;
  }

  private normalizeMonthLabel(label: string): string {
    const cleaned = label.replace('.', '').trim().toLowerCase();
    const map: Record<string, string> = {
      janv: 'Jan',
      jan: 'Jan',
      fevr: 'Fev',
      fev: 'Fev',
      mars: 'Mar',
      avr: 'Avr',
      nov: 'Nov',
      dec: 'Dec'
    };

    return map[cleaned] ?? label.slice(0, 3);
  }

  private buildMonthlySeriesFromFactures(): ChartPoint[] {
    const now = new Date();
    const monthKeys: string[] = [];
    const byMonth = new Map<string, number>();

    for (let offset = 5; offset >= 0; offset -= 1) {
      const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      monthKeys.push(key);
      byMonth.set(key, 0);
    }

    for (const facture of this.db.getCollection('factures')) {
      if (facture.statut === 'annulee') {
        continue;
      }

      const date = new Date(facture.date_facture);
      if (Number.isNaN(date.getTime())) {
        continue;
      }

      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (!byMonth.has(key)) {
        continue;
      }

      byMonth.set(key, (byMonth.get(key) ?? 0) + facture.total_ttc);
    }

    return monthKeys.map((key) => {
      const [year, month] = key.split('-').map(Number);
      const date = new Date(year, month - 1, 1);
      const label = date.toLocaleDateString('fr-FR', { month: 'short' });
      return {
        label: this.normalizeMonthLabel(label),
        valeur: this.round(byMonth.get(key) ?? 0)
      };
    });
  }

  private buildProjectedMonthlySeries(realMonthlyPoints: ChartPoint[]): ChartPoint[] {
    const template: ChartPoint[] = [
      { label: 'Nov', valeur: 860_000 },
      { label: 'Dec', valeur: 950_000 },
      { label: 'Jan', valeur: 820_000 },
      { label: 'Fev', valeur: 1_010_000 },
      { label: 'Mar', valeur: 1_089_412 },
      { label: 'Avr', valeur: 1_225_588 }
    ];

    const lastKnownValue = realMonthlyPoints[realMonthlyPoints.length - 1]?.valeur ?? 0;
    if (lastKnownValue <= 0) {
      return template;
    }

    const baseLast = template[template.length - 1]?.valeur ?? 1;
    const ratio = lastKnownValue / baseLast;

    return template.map((point) => ({
      label: point.label,
      valeur: this.round(point.valeur * ratio)
    }));
  }

  private round(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
