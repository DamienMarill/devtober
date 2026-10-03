import { Painter } from './paint';
import { Point, skyPoint } from './projection';
import { seeded } from './random';

/**
 * Les montagnes qu'on voit vers l'ouest depuis Ōgaki : le massif de Yōrō à gauche, le mont Ibuki
 * (1 377 m) et son épaule à droite, les collines de Tarui et Sekigahara entre les deux, et au loin les
 * crêtes de Suzuka. Chaque chaîne est une ligne de crête (azimut, élévation en degrés) bruitée en
 * fractale, avec ses ravins, sa lumière de crête et la brume à son pied.
 */

interface Range {
  /** Points de contrôle de la crête : [azimut, élévation]. */
  ridge: [number, number][];
  /** Couleur de la masse, des ravins, de la lumière de crête. */
  body: string;
  ravine?: string;
  light?: string;
  /** Amplitude du bruit (degrés) et nombre de ravins. */
  rough: number;
  ravines: number;
  /** Silhouette hérissée d'arbres (collines proches). */
  forest?: boolean;
  seed: number;
}

const RANGES: Range[] = [
  {
    // Suzuka et les crêtes lointaines, presque fondues dans le ciel.
    ridge: [
      [205, 1.1],
      [222, 1.7],
      [238, 1.4],
      [252, 1.9],
      [266, 1.2],
      [280, 1.5],
      [300, 2.1],
      [318, 1.7],
      [335, 1.3],
    ],
    body: 'mountain-far',
    rough: 0.18,
    ravines: 0,
    seed: 3,
  },
  {
    // Le massif de Yōrō : une longue crête qui descend vers la trouée de Sekigahara.
    ridge: [
      [205, 1.6],
      [216, 2.7],
      [226, 3.5],
      [234, 3.7],
      [242, 3.3],
      [250, 2.6],
      [258, 1.8],
      [266, 1.1],
      [272, 0.7],
    ],
    body: 'mountain-mid',
    ravine: 'mountain-ravine',
    light: 'mountain-light',
    rough: 0.22,
    ravines: 16,
    seed: 5,
  },
  {
    // Le mont Ibuki : flanc raide, large sommet, puis l'épaule qui redescend vers le nord.
    ridge: [
      [274, 0.8],
      [280, 1.5],
      [285, 2.6],
      [289, 3.6],
      [292, 4.05],
      [296, 4.0],
      [299, 3.6],
      [302, 3.2],
      [305, 3.45],
      [308, 3.1],
      [314, 2.3],
      [322, 1.9],
      [335, 2.1],
    ],
    body: 'mountain-mid',
    ravine: 'mountain-ravine',
    light: 'mountain-light',
    rough: 0.2,
    ravines: 18,
    seed: 8,
  },
  {
    // Les collines boisées devant (Nangū-san…).
    ridge: [
      [215, 0.6],
      [232, 1.1],
      [246, 1.5],
      [253, 2.15],
      [258, 2.35],
      [263, 1.9],
      [269, 1.2],
      [276, 0.8],
      [284, 1.05],
      [292, 1.45],
      [300, 1.1],
      [312, 0.75],
      [330, 0.9],
    ],
    body: 'mountain-near',
    ravine: 'mountain-near-ravine',
    light: 'mountain-near-light',
    rough: 0.12,
    ravines: 14,
    forest: true,
    seed: 13,
  },
];

const AZ_MIN = 180;
const AZ_MAX = 362;
const STEP = 0.2;
/** Pied des montagnes : tout en bas, derrière les fleurs ; on les voit dans la trouée, noyées de brume. */
const BASE = 1300;

/** Crête lissée (interpolation en cosinus) et bruitée (fractale à 4 octaves). */
function ridgeline(range: Range): [number, number][] {
  const random = seeded(range.seed);
  // Chaque chaîne déborde du cadre des deux côtés : elle se prolonge, un peu plus basse, jusqu'aux bords.
  const first = range.ridge[0];
  const last = range.ridge[range.ridge.length - 1];
  const ctrl: [number, number][] = [
    ...(first[0] > AZ_MIN ? [[AZ_MIN, first[1] * 0.8] as [number, number]] : []),
    ...range.ridge,
    ...(last[0] < AZ_MAX ? [[AZ_MAX, last[1] * 0.8] as [number, number]] : []),
  ];
  const octaves = [4, 2, 1, 0.45].map((wavelength, i) => ({
    wavelength,
    amp: range.rough / 2 ** i,
    values: Array.from(
      { length: Math.ceil((AZ_MAX - AZ_MIN) / wavelength) + 2 },
      () => random() * 2 - 1,
    ),
  }));
  const points: [number, number][] = [];
  for (let az = ctrl[0][0]; az <= ctrl[ctrl.length - 1][0] + 1e-9; az += STEP) {
    let i = ctrl.findIndex((c) => c[0] >= az);
    if (i <= 0) i = 1;
    const [a0, e0] = ctrl[i - 1];
    const [a1, e1] = ctrl[i];
    const t = (az - a0) / (a1 - a0);
    let e = e0 + ((e1 - e0) * (1 - Math.cos(Math.PI * t))) / 2;
    for (const o of octaves) {
      const u = (az - AZ_MIN) / o.wavelength;
      const k = Math.floor(u);
      const f = u - k;
      const s = f * f * (3 - 2 * f);
      e += o.amp * (o.values[k] * (1 - s) + o.values[k + 1] * s);
    }
    points.push([az, Math.max(0.15, e)]);
  }
  return points;
}

/** Les montagnes sont un peu exagérées en hauteur, comme dans un décor peint. */
const EXAGGERATE = 2.2;

function project(points: [number, number][]): Point[] {
  return points.map(([az, el]) => skyPoint(az, el * EXAGGERATE));
}

export function buildMountains(p: Painter): void {
  for (const range of RANGES) {
    const random = seeded(range.seed * 7 + 1);
    const ridge = ridgeline(range);
    const top = project(ridge);
    const first = top[0];
    const last = top[top.length - 1];
    p.poly(range.body, [...top, [last[0], BASE], [first[0], BASE]]);

    // Lumière de crête : un mince liseré sous la ligne de faîte, côté ciel.
    if (range.light) {
      const lit = top.map(([x, y]): Point => [x, y + 1.6]);
      p.poly(range.light, [...top, ...lit.reverse()]);
    }

    // Ravins : des sillons sombres qui descendent des sommets en serpentant, plus larges en bas.
    if (range.ravine) {
      for (let r = 0; r < range.ravines; r++) {
        const i = 4 + Math.floor(random() * (ridge.length - 8));
        // On part d'un point haut du voisinage.
        let best = i;
        for (let j = i - 6; j <= i + 6; j++) if (ridge[j] && ridge[j][1] > ridge[best][1]) best = j;
        let [az, el] = ridge[best];
        const length = el * (0.45 + random() * 0.45);
        const side = random() < 0.5 ? -1 : 1;
        const left: Point[] = [];
        const right: Point[] = [];
        const steps = 10;
        for (let s = 0; s <= steps; s++) {
          const k = s / steps;
          const w = 0.03 + k * 0.22 * (0.6 + random() * 0.8);
          const [x0, y0] = skyPoint(az - w, el * EXAGGERATE);
          const [x1, y1] = skyPoint(az + w, el * EXAGGERATE);
          left.push([x0, y0]);
          right.push([x1, y1]);
          az += side * (0.15 + random() * 0.25) * (1 + k);
          el -= length / steps;
        }
        p.poly(range.ravine, [...left, ...right.reverse()]);
      }
    }

    // Collines boisées : la silhouette se hérisse de cimes d'arbres.
    if (range.forest) {
      for (let i = 0; i < top.length; i += 1) {
        const [x, y] = top[i];
        p.circle(range.body, x + (random() - 0.5) * 2, y + 1.2, 1.4 + random() * 2.4);
      }
    }
    // Brume au pied : deux voiles de plus en plus denses vers le bas (les vallées noyées).
    for (const [m, drop] of [
      ['mist-a', 70],
      ['mist-b', 170],
    ] as const) {
      const band = top.map(([x, y]): Point => [x, y + drop + (y - top[0][1]) * 0.2]);
      p.poly(m, [...band, [last[0], BASE], [first[0], BASE]]);
    }
  }
}
