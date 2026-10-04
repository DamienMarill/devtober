import {
  CanvasTexture,
  Group,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/** Ce qu'on grave sur la plaque : une ligne d'en-tête, le mois, et le nom du lauréat. */
export interface Plaque {
  kicker: string;
  title: string;
  name: string;
}

const SERIF = '"Bodoni Moda", "Playfair Display", Didot, "Times New Roman", serif';
const PLAQUE_W = 1024;
const PLAQUE_H = 300;

/** Un hasard reproductible (le marbre est le même à chaque chargement). */
function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** Marbre noir à veines dorées et grises, dessiné une fois sur un canvas. */
function marbleTexture(): CanvasTexture {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const rand = rng(7);
  ctx.fillStyle = '#0d0b0a';
  ctx.fillRect(0, 0, size, size);

  // Nuages : de grandes taches très douces.
  for (let i = 0; i < 40; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 80 + rand() * 220;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const light = rand() < 0.5 ? '255,255,255' : '120,100,70';
    g.addColorStop(0, `rgba(${light},${0.05 + rand() * 0.05})`);
    g.addColorStop(1, `rgba(${light},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // Veines : des marches aléatoires qui dérivent dans une direction, parfois dorées.
  for (let v = 0; v < 26; v++) {
    const gold = rand() < 0.3;
    let x = rand() * size;
    let y = rand() * size;
    let a = rand() * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const steps = 60 + rand() * 120;
    for (let i = 0; i < steps; i++) {
      a += (rand() - 0.5) * 0.7;
      x += Math.cos(a) * 9;
      y += Math.sin(a) * 9;
      ctx.lineTo(x, y);
    }
    ctx.strokeStyle = gold ? `rgba(200,160,80,${0.25 + rand() * 0.3})` : `rgba(210,205,200,${0.1 + rand() * 0.2})`;
    ctx.lineWidth = gold ? 0.8 + rand() : 0.6 + rand() * 1.4;
    ctx.stroke();
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

/** Dessine la plaque de laiton : fond brossé, double filet, texte gravé (ombre claire dessous, sombre dessus). */
function drawPlaque(ctx: CanvasRenderingContext2D, { kicker, title, name }: Plaque) {
  const g = ctx.createLinearGradient(0, 0, PLAQUE_W, PLAQUE_H);
  g.addColorStop(0, '#9c7a35');
  g.addColorStop(0.45, '#e2c06f');
  g.addColorStop(1, '#8a6a2a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, PLAQUE_W, PLAQUE_H);

  // Le brossage : des milliers de traits horizontaux à peine visibles.
  const rand = rng(3);
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = `rgba(${rand() < 0.5 ? '255,240,200' : '60,40,10'},${0.02 + rand() * 0.04})`;
    ctx.fillRect(0, rand() * PLAQUE_H, PLAQUE_W, 1);
  }

  ctx.strokeStyle = 'rgba(60,40,10,0.7)';
  ctx.lineWidth = 3;
  ctx.strokeRect(14, 14, PLAQUE_W - 28, PLAQUE_H - 28);
  ctx.lineWidth = 1.2;
  ctx.strokeRect(24, 24, PLAQUE_W - 48, PLAQUE_H - 48);

  const engrave = (text: string, y: number, font: string, spacing: string) => {
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = spacing;
    ctx.fillStyle = 'rgba(255,240,200,0.55)';
    ctx.fillText(text, PLAQUE_W / 2 + 1.5, y + 1.5);
    ctx.fillStyle = '#2a1c06';
    ctx.fillText(text, PLAQUE_W / 2, y);
  };
  engrave(kicker.toUpperCase(), 68, `600 30px ${SERIF}`, '9px');
  engrave(title, 150, `700 72px ${SERIF}`, '2px');
  engrave(name, 238, `italic 500 40px ${SERIF}`, '1px');
}

export interface Plinth {
  group: Group;
  /** Regrave la plaque (texte venu du JSON). */
  setPlaque(plaque: Plaque): void;
  dispose(): void;
}

/** Le socle : deux gradins de marbre noir, des filets dorés, et la plaque gravée sur la face avant. */
export function buildPlinth(gold: Material): Plinth {
  const group = new Group();
  const marble = marbleTexture();
  const stone = new MeshPhysicalMaterial({
    color: 0xffffff,
    map: marble,
    roughness: 0.22,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
  });

  const lower = new Mesh(new RoundedBoxGeometry(3.6, 0.35, 3.6, 4, 0.05), stone);
  lower.position.y = 0.175;
  const upper = new Mesh(new RoundedBoxGeometry(3, 0.92, 3, 4, 0.04), stone);
  upper.position.y = 0.81;
  // Le plateau doré recouvre tout le dessus du marbre (1,27) : deux faces dans le même plan scintilleraient.
  const band = new Mesh(new RoundedBoxGeometry(3.08, 0.08, 3.08, 3, 0.03), gold);
  band.position.y = 1.26;
  const foot = new Mesh(new RoundedBoxGeometry(3.68, 0.05, 3.68, 3, 0.02), gold);
  foot.position.y = 0.375;
  group.add(lower, upper, band, foot);

  // La plaque : un cadre doré, et la plaque de laiton par-dessus.
  const canvas = document.createElement('canvas');
  canvas.width = PLAQUE_W;
  canvas.height = PLAQUE_H;
  const ctx = canvas.getContext('2d')!;
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;

  const frame = new Mesh(new RoundedBoxGeometry(2.46, 0.78, 0.05, 3, 0.012), gold);
  frame.position.set(0, 0.8, 1.5);
  const plate = new Mesh(new PlaneGeometry(2.36, 2.36 * (PLAQUE_H / PLAQUE_W)), new MeshBasicMaterial({ map: texture }));
  plate.position.set(0, 0.8, 1.5 + 0.027);
  group.add(frame, plate);

  let current: Plaque = { kicker: '', title: '', name: '' };
  const draw = () => {
    drawPlaque(ctx, current);
    texture.needsUpdate = true;
  };
  draw();

  return {
    group,
    setPlaque(plaque) {
      current = plaque;
      draw();
      // La police Didone arrive en différé : on regrave quand elle est là.
      void document.fonts?.load(`700 72px "Bodoni Moda"`).then(draw);
    },
    dispose() {
      marble.dispose();
      texture.dispose();
    },
  };
}
