import { CanvasTexture, Mesh, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace } from 'three';

/** Côté du tapis de découpe, en unités de scène (la feuille fait 2). */
export const MAT_SIZE = 6.4;

/**
 * Le tapis de découpe sous la feuille : quadrillage, graduations et diagonales à 45°, comme sur
 * l'établi de n'importe quel plieur. Il reçoit l'ombre du papier.
 */
export function cuttingMat(anisotropy: number): Mesh {
  const size = 2048;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const pad = size * 0.012;
  const radius = size * 0.035;

  ctx.beginPath();
  ctx.roundRect(pad, pad, size - 2 * pad, size - 2 * pad, radius);
  ctx.fillStyle = '#1c2458';
  ctx.fill();
  ctx.save();
  ctx.clip();

  // Le quadrillage : une ligne par « centimètre », plus marquée tous les cinq.
  const n = 64;
  const step = size / n;
  for (let i = 0; i <= n; i++) {
    const major = i % 8 === 0;
    ctx.strokeStyle = major ? 'rgba(146, 217, 255, 0.28)' : 'rgba(146, 217, 255, 0.1)';
    ctx.lineWidth = major ? 3 : 1.5;
    ctx.beginPath();
    ctx.moveTo(i * step, 0);
    ctx.lineTo(i * step, size);
    ctx.moveTo(0, i * step);
    ctx.lineTo(size, i * step);
    ctx.stroke();
  }
  // Les diagonales à 45° : l'angle préféré de l'origami.
  ctx.strokeStyle = 'rgba(255, 202, 236, 0.13)';
  ctx.lineWidth = 2;
  ctx.setLineDash([18, 14]);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(size, size);
  ctx.moveTo(size, 0);
  ctx.lineTo(0, size);
  ctx.stroke();
  ctx.setLineDash([]);
  // Les graduations des bords.
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= n * 2; i++) {
    const l = i % 16 === 0 ? 30 : i % 2 === 0 ? 16 : 8;
    const x = (i * step) / 2;
    ctx.beginPath();
    ctx.moveTo(x, pad);
    ctx.lineTo(x, pad + l);
    ctx.moveTo(pad, x);
    ctx.lineTo(pad + l, x);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
  ctx.font = `600 ${size * 0.016}px Lato, sans-serif`;
  ctx.fillText('折り紙 · ORIGAMI · 45°', pad + 60, size - pad - 40);
  ctx.restore();

  const texture = new CanvasTexture(c);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = anisotropy;
  const mat = new Mesh(
    new PlaneGeometry(MAT_SIZE, MAT_SIZE),
    // Les coins arrondis sont découpés (alphaTest) : le tapis reste opaque, donc bien trié sous la feuille.
    new MeshStandardMaterial({ map: texture, alphaTest: 0.5, roughness: 0.95, metalness: 0 }),
  );
  mat.position.z = -0.004;
  mat.receiveShadow = true;
  return mat;
}
