import { CONFIG } from './config';
import { Arc, Material, Pin, Rect, Seg, Shape, deg, polar } from './geometry';

/**
 * La « ゲージ » (la jauge) du plateau : où sont les rails, les clous, l'écran et ses pièces. Un kugishi
 * (釘師, le régleur de clous) passe ses matinées à tordre ces clous d'un dixième de millimètre : ici, ils
 * sont posés une fois pour toutes. Toutes les cotes sont en millimètres, origine au centre des rails.
 */

export type SensorKind = 'heso' | 'pocket' | 'attacker' | 'out' | 'warp' | 'right';

export interface Sensor {
  kind: SensorKind;
  rect: Rect;
}

export interface WindmillDef {
  x: number;
  y: number;
  blades: number;
  /** Longueur d'une pale depuis l'axe. */
  length: number;
  /** Moment d'inertie, en masses de bille × mm². */
  inertia: number;
}

export interface Board {
  shapes: Shape[];
  nails: Pin[];
  sensors: Sensor[];
  windmills: WindmillDef[];
  /** Contour du cadre de l'écran (pour le dessin), sens horaire. */
  ornament: [number, number][];
  /** L'écran LCD dans le cadre. */
  lcd: Rect;
  /** Le sol de la scène, de gauche à droite. */
  stage: [number, number][];
  /** Le tube de la ワープ : de la bouche (sur le flanc gauche du cadre) à l'entrée de la scène. */
  warpPath: [number, number][];
  /** Le clapet de l'アタッカー (fermé), du haut vers le bas de la rampe. */
  door: Seg;
  /** La rampe de la voie de droite, avec le clapet au milieu. */
  ramp: [number, number][];
  heso: { x: number; y: number; nails: [Pin, Pin] };
  pockets: { x: number; y: number }[];
}

const M = CONFIG.materials;
const B = CONFIG.board;

const seg = (
  ax: number,
  ay: number,
  bx: number,
  by: number,
  mat: Material = M.plastic,
  r = 0.8,
): Seg => ({ kind: 'seg', ax, ay, bx, by, r, mat });

const pin = (x: number, y: number, r: number = B.nailRadius, mat: Material = M.nail): Pin => ({
  kind: 'pin',
  x,
  y,
  r,
  mat,
});

/** Une ligne de `n` clous de (x0, y0) à (x1, y1). */
function line(x0: number, y0: number, x1: number, y1: number, n: number): Pin[] {
  const out: Pin[] = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1);
    out.push(pin(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t));
  }
  return out;
}

/** Un 道 (une route) : `n` clous de (x0, y0) à (x1, y1), sauf aux indices `gaps` (là, la bille tombe). */
function road(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  n: number,
  gaps: number[],
): Pin[] {
  return line(x0, y0, x1, y1, n).filter((_, i) => !gaps.includes(i));
}

/** Des clous le long d'un arc de cercle centré à l'origine (angles en degrés). */
function arcNails(R: number, from: number, to: number, n: number): Pin[] {
  const out: Pin[] = [];
  for (let i = 0; i < n; i++) {
    const [x, y] = polar(R, from + ((to - from) * i) / Math.max(1, n - 1));
    out.push(pin(x, y));
  }
  return out;
}

/** Un quinconce : des rangées décalées d'un demi-pas, coupées au rayon `clip` et hors du cadre. */
function forest(
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  pitch: number,
  rowStep: number,
  keep: (x: number, y: number) => boolean,
): Pin[] {
  const out: Pin[] = [];
  let row = 0;
  for (let y = y0; y <= y1 + 1e-6; y += rowStep, row++) {
    const shift = row % 2 ? pitch / 2 : 0;
    for (let x = x0 + shift; x <= x1 + 1e-6; x += pitch) if (keep(x, y)) out.push(pin(x, y));
  }
  return out;
}

/** Le cadre de l'écran : dôme en haut, flancs droits, ventre arrondi au-dessus de la ヘソ. */
function ornamentOutline(): [number, number][] {
  const { x: w, top, shoulder, bottom } = B.ornament;
  // Le dôme : arc de cercle qui passe par les deux épaules et le sommet.
  const c = (w * w + shoulder * shoulder - top * top) / (2 * (shoulder - top));
  const R = -top + c;
  const aL = Math.atan2(shoulder - c, -w);
  const aR = Math.atan2(shoulder - c, w);
  const pts: [number, number][] = [];
  const n = 16;
  for (let i = 0; i <= n; i++) {
    const a = aL + ((aR - aL + (aR < aL ? Math.PI * 2 : 0)) * i) / n;
    pts.push([Math.cos(a) * R, c + Math.sin(a) * R]);
  }
  pts.push([w, 40], [90, 60], [60, 71], [22, bottom], [-22, bottom], [-60, 71], [-90, 60], [-w, 40]);
  return pts;
}

export function buildBoard(): Board {
  const shapes: Shape[] = [];
  const nails: Pin[] = [];
  const sensors: Sensor[] = [];
  const addNails = (list: Pin[]) => {
    for (const p of list) {
      nails.push(p);
      shapes.push(p);
    }
  };

  // ── Les rails. L'extérieur fait presque le tour ; l'intérieur borde le couloir de lancement à gauche.
  const outer: Arc = {
    kind: 'arc',
    cx: 0,
    cy: 0,
    R: B.outer,
    a0: deg(B.outerFrom),
    a1: deg(B.outerTo + 360),
    r: 0.6,
    mat: M.rail,
  };
  const inner: Arc = {
    kind: 'arc',
    cx: 0,
    cy: 0,
    R: B.inner,
    a0: deg(B.innerFrom),
    a1: deg(B.tip),
    r: 0.9,
    mat: M.rail,
  };
  shapes.push(outer, inner);

  // Le fond : deux pentes vers l'アウト口, au milieu en bas.
  const innerEnd = polar(B.inner, B.innerFrom);
  const outerEnd = polar(B.outer, B.outerTo);
  shapes.push(seg(innerEnd[0], innerEnd[1], -15, 201), seg(outerEnd[0], outerEnd[1], 15, 201));
  sensors.push({ kind: 'out', rect: { x0: -120, y0: 206, x1: 24, y1: 320 } });

  // ── Le cadre de l'écran (センター役物), avec la bouche de la ワープ sur son flanc gauche.
  const ornament = ornamentOutline();
  const { x: w } = B.ornament;
  const mouth = { top: -38, bottom: -20 };
  for (let i = 0; i < ornament.length; i++) {
    const [ax, ay] = ornament[i];
    const [bx, by] = ornament[(i + 1) % ornament.length];
    if (ax === -w && bx === -w) continue; // le flanc gauche est posé à part, en deux morceaux
    shapes.push(seg(ax, ay, bx, by, M.plastic, 1.2));
  }
  const shoulderL = ornament[0];
  shapes.push(
    seg(-w, shoulderL[1], -w, mouth.top, M.plastic, 1.2),
    seg(-w, mouth.bottom, -w, 40, M.plastic, 1.2),
    // La lèvre sous la bouche : une bille qui longe le flanc roule dedans.
    seg(-w - 16, mouth.bottom - 5, -w, mouth.bottom + 1, M.plastic, 1),
  );
  sensors.push({
    kind: 'warp',
    rect: { x0: -w + 1, y0: mouth.top + 1, x1: -w + 12, y1: mouth.bottom },
  });

  // ── La scène sous l'écran : une cuvette où la bille roule avant de tomber à l'avant.
  const stage: [number, number][] = [];
  for (let i = 0; i <= 12; i++) {
    const x = -88 + (176 * i) / 12;
    stage.push([x, 64 - 12 * (x / 88) ** 2]);
  }
  for (let i = 0; i < stage.length - 1; i++) {
    const s = seg(stage[i][0], stage[i][1], stage[i + 1][0], stage[i + 1][1], M.stage, 1);
    s.stage = true;
    shapes.push(s);
  }
  shapes.push(seg(-90, 30, -90, 54, M.plastic, 1), seg(90, 30, 90, 54, M.plastic, 1));
  const warpPath: [number, number][] = [
    [-w + 6, (mouth.top + mouth.bottom) / 2],
    [-96, -10],
    [-97, 20],
    [-90, 36],
    [-82, 42],
  ];

  // ── Les clous.
  // Le ciel (天釘) : deux arcs en quinconce sous le sommet du rail, que les billes faibles traversent.
  addNails(arcNails(186, 238, 266, 8));
  addNails(arcNails(174, 242, 262, 6));
  // La forêt de gauche, au-dessus des 道釘.
  const clipL = (x: number, y: number) =>
    Math.hypot(x, y) < B.inner - 9 && x < -w - 10 && !(x > -150 && y > -100);
  addNails(forest(-196, -118, -168, -112, 15, 12, clipL));
  // Les 道釘 : une pente de clous serrés qui mène vers le flanc du cadre (et la ワープ), avec un trou.
  addNails(road(-178, -76, -114, -45, 7, [3]));
  // Sous le moulin, quelques clous pour brasser, puis le grand 道 qui ramène les billes vers la ヘソ
  // (ses derniers clous sont les 寄り釘). Deux trous laissent filer vers les poches.
  addNails([pin(-184, 4), pin(-170, 14), pin(-140, 10), pin(-126, 22), pin(-156, 26), pin(-188, 22)]);
  addNails(road(-192, 38, -112, 72, 8, [3]));
  addNails(road(-100.5, 75, -28, 94, 7, [3]));
  addNails(road(104, 82, 28, 94, 7, []));
  // Les ジャンプ釘 : ils renvoient vers le centre ce qui tombe au bout des 寄り.
  addNails([pin(-18, 99), pin(18, 99)]);
  // Les 命釘, de part et d'autre de la ヘソ.
  const { heso } = B;
  const lifeL = pin(heso.x - heso.gap / 2, heso.y - 7);
  const lifeR = pin(heso.x + heso.gap / 2, heso.y - 7);
  addNails([lifeL, lifeR]);
  // Le bas du plateau : la ハカマ des poches et quelques clous de sortie.
  addNails([pin(-162, 96), pin(-138, 96), pin(-71, 124), pin(-49, 124)]);
  addNails(forest(-70, 70, 128, 172, 16, 13, (x, y) => Math.hypot(x, y) < B.outer - 18 && Math.abs(x) > 14 && !(x > 40 && y > 140)));
  // La voie de droite : des clous effleurent le rail pour décrocher les billes vers la rampe.
  addNails([pin(...polar(201.5, 322)), pin(...polar(201, 346)), pin(...polar(200.5, 8))]);
  addNails(line(126, -40, 150, -12, 3));
  addNails(line(124, 16, 140, 44, 2));

  // ── La ヘソ : un gobelet entre les deux 命釘, avec des oreilles qui renvoient sur les côtés.
  const hw = heso.gap / 2 - 0.4;
  shapes.push(
    seg(heso.x - hw, heso.y - 3, heso.x - hw, heso.y + 10, M.plastic, 0.9),
    seg(heso.x + hw, heso.y - 3, heso.x + hw, heso.y + 10, M.plastic, 0.9),
    seg(heso.x - hw, heso.y - 3, heso.x - hw - 9, heso.y + 2, M.plastic, 0.9),
    seg(heso.x + hw, heso.y - 3, heso.x + hw + 9, heso.y + 2, M.plastic, 0.9),
  );
  sensors.push({
    kind: 'heso',
    rect: { x0: heso.x - hw + 1, y0: heso.y + 1, x1: heso.x + hw - 1, y1: heso.y + 14 },
  });

  // ── Les poches ordinaires (一般入賞口) : 10 billes chacune.
  const pockets = [
    { x: -150, y: 104 },
    { x: -60, y: 132 },
  ];
  for (const p of pockets) {
    shapes.push(
      seg(p.x - 7, p.y - 4, p.x - 7, p.y + 8, M.plastic, 0.9),
      seg(p.x + 7, p.y - 4, p.x + 7, p.y + 8, M.plastic, 0.9),
    );
    sensors.push({ kind: 'pocket', rect: { x0: p.x - 6, y0: p.y, x1: p.x + 6, y1: p.y + 12 } });
  }

  // ── La voie de droite : une rampe le long de laquelle les billes roulent, avec l'アタッカー au milieu.
  const rampTop = polar(B.outer - 1, 30);
  const doorA: [number, number] = [142, 126];
  const doorB: [number, number] = [98, 147];
  const rampEnd: [number, number] = [72, 159];
  shapes.push(seg(rampTop[0], rampTop[1], doorA[0], doorA[1], M.plastic, 1));
  const door = seg(doorA[0], doorA[1], doorB[0], doorB[1], M.plastic, 1);
  door.door = true;
  shapes.push(door, seg(doorB[0], doorB[1], rampEnd[0], rampEnd[1], M.plastic, 1));
  // La boîte sous le clapet.
  shapes.push(
    seg(doorB[0], doorB[1], doorB[0], 172, M.plastic, 1),
    seg(doorA[0], doorA[1], doorA[0] + 4, 172, M.plastic, 1),
    seg(doorB[0], 172, doorA[0] + 4, 172, M.plastic, 1),
  );
  sensors.push({ kind: 'attacker', rect: { x0: doorB[0] + 2, y0: 152, x1: doorA[0], y1: 171 } });
  // Le portillon de la voie de droite : sert à repérer qu'on « tire à droite ».
  sensors.push({ kind: 'right', rect: { x0: 120, y0: -175, x1: 200, y1: -95 } });

  return {
    shapes,
    nails,
    sensors,
    windmills: [{ x: -160, y: -12, blades: 4, length: 8.5, inertia: 18 }],
    ornament,
    lcd: { x0: -86, y0: -86, x1: 86, y1: 30 },
    stage,
    warpPath,
    door,
    ramp: [rampTop, doorA, doorB, rampEnd],
    heso: { x: heso.x, y: heso.y, nails: [lifeL, lifeR] },
    pockets,
  };
}
