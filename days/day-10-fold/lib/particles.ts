import {
  CanvasTexture,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  Euler,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  Texture,
  Vector3,
} from 'three';
import { rng } from './patterns';

export type Effect = 'none' | 'petals' | 'confetti' | 'snow';

export const EFFECTS: readonly { id: Effect; name: string }[] = [
  { id: 'none', name: 'Aucun' },
  { id: 'petals', name: 'Pétales' },
  { id: 'confetti', name: 'Confettis' },
  { id: 'snow', name: 'Neige' },
];

const COUNT = 150;

/** Un pétale de cerisier échancré, ou un flocon rond (blanc : la couleur vient de chaque instance). */
function sprite(kind: 'petal' | 'flake'): Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  if (kind === 'flake') {
    const g = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
    g.addColorStop(0, '#fff');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  } else {
    ctx.beginPath();
    ctx.moveTo(32, 62);
    ctx.bezierCurveTo(4, 44, 6, 10, 26, 4);
    ctx.lineTo(32, 13);
    ctx.lineTo(38, 4);
    ctx.bezierCurveTo(58, 10, 60, 44, 32, 62);
    ctx.fill();
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

interface Flake {
  p: Vector3;
  fall: number;
  sway: number;
  phase: number;
  spin: Vector3;
  rot: Euler;
  size: number;
}

/**
 * Ce qui tombe autour du modèle en mode photo : des pétales de cerisier, des confettis de papier ou de la
 * neige. Un seul `InstancedMesh` de petits carrés, dont la texture et les couleurs changent selon l'effet.
 */
export class Particles {
  readonly mesh: InstancedMesh;
  private readonly material: MeshBasicMaterial;
  private readonly petal = sprite('petal');
  private readonly flake = sprite('flake');
  private flakes: Flake[] = [];
  private mode: Effect = 'none';
  private center = new Vector3();
  private radius = 1;
  /** Le sol (les flocons disparaissent en le touchant) et le haut de la zone. */
  private bottom = 0;
  private top = 1;
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly s = new Vector3();

  constructor() {
    // Sans éclairage : vus par la tranche ou de dos, pétales et confettis gardent leur couleur.
    this.material = new MeshBasicMaterial({ side: DoubleSide, alphaTest: 0.4 });
    this.mesh = new InstancedMesh(new PlaneGeometry(1, 1), this.material, COUNT);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  /** Change d'effet ; `center` et `radius` délimitent la zone où ça tombe (autour du modèle). */
  setMode(mode: Effect, center: Vector3, radius: number) {
    this.mode = mode;
    this.center.copy(center);
    this.radius = radius;
    this.bottom = Math.max(0.02, center.z - radius * 1.4);
    this.top = center.z + radius * 2.2;
    this.mesh.visible = mode !== 'none';
    if (mode === 'none') return;
    this.material.map = mode === 'confetti' ? null : mode === 'petals' ? this.petal : this.flake;
    this.material.transparent = mode === 'snow';
    this.material.needsUpdate = true;
    const rand = rng(mode.length * 31);
    const palette =
      mode === 'petals'
        ? ['#ffd6e4', '#ffb7cf', '#ffffff', '#f79bb9']
        : mode === 'confetti'
          ? ['#ff7eb6', '#ffb35c', '#92d9ff', '#a49cff', '#fff3a8', '#7be0b4']
          : ['#ffffff', '#eef4ff'];
    const color = new Color();
    this.flakes = Array.from({ length: COUNT }, (_, i) => {
      this.mesh.setColorAt(i, color.set(palette[i % palette.length]));
      return {
        p: this.spawn(rand, rand()),
        fall: (mode === 'confetti' ? 0.45 : mode === 'snow' ? 0.22 : 0.3) * (0.7 + rand() * 0.6),
        sway: 0.15 + rand() * 0.25,
        phase: rand() * 6.3,
        spin: new Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(
          mode === 'snow' ? 0.5 : 5,
        ),
        rot: new Euler(rand() * 6, rand() * 6, rand() * 6),
        size:
          mode === 'confetti'
            ? 0.05 + rand() * 0.03
            : mode === 'snow'
              ? 0.025 + rand() * 0.03
              : 0.07 + rand() * 0.04,
      };
    });
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.step(0);
  }

  /** Un point au hasard dans la boîte autour du modèle, à une hauteur relative `h` (0 en bas, 1 en haut). */
  private spawn(rand: () => number, h: number) {
    const r = this.radius * 2.2;
    return new Vector3(
      this.center.x + (rand() - 0.5) * 2 * r,
      this.center.y + (rand() - 0.5) * 2 * r,
      this.bottom + h * (this.top - this.bottom),
    );
  }

  step(dt: number) {
    if (this.mode === 'none') return;
    const bottom = this.bottom;
    const rand = Math.random;
    this.flakes.forEach((f, i) => {
      f.phase += dt;
      f.p.z -= f.fall * dt;
      f.p.x += Math.sin(f.phase * 1.3) * f.sway * dt;
      f.p.y += Math.cos(f.phase * 0.9) * f.sway * 0.6 * dt;
      f.rot.x += f.spin.x * dt;
      f.rot.y += f.spin.y * dt;
      f.rot.z += f.spin.z * dt;
      if (f.p.z < bottom) f.p.copy(this.spawn(rand, 1));
      const w = this.mode === 'confetti' ? f.size * 0.6 : f.size;
      this.m.compose(f.p, this.q.setFromEuler(f.rot), this.s.set(f.size, w, 1));
      this.mesh.setMatrixAt(i, this.m);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.petal.dispose();
    this.flake.dispose();
  }
}
