/**
 * La piste jouet vue du dessus, dessinée dans le repère du circuit : la route (deux voies, chacune avec
 * sa fente et ses deux rails argentés), les glissières jaunes et les vibreurs des boucles, la ligne de
 * départ, le bornier où se branchent les manettes, le pont au croisement et le portique START.
 */
import { circle, dropShadow, noShadow, pixelScale, roundRect } from './paint';
import { Box, Bridge, Loop, Point, Track, elevation, grow, rotate } from './track';

/** Largeur de la route, et écart entre le milieu de la route et la fente de chaque voie. */
export const ROAD_WIDTH = 70;
export const LANE_OFFSET = 17.5;
/** Ce qui dépasse de la route de chaque côté : glissières et piquets. */
export const ROAD_MARGIN = 16;

/** Bande de sol réservée au décor tout autour du circuit. */
export const SCENERY_MARGIN = 24;

/** Le circuit est posé de travers, comme jeté sur le sol : une rotation de quelques degrés. */
export const TILT = (4 * Math.PI) / 180;

/**
 * Ce qui doit tenir à l'écran : le circuit tourné de `TILT`, ses glissières et le décor qui l'entoure.
 * Boîte dans le repère tourné (celle que `fitBox` centre).
 */
export function circuitBounds(track: Track): Box {
  const box: Box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const point of track.points) {
    const p = rotate(point, TILT);
    box.minX = Math.min(box.minX, p.x);
    box.minY = Math.min(box.minY, p.y);
    box.maxX = Math.max(box.maxX, p.x);
    box.maxY = Math.max(box.maxY, p.y);
  }
  return grow(box, ROAD_WIDTH / 2 + ROAD_MARGIN + SCENERY_MARGIN);
}

/** Le bornier, posé dans le creux sous le croisement, et ses deux prises (joueur 1 à gauche). */
export const POWER_BASE: Point = { x: 0, y: 124 };
const BASE_WIDTH = 66;
const BASE_HEIGHT = 34;
export const JACKS: readonly [Point, Point] = [
  { x: POWER_BASE.x - 15, y: POWER_BASE.y + BASE_HEIGHT / 2 - 4 },
  { x: POWER_BASE.x + 15, y: POWER_BASE.y + BASE_HEIGHT / 2 - 4 },
];
/** Voyant de chaque joueur sur le bornier (allumé quand sa manette est enfoncée). */
export const LEDS: readonly [Point, Point] = [
  { x: POWER_BASE.x - 15, y: POWER_BASE.y - 6 },
  { x: POWER_BASE.x + 15, y: POWER_BASE.y - 6 },
];

const ASPHALT = '#2f3036';
const PAINT = 'rgba(255, 255, 255, 0.9)';
const RAIL = '#c3c9d2';
const SLOT = '#0b0b0e';
const BARRIER = '#f5c211';
/** Longueur d'un morceau de piste (entre deux jointures). */
const PIECE = 87;

function polyline(ctx: CanvasRenderingContext2D, points: readonly Point[], close = false): void {
  ctx.beginPath();
  points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  if (close) ctx.closePath();
}

/**
 * La route entre deux distances (tout le tour si `closed`). Le pont réutilise cette fonction pour son
 * tablier : même dessin, donc aucun raccord visible au pied des rampes.
 */
export function drawRoad(
  ctx: CanvasRenderingContext2D,
  track: Track,
  from: number,
  to: number,
  closed: boolean,
): void {
  const lane = (offset: number) => track.lane(offset, from, to, 3);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'butt';

  polyline(ctx, lane(0), closed);
  ctx.lineWidth = ROAD_WIDTH;
  ctx.strokeStyle = ASPHALT;
  ctx.stroke();

  // Lignes de bord, et pointillés entre les deux voies (calés sur la distance, pour se raccorder au pont).
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = PAINT;
  for (const side of [-1, 1]) {
    polyline(ctx, lane(side * (ROAD_WIDTH / 2 - 4)), closed);
    ctx.stroke();
  }
  ctx.setLineDash([14, 12]);
  ctx.lineDashOffset = from;
  polyline(ctx, lane(0), closed);
  ctx.stroke();
  ctx.setLineDash([]);

  // Chaque voie : la fente où s'accroche la voiture, entre deux bandes de cuivre (ici argentées).
  for (const side of [-1, 1]) {
    for (const rail of [-4.5, 4.5]) {
      polyline(ctx, lane(side * LANE_OFFSET + rail), closed);
      ctx.lineWidth = 1.8;
      ctx.strokeStyle = RAIL;
      ctx.stroke();
    }
    polyline(ctx, lane(side * LANE_OFFSET), closed);
    ctx.lineWidth = 3;
    ctx.strokeStyle = SLOT;
    ctx.stroke();
  }

  // Jointures entre les morceaux de piste.
  const start = Math.ceil(from / PIECE) * PIECE;
  for (let d = start; d < to; d += PIECE) {
    const a = track.offsetAt(d, -ROAD_WIDTH / 2);
    const b = track.offsetAt(d, ROAD_WIDTH / 2);
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
}

/** Tout ce qui est au niveau du sol : route, vibreurs, glissières, ligne de départ, bornier. */
export function drawGround(
  ctx: CanvasRenderingContext2D,
  track: Track,
  loops: readonly Loop[],
): void {
  // La piste est un peu épaisse : une ombre courte sous la route.
  dropShadow(ctx, 2.5, 0.35);
  polyline(ctx, track.lane(0, 0, track.length, 3), true);
  ctx.lineWidth = ROAD_WIDTH;
  ctx.strokeStyle = ASPHALT;
  ctx.stroke();
  noShadow(ctx);

  drawRoad(ctx, track, 0, track.length, true);
  loops.forEach((loop, i) => {
    // Le côté extérieur de chaque boucle regarde vers l'extérieur du huit.
    const outward = i === 0 ? Math.PI : 0;
    drawCurb(ctx, loop, outward);
    drawBarrier(ctx, loop, outward);
  });
  drawStartLine(ctx, track);
  drawPowerBase(ctx);
}

/** Vibreurs rouge et blanc à la corde du virage, à l'intérieur de la boucle. */
function drawCurb(ctx: CanvasRenderingContext2D, loop: Loop, outward: number): void {
  const r = loop.radius - ROAD_WIDTH / 2 - 3.5;
  const span = 0.95;
  ctx.lineWidth = 7;
  ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.arc(loop.center.x, loop.center.y, r, outward - span, outward + span);
  ctx.strokeStyle = '#f8f9fa';
  ctx.stroke();
  ctx.setLineDash([9, 9]);
  ctx.strokeStyle = '#e03131';
  ctx.stroke();
  ctx.setLineDash([]);
}

/** Glissière jaune sur piquets, le long de l'extérieur de la boucle. */
function drawBarrier(ctx: CanvasRenderingContext2D, loop: Loop, outward: number): void {
  const r = loop.radius + ROAD_WIDTH / 2 + 8;
  const span = 1.95;
  const { x, y } = loop.center;
  ctx.fillStyle = '#5c5f66';
  for (let a = outward - span; a <= outward + span + 1e-6; a += 28 / r) {
    const px = x + Math.cos(a) * (r + 3);
    const py = y + Math.sin(a) * (r + 3);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(a);
    dropShadow(ctx, 3);
    ctx.fillRect(-2.5, -2.5, 5, 5);
    ctx.restore();
  }
  noShadow(ctx);
  ctx.lineCap = 'round';
  dropShadow(ctx, 4, 0.3);
  ctx.beginPath();
  ctx.arc(x, y, r, outward - span, outward + span);
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#c99700';
  ctx.stroke();
  noShadow(ctx);
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = BARRIER;
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.beginPath();
  ctx.arc(x, y, r - 0.8, outward - span, outward + span);
  ctx.stroke();
}

/** Damier en travers de la route, sur la ligne de départ (distance 0). */
function drawStartLine(ctx: CanvasRenderingContext2D, track: Track): void {
  const pose = track.poseAt(0);
  ctx.save();
  ctx.translate(pose.x, pose.y);
  ctx.rotate(pose.angle);
  const rows = 10;
  const cell = (ROAD_WIDTH - 8) / rows;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < 2; col++) {
      ctx.fillStyle = (row + col) % 2 ? '#f8f9fa' : '#141417';
      ctx.fillRect(-cell + col * cell, -ROAD_WIDTH / 2 + 4 + row * cell, cell, cell);
    }
  }
  ctx.restore();
}

/** Le bornier : un boîtier noir avec une prise et un voyant par joueur. */
function drawPowerBase(ctx: CanvasRenderingContext2D): void {
  const { x, y } = POWER_BASE;
  dropShadow(ctx, 6);
  ctx.fillStyle = '#26262c';
  roundRect(ctx, x - BASE_WIDTH / 2, y - BASE_HEIGHT / 2, BASE_WIDTH, BASE_HEIGHT, 5);
  ctx.fill();
  noShadow(ctx);
  ctx.fillStyle = '#34343c';
  roundRect(
    ctx,
    x - BASE_WIDTH / 2 + 3,
    y - BASE_HEIGHT / 2 + 3,
    BASE_WIDTH - 6,
    BASE_HEIGHT - 12,
    3,
  );
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.font = '700 6px Lato, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('POWER', x, y - 5.5);
  for (const jack of JACKS) {
    ctx.fillStyle = '#101013';
    circle(ctx, jack.x, jack.y, 4.2);
    ctx.fill();
    ctx.strokeStyle = '#8a8f98';
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
}

/** Les voyants du bornier, redessinés à chaque image : allumés quand la manette est enfoncée. */
export function drawLeds(
  ctx: CanvasRenderingContext2D,
  colors: readonly [string, string],
  lit: readonly [boolean, boolean],
): void {
  LEDS.forEach((led, i) => {
    ctx.fillStyle = colors[i];
    ctx.globalAlpha = lit[i] ? 1 : 0.35;
    ctx.shadowColor = colors[i];
    ctx.shadowBlur = lit[i] ? 8 * pixelScale(ctx) : 0;
    circle(ctx, led.x, led.y, 2.6);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
  noShadow(ctx);
}

/** Portée du pont : du pied d'une rampe au pied de l'autre. */
export function bridgeSpan(bridge: Bridge): [number, number] {
  const half = bridge.flat + bridge.ramp;
  return [bridge.center - half, bridge.center + half];
}

/**
 * Une voiture passe au-dessus du tablier un peu avant d'arriver à sa rampe et un peu après l'avoir quittée :
 * son nez ou sa queue, qui dépassent du point où elle est repérée, ne sont ainsi jamais recouverts par le
 * tablier (il a la même couleur que la route : la voiture semblerait en être coupée).
 */
export const BRIDGE_MARGIN = 30;

/** Vrai quand la voiture à la distance `distance` (tours compris) se dessine par-dessus le pont. */
export function isOnBridge(bridge: Bridge, length: number, distance: number): boolean {
  const [from, to] = bridgeSpan(bridge);
  const lap = ((distance % length) + length) % length;
  return lap >= from - BRIDGE_MARGIN && lap <= to + BRIDGE_MARGIN;
}

/**
 * Tout ce qui passe au-dessus des voitures roulant au sol : le pont (son ombre, son tablier et ses
 * garde-corps à treillis) et le portique de départ.
 */
export function drawOverhead(ctx: CanvasRenderingContext2D, track: Track, bridge: Bridge): void {
  const [from, to] = bridgeSpan(bridge);
  const height = (d: number) => elevation(bridge, track.length, d);

  // Ombre du tablier : elle s'éloigne de la route à mesure que le pont monte.
  const shadow = 30;
  const left: Point[] = [];
  const right: Point[] = [];
  for (let d = from; d <= to; d += 3) {
    const h = height(d);
    const dx = h * shadow * 0.55;
    const dy = h * shadow * 0.8;
    const a = track.offsetAt(d, -ROAD_WIDTH / 2 - 4);
    const b = track.offsetAt(d, ROAD_WIDTH / 2 + 4);
    left.push({ x: a.x + dx, y: a.y + dy });
    right.push({ x: b.x + dx, y: b.y + dy });
  }
  ctx.save();
  ctx.filter = `blur(${3 * pixelScale(ctx)}px)`;
  ctx.fillStyle = 'rgba(60, 42, 20, 0.38)';
  polyline(ctx, [...left, ...right.reverse()], true);
  ctx.fill();
  ctx.restore();

  drawRoad(ctx, track, from, to, false);

  // Garde-corps à treillis le long du tablier, là où le pont est assez haut.
  const railFrom = bridge.center - bridge.flat - bridge.ramp * 0.55;
  const railTo = bridge.center + bridge.flat + bridge.ramp * 0.55;
  for (const side of [-1, 1]) {
    // Une poutre grise de chaque côté du tablier, avec ses deux longerons clairs et le zigzag entre eux.
    const inner = side * (ROAD_WIDTH / 2 + 0.5);
    const outer = side * (ROAD_WIDTH / 2 + 7.5);
    dropShadow(ctx, 6, 0.35);
    polyline(ctx, track.lane(side * (ROAD_WIDTH / 2 + 4), railFrom, railTo, 3));
    ctx.lineCap = 'butt';
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#8c96a3';
    ctx.stroke();
    noShadow(ctx);
    ctx.strokeStyle = '#59626e';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let d = railFrom, k = 0; d <= railTo; d += 6, k++) {
      const p = track.offsetAt(d, k % 2 ? outer : inner);
      if (k) ctx.lineTo(p.x, p.y);
      else ctx.moveTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.strokeStyle = '#e4e9ef';
    ctx.lineWidth = 1.6;
    for (const offset of [inner, outer]) {
      polyline(ctx, track.lane(offset, railFrom, railTo, 3));
      ctx.stroke();
    }
    // Un pilier à chaque bout de la poutre.
    for (const d of [railFrom, railTo]) {
      const p = track.offsetAt(d, side * (ROAD_WIDTH / 2 + 4));
      dropShadow(ctx, 8, 0.3);
      ctx.fillStyle = '#6c7581';
      ctx.fillRect(p.x - 5, p.y - 5, 10, 10);
      noShadow(ctx);
    }
  }

  drawGantry(ctx, track);
}

/** Portique START au-dessus de la ligne de départ : deux poteaux et une banderole en travers. */
function drawGantry(ctx: CanvasRenderingContext2D, track: Track): void {
  const pose = track.poseAt(-6);
  const span = ROAD_WIDTH / 2 + 10;
  ctx.save();
  ctx.translate(pose.x, pose.y);
  // La banderole est perpendiculaire à la route ; on choisit le sens où le texte se lit à l'endroit.
  let angle = pose.angle + Math.PI / 2;
  if (Math.cos(angle) < 0) angle += Math.PI;
  ctx.rotate(angle);

  for (const x of [-span, span]) {
    dropShadow(ctx, 14, 0.25);
    ctx.fillStyle = '#3b3d45';
    ctx.fillRect(x - 3.5, -3.5, 7, 7);
  }
  dropShadow(ctx, 16, 0.25);
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, -span - 2, -7, 2 * span + 4, 14, 2);
  ctx.fill();
  noShadow(ctx);
  ctx.strokeStyle = '#e03131';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  // Damier aux deux bouts.
  const cell = 3.5;
  for (const x0 of [-span - 1, span - 6]) {
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 4; j++) {
        ctx.fillStyle = (i + j) % 2 ? '#ffffff' : '#141417';
        ctx.fillRect(x0 + i * cell, -7 + j * cell, cell, cell);
      }
    }
  }
  ctx.fillStyle = '#e03131';
  ctx.font = '800 9px "Bricolage Grotesque", Lato, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('START', 0, 0.5);
  ctx.restore();
}
