import { BLEED } from './camera';
import { LEFT_MASS, Mask, RIGHT_MASS, maskGradient } from './composition';
import { FOCAL, SITE, project } from './projection';
import { seeded } from './random';

/**
 * Les cerisiers (Somei Yoshino), générés. Un tronc penché vers l'eau, des charpentières longues qui
 * s'arquent, des branches secondaires, des rameaux en zigzag, et sur les rameaux des bouquets de 3 à 5
 * fleurs (ombelles). Le détail suit la distance : un arbre proche est décrit jusqu'au moindre bouquet, un
 * arbre lointain s'arrête plus tôt et se couvre de touffes. Tout vient d'une graine : même arbre à chaque
 * chargement.
 */

/** Une charpentière : angle depuis la verticale (radians, positif = vers la rivière), longueur (m). */
export interface Limb {
  angle: number;
  length: number;
  /** Plus ou moins de retombée que la normale (1). */
  droop?: number;
}

/** Les calques de la canopée, du fond vers l'avant. */
export type CanopyLayer = 'far' | 'mid' | 'left' | 'right';

export interface TreeSpec {
  /** Pied du tronc : X latéral (m), Z profondeur (m), et hauteur (m, par défaut le haut de la berge). */
  x: number;
  z: number;
  y?: number;
  /** +1 si la rivière est à droite du tronc (rive gauche), -1 sinon. */
  toward: 1 | -1;
  trunk: { height: number; radius: number; lean: number };
  limbs: Limb[];
  seed: number;
  layer: CanopyLayer;
  /** Densité de rameaux et de fleurs (1 = normale) : la branche du premier plan est plus fournie. */
  density?: number;
}

/** Un tronçon de bois, en composition : polyligne avec son rayon à chaque point. */
export interface Wood {
  points: { x: number; y: number; r: number }[];
  /** Ordre de ramification (0 = tronc). */
  depth: number;
}

/** Un bouquet de fleurs, en composition. */
export interface Umbel {
  x: number;
  y: number;
  /** Rayon d'une fleur (unités de composition). */
  size: number;
  /** Nombre de fleurs (1 à 5). */
  count: number;
  /** Éclairement de 0 (au cœur de la ramure) à 1 (en bord de couronne, vers le ciel). */
  light: number;
  /** Direction de la branche porteuse (radians, à l'écran) : les fleurs pendent de part et d'autre. */
  angle: number;
  seed: number;
  /** Vu de loin, le bouquet représente une touffe : il se peint d'un seul tampon. */
  clump: boolean;
}

export interface Tree {
  spec: TreeSpec;
  wood: Wood[];
  umbels: Umbel[];
  /** Pied du tronc (composition) : centre du balancement. */
  base: { x: number; y: number };
}

let mask: Mask | undefined;
let depthMask: Mask | undefined;
/** Le masque des masses de fleurs (croquis), construit à la première pousse. */
export function canopyMask(): Mask {
  mask ??= new Mask([LEFT_MASS, RIGHT_MASS], 6);
  return mask;
}
/** Le même, très flou : proche de 1 au cœur d'une masse (à l'ombre), plus bas près du ciel. */
function interiorMask(): Mask {
  depthMask ??= new Mask([LEFT_MASS, RIGHT_MASS], 16);
  return depthMask;
}

/** Rayon d'une fleur de Somei Yoshino (m) : ~3,5 cm de diamètre. */
export const FLOWER_RADIUS = 0.0175;

interface Rules {
  /** Écart entre deux départs de rameaux (m), par ordre. */
  spacing: number[];
  /** Longueur d'un rameau, relative à ce qui reste du porteur, par ordre. */
  ratio: number[];
  /** Ouverture des rameaux (radians), par ordre. */
  spread: number[];
  /** Zigzag (radians par pas). */
  wiggle: number[];
  /** Retombée sous le poids (radians par mètre). */
  droop: number[];
}

const RULES: Rules = {
  spacing: [0, 0.5, 0.28, 0.15, 0.08],
  ratio: [0, 0.48, 0.5, 0.55, 0.35],
  spread: [0, 0.7, 0.75, 0.8, 0.9],
  wiggle: [0.03, 0.05, 0.14, 0.32, 0.45],
  droop: [0, 0.08, 0.16, 0.32, 0.45],
};
/** Ordre des rameaux porteurs de fleurs (au-delà, plus de ramification). */
const MAX_DEPTH = 4;
/** En deçà de cette longueur à l'écran (unités), un rameau ne se ramifie plus : il se couvre de fleurs. */
const LOD = 16;
/** Écart minimal entre deux bouquets à l'écran (unités) : au loin, un bouquet devient une touffe. */
const MIN_GAP = 7;
/** Écart minimal entre deux départs de rameaux à l'écran (unités), par ordre. */
const MIN_SPACING = [0, 0, 26, 17, 11];

/**
 * Fait pousser un arbre. Les branches qui ne peuvent pas atteindre le cadre (débord) ne sont pas
 * développées : un arbre tout proche ne génère que ce qu'on voit.
 */
export function growTree(spec: TreeSpec): Tree {
  const random = seeded(spec.seed);
  const [bx, by] = project(spec.x, spec.y ?? SITE.bank, spec.z);
  const s = FOCAL / spec.z;
  const t = spec.toward;
  const wood: Wood[] = [];
  const umbels: Umbel[] = [];
  const at = (u: number, v: number) => ({ x: bx + u * s, y: by - v * s });
  const flower = FLOWER_RADIUS * s;
  /** Hauteur de la couronne (m), pour l'éclairage. */
  const crownTop =
    spec.trunk.height + Math.max(...spec.limbs.map((l) => l.length * Math.cos(l.angle))) * 0.9;

  // Les arbres devant le pont restent dans les masses du croquis : la trouée et le ciel restent libres.
  const shape = spec.layer === 'far' ? undefined : canopyMask();
  const interior = spec.layer === 'far' ? undefined : interiorMask();
  const visible = (u: number, v: number, reach: number) => {
    const p = at(u, v);
    const r = reach * s;
    return (
      p.x + r > BLEED.x &&
      p.x - r < BLEED.x + BLEED.w &&
      p.y + r > BLEED.y &&
      p.y - r < BLEED.y + BLEED.h
    );
  };

  /** Écart entre bouquets (m) et taille d'une fleur à l'écran, grossie au loin pour couvrir l'écart. */
  const density = spec.density ?? 1;
  const gap = Math.max(0.045 / density, MIN_GAP / s);
  // Au fond du tunnel, des touffes plus grosses : on y voit des masses roses, pas des rameaux.
  const bloom = Math.max(flower, gap * s * (spec.layer === 'far' ? 0.62 : 0.36));
  const addUmbel = (u: number, v: number, dir: number, depth: number, below = 0) => {
    const p = at(u, v);
    if (p.x < BLEED.x || p.x > BLEED.x + BLEED.w || p.y < BLEED.y || p.y > BLEED.y + BLEED.h)
      return;
    // Au bord des masses, les fleurs se raréfient : un contour déchiqueté.
    let rim = 0;
    if (shape && interior) {
      const m = shape.at(p.x, p.y);
      if (m < 0.02) return;
      // Le cœur d'une masse est à l'ombre ; son bord, tourné vers le ciel, prend la lumière.
      rim = 0.55 - interior.at(p.x, p.y);
    }
    // Plus clair en haut de la couronne et au bout des rameaux, plus sombre au cœur.
    const height = Math.min(1, Math.max(0, v / crownTop));
    const light = Math.min(
      1,
      Math.max(
        0,
        0.32 + 0.3 * height + 0.1 * (depth - 2) - below * 0.35 + rim * 0.9 + (random() - 0.5) * 0.4,
      ),
    );
    umbels.push({
      x: p.x,
      y: p.y,
      size: bloom * (0.85 + random() * 0.3),
      count: 2 + Math.floor(random() * 4),
      light,
      angle: dir,
      seed: Math.floor(random() * 1e9),
      clump: bloom > flower * 1.05,
    });
  };

  const grow = (
    u: number,
    v: number,
    angle: number,
    length: number,
    radius: number,
    depth: number,
    droopK: number,
  ) => {
    if (!visible(u, v, length * 1.5)) return;
    const stepLen = Math.max(0.03, Math.min(0.35, length / 10, 4 / s));
    const steps = Math.max(2, Math.ceil(length / stepLen));
    const step = length / steps;
    const points = [{ u, v, r: radius }];
    let a = angle;
    // Les grosses branches courbent en douceur (une dérive lente) ; les rameaux zigzaguent à chaque nœud.
    let bend = (random() - 0.5) * 0.25;
    let outside = 0;
    for (let i = 1; i <= steps; i++) {
      const k = i / steps;
      if (depth <= 1) {
        bend += (random() - 0.5) * (depth === 0 ? 0.35 : 0.12);
        bend *= 0.92;
        a += bend * step;
      } else {
        a += (random() - 0.5) * RULES.wiggle[depth];
      }
      // Le poids fait plonger l'extrémité, du côté où la branche penche.
      const side = Math.abs(a) < 1e-3 ? t : Math.sign(a);
      a += side * RULES.droop[depth] * droopK * step * (0.2 + 1.6 * k * k);
      a = Math.max(-2.8, Math.min(2.8, a));
      // Près du bord de sa masse (le ciel, la trouée), une branche se détourne vers l'intérieur, comme une
      // couronne qui s'arrondit ; si elle sort quand même, elle s'arrête en s'effilant.
      if (shape && depth >= 1) {
        const ahead = at(u + Math.sin(a) * step * 3, v + Math.cos(a) * step * 3);
        const m = shape.at(ahead.x, ahead.y);
        if (m < 0.3) {
          const toward = maskGradient(shape, ahead.x, ahead.y);
          if (toward !== undefined) {
            const diff = Math.atan2(Math.sin(toward - a), Math.cos(toward - a));
            a += Math.max(-0.18, Math.min(0.18, diff)) * (1 - m);
          }
        }
      }
      const nu = u + Math.sin(a) * step;
      const nv = v + Math.cos(a) * step;
      if (shape && depth >= 1) {
        const q = at(nu, nv);
        // Les rameaux s'arrêtent au bord, fleuris jusqu'au bout ; les grosses branches un peu avant.
        if (shape.at(q.x, q.y) < (depth >= 3 ? 0.06 : 0.04)) {
          outside++;
          if (outside > (depth <= 1 ? 1 : 0)) {
            const n = points.length;
            for (let j = Math.max(1, n - 6); j < n; j++)
              points[j].r *= 0.08 + 0.92 * ((n - 1 - j) / 6);
            break;
          }
        } else {
          outside = 0;
        }
      }
      u = nu;
      v = nv;
      // Effilement marqué : une charpentière finit en rameau ; le tronc s'évase à son pied.
      const taper =
        depth === 0
          ? 1 - 0.3 * k + 0.35 * Math.max(0, 0.25 - k) * 4
          : depth === 1
            ? (1 - 0.88 * k) ** 0.85
            : 1 - 0.6 * k;
      // Un bois noueux : le rayon ondule un peu.
      const knot = depth <= 1 ? 1 + 0.06 * Math.sin(i * 1.7 + spec.seed) : 1;
      points.push({ u, v, r: radius * taper * knot });
    }
    wood.push({ points: points.map((p) => ({ ...at(p.u, p.v), r: p.r * s })), depth });

    // Longueur réellement poussée (la branche a pu s'arrêter au bord de sa masse).
    length = (points.length - 1) * step;
    if (points.length < 2) return;
    const onScreen = length * s;
    if (depth >= MAX_DEPTH || onScreen < LOD) {
      // Bout de chaîne : des bouquets tout le long (sur les rameaux) ou un bouquet au bout.
      for (let d = length * 0.1; d <= length; d += gap * (0.6 + random() * 0.6)) {
        const p = points[Math.min(points.length - 1, Math.round(d / step))];
        // Les bouquets entourent le rameau, la plupart pendent dessous (et y sont à l'ombre).
        const below = random();
        addUmbel(p.u + (random() - 0.5) * 0.05, p.v + 0.02 - below * 0.07, a, depth, below);
      }
      return;
    }

    // Rameaux : alternés de part et d'autre, plus serrés et plus courts vers le bout.
    let side = random() < 0.5 ? -1 : 1;
    // Au loin, les rameaux s'espacent à l'écran (et portent des touffes plus grosses).
    const spacing = Math.max(RULES.spacing[depth + 1] / density, MIN_SPACING[depth + 1] / s);
    for (
      let d = spacing * (0.5 + random());
      d < length * 0.97;
      d += spacing * (0.6 + random() * 0.8)
    ) {
      const i = Math.min(points.length - 2, Math.round(d / step));
      const p = points[i];
      const q = points[i + 1];
      const local = Math.atan2(q.u - p.u, q.v - p.v);
      side = -side;
      const remaining = length - d;
      const childLength =
        depth === 0
          ? 0
          : Math.max(
              0.04,
              remaining * RULES.ratio[depth + 1] * (0.6 + random() * 0.8) + (depth >= 2 ? 0.08 : 0),
            );
      if (!childLength) continue;
      grow(
        p.u,
        p.v,
        local + side * RULES.spread[depth + 1] * (0.6 + random() * 0.7),
        Math.min(childLength, depth === 1 ? 4.5 : depth === 2 ? 1.6 : 0.45),
        p.r * (depth === 1 ? 0.55 : 0.6),
        depth + 1,
        droopK,
      );
    }
    // Quelques bouquets serrés sur le bois des rameaux eux-mêmes (les fleurs naissent aussi sur le vieux bois).
    if (depth >= 2) {
      for (let d = 0.1; d < length; d += Math.max(0.18, gap * 2) * (0.6 + random() * 0.8)) {
        const p = points[Math.min(points.length - 1, Math.round(d / step))];
        addUmbel(p.u, p.v, a, depth);
      }
    }
  };

  // Le tronc, puis les charpentières depuis son sommet.
  grow(0, 0, spec.trunk.lean * t, spec.trunk.height, spec.trunk.radius, 0, 1);
  const trunk = wood[0]?.points;
  const top = trunk ? trunk[trunk.length - 1] : at(0, spec.trunk.height);
  const topU = (top.x - bx) / s;
  const topV = (by - top.y) / s;
  for (const limb of spec.limbs) {
    grow(
      topU,
      topV,
      limb.angle * t + (random() - 0.5) * 0.08,
      limb.length,
      spec.trunk.radius * 0.66,
      1,
      limb.droop ?? 1,
    );
  }
  return { spec, wood, umbels, base: { x: bx, y: by } };
}

/** Un arbre de bord de canal, penché vers l'eau. */
function canal(
  side: 'left' | 'right',
  z: number,
  seed: number,
  layer: CanopyLayer,
  reach = 1,
  limbs?: Limb[],
  droop = 1,
): TreeSpec {
  const left = side === 'left';
  return {
    x: left ? SITE.river.left - 1.1 : SITE.path.right + 1,
    z,
    toward: left ? 1 : -1,
    trunk: { height: 2.4 + (seed % 3) * 0.3, radius: 0.34, lean: 0.25 },
    limbs: (
      limbs ?? [
        { angle: 1.0, length: 8 * reach },
        { angle: 0.6, length: 7.5 * reach },
        { angle: 0.25, length: 6 * reach },
        { angle: -0.35, length: 4.5 * reach },
      ]
    ).map((l) => ({ ...l, droop: (l.droop ?? 1) * droop })),
    seed,
    layer,
  };
}

/** Les hautes charpentières d'un cerisier de tunnel : elles montent, puis s'arquent vers l'eau. */
const TALL: Limb[] = [
  { angle: 0.95, length: 8 },
  { angle: 0.6, length: 8.5 },
  { angle: 0.25, length: 7.5 },
  { angle: -0.15, length: 6 },
  { angle: -0.5, length: 4.5 },
];
const tall = (k: number): Limb[] => TALL.map((l) => ({ ...l, length: l.length * k }));
/** Les arbres qui bordent la trouée s'étalent davantage, à mi-hauteur. */
const WIDE: Limb[] = [
  { angle: 1.35, length: 7 },
  { angle: 1.05, length: 7.5 },
  { angle: 0.7, length: 7.5 },
  { angle: 0.3, length: 6.5 },
  { angle: -0.2, length: 5 },
  { angle: -0.9, length: 4 },
];
const wide = (k: number): Limb[] => WIDE.map((l) => ({ ...l, length: l.length * k }));

/** Une branche basse d'un arbre tout proche, hors cadre, qui entre par un bord avec de grandes fleurs. */
function foreground(
  x: number,
  y: number,
  z: number,
  toward: 1 | -1,
  seed: number,
  limbs: Limb[],
): TreeSpec {
  return {
    x,
    y,
    z,
    toward,
    trunk: { height: 0.15, radius: 0.06, lean: 1.4 },
    limbs,
    seed,
    layer: toward > 0 ? 'left' : 'right',
    density: 1.4,
  };
}

/**
 * Les cerisiers des deux rives. On lève les yeux : leurs troncs sont sous le cadre, leurs couronnes se
 * referment en tunnel (dans les masses du croquis). Au fond du tunnel (`far`), les petits arbres lointains
 * qu'on aperçoit sous le pont ; puis ceux qui bordent la trouée (`mid`) ; puis les plus hauts, plus
 * proches, qui balancent au vent (`left`, `right`) ; et deux branches basses au premier plan.
 */
export const TREES: TreeSpec[] = [
  canal('right', 125, 49, 'far', 1, tall(1.7)),
  canal('left', 110, 50, 'far', 1, tall(1.7)),
  canal('right', 98, 51, 'far', 1, tall(1.7)),
  canal('left', 90, 41, 'far', 1, tall(1.7)),
  canal('right', 80, 42, 'far', 1, tall(1.5)),
  canal('left', 68, 43, 'far', 1, tall(1.5)),
  canal('right', 62, 44, 'far', 1, tall(1.5)),
  canal('left', 56, 45, 'far', 1, tall(1.5)),
  canal('right', 52, 46, 'far', 1, tall(1.5)),
  canal('left', 48, 47, 'far', 1, tall(1.5)),
  canal('left', 47, 37, 'mid', 1, wide(0.85)),
  canal('right', 45, 38, 'mid', 1, wide(0.85)),
  canal('left', 42, 31, 'mid', 1, wide(0.9)),
  canal('right', 38, 32, 'mid', 1, wide(0.9)),
  canal('left', 33, 33, 'mid', 1, wide(0.95)),
  canal('right', 30, 34, 'mid', 1, wide(0.95)),
  canal('left', 26, 35, 'mid', 1, wide(1)),
  canal('right', 24, 36, 'mid', 1, wide(1)),
  canal('left', 20, 21, 'left', 1, tall(1.05), 0.8),
  canal('left', 14, 23, 'left', 1, tall(1.1), 0.8),
  foreground(-3.6, 4.6, 6, 1, 27, [
    { angle: 1.35, length: 2.6, droop: 1.1 },
    { angle: 1.1, length: 2.2, droop: 1.2 },
    { angle: 1.7, length: 2, droop: 1 },
  ]),
  canal('right', 19, 24, 'right', 1, tall(1.05), 0.8),
  canal('right', 13, 26, 'right', 1, tall(1.1), 0.8),
  foreground(3.2, 5.3, 6.5, -1, 28, [
    { angle: 1.45, length: 2.7, droop: 1.1 },
    { angle: 1.15, length: 2.3, droop: 1.2 },
    { angle: 1.8, length: 2, droop: 1 },
  ]),
];

/** Les arbres d'un calque, du plus loin au plus près. */
export function treesOf(layer: CanopyLayer): Tree[] {
  return TREES.filter((t) => t.layer === layer)
    .sort((a, b) => b.z - a.z)
    .map(growTree);
}
