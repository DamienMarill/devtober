import {
  Seq,
  newStampTool,
  reink,
  stamp,
  stroke,
  toggle,
  type,
  useStamp,
  type StampTool,
} from './actions';
import type { Bureau, BureauEvent } from './bureau';
import { CONFIG } from './config';
import { joinDate, splitDate } from './dates';
import { blankPiece } from './generate';
import type { Dossier, Face, Field, Piece, Pt, StampId } from './model';
import { checkExigence, expand, inRect, signatureGroup, type RuleContext } from './rules';
import {
  FOLDER,
  POT_ITEMS,
  R,
  STAMP_ORDER,
  daterWheel,
  hitPiece,
  inkWell,
  inside,
  stampSlot,
  toLocal,
  INKS,
} from './scene';
import { chooseSpecimen, strokesLength } from './signature';

/**
 * Le bureau vu par la souris : un contrôleur sans DOM qui reçoit des gestes en coordonnées de scène (enfoncer,
 * déplacer, relâcher, molette, clavier) et les traduit en actions sur la journée. L'interface Angular lui passe
 * les événements du pointeur ; la démo (touche T) lui passe les gestes de son curseur fantôme. Mêmes règles pour
 * tout le monde.
 */
export type Tool =
  | { k: 'main' }
  | { k: 'stylo'; ink: 'bleu' | 'rouge' }
  | { k: 'tampon'; id: StampId; rot: number }
  | { k: 'loupe' };

export interface Sfx {
  stamp(): void;
  paper(): void;
  slide(): void;
  pen(speed: number): void;
  penUp(): void;
  tube(): void;
  thud(): void;
  bell(): void;
  click(): void;
  drawer(): void;
  reink(): void;
  refuse(): void;
  chariot(): void;
  key(): void;
}

export const SILENT: Sfx = {
  stamp() {},
  paper() {},
  slide() {},
  pen() {},
  penUp() {},
  tube() {},
  thud() {},
  bell() {},
  click() {},
  drawer() {},
  reink() {},
  refuse() {},
  chariot() {},
  key() {},
};

export interface PostIt {
  id: number;
  texte: string;
  x: number;
  y: number;
  rot: number;
  until: number;
  chef?: boolean;
}

export interface Anim {
  id: number;
  kind: 'arrivee' | 'retour' | 'transmis' | 'classe' | 'points';
  at: number;
  dossier?: string;
  delta?: number;
}

type Station =
  | { k: 'pot'; item: (typeof POT_ITEMS)[number]['id'] }
  | { k: 'tampon'; id: StampId }
  | { k: 'encre'; ink: (typeof INKS)[number] }
  | { k: 'molette'; i: 0 | 1 | 2 }
  | { k: 'pile' }
  | { k: 'archives' }
  | { k: 'corbeille' }
  | { k: 'sortant' }
  | { k: 'rabat' };

interface Drag {
  kind: 'piece' | 'folder' | 'feuille';
  uid?: string;
  start: Pt;
  dx: number;
  dy: number;
  ox: number;
  oy: number;
  moved: boolean;
}

interface Pen {
  piece: string;
  face: Face;
  points: Pt[];
  groupe: number;
  ink: 'bleu' | 'rouge';
  last: Pt;
  lastT: number;
}

export interface HelpLine {
  n: number;
  ok: boolean;
  chaud: boolean;
}

/** Le mode spécimen du lundi matin : un formulaire, trois signatures. */
export interface SpecimenState {
  sheet: Piece;
  ok: boolean[];
  message: string | null;
  done: boolean;
  until: number;
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const norm180 = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180;

export class Desk {
  clock = 0;
  tool: Tool = { k: 'main' };
  readonly stamps = Object.fromEntries(STAMP_ORDER.map((id) => [id, newStampTool(id)])) as Record<
    StampId,
    StampTool
  >;
  dater: [number, number, number];
  pointer: Pt = { x: 640, y: 420 };
  drag: Drag | null = null;
  pen: Pen | null = null;
  focus: { piece: string; champ: string } | null = null;
  overlay: 'archives' | 'corbeille' | null = null;
  lens = false;
  memoOpen = false;
  hoverStation: Station['k'] | null = null;
  postits: PostIt[] = [];
  anims: Anim[] = [];
  shakeUntil = 0;
  reinkUntil = 0;
  folder: Pt | null = null;
  folderZ = 0;
  specimen: SpecimenState | null = null;
  /** Ce que les gestes ont coûté, pour la calibration (export JSON depuis F3). */
  readonly journal: { t: number; geste: string; duree: number }[] = [];
  onSpecimen: ((strokes: Pt[][]) => void) | null = null;

  private readonly seq: Seq;
  private readonly local = new Map<string, Piece>();
  private lastPenUp: {
    piece: string;
    face: Face;
    t: number;
    groupe: number;
    box: { x: number; y: number; w: number; h: number };
  } | null = null;
  private rightDown: { t: number; p: Pt } | null = null;
  private lastClick: { uid: string; t: number } | null = null;
  private memoSince = 0;
  private z = 10;
  private ids = 0;
  private lastGesture = 0;

  constructor(
    readonly bureau: Bureau | null,
    readonly sfx: Sfx,
    readonly opts: { jour: number; aide: boolean; dateur: boolean; date: string },
  ) {
    this.seq = bureau?.seq ?? new Seq();
    this.dater = splitDate(opts.date);
  }

  get pieces(): ReadonlyMap<string, Piece> {
    return this.bureau?.pieces ?? this.local;
  }

  get ctx(): RuleContext | null {
    return this.bureau?.ctx ?? null;
  }

  current(): Dossier | null {
    return this.bureau?.current() ?? null;
  }

  /** Les pièces posées sur le bureau, de bas en haut. */
  deskPieces(): Piece[] {
    return [...this.pieces.values()]
      .filter((p) => p.lieu === 'sousmain' || p.lieu === 'bureau')
      .sort((a, b) => a.z - b.z);
  }

  /** Les feuilles de la surimpression ouverte (Archives ou corbeille). */
  overlayPieces(): Piece[] {
    if (!this.overlay) return [];
    const lieu = this.overlay;
    return [...this.pieces.values()].filter((p) => p.lieu === lieu).sort((a, b) => a.z - b.z);
  }

  private postit(texte: string, at: Pt, seconds = 2.8, chef = false): void {
    this.postits = this.postits.filter((p) => p.texte !== texte);
    this.postits.push({
      id: ++this.ids,
      texte,
      x: at.x,
      y: at.y,
      rot: rnd(-5, 5),
      until: this.clock + seconds,
      chef,
    });
  }

  private log(geste: string): void {
    this.journal.push({
      t: this.clock,
      geste,
      duree: Math.round((this.clock - this.lastGesture) * 100) / 100,
    });
    this.lastGesture = this.clock;
  }

  /* ───────── Temps ───────── */

  frame(dt: number): void {
    this.clock += dt;
    if (this.bureau) {
      this.bureau.tick(dt);
      for (const e of this.bureau.events) this.onEvent(e);
      this.bureau.events = [];
    }
    const d = this.current();
    if (
      this.memoOpen &&
      d &&
      d.etat === 'ouvert' &&
      !d.memoLu &&
      this.clock - this.memoSince > 0.6
    ) {
      d.memoLu = true;
      this.pieces.get(d.bordereau)!.v++;
    }
    this.postits = this.postits.filter((p) => p.until > this.clock);
    this.anims = this.anims.filter((a) => this.clock - a.at < 3);
    if (this.specimen && this.specimen.until && this.clock >= this.specimen.until)
      this.resolveSpecimen();
  }

  private onEvent(e: BureauEvent): void {
    switch (e.k) {
      case 'arrivee':
        this.sfx.thud();
        this.anims.push({ id: ++this.ids, kind: 'arrivee', at: this.clock, dossier: e.dossier });
        break;
      case 'retour':
        this.sfx.tube();
        this.anims.push({ id: ++this.ids, kind: 'retour', at: this.clock, dossier: e.dossier });
        break;
      case 'classe': {
        const d = this.bureau!.dossiers.get(e.dossier)!;
        this.anims.push({ id: ++this.ids, kind: 'classe', at: this.clock, dossier: e.dossier });
        this.postit(`Dossier ${d.numero} : classé sans suite.`, { x: 150, y: 180 }, 4);
        break;
      }
      case 'points':
        this.anims.push({ id: ++this.ids, kind: 'points', at: this.clock, delta: e.delta });
        break;
      case 'sonnerie':
        this.sfx.bell();
        break;
      case 'corbeille':
        this.sfx.chariot();
        this.postit(
          "L'agent d'entretien est passé : la corbeille est vide.",
          { x: 150, y: 600 },
          4,
        );
        if (this.overlay === 'corbeille') this.overlay = null;
        break;
      case 'postit':
        this.postit(e.texte, { x: 560, y: 120 }, 9999, true);
        break;
      case 'grace':
        this.postit(
          '17 h : terminez le dossier en cours, rien d’autre ne sera pris.',
          { x: 150, y: 118 },
          10,
        );
        break;
      default:
        break;
    }
  }

  /* ───────── Pièces et stations sous le pointeur ───────── */

  /** L'objet le plus haut sous le pointeur : le dossier fermé ou une pièce. */
  private topAt(p: Pt): { kind: 'folder' } | { kind: 'piece'; piece: Piece; local: Pt } | null {
    const pieces = this.deskPieces().reverse();
    const folderHit =
      this.folder &&
      inside(p, {
        x: this.folder.x - FOLDER.w / 2,
        y: this.folder.y - FOLDER.h / 2,
        w: FOLDER.w,
        h: FOLDER.h,
      });
    for (const piece of pieces) {
      if (folderHit && piece.z < this.folderZ) return { kind: 'folder' };
      const local = hitPiece(piece, p);
      if (local) return { kind: 'piece', piece, local };
    }
    return folderHit ? { kind: 'folder' } : null;
  }

  private stationAt(p: Pt): Station | null {
    for (const item of POT_ITEMS) if (inside(p, item.rect)) return { k: 'pot', item: item.id };
    for (const id of STAMP_ORDER) if (inside(p, stampSlot(id))) return { k: 'tampon', id };
    for (const ink of INKS) if (inside(p, inkWell(ink))) return { k: 'encre', ink };
    for (const i of [0, 1, 2] as const) if (inside(p, daterWheel(i))) return { k: 'molette', i };
    const d = this.current();
    if (d && d.etat === 'ouvert' && inside(p, R.rabat)) return { k: 'rabat' };
    if (inside(p, R.pile)) return { k: 'pile' };
    if (inside(p, R.archives)) return { k: 'archives' };
    if (inside(p, R.corbeille)) return { k: 'corbeille' };
    if (inside(p, R.sortant)) return { k: 'sortant' };
    return null;
  }

  private fieldAt(piece: Piece, local: Pt, kinds: Field['kind'][]): Field | undefined {
    const face: Face = piece.flipped ? 'verso' : 'recto';
    return piece.fields.find(
      (f) => f.face === face && kinds.includes(f.kind) && inRect(local, expand(f.zone, 2)),
    );
  }

  /* ───────── Gestes ───────── */

  down(p: Pt, button: number): void {
    this.pointer = p;
    if (button === 2) {
      this.rightDown = { t: this.clock, p };
      return;
    }
    if (this.tool.k === 'loupe') {
      this.lens = true;
      return;
    }
    if (this.overlay) return this.downOverlay(p);
    const hit = this.topAt(p);
    const station = this.stationAt(p);
    const focusBefore = this.focus;
    this.focus = null;

    if (this.tool.k === 'stylo') {
      if (hit?.kind === 'piece') {
        const field = this.fieldAt(hit.piece, hit.local, ['case', 'champ']);
        if (field?.kind === 'case') return this.toggleCase(hit.piece, field);
        if (field?.kind === 'champ') return this.focusField(hit.piece, field);
        return this.startStroke(hit.piece, hit.local);
      }
      if (station) this.station(station);
      return;
    }
    if (this.tool.k === 'tampon') {
      if (hit?.kind === 'piece') return this.print(hit.piece, p);
      if (station) this.station(station);
      return;
    }
    if (hit) {
      const pos = hit.kind === 'folder' ? this.folder! : { x: hit.piece.x, y: hit.piece.y };
      this.drag = {
        kind: hit.kind === 'folder' ? 'folder' : 'piece',
        uid: hit.kind === 'piece' ? hit.piece.uid : undefined,
        start: p,
        dx: p.x - pos.x,
        dy: p.y - pos.y,
        ox: pos.x,
        oy: pos.y,
        moved: false,
      };
      if (hit.kind === 'piece' && focusBefore?.piece === hit.piece.uid) this.focus = focusBefore;
      return;
    }
    if (station) this.station(station);
  }

  move(p: Pt): void {
    this.pointer = p;
    if (
      this.rightDown &&
      !this.lens &&
      (this.clock - this.rightDown.t > 0.12 ||
        Math.hypot(p.x - this.rightDown.p.x, p.y - this.rightDown.p.y) > 6)
    ) {
      this.lens = true;
    }
    const overMemo = !this.overlay && inside(p, R.memo);
    if (overMemo && !this.memoOpen) this.memoSince = this.clock;
    this.memoOpen = overMemo;
    this.hoverStation = this.overlay ? null : overMemo ? null : (this.stationAt(p)?.k ?? null);

    if (this.pen) {
      const piece = this.pieces.get(this.pen.piece)!;
      const l = toLocal(piece, p);
      const d = Math.hypot(l.x - this.pen.last.x, l.y - this.pen.last.y);
      if (d >= 1.5) {
        const dt = Math.max(0.008, this.clock - this.pen.lastT);
        this.sfx.pen(d / dt);
        this.pen.points.push(l);
        this.pen.last = l;
        this.pen.lastT = this.clock;
      }
      return;
    }
    const drag = this.drag;
    if (!drag) return;
    if (!drag.moved && Math.hypot(p.x - drag.start.x, p.y - drag.start.y) > 4) {
      drag.moved = true;
      this.focus = null;
      if (drag.kind === 'folder') this.folderZ = ++this.z;
      else {
        const piece = this.pieces.get(drag.uid!)!;
        piece.z = ++this.z;
        this.sfx.paper();
      }
    }
    if (!drag.moved) return;
    const x = p.x - drag.dx;
    const y = p.y - drag.dy;
    if (drag.kind === 'folder') this.folder = { x, y };
    else {
      const piece = this.pieces.get(drag.uid!)!;
      piece.x = x;
      piece.y = y;
    }
  }

  up(p: Pt, button: number): void {
    this.pointer = p;
    if (button === 2) {
      const rd = this.rightDown;
      this.rightDown = null;
      if (this.lens && this.tool.k !== 'loupe') {
        this.lens = false;
        return;
      }
      if (rd && this.clock - rd.t < 0.3) {
        const s = this.overlay ? null : this.stationAt(p);
        if (s?.k === 'molette') this.turnWheel(s.i, -1);
        else this.putBack();
      }
      this.lens = false;
      return;
    }
    if (this.tool.k === 'loupe') {
      this.lens = false;
      return;
    }
    if (this.pen) return this.endStroke();
    const drag = this.drag;
    this.drag = null;
    if (!drag) return;
    if (!drag.moved) return this.click(drag);
    if (drag.kind === 'folder') return this.dropFolder(p, drag);
    if (drag.kind === 'feuille') return this.dropSheet(p, drag);
    return this.dropPiece(p, drag);
  }

  wheel(dy: number, p: Pt): void {
    if (this.tool.k === 'tampon') {
      this.tool = {
        ...this.tool,
        rot: norm180(this.tool.rot + Math.sign(dy) * CONFIG.tampon.pasRotation),
      };
      this.sfx.click();
      return;
    }
    const s = this.stationAt(p);
    if (s?.k === 'molette') this.turnWheel(s.i, dy < 0 ? 1 : -1);
  }

  /** Le clavier : la saisie d'un champ d'abord. Renvoie vrai si la touche est consommée. */
  key(key: string): boolean {
    if (this.focus) {
      const piece = this.pieces.get(this.focus.piece)!;
      if (key === 'Enter' || key === 'Escape' || key === 'Tab') {
        this.focus = null;
        return true;
      }
      if (key === 'Backspace') {
        type(piece, this.seq, this.focus.champ, '\b');
        this.sfx.key();
        return true;
      }
      if (key.length === 1) {
        const current = piece.textes[this.focus.champ]?.chars.length ?? 0;
        if (current < 44) {
          type(piece, this.seq, this.focus.champ, key);
          this.sfx.key();
        }
        return true;
      }
      return false;
    }
    if (key === ' ') {
      this.take();
      return true;
    }
    if (key === 'Escape') {
      if (this.overlay) {
        this.overlay = null;
        this.sfx.drawer();
        return true;
      }
      if (this.tool.k !== 'main') {
        this.putBack();
        return true;
      }
    }
    return false;
  }

  /* ───────── Les stations ───────── */

  private station(s: Station): void {
    switch (s.k) {
      case 'pot':
        if (s.item === 'loupe')
          this.tool = this.tool.k === 'loupe' ? { k: 'main' } : { k: 'loupe' };
        else
          this.tool =
            this.tool.k === 'stylo' && this.tool.ink === s.item
              ? { k: 'main' }
              : { k: 'stylo', ink: s.item };
        this.sfx.click();
        break;
      case 'tampon':
        this.tool =
          this.tool.k === 'tampon' && this.tool.id === s.id
            ? { k: 'main' }
            : { k: 'tampon', id: s.id, rot: 0 };
        this.sfx.click();
        break;
      case 'encre':
        if (this.tool.k === 'tampon') {
          reink(this.stamps[this.tool.id], s.ink);
          this.reinkUntil = this.clock + CONFIG.tampon.reencrage;
          this.sfx.reink();
        }
        break;
      case 'molette':
        this.turnWheel(s.i, 1);
        break;
      case 'pile':
        this.take();
        break;
      case 'archives':
        if (this.opts.jour < 2)
          this.postit('Les Archives ouvrent mardi. Elles sont fermées pour inventaire.', {
            x: 1040,
            y: 520,
          });
        else {
          this.overlay = 'archives';
          this.tool = { k: 'main' };
          this.sfx.drawer();
        }
        break;
      case 'corbeille':
        if (![...this.pieces.values()].some((p) => p.lieu === 'corbeille'))
          this.postit('La corbeille est vide.', { x: 150, y: 610 });
        else {
          this.overlay = 'corbeille';
          this.tool = { k: 'main' };
          this.sfx.paper();
        }
        break;
      case 'rabat':
        this.close();
        break;
      case 'sortant':
        break;
    }
  }

  private turnWheel(i: 0 | 1 | 2, delta: number): void {
    if (!this.opts.dateur) {
      this.postit('Le dateur est réglé par le service jusqu’à mardi.', { x: 640, y: 560 });
      return;
    }
    const d = [...this.dater] as [number, number, number];
    if (i === 0) d[0] = ((d[0] - 1 + delta + 31) % 31) + 1;
    else if (i === 1) d[1] = ((d[1] - 1 + delta + 12) % 12) + 1;
    else d[2] = Math.max(1970, Math.min(2099, d[2] + delta));
    this.dater = d;
    this.sfx.click();
  }

  datedText(): string {
    return joinDate(this.dater);
  }

  /** Clic droit court : l'outil retourne à sa place. */
  putBack(): void {
    if (this.tool.k !== 'main') {
      this.tool = { k: 'main' };
      this.sfx.click();
    }
  }

  /* ───────── Le dossier ───────── */

  take(): void {
    if (!this.bureau || this.specimen) return;
    const refus = this.bureau.prendre();
    if (refus) {
      this.sfx.refuse();
      this.postit(refus, { x: 150, y: 240 });
      return;
    }
    this.arrange(this.current()!);
    this.sfx.paper();
    this.log('prendre');
  }

  /** Étale le dossier ouvert : le bordereau sur la chemise, les fiches de retour au-dessus, les pièces à droite. */
  arrange(d: Dossier): void {
    const pieces = this.pieces;
    const b = pieces.get(d.bordereau)!;
    b.x = R.chemise.x + R.chemise.w / 2;
    b.y = R.chemise.y + 6 + b.h / 2;
    b.rot = rnd(-1, 1);
    b.z = ++this.z;
    // Les justificatifs dessous, les pièces à remplir (celles que vise le bordereau) dessus.
    const targets = new Set(d.exigences.flatMap((e) => (e.piece ? [e.piece] : [])));
    const others = d.contenu
      .filter((uid) => uid !== d.bordereau && !d.fiches.includes(uid))
      .sort((a, b) => Number(targets.has(a)) - Number(targets.has(b)));
    const slots = [
      { x: 612, y: 290 },
      { x: 706, y: 306 },
      { x: 800, y: 292 },
      { x: 650, y: 412 },
      { x: 752, y: 424 },
      { x: 832, y: 404 },
      { x: 580, y: 360 },
    ];
    others.forEach((uid, i) => {
      const p = pieces.get(uid)!;
      const slot = slots[i % slots.length];
      p.x = slot.x + rnd(-8, 8);
      p.y = slot.y + rnd(-8, 8);
      p.rot = rnd(-3, 3);
      p.z = ++this.z;
    });
    d.fiches.forEach((uid, i) => {
      const f = pieces.get(uid)!;
      f.x = 470 + i * 10;
      f.y = 236 + i * 12;
      f.rot = rnd(-4, 2);
      f.z = ++this.z;
    });
    this.folder = null;
  }

  /** Le rabat : les pièces du sous-main rentrent dans la chemise, de gauche à droite. */
  close(): void {
    const d = this.current();
    if (!this.bureau || !d || d.etat !== 'ouvert') return;
    const head = new Set([d.bordereau, ...d.fiches]);
    const onPad = this.deskPieces().filter((p) => !head.has(p.uid) && inside(p, R.sousmain));
    for (const p of this.deskPieces())
      if (!head.has(p.uid) && !inside(p, R.sousmain)) p.lieu = 'bureau';
    this.bureau.fermer(onPad.sort((a, b) => a.x - b.x).map((p) => p.uid));
    this.folder = { x: FOLDER.x, y: FOLDER.y };
    this.folderZ = ++this.z;
    this.focus = null;
    this.sfx.paper();
    this.log('fermer');
  }

  /** Glisser la chemise fermée dans le bac Sortant. */
  transmit(): void {
    if (!this.bureau) return;
    const d = this.current();
    if (!d || d.etat !== 'ferme') return;
    this.bureau.transmettre();
    this.anims.push({ id: ++this.ids, kind: 'transmis', at: this.clock, dossier: d.id });
    this.folder = null;
    this.sfx.slide();
    this.log('transmettre');
  }

  private click(drag: Drag): void {
    if (drag.kind === 'folder') {
      this.bureau?.rouvrir();
      this.folder = null;
      this.sfx.paper();
      return;
    }
    if (drag.kind === 'feuille') return;
    const piece = this.pieces.get(drag.uid!)!;
    const double = this.lastClick?.uid === piece.uid && this.clock - this.lastClick.t < 0.35;
    this.lastClick = { uid: piece.uid, t: this.clock };
    const local = toLocal(piece, drag.start);
    const field = this.fieldAt(piece, local, ['case', 'champ']);
    if (field?.kind === 'case') return this.toggleCase(piece, field);
    if (field?.kind === 'champ') return this.focusField(piece, field);
    if (double) this.flip(piece);
    else piece.z = ++this.z;
  }

  flip(piece: Piece): void {
    piece.flipped = !piece.flipped;
    piece.v++;
    this.lastClick = null;
    this.sfx.paper();
    if (piece.scelle && !piece.ouvert) {
      piece.ouvert = true;
      this.postit(
        'Flacon ouvert. L’odeur, indescriptible, se répand dans le guichet.',
        { x: piece.x, y: piece.y - 80 },
        4,
      );
    }
  }

  private toggleCase(piece: Piece, field: Field): void {
    toggle(piece, this.seq, field.id);
    this.sfx.click();
    this.log('cocher');
  }

  private focusField(piece: Piece, field: Field): void {
    this.focus = { piece: piece.uid, champ: field.id };
    piece.z = ++this.z;
    this.sfx.click();
  }

  private print(piece: Piece, p: Pt): void {
    if (this.tool.k !== 'tampon') return;
    if (this.clock < this.reinkUntil) return;
    const tool = this.stamps[this.tool.id];
    const nette = useStamp(tool);
    const l = toLocal(piece, p);
    stamp(piece, this.seq, {
      stamp: this.tool.id,
      ink: tool.ink,
      x: l.x,
      y: l.y,
      rot: norm180(this.tool.rot - piece.rot),
      nette,
      date: this.tool.id === 'RECU_LE' ? joinDate(this.dater) : undefined,
      face: piece.flipped ? 'verso' : 'recto',
    });
    this.shakeUntil = this.clock + 0.08;
    this.sfx.stamp();
    this.log(`tampon ${this.tool.id}`);
  }

  /** Met une pièce au premier plan (comme un clic dessus). */
  raise(uid: string): void {
    const p = this.pieces.get(uid);
    if (p) p.z = ++this.z;
  }

  /** Le dernier geste d'encre : l'encreur rend 3 empreintes nettes. */
  inkLeft(id: StampId): number {
    return this.stamps[id].charges;
  }

  private startStroke(piece: Piece, local: Pt): void {
    if (this.tool.k !== 'stylo') return;
    const face: Face = piece.flipped ? 'verso' : 'recto';
    // Un trait prolonge la signature précédente s'il suit de près (moins de 1,5 s) et commence à côté d'elle.
    const lp = this.lastPenUp;
    const near = lp && inRect(local, expand(lp.box, 30));
    const groupe =
      lp &&
      near &&
      lp.piece === piece.uid &&
      lp.face === face &&
      this.clock - lp.t < CONFIG.signature.pauseMax
        ? lp.groupe
        : this.seq.next();
    this.pen = {
      piece: piece.uid,
      face,
      points: [local],
      groupe,
      ink: this.tool.ink,
      last: local,
      lastT: this.clock,
    };
    piece.z = Math.max(piece.z, this.z);
  }

  private endStroke(): void {
    const pen = this.pen!;
    this.pen = null;
    this.sfx.penUp();
    if (pen.points.length < 2) return;
    const piece = this.pieces.get(pen.piece)!;
    stroke(piece, this.seq, {
      points: pen.points,
      ink: pen.ink,
      face: pen.face,
      groupe: pen.groupe,
    });
    const pts = piece.strokes.filter((st) => st.groupe === pen.groupe).flatMap((st) => st.points);
    const xs = pts.map((q) => q.x);
    const ys = pts.map((q) => q.y);
    const box = {
      x: Math.min(...xs),
      y: Math.min(...ys),
      w: Math.max(...xs) - Math.min(...xs),
      h: Math.max(...ys) - Math.min(...ys),
    };
    this.lastPenUp = { piece: pen.piece, face: pen.face, t: this.clock, groupe: pen.groupe, box };
    this.log('trait');
    if (this.specimen && piece === this.specimen.sheet) this.checkSpecimen();
  }

  private dropPiece(p: Pt, drag: Drag): void {
    const piece = this.pieces.get(drag.uid!)!;
    const d = this.current();
    const restore = (texte: string) => {
      piece.x = drag.ox;
      piece.y = drag.oy;
      this.sfx.refuse();
      this.postit(texte, p);
    };
    if (inside(p, R.corbeille)) {
      if (d && (piece.uid === d.bordereau || d.fiches.includes(piece.uid)))
        return restore('Le bordereau ne se perd pas. Jamais.');
      if (this.specimen) return restore('Le spécimen se dépose, il ne se jette pas.');
      piece.lieu = 'corbeille';
      piece.x = rnd(380, 900);
      piece.y = rnd(260, 460);
      piece.rot = rnd(-30, 30);
      piece.z = ++this.z;
      this.sfx.paper();
      this.log('jeter');
      return;
    }
    if (inside(p, R.sortant)) return restore('On transmet un dossier fermé, pas une pièce.');
    if (inside(p, R.pile))
      return restore('La pile n’accepte que des dossiers, et elle en a assez.');
    piece.lieu = inside(piece, R.sousmain) ? 'sousmain' : 'bureau';
    piece.rot = rnd(-3, 3);
    this.sfx.paper();
  }

  private dropFolder(p: Pt, drag: Drag): void {
    if (inside(p, R.sortant)) return this.transmit();
    if (inside(p, R.pile)) {
      this.folder = { x: drag.ox, y: drag.oy };
      this.sfx.refuse();
      this.postit('Un dossier entamé ne retourne pas sur la pile.', p);
      return;
    }
    this.sfx.paper();
  }

  /* ───────── Archives et corbeille ───────── */

  private downOverlay(p: Pt): void {
    if (inside(p, R.poignee)) {
      this.overlay = null;
      this.sfx.drawer();
      return;
    }
    const sheets = this.overlayPieces().reverse();
    for (const piece of sheets) {
      if (hitPiece(piece, p)) {
        piece.z = ++this.z;
        this.drag = {
          kind: 'feuille',
          uid: piece.uid,
          start: p,
          dx: p.x - piece.x,
          dy: p.y - piece.y,
          ox: piece.x,
          oy: piece.y,
          moved: false,
        };
        this.sfx.paper();
        return;
      }
    }
  }

  private dropSheet(p: Pt, drag: Drag): void {
    if (!inside(p, R.onglet)) return;
    const piece = this.pieces.get(drag.uid!)!;
    const d = this.current();
    if (!d || d.etat !== 'ouvert') {
      this.sfx.refuse();
      this.postit('Aucun dossier ouvert : la pièce reste où elle est.', { x: p.x, y: p.y - 60 });
      piece.x = drag.ox;
      piece.y = drag.oy;
      return;
    }
    const from = piece.lieu;
    piece.lieu = 'sousmain';
    piece.flipped = false;
    piece.x = rnd(620, 780);
    piece.y = rnd(300, 400);
    piece.rot = rnd(-3, 3);
    piece.z = ++this.z;
    this.overlay = null;
    this.sfx.paper();
    this.log(from === 'archives' ? 'archives' : 'repecher');
  }

  /* ───────── Aide du lundi ───────── */

  /** Les coches vertes du bordereau ouvert (le lundi), et la ligne qui s'allume au survol de sa station. */
  help(): HelpLine[] {
    const d = this.current();
    if (!d || !this.ctx) return [];
    const present = new Set(
      [...this.pieces.values()]
        .filter((p) => p.lieu === 'sousmain' || p.lieu === 'chemise')
        .map((p) => p.uid),
    );
    return d.exigences
      .filter((e) => !e.pied)
      .map((e) => ({
        n: e.n,
        // Une ligne « vérifier » n'a rien à valider : une coche ferait croire que la condition est remplie.
        ok:
          this.opts.aide &&
          e.geste !== 'lire' &&
          checkExigence(e, d, this.pieces, this.ctx!, present) === null,
        chaud: Boolean(
          e.aide && (e.aide === this.hoverStationAsAide() || (e.aide === 'memo' && this.memoOpen)),
        ),
      }));
  }

  private hoverStationAsAide(): Station['k'] | 'stylo' | 'tampons' | null {
    const s = this.hoverStation;
    if (s === 'pot') return 'stylo';
    if (s === 'tampon' || s === 'encre' || s === 'molette') return 'tampons';
    return s;
  }

  /* ───────── Le spécimen du lundi matin ───────── */

  startSpecimen(): void {
    const sheet = blankPiece('specimen', 'specimen', 'Dépôt du spécimen de signature', 'a4', [
      { t: 'meta', texte: 'CAUFD · Service du personnel · Guichet 7B' },
      { t: 'titre', texte: 'DÉPÔT DU SPÉCIMEN DE SIGNATURE' },
      {
        t: 'texte',
        texte: 'Signez trois fois, de la même manière. Les trois signatures doivent se ressembler.',
      },
      { t: 'signature', id: 's1', label: 'Signature n° 1' },
      { t: 'signature', id: 's2', label: 'Signature n° 2' },
      { t: 'signature', id: 's3', label: 'Signature n° 3' },
    ]);
    sheet.lieu = 'sousmain';
    sheet.x = 590;
    sheet.y = 356;
    sheet.z = ++this.z;
    this.local.set(sheet.uid, sheet);
    this.specimen = { sheet, ok: [false, false, false], message: null, done: false, until: 0 };
  }

  private checkSpecimen(): void {
    const s = this.specimen!;
    s.ok = s.sheet.fields.map((f) => {
      const g = signatureGroup(s.sheet, f);
      if (!g) return false;
      const pts = g.flatMap((x) => x.points);
      const inFrame = pts.filter((pt) => inRect(pt, expand(f.rect, 4))).length / pts.length;
      return (
        inFrame >= CONFIG.signature.dansCadre &&
        strokesLength(g.map((x) => x.points)) >= CONFIG.signature.longueurMin
      );
    });
    if (s.ok.every(Boolean) && !s.until) s.until = this.clock + 0.7;
  }

  private resolveSpecimen(): void {
    const s = this.specimen!;
    s.until = 0;
    if (s.done) {
      this.onSpecimen?.(this.specimenStrokes!);
      return;
    }
    const samples = s.sheet.fields.map((f) => signatureGroup(s.sheet, f)!.map((x) => x.points));
    const chosen = chooseSpecimen(samples);
    if (!chosen) {
      s.message = 'Vos signatures ne se ressemblent pas. Recommencez.';
      this.sfx.refuse();
      s.sheet.strokes = [];
      s.sheet.v++;
      s.ok = [false, false, false];
      return;
    }
    s.message = 'Spécimen enregistré. Bonne prise de poste.';
    s.done = true;
    this.specimenStrokes = chosen.specimen;
    s.until = this.clock + 1.2;
    this.sfx.stamp();
  }

  private specimenStrokes: Pt[][] | null = null;
}
