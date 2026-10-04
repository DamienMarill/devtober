import {
  ACESFilmicToneMapping,
  CanvasTexture,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SpotLight,
  SRGBColorSpace,
  Texture,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { buildBanana } from './banana';
import { LID_Y, buildCup } from './cup';
import { studioEnvironment } from './env';
import { Plaque, Plinth, buildPlinth } from './plinth';

/** Hauteur à regarder (le milieu du trophée) et dimensions à faire tenir dans le cadre. */
const TARGET_Y = 2.95;
const FIT_HEIGHT = 8.4;
const FIT_WIDTH = 5.6;
const FOV = 28;

/** Durée (s) pendant laquelle le trophée dérape jusqu'à sa place avant de se stabiliser. */
const ENTRANCE_SECONDS = 3.2;

/** Ombre au sol : une tache sombre et douce sous le socle. */
function shadowTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(128, 128, 20, 128, 128, 128);
  g.addColorStop(0, 'rgba(0,0,0,0.85)');
  g.addColorStop(0.55, 'rgba(0,0,0,0.35)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/**
 * La scène du trophée : une Peau de banane d'or sur une coupe de Grand Prix, sur un socle de marbre.
 * Elle possède son canvas et son contexte WebGL, qu'on réutilise d'un mois à l'autre : on change la
 * plaque, on rejoue l'entrée.
 */
export class TrophyScene {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(FOV, 1, 0.1, 80);
  private readonly controls: OrbitControls;
  /** Tout le trophée, déplacé et tourné pendant l'entrée. */
  private readonly trophy = new Group();
  private readonly plinth: Plinth;
  private readonly env: Texture;
  private readonly resizer: ResizeObserver;
  private readonly observer: IntersectionObserver;
  private readonly reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  private frame = 0;
  private last = 0;
  private inView = true;
  private revealedAt: number | null = null;
  private clock = 0;
  private disposed = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.setClearColor(new Color(0x000000), 0);
    this.renderer = renderer;

    this.env = studioEnvironment(renderer);
    this.scene.environment = this.env;

    const gold = new MeshPhysicalMaterial({
      color: 0xf0c050,
      metalness: 1,
      roughness: 0.26,
      clearcoat: 0.6,
      clearcoatRoughness: 0.1,
    });

    this.plinth = buildPlinth(gold);
    const cup = buildCup(gold);
    const banana = buildBanana(gold);
    banana.position.y = LID_Y + 0.09;
    this.trophy.add(this.plinth.group, cup, banana);
    this.scene.add(this.trophy);

    const shadow = new Mesh(
      new PlaneGeometry(8, 8),
      new MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.002;
    this.scene.add(shadow);

    // Un projecteur chaud pour faire briller le marbre ; l'or vit surtout de l'environnement.
    const key = new SpotLight(0xffe2b0, 90, 40, Math.PI / 6, 0.6, 1.4);
    key.position.set(-5, 11, 9);
    key.target.position.set(0, 2.5, 0);
    this.scene.add(key, key.target);

    this.camera.position.set(0, 3.9, 14);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(0, TARGET_Y, 0);
    this.controls.enableZoom = false;
    this.controls.enablePan = false;
    this.controls.enableDamping = true;
    this.controls.minPolarAngle = 1.05;
    this.controls.maxPolarAngle = 1.6;
    this.controls.autoRotate = !this.reduced;
    this.controls.autoRotateSpeed = 1.1;
    if (this.reduced) this.controls.addEventListener('change', () => this.render());

    this.trophy.visible = false;

    this.resizer = new ResizeObserver(() => this.resize());
    this.resizer.observe(canvas);
    this.observer = new IntersectionObserver(([entry]) => {
      this.inView = entry.isIntersecting;
      this.schedule();
    });
    this.observer.observe(canvas);
    document.addEventListener('visibilitychange', this.onVisibility);

    this.resize();
    this.schedule();
  }

  /** Grave la plaque. */
  setPlaque(plaque: Plaque) {
    this.plinth.setPlaque(plaque);
    this.render();
  }

  /** Cache le trophée (avant l'ouverture de l'enveloppe). */
  hide() {
    this.trophy.visible = false;
    this.revealedAt = null;
    this.render();
  }

  /** Le trophée entre en dérapant, dépasse sa place, revient, puis se stabilise. */
  reveal() {
    this.trophy.visible = true;
    this.revealedAt = this.reduced ? null : this.clock;
    if (this.reduced) this.pose(ENTRANCE_SECONDS);
    this.schedule();
    this.render();
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.resizer.disconnect();
    this.observer.disconnect();
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.controls.dispose();
    const seen = new Set<unknown>();
    this.scene.traverse((o: Object3D) => {
      const mesh = o as Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
      for (const m of materials) {
        if (seen.has(m)) continue;
        seen.add(m);
        for (const value of Object.values(m)) if (value instanceof Texture) value.dispose();
        m.dispose();
      }
    });
    this.plinth.dispose();
    this.env.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }

  private readonly onVisibility = () => this.schedule();

  private resize() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Recule jusqu'à ce que le trophée tienne en hauteur comme en largeur (téléphone en portrait compris).
    const tan = Math.tan((FOV * Math.PI) / 360);
    const distance = Math.max(FIT_HEIGHT / 2 / tan, FIT_WIDTH / 2 / (tan * this.camera.aspect));
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    this.camera.position.copy(this.controls.target).addScaledVector(dir, distance);
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.render();
  }

  /**
   * Position du trophée `t` secondes après l'entrée : une glissade amortie qui dépasse sa place (le
   * dérapage), avec un lacet qui se rattrape en sens inverse.
   */
  private pose(t: number) {
    if (t >= ENTRANCE_SECONDS) {
      this.trophy.position.x = 0;
      this.trophy.rotation.set(0, 0, 0);
      return;
    }
    const decay = Math.exp(-2.2 * t);
    this.trophy.position.x = -7 * decay * Math.cos(3.4 * t);
    this.trophy.rotation.y = 2.6 * decay * Math.cos(3.4 * t + 0.5);
    this.trophy.rotation.z = -0.12 * decay * Math.sin(3.4 * t);
  }

  /** La boucle ne tourne que si le canvas est visible, l'onglet actif et quelque chose bouge. */
  private schedule() {
    if (this.disposed || this.frame || this.reduced || !this.inView || document.hidden) return;
    this.last = performance.now();
    this.frame = requestAnimationFrame(this.tick);
  }

  private readonly tick = (now: number) => {
    this.frame = 0;
    if (this.disposed || !this.inView || document.hidden) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.step(dt);
    this.frame = requestAnimationFrame(this.tick);
  };

  /** Avance l'animation de `dt` secondes et dessine une image. */
  step(dt: number) {
    this.clock += dt;
    if (this.revealedAt !== null) {
      const t = this.clock - this.revealedAt;
      if (t >= ENTRANCE_SECONDS) {
        this.revealedAt = null;
        this.pose(ENTRANCE_SECONDS);
      } else {
        this.pose(t);
      }
    }
    this.controls.update();
    this.render();
  }

  private render() {
    if (this.disposed) return;
    this.renderer.render(this.scene, this.camera);
  }
}
