import { describe, expect, it } from 'vitest';
import { Bureau } from './bureau';
import { playDay } from './bots';
import { CONFIG } from './config';
import { noteFor, releve } from './score';
import { applyAction, solve } from './solve';
import { signatureOf } from './signature-samples';

const specimen = signatureOf(1, 0);

/** Traite le dossier ouvert : tous les gestes du solveur sauf ceux que `skip` écarte, puis fermer et transmettre. */
function processCurrent(b: Bureau, skip: (i: number) => boolean = () => false): string[] {
  const d = b.current()!;
  const present = new Set(
    [...b.pieces.values()].filter((p) => p.lieu === 'sousmain').map((p) => p.uid),
  );
  solve(d, b.pieces, b.ctx, present).forEach(
    (a, i) => !skip(i) && applyAction(a, d, b.pieces, b.seq),
  );
  b.fermer(
    [...b.pieces.values()]
      .filter((p) => p.lieu === 'sousmain' && p.dossier === d.id && !p.leurre)
      .map((p) => p.uid),
  );
  return b.transmettre();
}

function untilReturn(b: Bureau): void {
  for (let i = 0; i < 400 && !b.events.some((e) => e.k === 'retour'); i++) b.tick(0.5);
}

describe('la journée au guichet', () => {
  it('le lundi commence par le dossier de prise de poste', () => {
    const b = new Bureau({ jour: 1, seed: 1, specimen, tutoriel: true });
    expect(b.prendre()).toBeNull();
    expect(b.current()!.modele).toBe('prise-de-poste');
    expect(b.prendre()).toBe('Un dossier à la fois.');
  });

  it('un dossier faux revient en R1, avec tous ses motifs, et coûte la moitié de ses points', () => {
    const b = new Bureau({ jour: 2, seed: 4, specimen });
    b.prendre();
    const d = b.current()!;
    const motifs = processCurrent(b, () => true);
    expect(motifs.length).toBe(d.exigences.length);
    const credited = d.points;
    expect(b.score).toBe(credited);
    b.events = [];
    untilReturn(b);
    expect(d.retours[0].type).toBe('R1');
    expect(b.score).toBe(credited - Math.round(credited / 2));
    expect(b.pile[b.pile.length - 1]).toBe(d.id);
    // On le reprend, on corrige (VU sur la fiche compris) : il passe.
    while (b.pile[b.pile.length - 1] !== d.id) b.tick(0.1);
    b.prendre();
    expect(processCurrent(b)).toEqual([]);
  });

  it('sans VU sur la fiche de retour, le dossier revient « non accusé »', () => {
    const b = new Bureau({ jour: 2, seed: 6, specimen });
    b.prendre();
    const d = b.current()!;
    b.forceRetour = 'R2';
    processCurrent(b);
    untilReturn(b);
    b.events = [];
    while (b.pile[b.pile.length - 1] !== d.id) b.tick(0.1);
    b.prendre();
    b.fermer([...d.contenu]);
    expect(b.transmettre()[0]).toMatch(/Retour non accusé/);
  });

  it('R3 : la pièce égarée part aux Archives, et se rejoint depuis là', () => {
    const b = new Bureau({ jour: 2, seed: 9, specimen });
    b.prendre();
    const d = b.current()!;
    b.forceRetour = 'R3';
    processCurrent(b);
    untilReturn(b);
    expect(d.retours[0].type).toBe('R3');
    const lost = [...b.pieces.values()].filter(
      (p) =>
        p.dossier === d.id && p.lieu === 'archives' && !p.leurre && d.attendues.includes(p.uid),
    );
    expect(lost.length).toBeGreaterThanOrEqual(1);
    while (b.pile[b.pile.length - 1] !== d.id) b.tick(0.1);
    b.prendre();
    expect(processCurrent(b)).toEqual([]);
  });

  it('au-delà de trois retours, le dossier est classé sans suite', () => {
    const b = new Bureau({ jour: 2, seed: 2, specimen });
    b.prendre();
    const d = b.current()!;
    for (let i = 0; i < 4; i++) {
      b.forceRetour = 'R2';
      processCurrent(b);
      b.events = [];
      for (let k = 0; k < 400 && !b.events.some((e) => e.k === 'retour' || e.k === 'classe'); k++)
        b.tick(0.5);
      if (d.etat === 'classe') break;
      while (b.pile[b.pile.length - 1] !== d.id) b.tick(0.1);
      b.prendre();
    }
    expect(d.retours.length).toBe(CONFIG.retours.maxParDossier);
    expect(d.etat).toBe('classe');
  });

  it('le lundi, un retour sans motif scripté arrive vers 11 h, avec le post-it du chef', () => {
    const b = new Bureau({ jour: 1, seed: 3, specimen, tutoriel: true });
    const events: string[] = [];
    while (b.phase === 'travail' || b.phase === 'grace') {
      b.tick(0.5);
      events.push(...b.events.map((e) => (e.k === 'retour' ? `retour ${e.type}` : e.k)));
      b.events = [];
      if (!b.courant && b.pile.length && b.phase === 'travail') {
        b.prendre();
        processCurrent(b);
      }
    }
    expect(events).toContain('retour R2');
    expect(events).toContain('postit');
  });

  it('une pile laissée à elle-même s’effondre, et la journée se rejoue à l’identique', () => {
    const run = () => {
      const b = new Bureau({ jour: 2, seed: 11, specimen, intervalle: 0.4 });
      while (b.phase === 'travail') b.tick(0.5);
      return b;
    };
    const a = run();
    expect(a.phase).toBe('effondre');
    expect(a.hauteur()).toBeGreaterThan(CONFIG.pile.capacite);
    const b = run();
    expect(b.t).toBe(a.t);
    expect([...b.dossiers.values()].map((d) => d.titre)).toEqual(
      [...a.dossiers.values()].map((d) => d.titre),
    );
  });

  it('le reliquat : 4 dossiers passent au lendemain, le surplus part chez Gérard', () => {
    const b = new Bureau({ jour: 2, seed: 5, specimen, zen: true });
    while (b.phase === 'travail') b.tick(0.5);
    expect(b.phase).toBe('fini');
    expect(b.pile.length).toBe(CONFIG.pile.reliquatMax);
    expect(b.stats.transferes).toBeGreaterThan(0);
    expect(b.score).toBe(-CONFIG.score.penaliteReliquat * b.stats.transferes);
    expect(releve(b).note).toBe('E');
    expect(noteFor(240, 180)).toBe('A');
    expect(noteFor(150, 180)).toBe('D');
    const carry = b.carry();
    const next = new Bureau({ jour: 2, seed: 6, specimen, carry });
    expect(next.pile.slice(0, 4)).toEqual(carry.pile);
  });

  it('un bot expert finit le mardi au-dessus de l’objectif', () => {
    const r = playDay({ jour: 2, seed: 21, specimen }, 'expert', 1);
    expect(r.effondre).toBe(false);
    expect(r.score).toBeGreaterThan(r.objectif);
  });
});
