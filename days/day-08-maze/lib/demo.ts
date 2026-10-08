import { Bureau } from './bureau';
import { DAYS } from './config';
import { splitDate } from './dates';
import { Desk, SILENT, type Sfx } from './desk';
import type { Dossier, Piece, Pt } from './model';
import { FOLDER, POT_ITEMS, PILE, R, daterWheel, inkWell, stampSlot, toWorld } from './scene';
import { signatureOf } from './signature-samples';
import { solve, type Action } from './solve';

/**
 * La démo (touche T) : un mardi de 14 h 45 joué par un curseur fantôme. Le fantôme n'a aucun passe-droit : il
 * enfonce, déplace et relâche le pointeur sur le même bureau que le joueur (`Desk`), et c'est le solveur qui lui
 * dit quoi faire. Il oublie le cachet du premier dossier (le tube le lui renvoie), puis le rush de fin de journée
 * fait monter la pile jusqu'à l'effondrement.
 */
type Cmd =
  | { k: 'move'; to: Pt; dur: number }
  | { k: 'down'; b: number }
  | { k: 'up'; b: number }
  | { k: 'wait'; s: number }
  | { k: 'key'; key: string }
  | { k: 'wheel'; dy: number }
  | { k: 'do'; fn: () => void };

const DEMO = { seed: 8, start: 194, intervalle: 0.5, rush: 22, rushEvery: 0.85 };
const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const center = (r: { x: number; y: number; w: number; h: number }): Pt => ({
  x: r.x + r.w / 2,
  y: r.y + r.h / 2,
});

export class Demo {
  readonly desk: Desk;
  done = false;
  private readonly gen: Generator<Cmd, void>;
  private cmd: Cmd | null = null;
  private from: Pt = { x: 640, y: 420 };
  private elapsed = 0;
  private time = 0;
  private lastRush = 0;
  private first = true;

  constructor(sfx: Sfx = SILENT) {
    const bureau = new Bureau({
      jour: 2,
      seed: DEMO.seed,
      specimen: [signatureOf(5, 0)],
      intervalle: DEMO.intervalle,
    });
    bureau.commencerA(DEMO.start);
    for (let i = 0; i < 3; i++) bureau.ajouter();
    bureau.events = [];
    this.desk = new Desk(bureau, sfx, { jour: 2, aide: false, dateur: true, date: DAYS[1].date });
    this.desk.pointer = { x: 700, y: 470 };
    this.gen = this.script();
  }

  private get bureau(): Bureau {
    return this.desk.bureau!;
  }

  step(dt: number): void {
    this.time += dt;
    if (
      this.time > DEMO.rush &&
      this.bureau.phase === 'travail' &&
      this.time - this.lastRush > DEMO.rushEvery
    ) {
      this.lastRush = this.time;
      this.bureau.ajouter();
    }
    let budget = dt;
    for (let guard = 0; budget > 0 && guard < 50; guard++) {
      if (!this.cmd) {
        const next = this.gen.next();
        if (next.done) {
          this.done = true;
          return;
        }
        this.cmd = next.value;
        this.elapsed = 0;
        this.from = { ...this.desk.pointer };
      }
      const c = this.cmd;
      if (c.k === 'move' || c.k === 'wait') {
        const dur = c.k === 'move' ? c.dur : c.s;
        const use = Math.min(budget, dur - this.elapsed);
        this.elapsed += use;
        budget -= use;
        if (c.k === 'move') {
          const t = ease(Math.min(1, this.elapsed / Math.max(1e-6, dur)));
          this.desk.move({
            x: this.from.x + (c.to.x - this.from.x) * t,
            y: this.from.y + (c.to.y - this.from.y) * t,
          });
        }
        if (this.elapsed >= dur - 1e-9) this.cmd = null;
        continue;
      }
      if (c.k === 'down') this.desk.down(this.desk.pointer, c.b);
      else if (c.k === 'up') this.desk.up(this.desk.pointer, c.b);
      else if (c.k === 'key') this.desk.key(c.key);
      else if (c.k === 'wheel') this.desk.wheel(c.dy, this.desk.pointer);
      else c.fn();
      this.cmd = null;
    }
  }

  /* ───────── Le script ───────── */

  private *script(): Generator<Cmd, void> {
    yield { k: 'wait', s: 0.5 };
    for (;;) {
      const b = this.bureau;
      if (b.phase === 'effondre') {
        yield { k: 'wait', s: 4 };
        return;
      }
      if (!b.courant) {
        if (!b.pile.length) {
          yield { k: 'wait', s: 0.3 };
          continue;
        }
        yield* this.take();
        continue;
      }
      yield* this.process(b.current()!);
    }
  }

  private *click(p: Pt, dur = 0.32, b = 0): Generator<Cmd, void> {
    yield { k: 'move', to: p, dur };
    yield { k: 'down', b };
    yield { k: 'wait', s: 0.05 };
    yield { k: 'up', b };
  }

  private *take(): Generator<Cmd, void> {
    const top = PILE.base - this.bureau.hauteur() * PILE.unit + 14;
    yield* this.click({ x: PILE.x + PILE.w / 2, y: Math.max(200, top) }, 0.4);
    yield { k: 'wait', s: 0.35 };
  }

  private *putBack(): Generator<Cmd, void> {
    if (this.desk.tool.k === 'main') return;
    yield { k: 'down', b: 2 };
    yield { k: 'up', b: 2 };
  }

  private world(piece: Piece, l: Pt): Pt {
    return toWorld(piece, l);
  }

  private *process(d: Dossier): Generator<Cmd, void> {
    const present = new Set(this.desk.deskPieces().map((p) => p.uid));
    let actions = solve(d, this.desk.pieces, this.bureau.ctx, present);
    const mistake = this.first;
    if (mistake) {
      // Le premier dossier part sans son cachet : il reviendra par le tube.
      const cachet = actions.findIndex((a) => a.k === 'stamp' && a.piece === d.bordereau);
      if (cachet >= 0) actions = actions.filter((_, i) => i !== cachet);
    }
    for (const a of actions) yield* this.perform(a);
    yield* this.putBack();
    yield* this.click(center(R.rabat), 0.35);
    yield { k: 'wait', s: 0.2 };
    yield { k: 'move', to: { x: FOLDER.x, y: FOLDER.y }, dur: 0.3 };
    yield { k: 'down', b: 0 };
    yield { k: 'move', to: { x: R.sortant.x + 150, y: R.sortant.y + 70 }, dur: 0.45 };
    yield { k: 'up', b: 0 };
    if (mistake && this.first) {
      this.first = false;
      // Le retour arrive vite, pour la démo.
      yield {
        k: 'do',
        fn: () => {
          for (const r of this.bureau.retours) r.at = Math.min(r.at, this.bureau.t + 5);
        },
      };
    }
    yield { k: 'wait', s: 0.25 };
  }

  private *perform(a: Action): Generator<Cmd, void> {
    const desk = this.desk;
    switch (a.k) {
      case 'stamp': {
        const piece = desk.pieces.get(a.piece)!;
        if (desk.tool.k !== 'tampon' || desk.tool.id !== a.stamp)
          yield* this.click(center(stampSlot(a.stamp)), 0.3);
        if (desk.stamps[a.stamp].charges === 0 || desk.stamps[a.stamp].ink !== a.ink) {
          yield* this.click(center(inkWell(a.ink)), 0.25);
          yield { k: 'wait', s: 0.55 };
        }
        if (a.date) yield* this.setDater(a.date);
        const tool = desk.tool;
        const wanted = Math.round((a.rot + piece.rot) / 15) * 15;
        const turns = tool.k === 'tampon' ? Math.round((wanted - tool.rot) / 15) : 0;
        for (let i = 0; i < Math.abs(turns); i++) {
          yield { k: 'wheel', dy: Math.sign(turns) * 100 };
          yield { k: 'wait', s: 0.06 };
        }
        yield { k: 'do', fn: () => desk.raise(piece.uid) };
        yield* this.click(this.world(piece, { x: a.x, y: a.y }), 0.38);
        yield { k: 'wait', s: 0.12 };
        break;
      }
      case 'sign': {
        const piece = desk.pieces.get(a.piece)!;
        if (desk.tool.k !== 'stylo') yield* this.click(center(POT_ITEMS[0].rect), 0.35);
        yield { k: 'do', fn: () => desk.raise(piece.uid) };
        for (const stroke of a.strokes) {
          const pts = stroke.filter((_, i) => i % 2 === 0 || i === stroke.length - 1);
          yield { k: 'move', to: this.world(piece, pts[0]), dur: 0.3 };
          yield { k: 'down', b: 0 };
          for (const p of pts.slice(1)) yield { k: 'move', to: this.world(piece, p), dur: 0.011 };
          yield { k: 'up', b: 0 };
        }
        yield { k: 'wait', s: 0.1 };
        break;
      }
      case 'check': {
        const piece = desk.pieces.get(a.piece)!;
        const f = piece.fields.find((x) => x.id === a.champ)!;
        if (desk.tool.k === 'tampon' || desk.tool.k === 'loupe') yield* this.putBack();
        yield { k: 'do', fn: () => desk.raise(piece.uid) };
        yield* this.click(this.world(piece, center(f.rect)), 0.32);
        break;
      }
      case 'write': {
        const piece = desk.pieces.get(a.piece)!;
        const f = piece.fields.find((x) => x.id === a.champ)!;
        if (desk.tool.k === 'tampon' || desk.tool.k === 'loupe') yield* this.putBack();
        yield { k: 'do', fn: () => desk.raise(piece.uid) };
        yield* this.click(
          this.world(piece, { x: f.rect.x + 20, y: f.rect.y + f.rect.h / 2 }),
          0.32,
        );
        for (const ch of a.text) {
          yield { k: 'key', key: ch };
          yield { k: 'wait', s: 0.05 };
        }
        yield { k: 'key', key: 'Enter' };
        break;
      }
      case 'attach': {
        yield* this.putBack();
        yield* this.click(center(R.archives), 0.4);
        yield { k: 'wait', s: 0.45 };
        const piece = desk.pieces.get(a.piece)!;
        if (piece.lieu === 'archives') {
          yield { k: 'do', fn: () => desk.raise(piece.uid) };
          yield { k: 'move', to: { x: piece.x, y: piece.y }, dur: 0.45 };
          yield { k: 'wait', s: 0.2 };
          yield { k: 'down', b: 0 };
          yield { k: 'move', to: center(R.onglet), dur: 0.5 };
          yield { k: 'up', b: 0 };
          yield { k: 'wait', s: 0.3 };
        }
        break;
      }
      case 'memo':
        yield { k: 'move', to: center(R.memo), dur: 0.4 };
        yield { k: 'wait', s: 0.8 };
        break;
    }
  }

  /** Les molettes du dateur, une à une. */
  private *setDater(date: string): Generator<Cmd, void> {
    const target = splitDate(date);
    for (const i of [0, 1, 2] as const) {
      let diff = target[i] - this.desk.dater[i];
      if (i < 2) {
        const mod = i === 0 ? 31 : 12;
        if (diff > mod / 2) diff -= mod;
        if (diff < -mod / 2) diff += mod;
      }
      for (let k = 0; k < Math.abs(diff); k++)
        yield* this.click(center(daterWheel(i)), k === 0 ? 0.25 : 0.06, diff > 0 ? 0 : 2);
    }
  }
}
