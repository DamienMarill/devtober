import {
  CircleGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Matrix4,
  MOUSE,
  Mesh,
  MeshBasicMaterial,
  NeutralToneMapping,
  PCFShadowMap,
  PerspectiveCamera,
  Plane,
  PlaneGeometry,
  Quaternion,
  Raycaster,
  Scene,
  ShadowMaterial,
  TOUCH,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { det, Line, overlaps, v, Vec2 } from './geometry';
import { Guides } from './guides';
import type { OrigamiModel } from './models';
import { depths, Facet, Folder, Motion, topAt, Turn, worldPoly } from './paper';
import { LAYER, PaperMesh, paperMaterial, PaperTextures } from './paper-mesh';
import { Effect, Particles } from './particles';
import type { Pattern } from './patterns';
import { Decor, DECORS, Rect } from './photo';
import { PaperSound } from './sound';
import { cuttingMat } from './table';

/** Ce que l'interface affiche : où on en est, et si la feuille est occupée. */
export interface FoldState {
  readonly index: number;
  readonly total: number;
  readonly busy: boolean;
  readonly dragging: boolean;
  readonly done: boolean;
}

/** Ce qu'on dessine : des facettes, et pour chacune une rotation éventuelle et sa hauteur avant/après. */
interface Display {
  readonly facets: readonly Facet[];
  readonly turns: readonly (Turn | null)[];
  readonly depth0: readonly number[];
  readonly depth1: readonly number[];
}

interface Tween {
  from: number;
  to: number;
  duration: number;
  time: number;
  done: () => void;
}

const FOV = 34;
/** Inclinaison de la caméra (depuis la verticale) : on regarde la table en biais, ou le modèle de face. */
const POLAR_TABLE = 0.72;
const POLAR_SHOW = 1.22;

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

/** Rotation d'angle `angle` autour d'une droite de la table, posée à la hauteur `z`. */
function rotationAbout(line: Line, z: number, angle: number): Matrix4 {
  const axis = new Vector3(line.n.y, -line.n.x, 0);
  const to = new Matrix4().makeTranslation(line.p.x, line.p.y, z);
  const back = new Matrix4().makeTranslation(-line.p.x, -line.p.y, -z);
  return to.multiply(new Matrix4().makeRotationAxis(axis, angle)).multiply(back);
}

/** Le battement d'un cœur : « poum-poum », puis un silence. */
function heartbeat(t: number) {
  const u = t % 1.15;
  return 0.09 * Math.exp(-((u - 0.1) ** 2) / 0.0018) + 0.05 * Math.exp(-((u - 0.34) ** 2) / 0.0018);
}

/**
 * La scène d'origami : la feuille sur son tapis, les guides du pli en cours, et tout ce qui fait
 * bouger la feuille (le doigt de l'utilisateur, la démonstration, l'annulation, la présentation finale).
 */
export class OrigamiScene {
  readonly sound = new PaperSound();
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(FOV, 1, 0.3, 60);
  private readonly controls: OrbitControls;
  /** pose (présentation finale) > lift (décoller de la table) > papier. */
  private readonly pose = new Group();
  private readonly lift = new Group();
  private readonly guides = new Guides();
  private readonly decals = new Group();
  private readonly mesh: PaperMesh;
  private readonly material: ReturnType<typeof paperMaterial>;
  private textures: PaperTextures | null = null;
  private readonly anisotropy: number;
  private readonly reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private readonly raycaster = new Raycaster();
  private readonly resizer: ResizeObserver;
  private readonly observer: IntersectionObserver;
  private readonly sky: HemisphereLight;
  private readonly sun: DirectionalLight;
  private readonly fill: DirectionalLight;
  private readonly mat: Mesh;
  /** Hors de l'atelier, un sol invisible qui ne garde que l'ombre du modèle. */
  private readonly catcher: Mesh<PlaneGeometry, ShadowMaterial>;
  private readonly particles = new Particles();

  private model!: OrigamiModel;
  private pattern!: Pattern;
  private folder!: Folder;
  private display!: Display;
  private shade0: number[] = [];
  private shade1: number[] = [];
  private motion: Motion | null = null;
  /** Avancement du pli en cours, de 0 (à plat) à 1 (plié). */
  private t = 0;
  private tween: Tween | null = null;
  private drag: { from: Vec2; pointer: number; last: number } | null = null;
  /** Le doigt fantôme suit la pointe pendant une démonstration. */
  private showFinger = false;
  private demoing = false;
  private demoTimer = 0;
  private idle = 0;
  private clock = 0;
  private liftZ = 0;
  /** La présentation finale : 0 → 1 pendant la mise en pose, puis l'horloge de l'animation. */
  private finale: { k: number; time: number; center: Vector3; radius: number } | null = null;
  private polarGoal: { polar: number; time: number } | null = null;
  private target = new Vector3();
  private distance = 6;
  private insets = { top: 0, bottom: 0 };
  /** Au chargement, la caméra se place d'un coup au lieu de glisser. */
  private snap = true;
  /** Mode photo : la caméra appartient au photographe dès qu'il la touche. */
  private photo = false;
  private userCam = false;
  private frozen = false;
  private viewfinder: { w: number; h: number } | null = null;
  private frame = 0;
  private last = 0;
  private inView = true;
  private disposed = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly onState: (s: FoldState) => void,
  ) {
    const renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.toneMapping = NeutralToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFShadowMap;
    this.renderer = renderer;
    this.anisotropy = renderer.capabilities.getMaxAnisotropy();

    this.camera.up.set(0, 0, 1);
    this.camera.position.set(0, -Math.sin(POLAR_TABLE) * 6, Math.cos(POLAR_TABLE) * 6);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableZoom = false;
    this.controls.enablePan = false;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.maxPolarAngle = 1.5;
    this.controls.addEventListener('start', () => {
      if (this.photo) this.userCam = true;
    });
    this.setOrbit(false);

    const sky = new HemisphereLight(0xfff4ea, 0x2b2466, 1.5);
    const sun = new DirectionalLight(0xfff0dc, 1.9);
    sun.position.set(-2.4, -3.2, 7);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const cam = sun.shadow.camera;
    cam.left = cam.bottom = -3.4;
    cam.right = cam.top = 3.4;
    cam.near = 1;
    cam.far = 18;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.01;
    sun.shadow.radius = 5;
    const rim = new DirectionalLight(0xb8c8ff, 0.55);
    rim.position.set(3, 4, 2);
    // Une lumière douce qui suit la caméra : le modèle debout, face à nous, n'est jamais dans l'ombre.
    const fill = new DirectionalLight(0xfff6f0, 1.05);
    fill.position.set(0, 0, 1);
    this.camera.add(fill);
    this.mat = cuttingMat(this.anisotropy);
    this.catcher = new Mesh(new PlaneGeometry(40, 40), new ShadowMaterial({ opacity: 0.25 }));
    this.catcher.position.z = -0.004;
    this.catcher.receiveShadow = true;
    this.catcher.visible = false;
    this.sky = sky;
    this.sun = sun;
    this.fill = fill;
    this.scene.add(sky, sun, rim, this.camera, this.mat, this.catcher, this.particles.mesh);

    const blank = new PaperTextures(() => v(0, 0), 1);
    this.material = paperMaterial(blank.color, blank.white);
    blank.dispose();
    this.mesh = new PaperMesh(this.material.material, (q) => this.uv(q));
    this.lift.add(this.mesh.mesh, this.mesh.edges, this.decals);
    this.pose.add(this.lift);
    this.scene.add(this.pose, this.guides.group);

    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointercancel', this.onUp);

    this.resizer = new ResizeObserver(() => this.resize());
    this.resizer.observe(canvas);
    this.observer = new IntersectionObserver(([e]) => {
      this.inView = e.isIntersecting;
      this.schedule();
    });
    this.observer.observe(canvas);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  // ───────────────────────────── modèle, papier

  /** Pose une feuille neuve pour ce modèle. */
  load(model: OrigamiModel, pattern: Pattern) {
    this.model = model;
    this.stopDemo();
    this.textures?.dispose();
    this.textures = new PaperTextures((q) => this.uv(q), this.anisotropy);
    this.pattern = pattern;
    this.textures.setPattern(pattern);
    this.applyFaces();
    this.folder = new Folder(model.sheet, model.steps);
    this.resetPose();
    this.tween = null;
    this.drag = null;
    this.t = 0;
    this.idle = 0;
    this.snap = true;
    this.refresh();
    this.schedule();
  }

  setPattern(pattern: Pattern) {
    this.pattern = pattern;
    this.textures?.setPattern(pattern);
  }

  restart() {
    this.load(this.model, this.pattern);
  }

  /** Les coordonnées de texture d'un point de la feuille (un losange est un carré tourné de 45°). */
  private uv(q: Vec2): Vec2 {
    if (this.model?.sheet !== 'diamond') return v((q.x + 1) / 2, (q.y + 1) / 2);
    const c = Math.SQRT1_2;
    return v((q.x * c - q.y * c + 1) / 2, (q.x * c + q.y * c + 1) / 2);
  }

  /** Face colorée dessus ou dessous au départ : on choisit quelle texture va au recto de la géométrie. */
  private applyFaces() {
    const t = this.textures!;
    if (this.model.colorUp) this.material.setFaces(t.color, t.white);
    else this.material.setFaces(t.white, t.color);
  }

  // ───────────────────────────── état

  /** Prépare l'étape suivante (ou l'état final) et l'affiche à plat. */
  private refresh() {
    this.motion = this.folder.next();
    this.textures?.setCreases(this.folder.state.creases);
    if (this.motion) this.setDisplay(this.motion);
    else {
      const facets = this.folder.state.facets;
      const d = depths(facets);
      this.setDisplay({ facets, turns: facets.map(() => null), depth0: d, depth1: d });
    }
    this.t = 0;
    this.showGuides();
    this.emit();
  }

  private setDisplay(d: Display) {
    this.display = d;
    this.mesh.setFacets(d.facets);
    this.shade0 = this.shading(d.facets, d.depth0);
    const after = 'result' in d && !(d as Motion).crease ? (d as Motion).result.facets : d.facets;
    this.shade1 = after.length === d.facets.length ? this.shading(after, d.depth1) : this.shade0;
  }

  /** Une facette recouverte par d'autres est un peu plus sombre : on lit mieux l'épaisseur des rabats. */
  private shading(facets: readonly Facet[], depth: readonly number[]): number[] {
    const polys = facets.map(worldPoly);
    return facets.map((_, i) => {
      let top = depth[i];
      for (let j = 0; j < facets.length; j++)
        if (j !== i && depth[j] > top && overlaps(polys[i], polys[j])) top = depth[j];
      return Math.max(0.74, 1 - 0.07 * (top - depth[i]));
    });
  }

  private showGuides() {
    const m = this.motion;
    if (!m || this.finale) {
      this.guides.clear();
      return;
    }
    const top = Math.max(0, ...this.display.depth0) * LAYER;
    this.guides.show(m.guides, m.grab, m.drop, top, m.step.kind === 'flip');
  }

  private emit() {
    this.onState({
      index: this.folder.index,
      total: this.model.steps.length,
      busy: !!this.tween || !!this.drag,
      dragging: !!this.drag,
      done: this.folder.done,
    });
  }

  // ───────────────────────────── actions

  /** « Montre-moi » : l'étape se plie toute seule, le doigt fantôme fait le geste. */
  play() {
    if (!this.motion || this.tween || this.drag || this.finale) return;
    this.showFinger = true;
    this.run(this.t, 1, this.motion.crease ? 0.85 : 1.05, () => this.landed());
  }

  /** Annule la dernière étape, en la repliant à l'envers. */
  undo() {
    if (this.tween || this.drag) return;
    this.stopDemo();
    if (this.finale) this.resetPose();
    const m = this.folder.undo();
    if (!m) return;
    this.guides.clear();
    if (m.crease) {
      this.refresh();
      return;
    }
    this.setDisplay(m);
    this.t = 1;
    this.textures?.setCreases(this.folder.state.creases);
    this.run(1, 0, 0.55, () => this.refresh());
    this.emit();
  }

  /** La démonstration (touche T) : toutes les étapes à la suite, puis la présentation. */
  startDemo() {
    this.demoing = true;
    this.demoTimer = 0.6;
  }

  private stopDemo() {
    this.demoing = false;
    this.showFinger = false;
  }

  /** Les insets de l'interface (en px) : on cadre le modèle dans la zone libre entre les deux. */
  setInsets(top: number, bottom: number) {
    this.insets = { top, bottom };
    this.resize();
  }

  setMuted(muted: boolean) {
    this.sound.setMuted(muted);
  }

  // ───────────────────────────── mode photo

  /** Entre en mode photo (le modèle doit être fini) ou en sort : on revient alors à l'atelier. */
  setPhotoMode(on: boolean) {
    this.photo = on && !!this.finale;
    this.userCam = false;
    const c = this.controls;
    c.enableZoom = this.photo;
    c.minDistance = this.photo ? this.finale!.radius * 1.4 : 0;
    c.maxDistance = this.photo ? this.finale!.radius * 9 : Infinity;
    if (!this.photo) {
      this.setDecor(DECORS[0]);
      this.setEffect('none');
      this.setFrozen(false);
      this.viewfinder = null;
    }
  }

  /** La taille du viseur (px) : le modèle est cadré dedans tant qu'on ne touche pas à la caméra. */
  setViewfinder(w: number, h: number) {
    this.viewfinder = { w, h };
  }

  /** Recadre automatiquement le modèle dans le viseur. */
  recenter() {
    this.userCam = false;
  }

  setDecor(d: Decor) {
    this.mat.visible = d.mat;
    this.catcher.visible = !d.mat;
    this.catcher.material.opacity = d.shadow;
    const m = d.mood;
    this.sky.color.setHex(m.sky);
    this.sky.groundColor.setHex(m.ground);
    this.sky.intensity = m.ambient;
    this.sun.color.setHex(m.sun);
    this.sun.intensity = m.sunIntensity;
    this.fill.intensity = m.fill;
  }

  setEffect(effect: Effect) {
    const f = this.finale;
    const center = f
      ? new Vector3(0, 0, this.model.finale === 'fly' ? 1 : f.radius + 0.12)
      : new Vector3();
    this.particles.setMode(effect, center, f?.radius ?? 1);
  }

  /** Fige le modèle (et ce qui tombe) pour composer la photo. */
  setFrozen(frozen: boolean) {
    this.frozen = frozen;
  }

  /**
   * Rend la zone `r` du canvas (le viseur, en px CSS) à `width` pixels de large, sans l'interface : on
   * agrandit la vue avec `setViewOffset`, on dessine une image, on la copie, puis on rend la taille normale.
   * Le fond est transparent : le décor est peint à part.
   */
  capture(r: Rect, width: number): HTMLCanvasElement {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const shift = (this.insets.top - this.insets.bottom) / 2;
    const full = h + 2 * Math.abs(shift);
    const y0 = Math.abs(shift) - shift;
    const s = width / r.w;
    const outW = Math.round(width);
    const outH = Math.round(r.h * s);
    const ratio = this.renderer.getPixelRatio();
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(outW, outH, false);
    this.camera.setViewOffset(w * s, full * s, r.x * s, (y0 + r.y) * s, outW, outH);
    this.camera.updateProjectionMatrix();
    this.renderer.render(this.scene, this.camera);
    const out = document.createElement('canvas');
    out.width = outW;
    out.height = outH;
    out.getContext('2d')!.drawImage(this.renderer.domElement, 0, 0);
    this.renderer.setPixelRatio(ratio);
    this.resize();
    this.renderer.render(this.scene, this.camera);
    return out;
  }

  private run(from: number, to: number, duration: number, done: () => void) {
    this.tween = { from, to, duration: this.reduced ? duration * 0.5 : duration, time: 0, done };
    this.emit();
  }

  /** Le pli est arrivé au bout : on le marque (ou on déplie, pour un simple pli de repère). */
  private landed() {
    const m = this.motion!;
    this.sound.crease(m.step.kind === 'flip' ? 0.5 : 1);
    if (m.crease) {
      this.run(1, 0, 0.6, () => this.commit());
      return;
    }
    this.commit();
  }

  private commit() {
    this.folder.commit(this.motion!);
    this.showFinger = false;
    this.refresh();
    if (this.folder.done) this.startFinale();
  }

  // ───────────────────────────── le doigt de l'utilisateur

  private readonly onDown = (e: PointerEvent) => {
    this.sound.unlock();
    if (this.demoing) this.stopDemo();
    if (e.button !== 0 || this.finale || !this.motion || this.tween || this.drag) return;
    const p = this.toTable(e);
    if (!p) return;
    this.canvas.setPointerCapture(e.pointerId);
    this.drag = { from: p, pointer: e.pointerId, last: performance.now() };
    this.showFinger = false;
    this.t = 0;
    this.emit();
  };

  private readonly onMove = (e: PointerEvent) => {
    const d = this.drag;
    const m = this.motion;
    if (!d || !m || e.pointerId !== d.pointer) return;
    const p = this.toTable(e);
    if (!p) return;
    // On projette le geste sur la direction de la flèche, puis on retrouve l'angle qui amène la pointe
    // sous le doigt : vue de dessus, la pointe avance comme (1 − cos θ).
    const gx = m.drop.x - m.grab.x;
    const gy = m.drop.y - m.grab.y;
    const progress = clamp01(((p.x - d.from.x) * gx + (p.y - d.from.y) * gy) / (gx * gx + gy * gy));
    const angle = Math.abs(m.turns.find(Boolean)!.angle);
    const t = Math.acos(1 - progress * (1 - Math.cos(angle))) / angle;
    const now = performance.now();
    this.sound.rustle(Math.abs(t - this.t) / Math.max(0.008, (now - d.last) / 1000) / 3);
    d.last = now;
    this.t = t;
  };

  private readonly onUp = (e: PointerEvent) => {
    const d = this.drag;
    if (!d || e.pointerId !== d.pointer) return;
    this.drag = null;
    this.sound.rustle(0);
    if (this.t > 0.42) this.run(this.t, 1, 0.35 * (1 - this.t) + 0.12, () => this.landed());
    else this.run(this.t, 0, 0.3 * this.t + 0.1, () => this.emit());
    this.emit();
  };

  /** Le point de la table sous le pointeur. */
  private toTable(e: PointerEvent): Vec2 | null {
    const r = this.canvas.getBoundingClientRect();
    const ndc = new Vector2(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      -((e.clientY - r.top) / r.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.ray.intersectPlane(
      new Plane(new Vector3(0, 0, 1), 0),
      new Vector3(),
    );
    return hit ? v(hit.x, hit.y) : null;
  }

  // ───────────────────────────── présentation finale

  private startFinale() {
    this.guides.clear();
    this.sound.done();
    // Les sommets de l'état final (le maillage vient d'être reconstruit).
    this.place(0);
    this.finale = { k: 0, time: 0, center: new Vector3(), radius: 1 };
    const pos = this.mesh.positions();
    const min = new Vector3(Infinity, Infinity, Infinity);
    const max = new Vector3(-Infinity, -Infinity, -Infinity);
    for (let i = 0; i < pos.length; i += 3) {
      min.min(new Vector3(pos[i], pos[i + 1], pos[i + 2]));
      max.max(new Vector3(pos[i], pos[i + 1], pos[i + 2]));
    }
    this.finale.center.copy(min).add(max).multiplyScalar(0.5);
    this.finale.radius = max.distanceTo(min) / 2;
    this.addDecals();
    this.polarGoal = { polar: POLAR_SHOW, time: 0 };
    this.setOrbit(true);
    this.emit();
  }

  private resetPose() {
    this.finale = null;
    this.pose.position.set(0, 0, 0);
    this.pose.quaternion.identity();
    this.pose.scale.setScalar(1);
    this.lift.position.set(0, 0, 0);
    this.liftZ = 0;
    for (const d of [...this.decals.children]) {
      this.decals.remove(d);
      (d as Mesh).geometry.dispose();
    }
    this.polarGoal = { polar: POLAR_TABLE, time: 0 };
    this.setOrbit(false);
  }

  /** Les yeux et la truffe du chien, posés sur la facette la plus haute à cet endroit. */
  private addDecals() {
    const state = this.folder.state;
    const d = this.display.depth0;
    for (const decal of this.model.decals ?? []) {
      const hit = topAt(state, decal.at);
      if (!hit) continue;
      const z = (d[state.facets.indexOf(hit.facet)] ?? 0) * LAYER + 0.0015;
      const black = new MeshBasicMaterial({ color: 0x1a1020, transparent: true, opacity: 0 });
      const shape =
        decal.kind === 'eye'
          ? new CircleGeometry(decal.size, 24)
          : new CircleGeometry(decal.size, 3, -Math.PI / 2);
      const mesh = new Mesh(shape, black);
      mesh.position.set(decal.at.x, decal.at.y, z);
      if (decal.kind === 'nose') mesh.scale.set(1.25, 0.8, 1);
      this.decals.add(mesh);
      if (decal.kind === 'eye') {
        const glint = new Mesh(
          new CircleGeometry(decal.size * 0.32, 12),
          new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 }),
        );
        glint.position.set(
          decal.at.x - decal.size * 0.3,
          decal.at.y + decal.size * 0.3,
          z + 0.0005,
        );
        this.decals.add(glint);
      }
    }
  }

  /** Pendant le pliage, le clic gauche plie ; une fois fini, il fait tourner la caméra autour du modèle. */
  private setOrbit(free: boolean) {
    const c = this.controls;
    c.mouseButtons = { LEFT: free ? MOUSE.ROTATE : null, MIDDLE: null, RIGHT: MOUSE.ROTATE };
    c.touches = { ONE: free ? TOUCH.ROTATE : null, TWO: TOUCH.DOLLY_ROTATE };
  }

  // ───────────────────────────── boucle

  private readonly onVisibility = () => this.schedule();

  private schedule() {
    if (this.disposed || this.frame || !this.inView || document.hidden) return;
    this.last = performance.now();
    this.frame = requestAnimationFrame(this.tick);
  }

  private readonly tick = (now: number) => {
    this.frame = 0;
    if (this.disposed || !this.inView || document.hidden) return;
    // Plafonné à 0,1 s : à 10 images/s (rendu logiciel), les plis gardent leur vraie durée.
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.step(dt);
    this.frame = requestAnimationFrame(this.tick);
  };

  private step(dt: number) {
    this.clock += dt;
    this.animate(dt);
    this.place(dt);
    if (!this.frozen) this.particles.step(dt);
    this.frameCamera(dt);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  private animate(dt: number) {
    const tw = this.tween;
    if (tw) {
      tw.time += dt;
      const k = clamp01(tw.time / tw.duration);
      this.t = tw.from + (tw.to - tw.from) * easeInOut(k);
      if (k >= 1) {
        this.tween = null;
        tw.done();
        this.emit();
      }
    }

    // La démonstration enchaîne les étapes toute seule.
    if (this.demoing && !this.tween && !this.drag) {
      this.demoTimer -= dt;
      if (this.demoTimer <= 0) {
        if (this.motion) {
          this.play();
          this.demoTimer = 0.55;
        } else this.demoing = false;
      }
    }

    // Au repos, un indice : le doigt fantôme refait le geste et la feuille se soulève à peine.
    const resting = !this.tween && !this.drag && !this.finale && !!this.motion && !this.demoing;
    this.idle = resting ? this.idle + dt : 0;
    if (resting && this.idle > 1.3) {
      const u = ((this.idle - 1.3) % 3) / 3;
      const move = clamp01((u - 0.12) / 0.5);
      const fade = u < 0.12 ? u / 0.12 : u > 0.72 ? Math.max(0, 1 - (u - 0.72) / 0.12) : 1;
      this.guides.setFinger(easeInOut(move), fade * 0.95);
      if (!this.reduced) this.t = 0.09 * Math.sin(Math.PI * move) * fade;
    } else if (!this.showFinger) this.guides.setFinger(null);

    const fading = this.drag || (this.tween && !this.showFinger);
    const pulse = 0.75 + 0.25 * Math.sin(this.clock * 3.2);
    this.guides.setOpacity(fading ? 0.35 : 0.95, fading ? 0.15 : 0.9 * pulse);
  }

  /** Calcule la matrice de chaque facette pour l'avancement `t`, et met le papier à jour. */
  private place(dt: number) {
    const d = this.display;
    if (!d) return;
    const t = this.t;
    const s = clamp01(t);
    const matrices = d.facets.map((f, i) => {
      const iso = f.iso;
      const z0 = d.depth0[i] * LAYER;
      const z1 = d.depth1[i] * LAYER;
      const turn = d.turns[i];
      const m = new Matrix4().set(
        iso.a,
        iso.b,
        0,
        iso.tx,
        iso.c,
        iso.d,
        0,
        iso.ty,
        0,
        0,
        det(iso),
        z0,
        0,
        0,
        0,
        1,
      );
      if (!turn) {
        m.elements[14] = z0 + (z1 - z0) * s;
      } else {
        m.premultiply(rotationAbout(turn.line, turn.h * LAYER, t * turn.angle));
        // Une rotation d'un demi-tour pose la facette à 2h − z0 ; on la glisse vers sa vraie hauteur.
        if (Math.abs(Math.abs(turn.angle) - Math.PI) < 1e-6)
          m.elements[14] += (z1 - (2 * turn.h * LAYER - z0)) * s;
      }
      for (let k = f.bends.length - 1; k >= 0; k--) {
        const b = f.bends[k];
        m.premultiply(rotationAbout(b.line, b.h * LAYER, b.angle));
      }
      return m;
    });
    const shade = this.shade0.map((a, i) => a + ((this.shade1[i] ?? a) - a) * s);
    this.mesh.update(matrices, shade);

    // Si une partie passe sous la table (pli montagne, retournement), on soulève toute la feuille.
    let minZ = 0;
    const pos = this.mesh.positions();
    for (let i = 2; i < pos.length; i += 3) minZ = Math.min(minZ, pos[i]);
    const goal = this.finale ? 0 : -minZ;
    this.liftZ = goal > this.liftZ || this.finale ? this.liftZ + (goal - this.liftZ) * 0.25 : goal;
    this.lift.position.z = this.liftZ;
    this.guides.group.position.z = this.liftZ;

    // Le doigt fantôme accompagne la pointe pendant une démonstration.
    const m = this.motion;
    if (this.showFinger && m && this.tween) {
      const turn = m.turns.find(Boolean)!;
      const tip = new Vector3(m.grab.x, m.grab.y, turn.h * LAYER).applyMatrix4(
        rotationAbout(turn.line, turn.h * LAYER, t * turn.angle),
      );
      tip.z += this.liftZ + 0.03;
      this.guides.putFinger(tip, 0.95);
    }

    this.placeFinale(dt);
  }

  /** La pose finale : debout face à nous (le chien, le gobelet, le kabuto, le cœur qui bat), ou en vol. */
  private placeFinale(dt: number) {
    const f = this.finale;
    if (!f) return;
    f.k = Math.min(1, f.k + dt / 1.3);
    if (!this.frozen) f.time += dt;
    const k = easeInOut(f.k);
    const c = f.center;
    this.lift.position.set(-c.x, -c.y, -c.z + this.liftZ);

    const goal = new Quaternion();
    const pos = new Vector3(0, 0, 0);
    const motion = this.reduced ? 0 : 1;
    if (this.model.finale === 'fly') {
      const yaw = -0.5 + f.time * 0.35 * motion;
      goal
        .setFromAxisAngle(new Vector3(0, 0, 1), yaw)
        .multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 0.12))
        .multiply(
          new Quaternion().setFromAxisAngle(
            new Vector3(0, 1, 0),
            Math.PI / 2 + 0.16 * Math.sin(f.time * 1.4) * motion,
          ),
        );
      pos.set(0, 0, 1.0 + 0.08 * Math.sin(f.time * 1.1) * motion);
    } else {
      const sway = 0.28 * Math.sin(f.time * 0.7) * motion;
      goal
        .setFromAxisAngle(new Vector3(0, 0, 1), sway)
        // Debout, penché en arrière de 20° : face à la caméra, qui le regarde un peu d'en haut.
        .multiply(
          new Quaternion().setFromAxisAngle(
            new Vector3(1, 0, 0),
            Math.PI / 2 - (Math.PI / 2 - POLAR_SHOW),
          ),
        );
      pos.set(0, 0, f.radius + 0.12 + 0.03 * Math.sin(f.time * 1.3) * motion);
    }
    this.pose.quaternion.identity().slerp(goal, k);
    this.pose.position.copy(c).lerp(pos, k);
    this.pose.scale.setScalar(
      this.model.finale === 'beat' ? 1 + heartbeat(f.time) * k * motion : 1,
    );

    for (const d of this.decals.children) {
      const mat = (d as Mesh).material as MeshBasicMaterial;
      mat.opacity = clamp01((f.k - 0.6) / 0.4);
    }
  }

  // ───────────────────────────── caméra

  private resize() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    // On décale le centre de l'image vers le milieu de la zone libre (entre la barre du haut et le panneau du bas).
    const shift = (this.insets.top - this.insets.bottom) / 2;
    const full = h + 2 * Math.abs(shift);
    this.camera.aspect = w / full;
    this.camera.setViewOffset(w, full, 0, Math.abs(shift) - shift, w, h);
    this.camera.updateProjectionMatrix();
  }

  /** Cadre le modèle : la caméra suit son centre et recule pour qu'il tienne dans la zone libre. */
  private frameCamera(dt: number) {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (!w || !h) return;
    const pos = this.mesh.positions();
    let center: Vector3;
    let radius: number;
    if (this.finale) {
      center = this.pose.position.clone();
      radius = this.finale.radius;
    } else {
      const min = new Vector3(Infinity, Infinity, Infinity);
      const max = new Vector3(-Infinity, -Infinity, -Infinity);
      const p = new Vector3();
      for (let i = 0; i < pos.length; i += 3) {
        p.set(pos[i], pos[i + 1], pos[i + 2] + this.liftZ);
        min.min(p);
        max.max(p);
      }
      if (!isFinite(min.x)) return;
      center = min.clone().add(max).multiplyScalar(0.5);
      radius = 0.5;
      for (let i = 0; i < pos.length; i += 3)
        radius = Math.max(radius, Math.hypot(pos[i] - center.x, pos[i + 1] - center.y));
    }
    // En mode photo, une fois que le photographe a pris la caméra, on ne la touche plus.
    if (this.photo && this.userCam) return;
    const full = h + Math.abs(this.insets.top - this.insets.bottom);
    const safe = Math.max(120, h - this.insets.top - this.insets.bottom);
    const fitW = this.viewfinder?.w ?? w;
    const fitH = this.viewfinder?.h ?? safe;
    const tan = Math.tan((FOV * Math.PI) / 360);
    const fit = radius / Math.min((tan * fitH) / full, (tan * fitW) / full);
    // En mode photo, le viseur montre exactement l'image : on serre le cadrage.
    const goal = fit * (this.photo ? 1 : this.finale ? 1.25 : 1.15);

    const k = this.snap ? 1 : 1 - Math.exp(-dt * 2.6);
    this.snap = false;
    this.target.lerp(center, k);
    this.distance += (goal - this.distance) * k;
    this.controls.target.copy(this.target);

    const offset = this.camera.position.clone().sub(this.target).normalize();
    const g = this.polarGoal;
    if (g) {
      g.time += dt;
      const az = Math.atan2(offset.y, offset.x);
      const want = new Vector3(
        Math.sin(g.polar) * Math.cos(az),
        Math.sin(g.polar) * Math.sin(az),
        Math.cos(g.polar),
      );
      offset.lerp(want, 1 - Math.exp(-dt * 3)).normalize();
      if (g.time > 2) this.polarGoal = null;
    }
    this.camera.position.copy(this.target).addScaledVector(offset, this.distance);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.resizer.disconnect();
    this.observer.disconnect();
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.canvas.removeEventListener('pointerdown', this.onDown);
    this.canvas.removeEventListener('pointermove', this.onMove);
    this.canvas.removeEventListener('pointerup', this.onUp);
    this.canvas.removeEventListener('pointercancel', this.onUp);
    this.controls.dispose();
    this.guides.dispose();
    this.particles.dispose();
    this.mesh.dispose();
    this.textures?.dispose();
    this.material.material.dispose();
    this.scene.traverse((o) => {
      const m = o as Mesh;
      if (m.isMesh && m !== this.mesh.mesh) {
        m.geometry.dispose();
        const mat = m.material as MeshBasicMaterial;
        mat.map?.dispose();
        mat.dispose();
      }
    });
    this.sound.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
