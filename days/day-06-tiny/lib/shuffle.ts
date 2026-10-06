import { CycleWatch } from './cycle';
import { NEIGHBORS, Neighborhood, Rule, normalize, transitionTable } from './rule';
import { seeded, sow } from './seed';
import { World } from './world';

/** Banc d'essai d'une règle tirée au hasard : un petit tore, une soupe, quelques dizaines de générations. */
const TEST = { width: 48, height: 48, density: 0.35, generations: 60, maxFill: 0.75, tries: 40 };

/** Une règle au hasard, sans B0, pour le voisinage donné ; une fois sur quatre, une règle Generations. */
export function randomRule(rng: () => number, neighborhood: Neighborhood): Rule {
  const max = NEIGHBORS[neighborhood];
  let birth = 0;
  let survive = 0;
  for (let k = 1; k <= max; k++) if (rng() < 0.3) birth |= 1 << k;
  for (let k = 0; k <= max; k++) if (rng() < 0.4) survive |= 1 << k;
  // Sans naissance, rien ne se passe : on en force une, plutôt au milieu.
  if (!birth) birth = 1 << (2 + Math.floor(rng() * (max - 2)));
  const states = rng() < 0.25 ? 3 + Math.floor(rng() * 6) : 2;
  return normalize({ birth, survive, states, neighborhood });
}

/** Vrai si la règle tient l'écran : la soupe d'essai ne meurt pas, ne sature pas et ne se fige pas. */
export function isLively(rule: Rule, seed: number): boolean {
  const world = new World(TEST.width, TEST.height);
  sow(world, 'soup', TEST.density, seed);
  const table = transitionTable(rule);
  const watch = new CycleWatch(16);
  let verdict = 'alive';
  for (let g = 0; g < TEST.generations; g++) {
    world.step(rule, table);
    verdict = watch.push(world.cells, world.population).kind;
    if (verdict === 'extinct') return false;
  }
  return verdict === 'alive' && world.population < world.size * TEST.maxFill;
}

/**
 * Le bouton « Au hasard » : tire des règles jusqu'à en trouver une vivante (au plus `TEST.tries` essais, sinon
 * la dernière tirée). Même graine, même règle.
 */
export function shuffleRule(seed: number, neighborhood: Neighborhood): Rule {
  const rng = seeded(seed);
  let rule = randomRule(rng, neighborhood);
  for (let i = 1; i < TEST.tries && !isLively(rule, seed + i); i++) {
    rule = randomRule(rng, neighborhood);
  }
  return rule;
}
