import {
  CatmullRomCurve3,
  Group,
  Material,
  Mesh,
  MeshPhysicalMaterial,
  SphereGeometry,
  TubeGeometry,
  Vector3,
} from 'three';
import { Ring, smoothstep, sweep } from './sweep';

/** Hauteur du corps de la banane (de la base au bout de la queue). */
const HEIGHT = 2;
/** Angles (autour de l'axe vertical) des trois pelures : deux de part et d'autre du visage (qui regarde vers +z), une derrière. */
const FLAPS = [28, 152, 270].map((d) => (d * Math.PI) / 180);
/** Les cinq nervures du corps, dont une pile au milieu du visage (les sections partent de +z). */
const RIDGES = 5;
const RIDGE = 0.035;

/** Rayon du corps à la hauteur `s` (0 : bas, 1 : bout de la queue). Ventre rond, cou fin, queue arrondie. */
export function bodyRadius(s: number): number {
  if (s < 0.14) return 0.56 * Math.sqrt(1 - ((0.14 - s) / 0.14) ** 2);
  if (s < 0.38) return 0.56;
  if (s < 0.8) return 0.56 - 0.46 * smoothstep((s - 0.38) / 0.42);
  if (s < 0.97) return 0.1 - 0.015 * ((s - 0.8) / 0.17);
  return 0.085 * Math.sqrt(Math.max(0, 1 - ((s - 0.97) / 0.03) ** 2));
}

/** Le corps se courbe en croissant : le bas reste sur l'axe, la queue penche vers +x. */
const lean = (s: number) => 0.5 * s ** 3.2;

function bodyRing(s: number): Ring {
  const e = 0.001;
  const dx = lean(Math.min(1, s + e)) - lean(Math.max(0, s - e));
  const dy = HEIGHT * (Math.min(1, s + e) - Math.max(0, s - e));
  const len = Math.hypot(dx, dy);
  const r = bodyRadius(s);
  return { p: [lean(s), HEIGHT * s, 0], b: [0, 0, 1], n: [-dy / len, dx / len, 0], a: r, c: r };
}

/**
 * Une pelure : une lanière qui part du ventre, se couche sur le couvercle de la coupe (sans y entrer),
 * puis retombe par-dessus le bord en s'arrondissant.
 */
function flapRing(theta: number) {
  const rho = (u: number) => 0.28 + 1.2 * u;
  /** Au-delà de ce point (u), la pelure a dépassé le bord du couvercle et peut tomber. */
  const EDGE = 0.65;
  const y = (u: number) => 0.12 - 0.15 * u - 2.6 * Math.max(0, u - EDGE) ** 2;
  const dRho = 1.2;
  const dy = (u: number) => -0.15 - 5.2 * Math.max(0, u - EDGE);
  return (u: number): Ring => {
    const tx = dRho * Math.cos(theta);
    const tz = dRho * Math.sin(theta);
    const ty = dy(u);
    // Normale dans le plan vertical de la pelure : largeur × tangente (sens qui pointe vers le haut).
    const b = [-Math.sin(theta), 0, Math.cos(theta)] as const;
    const n = new Vector3(...b).cross(new Vector3(tx, ty, tz)).normalize();
    const tip = Math.sqrt(Math.max(0, 1 - u ** 2.4));
    return {
      p: [rho(u) * Math.cos(theta), y(u), rho(u) * Math.sin(theta)],
      b: [...b],
      n: [n.x, n.y, n.z],
      a: 0.46 * tip,
      c: 0.09 * tip + 0.012,
    };
  };
}

/**
 * La peau de banane, façon Mario Kart : un corps dodu en croissant, trois pelures qui retombent, et un
 * visage laqué noir (deux yeux, un petit sourire). Origine au bas du corps ; le visage regarde vers +z.
 */
export function buildBanana(gold: Material): Group {
  const group = new Group();

  const body = new Mesh(
    sweep(bodyRing, {
      slices: 96,
      stacks: 48,
      wobble: (phi) => 1 + RIDGE * Math.cos(RIDGES * phi),
    }),
    gold,
  );
  group.add(body);
  for (const theta of FLAPS) group.add(new Mesh(sweep(flapRing(theta), { slices: 48, stacks: 36 }), gold));

  // Le visage : sur le devant du ventre, légèrement enfoncé dans l'or pour suivre la courbure.
  const lacquer = new MeshPhysicalMaterial({ color: 0x0a0807, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 });
  const shine = new MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.4, emissive: 0xffffff, emissiveIntensity: 0.6 });
  /** Profondeur de la peau devant (x relatif à l'axe du corps, y absolu), nervure du milieu comprise (la section part de +z). */
  const surfaceZ = (x: number, y: number) => {
    const r = bodyRadius(y / HEIGHT);
    const phi = Math.asin(Math.min(1, Math.abs(x) / r));
    return r * (1 + RIDGE * Math.cos(RIDGES * phi)) * Math.cos(phi);
  };

  const eyeY = 1.0;
  const cx = lean(eyeY / HEIGHT);
  for (const side of [-1, 1]) {
    const dx = side * 0.19;
    const z = surfaceZ(dx, eyeY) - 0.02;
    const eye = new Mesh(new SphereGeometry(1, 24, 16), lacquer);
    eye.scale.set(0.075, 0.13, 0.05);
    eye.position.set(cx + dx, eyeY, z);
    eye.rotation.y = Math.asin(Math.min(1, Math.abs(dx) / bodyRadius(eyeY / HEIGHT))) * side;
    group.add(eye);

    const glint = new Mesh(new SphereGeometry(1, 12, 8), shine);
    glint.scale.set(0.02, 0.03, 0.015);
    glint.position.set(cx + dx - side * 0.012, eyeY + 0.045, z + 0.03);
    group.add(glint);
  }

  // Le sourire : un arc de parabole, un petit tube noir posé sur le ventre.
  const smileY = 0.8;
  const smileX = lean(smileY / HEIGHT);
  const points: Vector3[] = [];
  for (let i = 0; i <= 14; i++) {
    const t = i / 14 - 0.5;
    const dx = t * 0.4;
    const y = smileY - 0.075 * (1 - (2 * t) ** 2);
    points.push(new Vector3(smileX + dx, y, surfaceZ(dx, y) + 0.004));
  }
  group.add(new Mesh(new TubeGeometry(new CatmullRomCurve3(points), 28, 0.02, 10), lacquer));

  return group;
}
