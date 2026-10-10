import {
  apply,
  bisector,
  centroid,
  clip,
  contains,
  det,
  EPS,
  IDENTITY,
  invert,
  Iso,
  Line,
  lineThrough,
  mirror,
  overlaps,
  reflect,
  side,
  sub,
  compose,
  v,
  Vec2,
} from './geometry';

/**
 * Une facette : un morceau plat de la feuille, qui ne se plie plus. Au départ, la feuille entière ;
 * chaque pli coupe en deux les facettes qu'il traverse.
 */
export interface Facet {
  readonly id: number;
  /** Contour convexe, en coordonnées « feuille » : la feuille telle qu'elle est posée au départ. */
  readonly poly: readonly Vec2[];
  /** Où la facette se trouve, une fois tout aplati sur la table (déterminant -1 : elle montre son dos). */
  readonly iso: Iso;
  /** Ordre d'empilement : plus il est grand, plus la facette est au-dessus. */
  readonly layer: number;
  /** Les étapes pendant lesquelles elle a bougé (pour viser « le rabat du dessus », par exemple). */
  readonly tags: ReadonlySet<string>;
  /** Mise en forme finale en 3D (ouvrir les ailes…), appliquée après la pose à plat. */
  readonly bends: readonly Bend[];
}

/** Une rotation autour d'une droite de la table, à la hauteur `h` (en couches). */
export interface Bend {
  readonly line: Line;
  readonly angle: number;
  readonly h: number;
}

/** Un pli marqué, en coordonnées feuille : on le dessine sur le papier. */
export interface Crease {
  readonly a: Vec2;
  readonly b: Vec2;
}

export interface PaperState {
  readonly facets: readonly Facet[];
  readonly creases: readonly Crease[];
  /** Prochain identifiant de facette libre. */
  readonly nextId: number;
}

/** Un point désigné par sa place sur la feuille de départ, ou par une position sur la table. */
export type Target = { readonly sheet: Vec2 } | { readonly world: Vec2 };
export const sheet = (x: number, y: number): Target => ({ sheet: v(x, y) });
export const world = (x: number, y: number): Target => ({ world: v(x, y) });

/** Quelles facettes participent à un pli (en plus d'être du bon côté de la droite). */
export interface Selection {
  /** Seulement les facettes qui ont bougé pendant l'une de ces étapes. */
  readonly only?: readonly string[];
  /** Pas celles qui ont bougé pendant l'une de ces étapes. */
  readonly except?: readonly string[];
  /** Filtre sur le centre de la facette, en coordonnées feuille. */
  readonly where?: (p: Vec2) => boolean;
  /** Filtre sur le centre de la facette, sur la table au moment du pli. */
  readonly within?: (p: Vec2) => boolean;
}

/**
 * Un pli : soit « amène `from` sur `to` » (la droite est leur médiatrice), soit « plie selon la
 * droite qui passe par ces deux points », le côté de `side` bougeant.
 */
export interface FoldSpec extends Selection {
  readonly from?: Target;
  readonly to?: Target;
  readonly through?: readonly [Target, Target];
  readonly side?: Target;
  /** Pli montagne : la partie qui bouge passe derrière. Sinon pli vallée : elle vient dessus. */
  readonly mountain?: boolean;
  /**
   * Pli vallée glissé dans une poche : la partie qui bouge finit sous les facettes qui ont bougé pendant
   * ces étapes (les rabats du gobelet), au lieu de se poser par-dessus tout.
   */
  readonly tuck?: readonly string[];
}

/** Mise en forme : on tourne une partie d'un angle quelconque autour d'un pli existant. */
export interface BendSpec extends Selection {
  readonly through: readonly [Target, Target];
  readonly side: Target;
  /** Angle (radians) ; positif, le côté de `side` monte vers le haut. */
  readonly angle: number;
}

export type Step =
  | {
      readonly kind: 'fold';
      readonly id: string;
      readonly text: string;
      readonly folds: readonly FoldSpec[];
      /** Plier puis déplier : il ne reste que la marque du pli. */
      readonly crease?: boolean;
    }
  | { readonly kind: 'flip'; readonly id: string; readonly text: string }
  | {
      readonly kind: 'bend';
      readonly id: string;
      readonly text: string;
      readonly bends: readonly BendSpec[];
    };

/** Rotation d'une facette pendant une étape : autour de `line`, de 0 à `angle`, à la hauteur `h` (en couches). */
export interface Turn {
  readonly line: Line;
  readonly angle: number;
  readonly h: number;
}

/** Ce qu'on montre au joueur pour une étape : la droite du pli et la flèche. */
export interface Guide {
  /** Segment du pli sur le modèle (absent pour un retournement). */
  readonly crease: readonly [Vec2, Vec2] | null;
  readonly mountain: boolean;
}

/**
 * Une étape préparée : les facettes déjà coupées, ce que fait chacune, et l'état final. L'animation
 * interpole entre `depth0` et `depth1` en tournant les facettes qui ont un `turn`.
 */
export interface Motion {
  readonly step: Step;
  readonly facets: readonly Facet[];
  readonly turns: readonly (Turn | null)[];
  /** Hauteur (en couches) de chaque facette avant et après le pli. */
  readonly depth0: readonly number[];
  readonly depth1: readonly number[];
  /** L'état une fois l'étape terminée (pour une marque de pli : la feuille dépliée, mais marquée). */
  readonly result: PaperState;
  /** Le geste : un point de la partie qui bouge et l'endroit où il arrive (vu de dessus). */
  readonly grab: Vec2;
  readonly drop: Vec2;
  readonly guides: readonly Guide[];
  readonly crease: boolean;
}

/** Les coordonnées feuille d'un carré de côté 2, posé droit ou en losange (pointe en haut). */
export function sheetPolygon(shape: 'square' | 'diamond'): Vec2[] {
  if (shape === 'square') return [v(-1, -1), v(1, -1), v(1, 1), v(-1, 1)];
  const s = Math.SQRT2;
  return [v(0, -s), v(s, 0), v(0, s), v(-s, 0)];
}

export function initialState(shape: 'square' | 'diamond'): PaperState {
  return {
    facets: [
      { id: 0, poly: sheetPolygon(shape), iso: IDENTITY, layer: 0, tags: new Set(), bends: [] },
    ],
    creases: [],
    nextId: 1,
  };
}

/** Où se trouve, sur la table, un point de la feuille (ou un point déjà donné sur la table). */
export function resolve(state: PaperState, t: Target): Vec2 {
  if ('world' in t) return t.world;
  const f = state.facets.find((f) => contains(f.poly, t.sheet));
  if (!f) throw new Error(`Point hors de la feuille : ${t.sheet.x}, ${t.sheet.y}`);
  return apply(f.iso, t.sheet);
}

export const worldPoly = (f: Facet) => f.poly.map((q) => apply(f.iso, q));

/**
 * La hauteur de chaque facette dans la pile, en couches : 0 sur la table, puis 1 + la plus haute des
 * facettes en dessous qui la recouvrent. Une pile de 3 feuilles ne fait que 3 couches, même si la
 * feuille compte 40 facettes.
 */
export function depths(facets: readonly Facet[]): number[] {
  const polys = facets.map(worldPoly);
  const order = facets.map((_, i) => i).sort((a, b) => facets[a].layer - facets[b].layer);
  const depth = new Array<number>(facets.length).fill(0);
  for (let k = 0; k < order.length; k++) {
    const i = order[k];
    for (let j = 0; j < k; j++) {
      const below = order[j];
      if (depth[below] + 1 > depth[i] && overlaps(polys[i], polys[below]))
        depth[i] = depth[below] + 1;
    }
  }
  return depth;
}

/** Renumérote les couches 0, 1, 2… dans le même ordre. */
function normalize(facets: Facet[]): Facet[] {
  const order = facets.map((f, i) => [f.layer, i] as const).sort((a, b) => a[0] - b[0]);
  const layer = new Array<number>(facets.length);
  order.forEach(([, i], rank) => (layer[i] = rank));
  return facets.map((f, i) => ({ ...f, layer: layer[i] }));
}

function selected(sel: Selection, f: Facet, poly: readonly Vec2[]): boolean {
  if (sel.only && !sel.only.some((id) => f.tags.has(id))) return false;
  if (sel.except && sel.except.some((id) => f.tags.has(id))) return false;
  const c = centroid(poly);
  if (sel.where && !sel.where(c)) return false;
  if (sel.within && !sel.within(apply(f.iso, c))) return false;
  return true;
}

function lineOf(state: PaperState, spec: FoldSpec | BendSpec): Line {
  if ('from' in spec && spec.from && spec.to)
    return bisector(resolve(state, spec.from), resolve(state, spec.to));
  if (!spec.through || !spec.side) throw new Error('Pli sans droite');
  const p = resolve(state, spec.through[0]);
  const q = resolve(state, spec.through[1]);
  return lineThrough(p, sub(q, p), resolve(state, spec.side));
}

/** Les points du contour posés sur la droite (au plus deux pour un polygone convexe). */
function onLine(poly: readonly Vec2[], d: (q: Vec2) => number): Vec2[] {
  return poly.filter((q) => Math.abs(d(q)) <= 1e-5);
}

interface Cut {
  facets: Facet[];
  moving: boolean[];
  creases: Crease[];
  nextId: number;
}

/**
 * Coupe les facettes par la droite et repère celles qui bougent. Une facette à cheval n'est coupée que
 * si sa partie mobile est sélectionnée : sinon elle reste entière, sans marque de pli.
 */
function cut(
  state: PaperState,
  facets: readonly Facet[],
  free: readonly boolean[],
  line: Line,
  sel: Selection,
): Cut {
  const out: Facet[] = [];
  const moving: boolean[] = [];
  const creases: Crease[] = [];
  let nextId = state.nextId;
  facets.forEach((f, i) => {
    if (!free[i]) {
      out.push(f);
      moving.push(false);
      return;
    }
    const d = (q: Vec2) => side(line, apply(f.iso, q));
    const ds = f.poly.map(d);
    const max = Math.max(...ds);
    const min = Math.min(...ds);
    if (max <= 1e-5) {
      out.push(f);
      moving.push(false);
    } else if (min >= -1e-5) {
      const go = selected(sel, f, f.poly);
      out.push(f);
      moving.push(go);
      const edge = onLine(f.poly, d);
      if (go && edge.length === 2) creases.push({ a: edge[0], b: edge[1] });
    } else {
      const [pos, neg] = clip(f.poly, d);
      if (pos.length && neg.length && selected(sel, f, pos)) {
        out.push({ ...f, id: nextId++, poly: pos }, { ...f, id: nextId++, poly: neg });
        moving.push(true, false);
        const edge = onLine(pos, d);
        if (edge.length === 2) creases.push({ a: edge[0], b: edge[1] });
      } else {
        out.push(f);
        moving.push(false);
      }
    }
  });
  return { facets: out, moving, creases, nextId };
}

/** Le segment de la droite qui traverse le modèle (pour la dessiner en pointillés). */
function span(facets: readonly Facet[], line: Line): readonly [Vec2, Vec2] | null {
  let lo = Infinity;
  let hi = -Infinity;
  for (const f of facets) {
    const poly = worldPoly(f);
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const sa = side(line, a);
      const sb = side(line, b);
      const hits: Vec2[] = [];
      if (Math.abs(sa) <= 1e-5) hits.push(a);
      if (sa * sb < 0)
        hits.push(v(a.x + ((b.x - a.x) * sa) / (sa - sb), a.y + ((b.y - a.y) * sa) / (sa - sb)));
      for (const h of hits) {
        const t = (h.x - line.p.x) * line.d.x + (h.y - line.p.y) * line.d.y;
        lo = Math.min(lo, t);
        hi = Math.max(hi, t);
      }
    }
  }
  if (!(hi - lo > EPS)) return null;
  const at = (t: number) => v(line.p.x + line.d.x * t, line.p.y + line.d.y * t);
  return [at(lo), at(hi)];
}

/** Le point de la partie mobile le plus loin de la droite : c'est lui qu'on « attrape ». */
function farthest(facets: readonly Facet[], moving: readonly boolean[], line: Line): Vec2 {
  let best = line.p;
  let far = -Infinity;
  facets.forEach((f, i) => {
    if (!moving[i]) return;
    for (const q of worldPoly(f)) {
      const s = side(line, q);
      if (s > far + 1e-6) {
        far = s;
        best = q;
      }
    }
  });
  return best;
}

function bbox(facets: readonly Facet[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const f of facets)
    for (const q of worldPoly(f)) {
      minX = Math.min(minX, q.x);
      minY = Math.min(minY, q.y);
      maxX = Math.max(maxX, q.x);
      maxY = Math.max(maxY, q.y);
    }
  return { minX, minY, maxX, maxY };
}

export function bounds(state: PaperState) {
  return bbox(state.facets);
}

/** Prépare une étape : coupe les facettes, calcule où chacune va et ce qu'il faut afficher. */
export function prepare(state: PaperState, step: Step): Motion {
  if (step.kind === 'flip') return prepareFlip(state, step);
  if (step.kind === 'bend') return prepareBend(state, step);

  let facets: Facet[] = [...state.facets];
  let turns: (Turn | null)[] = facets.map(() => null);
  let nextId = state.nextId;
  const creases: Crease[] = [];
  const guides: Guide[] = [];
  const lines: { line: Line; mountain: boolean; tuck?: readonly string[] }[] = [];
  let grab = v(0, 0);
  let drop = v(0, 0);

  step.folds.forEach((spec, k) => {
    const line = lineOf({ ...state, facets }, spec);
    const c = cut(
      { ...state, nextId },
      facets,
      turns.map((t) => t === null),
      line,
      spec,
    );
    // Les facettes coupées héritent de la rotation de leur parent (aucune ici : seules les libres sont coupées).
    const nextTurns: (Turn | null)[] = [];
    let j = 0;
    facets.forEach((f, i) => {
      const parts = c.facets[j] && c.facets[j].id === f.id ? 1 : 2;
      for (let p = 0; p < parts; p++) nextTurns.push(turns[i]);
      j += parts;
    });
    facets = c.facets;
    nextId = c.nextId;
    turns = nextTurns;
    creases.push(...c.creases);
    if (!c.moving.some(Boolean))
      throw new Error(`Étape « ${step.id} » : le pli ${k + 1} ne bouge rien`);
    lines.push({ line, mountain: !!spec.mountain, tuck: spec.tuck });
    if (k === 0) {
      grab = spec.from
        ? resolve({ ...state, facets }, spec.from)
        : farthest(facets, c.moving, line);
      drop = reflect(line, grab);
    }
    guides.push({ crease: span(facets, line), mountain: !!spec.mountain });
    // On note la rotation tout de suite, pour qu'un pli suivant ne reprenne pas ces facettes.
    turns = turns.map((t, i) =>
      c.moving[i] ? { line, angle: spec.mountain ? -Math.PI : Math.PI, h: 0 } : t,
    );
  });

  const depth0 = depths(facets);

  // L'état plié : chaque partie mobile est retournée, puis posée dessus (vallée) ou dessous (montagne).
  // (Les plis suivants ont pu couper des facettes : on retrouve chaque groupe par sa droite.)
  let folded = facets;
  for (const { line, mountain, tuck } of lines) {
    const moving = turns.map((t) => t?.line === line);
    const flip = mirror(line);
    const layers = folded.filter((_, i) => moving[i]).map((f) => f.layer);
    const top = Math.max(...folded.map((f) => f.layer));
    const bottom = Math.min(...folded.map((f) => f.layer));
    const hi = Math.max(...layers);
    const lo = Math.min(...layers);
    // Dans une poche : juste sous le plus bas des rabats visés, toujours dans l'ordre inverse.
    const pocket = tuck
      ? Math.min(
          ...folded
            .filter((f, i) => !moving[i] && tuck.some((id) => f.tags.has(id)))
            .map((f) => f.layer),
        )
      : 0;
    const layer = (f: Facet) =>
      mountain
        ? bottom - 1 - (f.layer - lo)
        : tuck
          ? pocket - 1 + (1 + hi - f.layer) / (hi - lo + 2)
          : top + 1 + (hi - f.layer);
    folded = folded.map((f, i) =>
      moving[i]
        ? { ...f, iso: compose(f.iso, flip), layer: layer(f), tags: new Set([...f.tags, step.id]) }
        : f,
    );
  }
  folded = normalize(folded);
  const depth1 = depths(folded);

  // L'axe de chaque pli passe au ras de la pile qui bouge : au-dessus (vallée) ou en dessous (montagne).
  turns = turns.map((t, i) => {
    if (!t) return null;
    const group = facets.map((_, j) => j).filter((j) => turns[j]?.line === t.line);
    const zs = group.map((j) => depth0[j]);
    return { ...t, h: t.angle > 0 ? Math.max(...zs) : Math.min(...zs) };
  });

  const marked = [...state.creases, ...creases];
  const result: PaperState = step.crease
    ? { facets: normalize(facets.map((f) => ({ ...f }))), creases: marked, nextId }
    : { facets: folded, creases: marked, nextId };

  return { step, facets, turns, depth0, depth1, result, grab, drop, guides, crease: !!step.crease };
}

/** Retourner le modèle : tout tourne d'un demi-tour autour d'un axe vertical passant par son milieu. */
function prepareFlip(state: PaperState, step: Step): Motion {
  const facets = state.facets;
  const b = bbox(facets);
  const cy = (b.minY + b.maxY) / 2;
  const c = v((b.minX + b.maxX) / 2, cy);
  const line = lineThrough(c, v(0, 1), v(b.maxX, cy));
  const depth0 = depths(facets);
  const flip = mirror(line);
  const result: PaperState = {
    ...state,
    facets: normalize(facets.map((f) => ({ ...f, iso: compose(f.iso, flip), layer: -f.layer }))),
  };
  const depth1 = depths(result.facets);
  const h = Math.max(...depth0) / 2;
  return {
    step,
    facets,
    turns: facets.map(() => ({ line, angle: Math.PI, h })),
    depth0,
    depth1,
    result,
    grab: v(b.maxX, cy),
    drop: v(b.minX, cy),
    guides: [],
    crease: false,
  };
}

/** Mise en forme 3D : les facettes choisies tournent autour d'un pli, sans changer l'empilement. */
function prepareBend(state: PaperState, step: Extract<Step, { kind: 'bend' }>): Motion {
  let facets: Facet[] = [...state.facets];
  let turns: (Turn | null)[] = facets.map(() => null);
  let nextId = state.nextId;
  let grab = v(0, 0);
  let drop = v(0, 0);
  const guides: Guide[] = [];
  const depth = depths(facets);

  step.bends.forEach((spec, k) => {
    const line = lineOf({ ...state, facets }, spec);
    const c = cut(
      { ...state, nextId },
      facets,
      turns.map((t) => t === null),
      line,
      spec,
    );
    if (c.facets.length !== facets.length)
      throw new Error(`Étape « ${step.id} » : une mise en forme doit suivre un pli existant`);
    nextId = c.nextId;
    if (!c.moving.some(Boolean))
      throw new Error(`Étape « ${step.id} » : la mise en forme ${k + 1} ne bouge rien`);
    const zs = depth.filter((_, i) => c.moving[i]);
    const h = zs.reduce((s, z) => s + z, 0) / zs.length;
    turns = turns.map((t, i) => (c.moving[i] ? { line, angle: spec.angle, h } : t));
    if (k === 0) {
      grab = farthest(facets, c.moving, line);
      const s = side(line, grab);
      drop = v(
        grab.x + line.n.x * (s * Math.cos(spec.angle) - s),
        grab.y + line.n.y * (s * Math.cos(spec.angle) - s),
      );
    }
    guides.push({ crease: span(facets, line), mountain: spec.angle < 0 });
  });

  const result: PaperState = {
    ...state,
    nextId,
    facets: facets.map((f, i) => {
      const t = turns[i];
      return t
        ? {
            ...f,
            bends: [...f.bends, { line: t.line, angle: t.angle, h: t.h }],
            tags: new Set([...f.tags, step.id]),
          }
        : f;
    }),
  };
  return {
    step,
    facets,
    turns,
    depth0: depth,
    depth1: depth,
    result,
    grab,
    drop,
    guides,
    crease: false,
  };
}

/** La face visible d'une facette posée à plat : le recto (motif) si elle n'est pas retournée. */
export const showsFront = (f: Facet) => det(f.iso) > 0;

/** Le point de la feuille qui se trouve en `p` sur la table, sur la facette la plus haute. */
export function topAt(state: PaperState, p: Vec2): { facet: Facet; sheet: Vec2 } | null {
  let best: Facet | null = null;
  for (const f of state.facets)
    if (contains(worldPoly(f), p) && (!best || f.layer > best.layer)) best = f;
  return best ? { facet: best, sheet: apply(invert(best.iso), p) } : null;
}

/** Suit les étapes d'un modèle : l'état courant, et l'historique pour revenir en arrière. */
export class Folder {
  private history: { before: PaperState; motion: Motion }[] = [];
  private cached: Motion | null = null;
  state: PaperState;

  constructor(
    readonly shape: 'square' | 'diamond',
    readonly steps: readonly Step[],
  ) {
    this.state = initialState(shape);
  }

  get index() {
    return this.history.length;
  }

  get done() {
    return this.index >= this.steps.length;
  }

  /** L'étape à faire, préparée (calculée une seule fois). */
  next(): Motion | null {
    if (this.done) return null;
    this.cached ??= prepare(this.state, this.steps[this.index]);
    return this.cached;
  }

  commit(motion: Motion) {
    this.history.push({ before: this.state, motion });
    this.state = motion.result;
    this.cached = null;
  }

  /** Annule la dernière étape ; renvoie son mouvement, pour le rejouer à l'envers. */
  undo(): Motion | null {
    const last = this.history.pop();
    if (!last) return null;
    this.state = last.before;
    this.cached = null;
    return last.motion;
  }
}
