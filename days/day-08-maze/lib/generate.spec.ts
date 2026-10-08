import { describe, expect, it } from 'vitest';
import { DOSSIERS } from '../content/dossiers';
import { Seq } from './actions';
import { DAYS } from './config';
import { genererDossier } from './generate';
import type { Piece } from './model';
import { Rng } from './rng';
import { checkDossier, DEFAULT_RULES, type RuleContext } from './rules';
import { signatureOf } from './signature-samples';
import { applyAction, solve } from './solve';

const ctx: RuleContext = { specimen: [signatureOf(1, 0)], ...DEFAULT_RULES };

function make(modelId: string, jour: number, seed: number) {
  let n = 0;
  const model = DOSSIERS.find((m) => m.id === modelId)!;
  const g = genererDossier(model, new Rng(seed), {
    jour: DAYS[jour - 1],
    index: seed % 50,
    uid: (p) => `${p}${++n}`,
  });
  const pieces = new Map<string, Piece>(g.pieces.map((p) => [p.uid, p]));
  return { dossier: g.dossier, pieces };
}

describe('génération des dossiers', () => {
  for (const model of DOSSIERS) {
    for (const jour of [1, 2].filter((j) => j >= model.jourMin && j <= (model.jourMax ?? 9))) {
      it(`« ${model.id} » (jour ${jour}) : soluble, et non conforme sans rien faire`, () => {
        for (let seed = 1; seed <= 40; seed++) {
          const { dossier, pieces } = make(model.id, jour, seed);
          // Les blocs tiennent dans leur feuille.
          for (const p of pieces.values()) {
            for (const l of p.recto)
              expect(l.rect.y + l.rect.h, `${p.type} déborde`).toBeLessThanOrEqual(p.h + 1);
          }
          const lines = dossier.exigences.length;
          if (!model.tutoriel) {
            expect(lines).toBeGreaterThanOrEqual(DAYS[jour - 1].lignes[0]);
            expect(lines).toBeLessThanOrEqual(DAYS[jour - 1].lignes[1] + 1);
          }
          const present = new Set(dossier.contenu);
          const actions = solve(dossier, pieces, ctx, present);
          expect(actions.length).toBeGreaterThan(0);
          const seq = new Seq();
          for (const a of actions) {
            applyAction(a, dossier, pieces, seq);
            if (a.k === 'attach') dossier.contenu.push(a.piece);
          }
          expect(checkDossier(dossier, pieces, ctx)).toEqual([]);
        }
      });
    }
  }

  it('même graine, même dossier', () => {
    const a = make('studio-9m2', 1, 7);
    const b = make('studio-9m2', 1, 7);
    expect(a.dossier.vars).toEqual(b.dossier.vars);
    expect(a.dossier.exigences).toEqual(b.dossier.exigences);
  });

  it('le mardi ajoute visa et cachet au pied du bordereau', () => {
    const { dossier } = make('studio-9m2', 2, 3);
    expect(dossier.exigences.filter((e) => e.pied).map((e) => e.geste)).toEqual([
      'signer',
      'tamponner',
    ]);
  });

  it('une pièce manquante est aux Archives, avec des leurres qui diffèrent d’un seul critère', () => {
    const { dossier, pieces } = make('bourse', 2, 5);
    const target = pieces.get(dossier.exigences.find((e) => e.geste === 'joindre')!.joindre!)!;
    expect(target.lieu).toBe('archives');
    const leurres = [...pieces.values()].filter((p) => p.leurre);
    expect(leurres.length).toBeGreaterThanOrEqual(1);
    for (const l of leurres) {
      const diffs = [l.titre !== target.titre, l.nom !== target.nom, l.date !== target.date].filter(
        Boolean,
      );
      expect(diffs.length).toBe(1);
    }
  });
});
