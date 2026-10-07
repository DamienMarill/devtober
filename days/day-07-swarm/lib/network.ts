import { CONFIG, StationKind } from './config';
import { LINES, STATIONS } from './network-data';

/** Une station telle que l'écrit `tools/gtfs.mjs`. */
export interface StationData {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

/** Un parcours complet d'une ligne dans le sens 0 du GTFS (deux pour les branches de la 3). */
export interface RouteData {
  stations: readonly string[];
  /** Minutes entre deux stations successives (une de plus pour une boucle : la dernière revient à la première). */
  minutes: readonly number[];
}

export interface LineData {
  id: number;
  name: string;
  color: string;
  text: string;
  loop: boolean;
  routes: readonly RouteData[];
  /** Rames en ligne à hh:30, de 0 h à 23 h. */
  fleet: readonly number[];
  /** Courses de la journée. */
  trips: number;
}

export interface Station {
  index: number;
  id: string;
  name: string;
  short: string;
  kind: StationKind;
  /** Coordonnées réelles (pour les distances à pied : x et y sont déformés par la loupe). */
  lat: number;
  lon: number;
  /** Position sur la carte, en km « loupés » autour de la Comédie (y vers le bas). */
  x: number;
  y: number;
  /** Lignes qui la desservent (numéros). */
  lines: number[];
  terminus: boolean;
}

/**
 * Un sens de circulation d'une ligne : la liste des stations dans l'ordre où la rame les dessert. Les parcours de
 * base viennent du GTFS ; le plan d'exploitation (`plan.ts`) en dérive d'autres (tronçons, déviation), tous
 * identifiés par leur `key` et partagés (un même parcours = un même objet pendant toute la partie).
 */
export interface Path {
  key: string;
  line: number;
  stations: number[];
  /** `minutes[k]` : de `stations[k]` à `stations[k + 1]` (boucle : la dernière revient à la première). */
  minutes: number[];
  loop: boolean;
  /** Sens : 1 = sens du GTFS, -1 = retour. */
  dir: 1 | -1;
  /** Groupe de régulation : le tronçon exploité (les deux sens), ou un sens de la boucle. */
  group: string;
  /** Extrémités créées par une coupure (terminus provisoires), dans le sens de marche : [départ, arrivée]. */
  provisional: readonly [boolean, boolean];
  /** Déviation empruntée (`deviations.ts`), ou null. */
  deviation: string | null;
  /** Parcours d'une seule rame (déviation à la demande, repli) : hors du service régulier. */
  oneOff: boolean;
  /** Rang de chaque station dans ce parcours, -1 si absente. */
  rank: Int16Array;
  /** Décalage latéral de la ligne à chaque station (vecteur à multiplier par l'écart en pixels). */
  offsets: Float32Array;
}

export interface Line {
  id: number;
  name: string;
  color: string;
  display: string;
  text: string;
  loop: boolean;
  capacity: number;
  /** Parcours de base : aller puis retour de chaque branche (`paths[2b]`, `paths[2b + 1]`), ou les deux sens de la boucle. */
  paths: Path[];
  branches: number;
  /** Stations de chaque branche dans le sens du GTFS (la boucle : dans le sens 1, sans répéter la première). */
  base: number[][];
  fleet: readonly number[];
  trips: number;
  /** Stations desservies, sans doublon. */
  stations: number[];
}

export interface Network {
  stations: Station[];
  lines: Line[];
  byId: Map<string, number>;
  /** Tronçons (non orientés) et les lignes qui les empruntent. */
  segments: Map<string, number[]>;
  /** Minutes de parcours de chaque tronçon (non orienté). */
  hops: Map<string, number>;
  /** Stations voisines à pied (distance réelle sous `CONFIG.walk.max`), avec la distance en mètres. */
  walk: { to: number; metres: number }[][];
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
}

/** Ce qu'il faut pour fabriquer un parcours : stations, temps des tronçons et lignes de chaque tronçon. */
export type PathContext = Pick<Network, 'stations' | 'hops' | 'segments'>;

export interface PathMeta {
  group?: string;
  provisional?: readonly [boolean, boolean];
  deviation?: string | null;
  oneOff?: boolean;
  /** Ligne dont on emprunte la voie (décalage d'affichage) sur les tronçons que la ligne n'utilise pas. */
  borrow?: number;
  /** Tronçons parcourus plus lentement (déviation : aiguillages, voie d'une autre ligne) et le facteur. */
  slow?: { edges: ReadonlySet<string>; factor: number };
}

export const pathKey = (
  line: number,
  dir: 1 | -1,
  loop: boolean,
  stations: readonly number[],
  oneOff = false,
) => `${line}|${dir}|${loop ? 'L' : 'S'}|${stations.join('.')}${oneOff ? '|1' : ''}`;

/** Fabrique un parcours (temps, rangs, décalages) à partir d'une suite de stations reliées par de vrais tronçons. */
export function createPath(
  ctx: PathContext,
  line: number,
  stations: readonly number[],
  dir: 1 | -1,
  loop: boolean,
  meta: PathMeta = {},
): Path {
  const ids = [...stations];
  const count = loop ? ids.length : ids.length - 1;
  const minutes: number[] = [];
  for (let k = 0; k < count; k++) {
    const key = segmentKey(ids[k], ids[(k + 1) % ids.length]);
    const m = ctx.hops.get(key);
    if (m === undefined)
      throw new Error(`Pas de voie entre ${ids[k]} et ${ids[(k + 1) % ids.length]}`);
    minutes.push(meta.slow?.edges.has(key) ? m * meta.slow.factor : m);
  }
  const rank = new Int16Array(ctx.stations.length).fill(-1);
  ids.forEach((s, k) => (rank[s] = k));
  const key = pathKey(line, dir, loop, ids, meta.oneOff);
  const path: Path = {
    key,
    line,
    stations: ids,
    minutes,
    loop,
    dir,
    group: meta.group ?? key,
    provisional: meta.provisional ?? [false, false],
    deviation: meta.deviation ?? null,
    oneOff: meta.oneOff ?? false,
    rank,
    offsets: new Float32Array(ids.length * 2),
  };
  computeOffsets(path, ctx.stations, ctx.segments, meta.borrow);
  return path;
}

/** Distance réelle entre deux stations, en mètres (projection équirectangulaire, largement assez à cette échelle). */
export function metres(a: Station, b: Station): number {
  const kx = 111_320 * Math.cos((CONFIG.map.lens.lat * Math.PI) / 180);
  return Math.hypot((a.lon - b.lon) * kx, (a.lat - b.lat) * 110_570);
}

export const segmentKey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);

/** Lat/lon → km autour du centre de la loupe, puis la loupe : r' = r0 · asinh(r / r0). */
export function project(
  lat: number,
  lon: number,
  lens = CONFIG.map.lens,
): { x: number; y: number } {
  const kx = 111.32 * Math.cos((lens.lat * Math.PI) / 180);
  const x = (lon - lens.lon) * kx;
  const y = -(lat - lens.lat) * 110.57;
  const r = Math.hypot(x, y);
  if (r < 1e-9) return { x: 0, y: 0 };
  const k = (lens.r0 * Math.asinh(r / lens.r0)) / r;
  return { x: x * k, y: y * k };
}

/** Le nom court d'une étiquette. */
export function shortName(id: string, name: string): string {
  return CONFIG.map.short[id] ?? name.split(/ - | \(/)[0];
}

export function buildNetwork(
  stationData: readonly StationData[] = STATIONS,
  lineData: readonly LineData[] = LINES,
): Network {
  const byId = new Map(stationData.map((s, i) => [s.id, i]));
  const stations: Station[] = stationData.map((s, index) => ({
    index,
    id: s.id,
    name: s.name,
    short: shortName(s.id, s.name),
    kind: CONFIG.kinds[s.id] ?? 'home',
    lat: s.lat,
    lon: s.lon,
    ...project(s.lat, s.lon),
    lines: [],
    terminus: false,
  }));

  // Temps de parcours non orientés, pour construire les sens retour.
  const hops = new Map<string, number>();
  for (const line of lineData) {
    for (const route of line.routes) {
      const ids = route.stations.map((id) => byId.get(id)!);
      route.minutes.forEach((m, k) => hops.set(segmentKey(ids[k], ids[(k + 1) % ids.length]), m));
    }
  }
  // Tronçons partagés : chaque ligne y est décalée sur le côté, comme sur un plan de métro.
  const segments = new Map<string, number[]>();
  const bases = lineData.map((data) =>
    data.routes.map((r) => r.stations.map((id) => byId.get(id)!)),
  );
  lineData.forEach((data, li) => {
    for (const ids of bases[li]) {
      const n = data.loop ? ids.length : ids.length - 1;
      for (let k = 0; k < n; k++) {
        const key = segmentKey(ids[k], ids[(k + 1) % ids.length]);
        const users = segments.get(key) ?? [];
        if (!users.includes(data.id)) users.push(data.id);
        segments.set(
          key,
          users.sort((a, b) => a - b),
        );
      }
    }
  });
  const ctx: PathContext = { stations, hops, segments };

  const lines: Line[] = lineData.map((data, li) => {
    const paths: Path[] = [];
    bases[li].forEach((forward) => {
      // Retour : à l'envers ; pour une boucle, on repart de la même station dans l'autre sens.
      const backward = data.loop
        ? [forward[0], ...forward.slice(1).reverse()]
        : [...forward].reverse();
      // Groupe de régulation : le tronçon (les deux sens d'une branche), ou chaque sens de la boucle.
      const group = data.loop ? undefined : sectionKey(data.id, forward);
      paths.push(createPath(ctx, data.id, forward, 1, data.loop, { group }));
      paths.push(createPath(ctx, data.id, backward, -1, data.loop, { group }));
    });
    const unique = [...new Set(paths.flatMap((p) => p.stations))];
    for (const s of unique) stations[s].lines.push(data.id);
    if (!data.loop) {
      for (const p of paths) stations[p.stations[0]].terminus = true;
    } else {
      stations[paths[0].stations[0]].terminus = true;
    }
    return {
      id: data.id,
      name: data.name,
      color: data.color,
      display: CONFIG.map.display[data.id] ?? data.color,
      text: data.text,
      loop: data.loop,
      capacity: CONFIG.tram.capacity[data.id] ?? CONFIG.tram.defaultCapacity,
      paths,
      branches: data.routes.length,
      base: bases[li],
      fleet: data.fleet,
      trips: data.trips,
      stations: unique,
    };
  });

  // À pied : les stations à moins de `CONFIG.walk.max` mètres les unes des autres.
  const walk = stations.map((a) =>
    stations
      .filter((b) => b !== a)
      .map((b) => ({ to: b.index, metres: metres(a, b) }))
      .filter((w) => w.metres <= CONFIG.walk.max)
      .sort((x, y) => x.metres - y.metres),
  );

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const s of stations) {
    minX = Math.min(minX, s.x);
    maxX = Math.max(maxX, s.x);
    minY = Math.min(minY, s.y);
    maxY = Math.max(maxY, s.y);
  }
  return { stations, lines, byId, segments, hops, walk, bounds: { minX, maxX, minY, maxY } };
}

/**
 * La normale d'un tronçon, orientée de façon stable (vers la gauche d'un tronçon parcouru d'ouest en est) : deux
 * lignes qui partagent plusieurs tronçons restent chacune de leur côté.
 */
export function segmentNormal(a: Station, b: Station): { x: number; y: number } {
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  if (dx < 0 || (dx === 0 && dy < 0)) {
    dx = -dx;
    dy = -dy;
  }
  const len = Math.hypot(dx, dy) || 1;
  return { x: dy / len, y: -dx / len };
}

/** La clé d'un tronçon exploité : la ligne et ses stations dans le sens du GTFS. */
export const sectionKey = (line: number, stations: readonly number[]) =>
  `${line}|S|${stations.join('.')}`;

/**
 * Décalage de chaque station d'un parcours : moyenne des décalages des deux tronçons qui l'encadrent. Sur un tronçon
 * que la ligne n'utilise pas d'habitude (déviation), on prend la voie de la ligne `borrow`.
 */
export function computeOffsets(
  path: Path,
  stations: readonly Station[],
  segments: ReadonlyMap<string, number[]>,
  borrow?: number,
): void {
  const ids = path.stations;
  const n = ids.length;
  const shift = (k: number) => {
    const a = stations[ids[k]];
    const b = stations[ids[(k + 1) % n]];
    const users = segments.get(segmentKey(a.index, b.index)) ?? [];
    let lane = users.indexOf(path.line);
    if (lane < 0 && borrow !== undefined) lane = users.indexOf(borrow);
    if (lane < 0) lane = 0;
    const slot = users.length ? lane - (users.length - 1) / 2 : 0;
    const nrm = segmentNormal(a, b);
    return { x: nrm.x * slot, y: nrm.y * slot };
  };
  const segs = path.loop ? n : n - 1;
  for (let k = 0; k < n; k++) {
    const before = path.loop || k > 0 ? shift((k - 1 + n) % n) : null;
    const after = k < segs ? shift(k) : null;
    const parts = [before, after].filter((v): v is { x: number; y: number } => v !== null);
    path.offsets[k * 2] = parts.reduce((s, v) => s + v.x, 0) / parts.length;
    path.offsets[k * 2 + 1] = parts.reduce((s, v) => s + v.y, 0) / parts.length;
  }
}

/** Durée d'un tour complet (aller, retour et battements) : de quoi répartir les rames au départ. */
export function cycleMinutes(line: Line, branch = 0): number {
  const go = line.paths[branch * 2].minutes.reduce((s, m) => s + m, 0);
  if (line.loop) return go + CONFIG.tram.loopStop;
  const back = line.paths[branch * 2 + 1].minutes.reduce((s, m) => s + m, 0);
  return go + back + 2 * CONFIG.tram.layover;
}

/** Les rames que la TaM fait rouler sur une ligne à une minute de la journée (horaires réels). */
export function realFleet(line: Line, minute: number): number {
  return line.fleet[Math.floor(minute / 60) % 24];
}
