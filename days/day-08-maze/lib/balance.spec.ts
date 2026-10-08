import { describe, expect, it } from 'vitest';
import { playDay, type Profil } from './bots';
import { DAYS } from './config';
import { signatureOf } from './signature-samples';

/**
 * Le simulateur d'équilibrage (section Équilibrage du GDD) : trois profils de bots jouent chaque journée avec le
 * vrai moteur. `npm run balance` en lance 1000 par jour et par profil et affiche la table ; la suite de tests
 * normale se contente de 40, et vérifie les cibles de probabilité d'effondrement.
 */
const env =
  (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const RUNS = Number(env['BALANCE_DAYS'] ?? (env['npm_lifecycle_event'] === 'balance' ? 1000 : 40));
const PROFILS: Profil[] = ['novice', 'intermediaire', 'expert'];
/** Cibles du GDD (probabilité d'effondrement maximale), lundi et mardi. */
const CIBLES: Record<Profil, [number, number]> = {
  novice: [0.02, 0.05],
  intermediaire: [0.005, 0.02],
  expert: [0.001, 0.001],
};
const q = (a: number[], p: number) => [...a].sort((x, y) => x - y)[Math.floor(p * (a.length - 1))];

describe('équilibrage', () => {
  for (const day of DAYS) {
    it(`${day.nom} : la pile tient selon les cibles du GDD`, () => {
      const rows: string[] = [];
      for (const profil of PROFILS) {
        const results = Array.from({ length: RUNS }, (_, i) =>
          playDay(
            {
              jour: day.numero,
              seed: 1000 + i,
              specimen: [signatureOf(1, 0)],
              tutoriel: day.numero === 1,
            },
            profil,
            77 + i,
          ),
        );
        const collapse = results.filter((r) => r.effondre).length / RUNS;
        const heights = results.map((r) => r.hauteurMax);
        const scores = results.filter((r) => !r.effondre).map((r) => r.score / r.objectif);
        const share = results.map((r) => r.traites / r.arrives);
        rows.push(
          `${profil.padEnd(13)} effondrement ${(collapse * 100).toFixed(1).padStart(5)} % · pile max ${q(heights, 0.5)} (p90 ${q(heights, 0.9)}) · score ${(q(scores, 0.5) * 100).toFixed(0)} % de l'objectif · traités ${(q(share, 0.5) * 100).toFixed(0)} %`,
        );
        if (RUNS >= 40)
          expect(collapse, `${day.nom}, ${profil}`).toBeLessThanOrEqual(
            CIBLES[profil][day.numero - 1] + (RUNS < 200 ? 0.05 : 0),
          );
      }
      console.log(`\n${day.nom} (${RUNS} journées par profil)\n${rows.join('\n')}`);
    }, 600_000);
  }
});
