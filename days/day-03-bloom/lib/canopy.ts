import { Camera, toScreen } from './camera';
import { Look } from './look';
import { Source } from './petals';
import { SITE, project } from './projection';
import { CanopyLayer, TREES, Tree, TreeSpec, growTree } from './sakura';
import { paintTree } from './sakura-paint';
import { glows } from './scenery';
import { applyTint } from './tint';

/** Plafond de pixels par calque (≈ 2560 × 1600) : au-delà, on baisse la densité de pixels. */
const MAX_PIXELS = 4_200_000;
const ORDER: CanopyLayer[] = ['far', 'mid', 'left', 'right'];
const GLOWS = glows();
/** Pendant qu'un calque se peint, on montre où il en est à ce rythme (ms). */
const PROGRESS_MS = 120;

interface Layer {
  name: CanopyLayer;
  view: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  /** La peinture en plein jour, avant la lumière du moment. */
  base: HTMLCanvasElement;
  /** Les arbres du calque, du plus loin au plus près ; générés à la demande, une fois. */
  specs: TreeSpec[];
  trees: Tree[];
  job?: Generator<void>;
  painted: boolean;
}

/**
 * Les quatre calques de cerisiers. Chacun est peint (à l'ouverture et à chaque changement de taille)
 * dans un canvas « de plein jour », par petites tranches à chaque image : l'animation ne se fige pas et la
 * canopée fleurit à l'écran. La lumière du moment y est ensuite appliquée d'un bloc.
 */
export class Canopy {
  private readonly layers: Layer[];
  private camera?: Camera;
  private dpr = 1;
  private look?: Look;
  private shownAt = 0;

  constructor(views: Record<CanopyLayer, HTMLCanvasElement>) {
    this.layers = ORDER.map((name) => ({
      name,
      view: views[name],
      ctx: views[name].getContext('2d')!,
      base: document.createElement('canvas'),
      specs: TREES.filter((t) => t.layer === name).sort((a, b) => b.z - a.z),
      trees: [],
      painted: false,
    }));
  }

  /** Tout est-il peint ? */
  get done(): boolean {
    return this.layers.every((l) => l.painted);
  }

  resize(camera: Camera): void {
    const same =
      this.camera && this.camera.width === camera.width && this.camera.height === camera.height;
    this.camera = camera;
    if (same) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.dpr = Math.min(dpr, Math.sqrt(MAX_PIXELS / Math.max(1, camera.width * camera.height)));
    for (const layer of this.layers) {
      const w = Math.round(camera.width * this.dpr);
      const h = Math.round(camera.height * this.dpr);
      layer.view.width = layer.base.width = w;
      layer.view.height = layer.base.height = h;
      layer.painted = false;
      layer.job = undefined;
    }
  }

  /** Avance la peinture jusqu'à `deadline` (horloge `performance.now()`) ; vrai s'il reste du travail. */
  work(deadline: number): boolean {
    const camera = this.camera;
    if (!camera) return false;
    let current: Layer | undefined;
    while (performance.now() < deadline) {
      current = this.layers.find((l) => !l.painted);
      if (!current) break;
      current.job ??= this.paint(current, camera);
      if (current.job.next().done) {
        current.painted = true;
        current.job = undefined;
        this.tintLayer(current);
        current = undefined;
      }
    }
    if (current && performance.now() - this.shownAt > PROGRESS_MS) {
      this.shownAt = performance.now();
      this.tintLayer(current);
    }
    return !this.done;
  }

  /** Applique la lumière du moment à tous les calques (déjà peints, ou en cours). */
  tint(look: Look): void {
    this.look = look;
    for (const layer of this.layers) if (layer.painted || layer.job) this.tintLayer(layer);
  }

  /** Points de départ des pétales : un échantillon des bouquets des arbres devant le pont (une fois générés). */
  sources(max = 1500): Source[] {
    const all: Source[] = [];
    for (const layer of this.layers) {
      if (layer.name === 'far') continue;
      for (const tree of layer.trees) {
        for (const u of tree.umbels) all.push({ x: u.x, y: u.y, r: u.size * 3, z: tree.spec.z });
      }
    }
    const step = Math.max(1, Math.floor(all.length / max));
    return all.filter((_, i) => i % step === 0);
  }

  /** Pied de l'arbre le plus proche d'une rive (composition), pour le balancement. */
  pivot(name: 'left' | 'right'): { x: number; y: number } {
    const specs = this.layers.find((l) => l.name === name)!.specs.filter((s) => s.y === undefined);
    const nearest = specs[specs.length - 1];
    const [x, y] = project(nearest.x, SITE.bank, nearest.z);
    return { x, y };
  }

  private *paint(layer: Layer, camera: Camera): Generator<void> {
    const ctx = layer.base.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, layer.base.width, layer.base.height);
    for (let i = 0; i < layer.specs.length; i++) {
      if (!layer.trees[i]) {
        layer.trees[i] = growTree(layer.specs[i]);
        yield;
      }
      yield* paintTree(ctx, layer.trees[i], camera, this.dpr);
    }
  }

  private tintLayer(layer: Layer): void {
    const look = this.look;
    const camera = this.camera;
    if (!look || !camera) {
      layer.ctx.setTransform(1, 0, 0, 1, 0, 0);
      layer.ctx.globalCompositeOperation = 'copy';
      layer.ctx.drawImage(layer.base, 0, 0);
      layer.ctx.globalCompositeOperation = 'source-over';
      return;
    }
    const c = look.canopy;
    const k = this.dpr;
    applyTint(layer.ctx, layer.base, {
      ambient: c.ambient,
      desaturate: c.desaturate,
      haze: {
        color: c.haze,
        alpha: layer.name === 'far' ? c.far : layer.name === 'mid' ? c.mid : c.near,
      },
      // La nuit, les lanternes éclairent les fleurs autour d'elles (yozakura).
      glows: GLOWS.map((g) => {
        const p = toScreen(camera, g.x, g.y);
        return {
          x: p.x * k,
          y: p.y * k,
          r: g.r * 2.2 * camera.scale * k,
          color: 'rgb(255 150 120)',
          alpha: c.lanterns * 0.35,
        };
      }),
    });
  }
}
