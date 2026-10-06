import { Neighborhood } from './rule';

/**
 * Les pictogrammes imprimés sur la vitre du LCD (7 × 7) et ceux du sélecteur de voisinage (3 × 3), en points
 * `#`. Le composant les dessine en SVG, un carré par point.
 */
const ICONS = {
  play: '.#.....|.##....|.###...|.####..|.###...|.##....|.#.....',
  sound: '..####.|..#..#.|..#..#.|..#..#.|###.###|###.###|.......',
  light: '#..#..#|.#...#.|..###..|#.###.#|..###..|.#...#.|#..#..#',
  custom: '.....##|....###|...###.|..###..|.###...|##.....|#......',
  alive: '...#...|...#...|..###..|#######|..###..|...#...|...#...',
  still: '....###|.....#.|....###|###....|..#....|.#.....|###....',
  oscillator: '.####.#|#....##|#...###|#......|#.....#|.#...#.|..###..',
  extinct: '..###..|.#####.|##.#.##|#######|#######|#######|#.#.#.#',
} as const;

export type IconId = keyof typeof ICONS;

/** Les cellules comptées autour de la cellule du centre (`o`), comme dans `OFFSETS` du monde. */
const NEIGHBORHOOD_ICONS: Readonly<Record<Neighborhood, string>> = {
  moore: '###|#o#|###',
  vonNeumann: '.#.|#o#|.#.',
  hex: '##.|#o#|.##',
};

/** Les points allumés d'un dessin `.#|#.` : `[x, y, centre ?]`. */
function pixels(art: string): (readonly [number, number, boolean])[] {
  return art
    .split('|')
    .flatMap((row, y) =>
      [...row].flatMap((c, x) => (c === '.' ? [] : [[x, y, c === 'o'] as const])),
    );
}

export const ICON_PIXELS = Object.fromEntries(
  Object.entries(ICONS).map(([id, art]) => [id, pixels(art)]),
) as Record<IconId, ReturnType<typeof pixels>>;

export const NEIGHBORHOOD_PIXELS = Object.fromEntries(
  Object.entries(NEIGHBORHOOD_ICONS).map(([id, art]) => [id, pixels(art)]),
) as Record<Neighborhood, ReturnType<typeof pixels>>;
