import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  QuadraticBezierCurve3,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  TubeGeometry,
  Vector3,
} from 'three';
import { dist, norm, sub, Vec2 } from './geometry';
import type { Guide } from './paper';

/** Pli vallée : rose sakura. Pli montagne : pêche (comme dans les diagrammes, deux traits différents). */
export const VALLEY = new Color('#ff7eb6');
export const MOUNTAIN = new Color('#ffb35c');

/** Des tirets posés à plat le long d'un segment : « — — — » (vallée) ou « — · — · » (montagne). */
function dashes(a: Vec2, b: Vec2, z: number, mountain: boolean, width: number): BufferGeometry {
  const l = dist(a, b);
  const d = norm(sub(b, a));
  const n = { x: -d.y * (width / 2), y: d.x * (width / 2) };
  const pattern = mountain ? [0.075, 0.035, 0.014, 0.035] : [0.06, 0.04];
  const quads: number[] = [];
  let t = 0;
  let k = 0;
  while (t < l) {
    const len = pattern[k % pattern.length];
    if (k % 2 === 0) {
      const t1 = Math.min(l, t + len);
      const p0 = { x: a.x + d.x * t, y: a.y + d.y * t };
      const p1 = { x: a.x + d.x * t1, y: a.y + d.y * t1 };
      const c = [
        [p0.x - n.x, p0.y - n.y],
        [p1.x - n.x, p1.y - n.y],
        [p1.x + n.x, p1.y + n.y],
        [p0.x + n.x, p0.y + n.y],
      ];
      for (const i of [0, 1, 2, 0, 2, 3]) quads.push(c[i][0], c[i][1], z);
    }
    t += len;
    k++;
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(quads), 3));
  return g;
}

/** Le doigt fantôme : un rond lumineux qui montre le geste. */
function fingerTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 8, 64, 64, 62);
  g.addColorStop(0, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.45, 'rgba(255,214,236,0.75)');
  g.addColorStop(0.7, 'rgba(255,126,182,0.35)');
  g.addColorStop(1, 'rgba(255,126,182,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(64, 64, 34, 0, Math.PI * 2);
  ctx.stroke();
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/**
 * Ce qu'on dessine au-dessus de la feuille pour guider le pli : la droite en pointillés, une flèche en
 * arc de la partie à plier jusqu'à sa destination, et un doigt fantôme qui mime le geste.
 */
export class Guides {
  readonly group = new Group();
  readonly finger: Sprite;
  private readonly lineMat = new MeshBasicMaterial({
    color: VALLEY,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  private readonly arrowMat = new MeshBasicMaterial({
    color: VALLEY,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  private readonly parts: Mesh[] = [];
  private curve: QuadraticBezierCurve3 | null = null;

  constructor() {
    this.finger = new Sprite(
      new SpriteMaterial({
        map: fingerTexture(),
        transparent: true,
        depthTest: false,
        depthWrite: false,
        opacity: 0,
      }),
    );
    this.finger.scale.setScalar(0.22);
    this.finger.renderOrder = 12;
    this.group.add(this.finger);
  }

  /** Affiche les guides d'une étape : `z` est le dessus de la pile, `grab` → `drop` le geste. */
  show(guides: readonly Guide[], grab: Vec2, drop: Vec2, z: number, flip: boolean) {
    this.clear();
    const mountain = guides[0]?.mountain ?? false;
    const color = mountain ? MOUNTAIN : VALLEY;
    this.lineMat.color.copy(color);
    this.arrowMat.color.copy(color);
    for (const g of guides) {
      if (!g.crease) continue;
      // Les pointillés débordent un peu du modèle, comme sur un diagramme.
      const [a, b] = g.crease;
      const d = norm(sub(b, a));
      const ext = 0.12;
      const mesh = new Mesh(
        dashes(
          { x: a.x - d.x * ext, y: a.y - d.y * ext },
          { x: b.x + d.x * ext, y: b.y + d.y * ext },
          z + 0.004,
          g.mountain,
          0.022,
        ),
        this.lineMat,
      );
      mesh.renderOrder = 10;
      this.parts.push(mesh);
    }

    // L'arc : plus haut pour un grand geste ; un retournement fait une grande boucle.
    const span = dist(grab, drop);
    const start = new Vector3(grab.x, grab.y, z + 0.02);
    const end = new Vector3(drop.x, drop.y, z + 0.02);
    const mid = start.clone().lerp(end, 0.5);
    mid.z += flip ? span * 0.6 : 0.12 + span * 0.45;
    // On raccourcit un peu les deux bouts : la flèche ne doit pas cacher les coins.
    const curve = new QuadraticBezierCurve3(start, mid, end);
    const trimmed = new QuadraticBezierCurve3(curve.getPoint(0.08), mid, curve.getPoint(0.9));
    this.curve = curve;
    const tube = new Mesh(new TubeGeometry(trimmed, 48, 0.016, 8, false), this.arrowMat);
    const head = new Mesh(new ConeGeometry(0.055, 0.14, 16), this.arrowMat);
    const tip = trimmed.getPoint(1);
    const tangent = trimmed.getTangent(1);
    head.position.copy(tip).addScaledVector(tangent, 0.05);
    head.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), tangent);
    tube.renderOrder = head.renderOrder = 11;
    this.parts.push(tube, head);
    this.group.add(...this.parts);
  }

  /** Opacité des guides (on les estompe pendant qu'on plie). */
  setOpacity(lines: number, arrow: number) {
    this.lineMat.opacity = lines;
    this.arrowMat.opacity = arrow;
  }

  /** Place le doigt fantôme à `t` (0 → 1) le long de l'arc, avec une opacité. */
  setFinger(t: number | null, opacity = 1) {
    const m = this.finger.material;
    if (t === null || !this.curve) {
      m.opacity = 0;
      return;
    }
    this.finger.position.copy(this.curve.getPoint(Math.min(1, Math.max(0, t))));
    m.opacity = opacity;
  }

  /** Place le doigt fantôme à une position donnée (pendant une démonstration). */
  putFinger(p: Vector3, opacity: number) {
    this.finger.position.copy(p);
    this.finger.material.opacity = opacity;
  }

  clear() {
    for (const p of this.parts) {
      this.group.remove(p);
      p.geometry.dispose();
    }
    this.parts.length = 0;
    this.curve = null;
    this.finger.material.opacity = 0;
  }

  dispose() {
    this.clear();
    this.lineMat.dispose();
    this.arrowMat.dispose();
    this.finger.material.map?.dispose();
    this.finger.material.dispose();
  }
}
