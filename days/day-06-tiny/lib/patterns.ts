/**
 * Petits motifs célèbres, en RLE (vérifiés sur LifeWiki). Les anecdotes valent pour un plan infini : sur le
 * tore de l'écran, les débris finissent par se rentrer dedans.
 */
export const PATTERNS = {
  cell: {
    name: 'Cellule seule',
    rle: 'o!',
    note: 'Une seule cellule : la plus petite graine possible.',
  },
  block: {
    name: 'Bloc 2×2',
    rle: '2o$2o!',
    note: 'Le bloc, 4 cellules : l’objet le plus courant du jeu de la vie.',
  },
  glider: {
    name: 'Planeur',
    rle: 'bob$2bo$3o!',
    note: '5 cellules qui marchent en diagonale : le premier vaisseau découvert (1969).',
  },
  lwss: {
    name: 'Vaisseau léger',
    rle: 'bo2bo$o4b$o3bo$4o!',
    note: '9 cellules : le plus petit vaisseau qui file tout droit.',
  },
  rpentomino: {
    name: 'R-pentomino',
    rle: 'b2o$2o$bo!',
    note: '5 cellules, 1 103 générations d’agitation avant de se calmer.',
  },
  acorn: {
    name: 'Gland',
    rle: 'bo$3bo$2o2b3o!',
    note: '7 cellules qui s’agitent pendant 5 206 générations.',
  },
  diehard: {
    name: 'Diehard',
    rle: '6bo$2o$bo3b3o!',
    note: '7 cellules qui disparaissent sans laisser de trace à la génération 130.',
  },
  gosper: {
    name: 'Canon de Gosper',
    rle: '24bo11b$22bobo11b$12b2o6b2o12b2o$11bo3bo4b2o12b2o$2o8bo5bo3b2o14b$2o8bo3bob2o4bobo11b$10bo5bo7bo11b$11bo3bo20b$12b2o!',
    note: '36 cellules qui tirent un planeur toutes les 30 générations (Bill Gosper, 1970).',
  },
  pulsar: {
    name: 'Pulsar',
    rle: '2b3o3b3o2$o4bobo4bo$o4bobo4bo$o4bobo4bo$2b3o3b3o2$2b3o3b3o$o4bobo4bo$o4bobo4bo$o4bobo4bo2$2b3o3b3o!',
    note: '48 cellules qui battent sur une période de 3.',
  },
  replicator: {
    name: 'Réplicateur',
    rle: '2b3o$bo2bo$o3bo$o2bo$3o!',
    note: 'En HighLife, ces 12 cellules se recopient en diagonale toutes les 12 générations.',
  },
} as const satisfies Record<string, { name: string; rle: string; note: string }>;

export type PatternId = keyof typeof PATTERNS;

export const PATTERN_IDS = Object.keys(PATTERNS) as PatternId[];
