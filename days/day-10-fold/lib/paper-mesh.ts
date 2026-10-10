import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  DoubleSide,
  DynamicDrawUsage,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  SRGBColorSpace,
  Texture,
} from 'three';
import { dist, lerp, Vec2 } from './geometry';
import type { Crease, Facet } from './paper';
import { drawBack, Pattern } from './patterns';

/** Épaisseur d'une couche de papier (la feuille mesure 2 unités de côté). */
export const LAYER = 0.0035;

const SIZE = 1024;

function canvas() {
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  return c;
}

/**
 * Les deux faces de la feuille : le motif choisi et le washi crème. Les plis marqués sont dessinés
 * dessus, aux mêmes coordonnées de texture des deux côtés.
 */
export class PaperTextures {
  readonly color: CanvasTexture;
  readonly white: CanvasTexture;
  private readonly patternBase = canvas();
  private readonly whiteBase = canvas();
  private readonly colorCanvas = canvas();
  private readonly whiteCanvas = canvas();
  private creases: readonly Crease[] = [];

  constructor(
    private readonly uv: (q: Vec2) => Vec2,
    anisotropy: number,
  ) {
    drawBack(this.whiteBase.getContext('2d')!, SIZE);
    this.color = this.texture(this.colorCanvas, anisotropy);
    this.white = this.texture(this.whiteCanvas, anisotropy);
  }

  setPattern(pattern: Pattern) {
    const ctx = this.patternBase.getContext('2d')!;
    ctx.clearRect(0, 0, SIZE, SIZE);
    pattern.draw(ctx, SIZE);
    this.compose(this.colorCanvas, this.patternBase, this.color);
  }

  setCreases(creases: readonly Crease[]) {
    if (creases === this.creases) return;
    this.creases = creases;
    this.compose(this.colorCanvas, this.patternBase, this.color);
    this.compose(this.whiteCanvas, this.whiteBase, this.white);
  }

  /** Le fond, puis chaque pli : un sillon sombre bordé d'un fil de lumière. */
  private compose(target: HTMLCanvasElement, base: HTMLCanvasElement, texture: Texture) {
    const ctx = target.getContext('2d')!;
    ctx.drawImage(base, 0, 0);
    ctx.lineCap = 'round';
    const px = (q: Vec2) => {
      const t = this.uv(q);
      return [t.x * SIZE, (1 - t.y) * SIZE] as const;
    };
    const seen = new Set<string>();
    for (const c of this.creases) {
      if (dist(c.a, c.b) < 1e-4) continue;
      const key = [c.a, c.b]
        .map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`)
        .sort()
        .join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      const [ax, ay] = px(c.a);
      const [bx, by] = px(c.b);
      ctx.strokeStyle = 'rgba(40, 24, 30, 0.2)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(ax + 1.5, ay + 1.5);
      ctx.lineTo(bx + 1.5, by + 1.5);
      ctx.stroke();
    }
    texture.needsUpdate = true;
  }

  private texture(c: HTMLCanvasElement, anisotropy: number) {
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = anisotropy;
    return t;
  }

  dispose() {
    this.color.dispose();
    this.white.dispose();
  }
}

/**
 * Le matériau du papier : un seul matériau double face, qui choisit sa texture selon la face vue
 * (`gl_FrontFacing`) : le recto de la géométrie montre `map`, le verso `backMap`.
 */
export function paperMaterial(front: Texture, back: Texture) {
  const material = new MeshStandardMaterial({
    map: front,
    side: DoubleSide,
    shadowSide: DoubleSide,
    roughness: 0.86,
    metalness: 0,
    vertexColors: true,
  });
  const backMap = { value: back };
  material.onBeforeCompile = (shader) => {
    shader.uniforms['backMap'] = backMap;
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform sampler2D backMap;\nvoid main() {')
      .replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
  vec4 sampledDiffuseColor = gl_FrontFacing ? texture2D( map, vMapUv ) : texture2D( backMap, vMapUv );
  diffuseColor *= sampledDiffuseColor;
#endif`,
      );
  };
  return {
    material,
    setFaces(f: Texture, b: Texture) {
      material.map = f;
      backMap.value = b;
    },
  };
}

const sameIso = (f: Facet, g: Facet) =>
  Math.abs(f.iso.a - g.iso.a) +
    Math.abs(f.iso.b - g.iso.b) +
    Math.abs(f.iso.c - g.iso.c) +
    Math.abs(f.iso.d - g.iso.d) +
    Math.abs(f.iso.tx - g.iso.tx) +
    Math.abs(f.iso.ty - g.iso.ty) <
    1e-6 && f.bends.length === g.bends.length;

/** Le milieu de [a, b] est-il sur le segment [c, d] ? */
function onSegment(m: Vec2, c: Vec2, d: Vec2) {
  const l = dist(c, d);
  if (l < 1e-9) return false;
  const t = ((m.x - c.x) * (d.x - c.x) + (m.y - c.y) * (d.y - c.y)) / (l * l);
  if (t < -1e-6 || t > 1 + 1e-6) return false;
  return dist(m, lerp(c, d, t)) < 1e-5;
}

/**
 * La feuille à l'écran : un seul maillage pour toutes les facettes (un éventail de triangles chacune),
 * dont on recalcule les sommets à chaque image, et les arêtes visibles (bords du papier et plis
 * repliés ; les plis à plat sont déjà dessinés dans la texture).
 */
export class PaperMesh {
  readonly mesh: Mesh;
  readonly edges: LineSegments;
  private facets: readonly Facet[] = [];
  /** Pour chaque facette : ses sommets (feuille) et l'indice de son premier sommet dans le tampon. */
  private starts: number[] = [];
  private edgeList: { facet: number; a: Vec2; b: Vec2 }[] = [];

  constructor(
    material: MeshStandardMaterial,
    private readonly uv: (q: Vec2) => Vec2,
  ) {
    this.mesh = new Mesh(new BufferGeometry(), material);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.edges = new LineSegments(
      new BufferGeometry(),
      new LineBasicMaterial({
        color: 0x2a1830,
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
      }),
    );
    this.edges.frustumCulled = false;
  }

  get current() {
    return this.facets;
  }

  setFacets(facets: readonly Facet[]) {
    this.facets = facets;
    const verts = facets.reduce((s, f) => s + (f.poly.length - 2) * 3, 0);
    const position = new BufferAttribute(new Float32Array(verts * 3), 3).setUsage(DynamicDrawUsage);
    const normal = new BufferAttribute(new Float32Array(verts * 3), 3).setUsage(DynamicDrawUsage);
    const color = new BufferAttribute(new Float32Array(verts * 3), 3).setUsage(DynamicDrawUsage);
    const uvs = new Float32Array(verts * 2);
    this.starts = [];
    let k = 0;
    for (const f of facets) {
      this.starts.push(k);
      for (let i = 1; i < f.poly.length - 1; i++)
        for (const q of [f.poly[0], f.poly[i], f.poly[i + 1]]) {
          const t = this.uv(q);
          uvs[k * 2] = t.x;
          uvs[k * 2 + 1] = t.y;
          k++;
        }
    }
    const geometry = this.mesh.geometry;
    geometry.setAttribute('position', position);
    geometry.setAttribute('normal', normal);
    geometry.setAttribute('color', color);
    geometry.setAttribute('uv', new BufferAttribute(uvs, 2));
    geometry.setDrawRange(0, verts);

    // Arêtes : un côté de facette qu'une voisine prolonge à plat ne se voit pas.
    this.edgeList = [];
    facets.forEach((f, i) => {
      for (let e = 0; e < f.poly.length; e++) {
        const a = f.poly[e];
        const b = f.poly[(e + 1) % f.poly.length];
        const m = lerp(a, b, 0.5);
        const hidden = facets.some(
          (g, j) =>
            j !== i &&
            sameIso(f, g) &&
            g.poly.some((c, n) => onSegment(m, c, g.poly[(n + 1) % g.poly.length])),
        );
        if (!hidden) this.edgeList.push({ facet: i, a, b });
      }
    });
    this.edges.geometry.setAttribute(
      'position',
      new BufferAttribute(new Float32Array(this.edgeList.length * 6), 3).setUsage(DynamicDrawUsage),
    );
  }

  /**
   * Place chaque facette avec sa matrice (feuille → monde) et l'assombrit un peu selon sa hauteur dans
   * la pile (`shade` : 1 = pleine lumière).
   */
  update(matrices: readonly Matrix4[], shade: readonly number[]) {
    const geometry = this.mesh.geometry;
    const pos = geometry.getAttribute('position') as BufferAttribute;
    const nor = geometry.getAttribute('normal') as BufferAttribute;
    const col = geometry.getAttribute('color') as BufferAttribute;
    if (!pos) return;
    this.facets.forEach((f, i) => {
      const e = matrices[i].elements;
      // La normale du recto (0, 0, 1) transformée : la troisième colonne de la matrice.
      const nx = e[8];
      const ny = e[9];
      const nz = e[10];
      const s = shade[i];
      let k = this.starts[i];
      for (let t = 1; t < f.poly.length - 1; t++)
        for (const q of [f.poly[0], f.poly[t], f.poly[t + 1]]) {
          pos.setXYZ(
            k,
            e[0] * q.x + e[4] * q.y + e[12],
            e[1] * q.x + e[5] * q.y + e[13],
            e[2] * q.x + e[6] * q.y + e[14],
          );
          nor.setXYZ(k, nx, ny, nz);
          col.setXYZ(k, s, s, s * 0.985);
          k++;
        }
    });
    pos.needsUpdate = true;
    nor.needsUpdate = true;
    col.needsUpdate = true;
    geometry.computeBoundingSphere();

    const epos = this.edges.geometry.getAttribute('position') as BufferAttribute;
    this.edgeList.forEach(({ facet, a, b }, n) => {
      const e = matrices[facet].elements;
      // Un soupçon au-dessus du papier, côté recto comme verso : on décale le long de la normale.
      const lift = 0.0012;
      for (const [j, q] of [a, b].entries()) {
        const up = Math.sign(e[10]) || 1;
        epos.setXYZ(
          n * 2 + j,
          e[0] * q.x + e[4] * q.y + e[12] + e[8] * lift * up,
          e[1] * q.x + e[5] * q.y + e[13] + e[9] * lift * up,
          e[2] * q.x + e[6] * q.y + e[14] + e[10] * lift * up,
        );
      }
    });
    epos.needsUpdate = true;
  }

  /** Lit les sommets courants (pour cadrer la caméra et décoller la feuille de la table). */
  positions(): Float32Array {
    const pos = this.mesh.geometry.getAttribute('position') as BufferAttribute | undefined;
    return (pos?.array as Float32Array) ?? new Float32Array();
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.edges.geometry.dispose();
    (this.edges.material as LineBasicMaterial).dispose();
  }
}
