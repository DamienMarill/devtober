import { DOSSIERS } from '../content/dossiers';
import { POSTIT_CHEF } from '../content/memo';
import { Seq } from './actions';
import { ARCHIVES_FOND, CONFIG, DAYS, type DayParams } from './config';
import { epaisseur, ficheRetour, fillerPiece, genererDossier, pickModel } from './generate';
import type { Dossier, Piece, Pt, RetourType } from './model';
import { Rng, mix } from './rng';
import { checkDossier, DEFAULT_RULES, type RuleContext } from './rules';

/**
 * La journée au guichet, sans affichage : l'horloge, les arrivées, la pile, les retours par le tube, le score,
 * l'effondrement et le reliquat. Tout l'aléatoire est à graine (arrivées, contenu, retours, Archives) : même
 * graine et mêmes gestes, même journée. L'interface, la démo et le simulateur d'équilibrage partagent ce code.
 */
export interface PendingReturn {
  dossier: string;
  at: number;
  type: RetourType | 'CLASSE';
  motifs: string[];
}

/** Ce qui passe d'une journée à la suivante : le reliquat de la pile, les retours en route, les compteurs. */
export interface Carry {
  dossiers: Dossier[];
  pieces: Piece[];
  pile: string[];
  retours: PendingReturn[];
  seq: number;
  uid: number;
}

export type BureauEvent =
  | { k: 'arrivee'; dossier: string }
  | { k: 'retour'; dossier: string; type: RetourType }
  | { k: 'classe'; dossier: string }
  | { k: 'transmis'; dossier: string; points: number }
  | { k: 'points'; delta: number; raison: string }
  | { k: 'heure'; heure: number }
  | { k: 'sonnerie'; heure: number }
  | { k: 'corbeille'; detruites: number }
  | { k: 'postit'; texte: string }
  | { k: 'grace' }
  | { k: 'effondrement' }
  | { k: 'fin' };

export type Phase = 'travail' | 'grace' | 'fini' | 'effondre';

export interface BureauInit {
  jour: number;
  seed: number;
  specimen: Pt[][] | null;
  carry?: Carry | null;
  /** Le dossier de prise de poste en haut de la pile (le lundi). */
  tutoriel?: boolean;
  zen?: boolean;
  rules?: Partial<Omit<RuleContext, 'specimen'>>;
  /** Multiplie l'intervalle des arrivées (la démo, les tests). */
  intervalle?: number;
}

export interface DayStats {
  traites: number;
  retours: Record<RetourType, number>;
  classes: number;
  transferes: number;
  durees: number[];
}

/** Le plan des arrivées : intervalle moyen ÷ multiplicateur de la tranche horaire × un facteur tiré (0,7 à 1,3). */
export function arrivalTimes(params: DayParams, rng: Rng, factor = 1): number[] {
  const out: number[] = [];
  const minuteAt = (t: number) =>
    CONFIG.journee.debut + (t * (CONFIG.journee.fin - CONFIG.journee.debut)) / params.duree;
  let t = 0;
  for (;;) {
    const hour = minuteAt(t) / 60;
    const slot =
      CONFIG.arrivees.courbe.find((c) => hour >= c.de && hour < c.a) ?? CONFIG.arrivees.courbe[0];
    t +=
      ((params.intervalle * factor) / slot.x) *
      rng.range(CONFIG.arrivees.jitter[0], CONFIG.arrivees.jitter[1]);
    if (t >= params.duree) return out;
    out.push(t);
  }
}

export class Bureau {
  readonly params: DayParams;
  readonly ctx: RuleContext;
  readonly seq: Seq;
  t = 0;
  phase: Phase = 'travail';
  readonly dossiers = new Map<string, Dossier>();
  readonly pieces = new Map<string, Piece>();
  /** De bas en haut. */
  pile: string[] = [];
  courant: string | null = null;
  retours: PendingReturn[] = [];
  readonly arrivees: number[];
  score = 0;
  events: BureauEvent[] = [];
  readonly stats: DayStats = {
    traites: 0,
    retours: { R1: 0, R2: 0, R3: 0, NON_ACCUSE: 0 },
    classes: 0,
    transferes: 0,
    durees: [],
  };
  /** Débogage : le prochain dossier transmis revient avec ce motif. */
  forceRetour: RetourType | null = null;

  private nextArrival = 0;
  private generated = 0;
  private uidCounter: number;
  private zCounter = 0;
  private lastAbsurd = -Infinity;
  private scriptedR2 = false;
  private lastHour = 9;
  private graceUntil = 0;
  private lastModel: string | undefined;
  private readonly rngAbs: Rng;
  private readonly rngDelay: Rng;
  private readonly rngArchives: Rng;
  private readonly zen: boolean;

  constructor(readonly init: BureauInit) {
    this.params = DAYS[init.jour - 1];
    this.ctx = { specimen: init.specimen, ...DEFAULT_RULES, ...init.rules };
    this.seq = new Seq();
    this.seq.value = init.carry?.seq ?? 0;
    this.uidCounter = init.carry?.uid ?? 0;
    this.zen = Boolean(init.zen);
    this.rngAbs = new Rng(mix(init.seed, init.jour, 1));
    this.rngDelay = new Rng(mix(init.seed, init.jour, 2));
    this.rngArchives = new Rng(mix(init.seed, init.jour, 3));
    this.arrivees = arrivalTimes(
      this.params,
      new Rng(mix(init.seed, init.jour, 4)),
      init.intervalle ?? 1,
    );

    // Les Archives : le fouillis de fond, puis ce que la veille y a laissé.
    if (this.params.numero >= 2) {
      const rng = new Rng(mix(init.seed, init.jour, 5));
      for (let i = 0; i < Math.round(ARCHIVES_FOND * this.params.fouillis); i++)
        this.addPiece(fillerPiece(this.params, rng, (p) => this.uid(p)));
    }
    if (init.carry) {
      for (const p of init.carry.pieces) this.addPiece(p);
      for (const d of init.carry.dossiers) this.dossiers.set(d.id, d);
      for (const id of init.carry.pile) {
        const d = this.dossiers.get(id)!;
        d.arrivee = 0;
        this.pile.push(id);
      }
    }
    for (let i = 0; i < this.params.courrier; i++) this.arrive();
    if (init.carry) {
      for (const r of init.carry.retours) this.deliver({ ...r, at: 0 });
    }
    if (init.tutoriel) this.arrive(DOSSIERS.find((m) => m.tutoriel)!.id);
    this.events = [];
  }

  uid(prefix: string): string {
    return `${prefix}${++this.uidCounter}`;
  }

  /** Minutes depuis minuit, en jeu (9 h → 17 h). */
  minute(): number {
    const { debut, fin } = CONFIG.journee;
    return debut + (Math.min(this.t, this.params.duree) * (fin - debut)) / this.params.duree;
  }

  heure(): string {
    const m = Math.floor(this.minute());
    return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
  }

  /** Hauteur de la pile en unités d'épaisseur. */
  hauteur(): number {
    return this.pile.reduce((s, id) => s + this.dossiers.get(id)!.epaisseur, 0);
  }

  current(): Dossier | null {
    return this.courant ? this.dossiers.get(this.courant)! : null;
  }

  private addPiece(p: Piece): void {
    if (p.lieu === 'archives') this.placeInArchives(p);
    this.pieces.set(p.uid, p);
  }

  /** Une feuille qui tombe dans le fouillis : n'importe où, n'importe comment (Gérard y range). */
  placeInArchives(p: Piece): void {
    p.lieu = 'archives';
    p.flipped = false;
    p.x = this.rngArchives.range(150, 1130);
    p.y = this.rngArchives.range(170, 520);
    p.rot = this.rngArchives.range(-25, 25);
    p.z = ++this.zCounter;
  }

  /** Un nouveau dossier sur la pile (modèle tiré, ou imposé). */
  private arrive(modelId?: string): Dossier {
    const index = this.generated++;
    const rng = new Rng(mix(this.init.seed, this.params.numero, 1000 + index));
    const model = modelId
      ? DOSSIERS.find((m) => m.id === modelId)!
      : pickModel(this.params.numero, rng, this.lastModel);
    if (!modelId) this.lastModel = model.id;
    const g = genererDossier(model, rng, { jour: this.params, index, uid: (p) => this.uid(p) });
    for (const p of g.pieces) this.addPiece(p);
    const d = g.dossier;
    d.arrivee = this.t;
    this.dossiers.set(d.id, d);
    this.pile.push(d.id);
    this.events.push({ k: 'arrivee', dossier: d.id });
    return d;
  }

  /** Débogage : un dossier de plus sur la pile, tout de suite. */
  ajouter(): void {
    this.arrive();
  }

  /** Débogage : avance l'horloge de `minutes` de jeu. */
  avancer(minutes: number): void {
    this.tick((minutes * this.params.duree) / (CONFIG.journee.fin - CONFIG.journee.debut));
  }

  tick(dt: number): void {
    if (this.phase === 'fini' || this.phase === 'effondre') return;
    this.t += dt;
    while (
      this.phase === 'travail' &&
      this.nextArrival < this.arrivees.length &&
      this.arrivees[this.nextArrival] <= this.t
    ) {
      this.nextArrival++;
      this.arrive();
    }
    const due = this.retours.filter((r) => r.at <= this.t).sort((a, b) => a.at - b.at);
    if (due.length) {
      this.retours = this.retours.filter((r) => r.at > this.t);
      for (const r of due) this.deliver(r);
    }
    const hour = Math.floor(this.minute() / 60 + 1e-9);
    while (this.lastHour < hour) {
      this.lastHour++;
      this.events.push({ k: 'heure', heure: this.lastHour });
      if ([12, 14, 17].includes(this.lastHour))
        this.events.push({ k: 'sonnerie', heure: this.lastHour });
      this.emptyBin();
    }
    if (!this.zen && this.hauteur() > CONFIG.pile.capacite) {
      this.phase = 'effondre';
      this.events.push({ k: 'effondrement' });
      return;
    }
    if (this.phase === 'travail' && this.t >= this.params.duree) {
      if (this.courant) {
        this.phase = 'grace';
        this.graceUntil = this.t + CONFIG.journee.grace;
        this.events.push({ k: 'grace' });
      } else {
        this.finish();
      }
    }
    if (this.phase === 'grace' && this.t >= this.graceUntil) this.finish();
  }

  /** L'agent d'entretien passe à chaque heure pile : ce qui était dans la corbeille est perdu. */
  private emptyBin(): void {
    let n = 0;
    for (const p of this.pieces.values()) {
      if (p.lieu === 'corbeille') {
        p.lieu = 'detruite';
        n++;
      }
    }
    if (n) this.events.push({ k: 'corbeille', detruites: n });
  }

  /** Prendre le dossier du dessus. Renvoie le motif du refus, ou null. */
  prendre(): string | null {
    if (this.phase !== 'travail') return 'Fermeture : plus aucun dossier ne peut être pris.';
    if (this.courant) return 'Un dossier à la fois.';
    const id = this.pile.pop();
    if (!id) return 'La pile est vide. Profitez-en, ça ne durera pas.';
    const d = this.dossiers.get(id)!;
    d.etat = 'ouvert';
    d.prise = this.t;
    this.courant = id;
    for (const uid of d.contenu) this.pieces.get(uid)!.lieu = 'sousmain';
    return null;
  }

  /** Fermer la chemise : `ordre` = les pièces du sous-main de gauche à droite (sans bordereau ni fiches). */
  fermer(ordre: string[]): void {
    const d = this.current();
    if (!d || d.etat !== 'ouvert') return;
    const head = [d.bordereau, ...d.fiches];
    d.contenu = [...head, ...ordre.filter((uid) => !head.includes(uid))];
    for (const uid of d.contenu) this.pieces.get(uid)!.lieu = 'chemise';
    d.epaisseur = epaisseur(d.contenu.length);
    d.etat = 'ferme';
  }

  rouvrir(): void {
    const d = this.current();
    if (!d || d.etat !== 'ferme') return;
    d.etat = 'ouvert';
    for (const uid of d.contenu) this.pieces.get(uid)!.lieu = 'sousmain';
  }

  /** Les points d'un dossier à sa première transmission : lignes, bonus rapidité, bonus urgent. */
  pointsFor(d: Dossier): number {
    const lignes = d.exigences.length;
    const s = CONFIG.score;
    let mult = 1;
    if (d.prise !== null && this.t - d.prise <= s.rapidite.parLigne * lignes + s.rapidite.fixe)
      mult += s.rapidite.bonus;
    if (d.urgent && this.t - d.arrivee <= CONFIG.urgent.delai) mult += s.bonusUrgent;
    return Math.round(s.pointsParLigne * lignes * mult);
  }

  /** Glisser la chemise fermée dans le bac Sortant. Renvoie les motifs relevés (le joueur ne les voit qu'au retour). */
  transmettre(): string[] {
    const d = this.current();
    if (!d || d.etat !== 'ferme') return [];
    const motifs = checkDossier(d, this.pieces, this.ctx);
    this.courant = null;
    d.etat = 'transmis';
    if (!d.credite) {
      d.credite = true;
      d.points = this.pointsFor(d);
      this.score += d.points;
      this.stats.traites++;
      if (d.prise !== null) this.stats.durees.push(this.t - d.prise);
      this.events.push({ k: 'points', delta: d.points, raison: d.numero });
    }
    this.events.push({ k: 'transmis', dossier: d.id, points: d.credite ? d.points : 0 });

    // Deux tirages à chaque transmission, qu'on s'en serve ou non : la suite des retours ne dépend que de l'ordre.
    const r = this.rngAbs.float();
    const pick = this.rngAbs.float();
    let type: RetourType | null = null;
    if (this.forceRetour) {
      type = this.forceRetour;
      this.forceRetour = null;
      if (type === 'R1' && motifs.length === 0)
        motifs.push(`Ligne 1 : motif forcé par le débogage`);
    } else if (motifs.length) {
      type = motifs.length === 1 && motifs[0].startsWith('Retour non accusé') ? 'NON_ACCUSE' : 'R1';
    } else if (!d.tutoriel) {
      if (this.params.numero === 1 && !this.scriptedR2 && this.minute() >= 10 * 60 + 45) {
        type = 'R2';
        this.scriptedR2 = true;
      } else {
        const unlocked: RetourType[] = this.params.numero >= 2 ? ['R2', 'R3'] : [];
        const removable = d.contenu.some((uid) => uid !== d.bordereau && !d.fiches.includes(uid));
        const avail = unlocked.filter((x) => !d.absurdes.includes(x) && (x !== 'R3' || removable));
        let p = this.params.pAbs;
        if (this.hauteur() > CONFIG.pile.danger) p *= CONFIG.retours.freinDanger;
        const bucket = this.t - this.lastAbsurd >= CONFIG.retours.seauAbsurde;
        if (
          avail.length &&
          d.absurdes.length < CONFIG.retours.maxAbsurdesParDossier &&
          bucket &&
          r < p
        ) {
          type = avail[Math.floor(pick * avail.length)];
        }
      }
      if (type) {
        this.lastAbsurd = this.t;
        d.absurdes.push(type);
      }
    }
    if (type) {
      const [a, b] = CONFIG.retours.delai;
      const at = this.t + this.rngDelay.range(a, b);
      const classe = d.retours.length >= CONFIG.retours.maxParDossier;
      this.retours.push({
        dossier: d.id,
        at,
        type: classe ? 'CLASSE' : type,
        motifs: type === 'R1' || type === 'NON_ACCUSE' ? motifs : [],
      });
    }
    if (this.phase === 'grace') this.finish();
    return motifs;
  }

  /** Un retour tombe du tube : fiche agrafée, gommette, et le dossier sur le dessus de la pile. */
  private deliver(r: PendingReturn): void {
    const d = this.dossiers.get(r.dossier)!;
    if (r.type === 'CLASSE') {
      d.etat = 'classe';
      this.stats.classes++;
      for (const uid of d.contenu) this.pieces.get(uid)!.lieu = 'detruite';
      this.events.push({ k: 'classe', dossier: d.id });
      return;
    }
    let motifs = r.motifs;
    if (r.type === 'R1' || r.type === 'NON_ACCUSE') {
      const delta = -Math.round(d.points * CONFIG.score.penaliteR1);
      if (delta) {
        this.score += delta;
        this.events.push({ k: 'points', delta, raison: `Retour ${d.numero}` });
      }
    } else if (r.type === 'R2') {
      motifs = ["Retour pour complément d'information."];
      if (this.params.numero === 1 && !this.stats.retours.R2)
        this.events.push({ k: 'postit', texte: POSTIT_CHEF });
    } else if (r.type === 'R3') {
      const candidates = d.contenu
        .map((uid, i) => ({ uid, n: i + 1 }))
        .filter((c) => c.uid !== d.bordereau && !d.fiches.includes(c.uid));
      const lost = candidates[Math.floor(this.rngDelay.float() * candidates.length)];
      const piece = this.pieces.get(lost.uid)!;
      d.contenu = d.contenu.filter((uid) => uid !== lost.uid);
      this.placeInArchives(piece);
      motifs = [
        `Pièce n° ${lost.n} égarée lors du transfert (« ${piece.titre} »). Elle est aux Archives.`,
      ];
    }
    const fiche = ficheRetour(this.uid('r'), d, motifs, this.heure());
    this.pieces.set(fiche.uid, fiche);
    fiche.lieu = 'chemise';
    d.fiches.push(fiche.uid);
    d.contenu = [
      d.bordereau,
      ...d.fiches,
      ...d.contenu.filter((uid) => uid !== d.bordereau && !d.fiches.includes(uid)),
    ];
    d.retours.push({ type: r.type, motifs, fiche: fiche.uid });
    d.epaisseur = epaisseur(d.contenu.length);
    d.etat = 'pile';
    d.arrivee = this.t;
    this.stats.retours[r.type]++;
    this.pile.push(d.id);
    this.events.push({ k: 'retour', dossier: d.id, type: r.type });
  }

  /** 17 h (ou la fin du délai de grâce) : le dossier ouvert retourne sur la pile, le reliquat est calculé. */
  private finish(): void {
    const d = this.current();
    if (d) {
      if (d.etat === 'ouvert') {
        for (const p of this.pieces.values()) {
          if (p.dossier === d.id && p.lieu === 'sousmain') {
            p.lieu = 'chemise';
            if (!d.contenu.includes(p.uid)) d.contenu.push(p.uid);
          }
        }
      }
      d.etat = 'pile';
      this.pile.push(d.id);
      this.courant = null;
    }
    const surplus = this.pile.length - CONFIG.pile.reliquatMax;
    if (surplus > 0) {
      const transferred = this.pile.splice(CONFIG.pile.reliquatMax, surplus);
      for (const id of transferred) this.dossiers.get(id)!.etat = 'classe';
      this.stats.transferes = transferred.length;
      const delta = -CONFIG.score.penaliteReliquat * transferred.length;
      this.score += delta;
      this.events.push({ k: 'points', delta, raison: 'Transfert au guichet 7C' });
    }
    this.phase = 'fini';
    this.events.push({ k: 'fin' });
  }

  /** Ce que la journée lègue au lendemain. */
  carry(): Carry {
    const ids = new Set([
      ...this.pile,
      ...this.retours.filter((r) => r.type !== 'CLASSE').map((r) => r.dossier),
    ]);
    const dossiers = [...ids].map((id) => this.dossiers.get(id)!);
    const pieces = [...this.pieces.values()].filter(
      (p) => p.dossier !== null && ids.has(p.dossier) && p.lieu !== 'detruite',
    );
    return {
      dossiers: structuredClone(dossiers),
      pieces: structuredClone(pieces),
      pile: [...this.pile],
      retours: this.retours.filter((r) => r.type !== 'CLASSE').map((r) => ({ ...r, at: 0 })),
      seq: this.seq.value,
      uid: this.uidCounter,
    };
  }
}
