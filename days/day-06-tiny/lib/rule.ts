/** Les voisins qu'on compte autour d'une cellule. */
export type Neighborhood = 'moore' | 'vonNeumann' | 'hex';

/**
 * Une règle « outer-totalistic » : le sort d'une cellule ne dépend que de son état et du nombre de voisins
 * vivants. `birth` et `survive` sont des masques de 9 bits (bit k = « k voisins »). Avec `states` > 2, c'est
 * une règle Generations : une cellule qui devrait mourir passe par `states - 2` états d'agonie avant de
 * s'éteindre, et seuls les états 1 comptent comme voisins.
 *
 * Les bits au-delà du nombre de voisins (5 à 8 en von Neumann, 7 et 8 en hexagonal) peuvent rester dans
 * l'objet, pour qu'on les retrouve en revenant à Moore ; ils n'ont aucun effet (voir `normalize`).
 */
export interface Rule {
  birth: number;
  survive: number;
  states: number;
  neighborhood: Neighborhood;
}

/** Nombre de voisins de chaque voisinage. */
export const NEIGHBORS: Readonly<Record<Neighborhood, number>> = {
  moore: 8,
  vonNeumann: 4,
  hex: 6,
};

export const MIN_STATES = 2;
export const MAX_STATES = 24;

/** Le jeu de la vie de Conway, B3/S23. */
export const CONWAY: Rule = { birth: 0b1000, survive: 0b1100, states: 2, neighborhood: 'moore' };

/** Suffixe Golly du voisinage. */
const SUFFIX: Readonly<Record<Neighborhood, string>> = { moore: '', vonNeumann: 'V', hex: 'H' };

/** Masque des comptes possibles pour un voisinage (0 à 8, 0 à 4 ou 0 à 6). */
export function countMask(neighborhood: Neighborhood): number {
  return (1 << (NEIGHBORS[neighborhood] + 1)) - 1;
}

/**
 * La règle telle qu'elle agit : sans B0 (toutes les cellules mortes naîtraient à chaque génération, l'écran
 * clignoterait en entier), sans les comptes impossibles pour le voisinage, avec un nombre d'états borné.
 */
export function normalize(rule: Rule): Rule {
  const mask = countMask(rule.neighborhood);
  return {
    birth: rule.birth & mask & ~1,
    survive: rule.survive & mask,
    states: Math.min(MAX_STATES, Math.max(MIN_STATES, Math.round(rule.states) || MIN_STATES)),
    neighborhood: rule.neighborhood,
  };
}

/** Les comptes d'un masque, en chiffres : 0b1100 → "23". */
export function digits(mask: number): string {
  let out = '';
  for (let k = 0; k <= 8; k++) if (mask & (1 << k)) out += k;
  return out;
}

/** Le masque de chiffres : "23" → 0b1100. Null si un caractère n'est pas un chiffre de 0 à 8. */
function maskOf(text: string): number | null {
  let mask = 0;
  for (const c of text) {
    if (c < '0' || c > '8') return null;
    mask |= 1 << Number(c);
  }
  return mask;
}

/** Nombre d'états d'une règle Generations ; 0 ou 1 valent 2 (comme dans Golly), au-delà du max : invalide. */
function statesOf(text: string): number | null {
  const m = /^[CG]?(\d{1,3})$/.exec(text);
  if (!m) return null;
  const n = Math.max(MIN_STATES, Number(m[1]));
  return n > MAX_STATES ? null : n;
}

/**
 * Lit une règle, dans les notations courantes :
 * - B/S : `B3/S23`, aussi dans l'ordre `S23/B3` ;
 * - S/B sans lettres (MCell, Golly) : `23/3` ;
 * - Generations : `B2/S/C3`, `B2/S/G3`, `B2/S/3` ou `/2/3` (S/B/N) ;
 * - suffixe de voisinage : `V` (von Neumann) ou `H` (hexagonal), ex. `B2/S34H`.
 *
 * Renvoie la règle normalisée (voir `normalize`), ou null si le texte n'est pas une règle.
 */
export function parseRule(text: string): Rule | null {
  let s = text.replace(/\s+/g, '').toUpperCase();
  let neighborhood: Neighborhood = 'moore';
  if (s.endsWith('V')) neighborhood = 'vonNeumann';
  else if (s.endsWith('H')) neighborhood = 'hex';
  if (neighborhood !== 'moore') s = s.slice(0, -1);

  const parts = s.split('/');
  if (parts.length < 2 || parts.length > 3) return null;
  const states = parts.length === 3 ? statesOf(parts[2]) : MIN_STATES;
  if (states === null) return null;

  let birth: number | null;
  let survive: number | null;
  const [a, b] = parts;
  if (a[0] === 'B' && b[0] === 'S') {
    birth = maskOf(a.slice(1));
    survive = maskOf(b.slice(1));
  } else if (a[0] === 'S' && b[0] === 'B') {
    survive = maskOf(a.slice(1));
    birth = maskOf(b.slice(1));
  } else {
    // Sans lettres, la survie vient d'abord.
    survive = maskOf(a);
    birth = maskOf(b);
  }
  if (birth === null || survive === null) return null;
  return normalize({ birth, survive, states, neighborhood });
}

/** La forme canonique : `B3/S23`, `B2/S/C3`, `B2/S34H`. */
export function formatRule(rule: Rule): string {
  const r = normalize(rule);
  const generations = r.states > 2 ? `/C${r.states}` : '';
  return `B${digits(r.birth)}/S${digits(r.survive)}${generations}${SUFFIX[r.neighborhood]}`;
}

/** Vrai si les deux règles agissent de la même façon. */
export function sameRule(a: Rule, b: Rule): boolean {
  return formatRule(a) === formatRule(b);
}

/**
 * La table de transition des cellules d'état 0 ou 1 : `table[alive * 9 + n]` vaut 1 si la cellule est
 * vivante à la génération suivante avec `n` voisins vivants.
 */
export function transitionTable(rule: Rule): Uint8Array {
  const r = normalize(rule);
  const table = new Uint8Array(18);
  for (let n = 0; n <= 8; n++) {
    table[n] = (r.birth >> n) & 1;
    table[9 + n] = (r.survive >> n) & 1;
  }
  return table;
}
