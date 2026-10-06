import { textPattern } from './font';
import { PATTERNS, PATTERN_IDS, PatternId } from './patterns';
import { Pattern, parseRle } from './rle';
import { World } from './world';

/**
 * Comment on remplit la boîte : une soupe aléatoire sur tout l'écran, une goutte de soupe au centre, le mot
 * « TINY », ou un des petits motifs célèbres.
 */
export type StartId = 'soup' | 'drop' | 'tiny' | PatternId;

export const START_IDS: readonly StartId[] = ['soup', 'drop', 'tiny', ...PATTERN_IDS];

/** Côté de la goutte (en cellules). */
export const DROP_SIZE = 20;
/** Taille des points du « TINY » de l'intro. */
export const TINY_SCALE = 4;

export function isStartId(value: string): value is StartId {
  return (START_IDS as readonly string[]).includes(value);
}

/** Générateur pseudo-aléatoire à graine (mulberry32, comme aux jours 2, 3 et 5). */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Une graine neuve, assez courte pour une adresse. */
export function randomSeed(): number {
  return Math.floor(Math.random() * 1_000_000);
}

/** Libellé d'un semis : « Soupe 35 % », « Goutte 50 % », « TINY », « Planeur »… */
export function startLabel(start: StartId, density: number): string {
  const percent = `${Math.round(density * 100)} %`;
  if (start === 'soup') return `Soupe ${percent}`;
  if (start === 'drop') return `Goutte ${percent}`;
  if (start === 'tiny') return 'TINY';
  return PATTERNS[start].name;
}

/** Vrai si le semis tire au hasard (et dépend donc de la graine et de la densité). */
export function isRandomStart(start: StartId): boolean {
  return start === 'soup' || start === 'drop';
}

/** Le motif d'un semis déterministe. */
export function startPattern(start: Exclude<StartId, 'soup' | 'drop'>): Pattern {
  return start === 'tiny' ? textPattern('TINY', TINY_SCALE) : parseRle(PATTERNS[start].rle)!;
}

/** Pose un motif centré sur `(cx, cy)` (ses cellules mortes n'effacent rien). */
export function stamp(world: World, pattern: Pattern, cx: number, cy: number): void {
  const x0 = Math.round(cx - pattern.width / 2);
  const y0 = Math.round(cy - pattern.height / 2);
  for (let y = 0; y < pattern.height; y++) {
    for (let x = 0; x < pattern.width; x++) {
      const s = pattern.cells[y * pattern.width + x];
      if (s) world.set(x0 + x, y0 + y, s);
    }
  }
}

/** Remplit un rectangle au hasard, chaque cellule vivante avec la probabilité `density`. */
function scatter(
  world: World,
  rng: () => number,
  density: number,
  x0: number,
  y0: number,
  w: number,
  h: number,
): void {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) if (rng() < density) world.cells[world.index(x, y)] = 1;
  }
}

/** Vide le monde et le sème. */
export function sow(world: World, start: StartId, density: number, seed: number): void {
  world.clear();
  const rng = seeded(seed);
  if (start === 'soup') {
    scatter(world, rng, density, 0, 0, world.width, world.height);
  } else if (start === 'drop') {
    const x0 = Math.round((world.width - DROP_SIZE) / 2);
    const y0 = Math.round((world.height - DROP_SIZE) / 2);
    scatter(world, rng, density, x0, y0, DROP_SIZE, DROP_SIZE);
  } else {
    stamp(world, startPattern(start), world.width / 2, world.height / 2);
  }
  world.recount();
}
