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
  /** Position sur la carte, en km « loupés » autour de la Comédie (y vers le bas). */
  x: number;
  y: number;
  /** Lignes qui la desservent (numéros). */
  lines: number[];
  terminus: boolean;
}

/** Un sens de circulation d'une ligne : la liste des stations dans l'ordre où la rame les dessert. */
export interface Path {
  line: number;
  /** Indice dans `line.paths`. */
  index: number;
  stations: number[];
  /** `minutes[k]` : de `stations[k]` à `stations[k + 1]` (boucle : la dernière revient à la première). */
  minutes: number[];
  loop: boolean;
  /** Sens : 1 = sens du GTFS, -1 = retour. */
  dir: 1 | -1;
  /** Branche (ligne 3 : 0 et 1 ; 0 ailleurs). */
  branch: number;
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
  /** Aller puis retour de chaque branche (`paths[2b]`, `paths[2b + 1]`), ou les deux sens de la boucle. */
  paths: Path[];
  branches: number;
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
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
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
  const timesOf = (ids: number[], loop: boolean) =>
    ids
      .slice(0, loop ? undefined : -1)
      .map((a, k) => hops.get(segmentKey(a, ids[(k + 1) % ids.length]))!);

  const lines: Line[] = lineData.map((data) => {
    const paths: Path[] = [];
    data.routes.forEach((route, branch) => {
      const forward = route.stations.map((id) => byId.get(id)!);
      // Retour : à l'envers ; pour une boucle, on repart de la même station dans l'autre sens.
      const backward = data.loop
        ? [forward[0], ...forward.slice(1).reverse()]
        : [...forward].reverse();
      for (const [ids, dir] of [
        [forward, 1],
        [backward, -1],
      ] as const) {
        const rank = new Int16Array(stationData.length).fill(-1);
        ids.forEach((s, k) => (rank[s] = k));
        paths.push({
          line: data.id,
          index: paths.length,
          stations: ids,
          minutes: timesOf(ids, data.loop),
          loop: data.loop,
          dir,
          branch,
          rank,
          offsets: new Float32Array(ids.length * 2),
        });
      }
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
      fleet: data.fleet,
      trips: data.trips,
      stations: unique,
    };
  });

  // Tronçons partagés : chaque ligne y est décalée sur le côté, comme sur un plan de métro.
  const segments = new Map<string, number[]>();
  for (const line of lines) {
    for (const path of line.paths) {
      const n = path.loop ? path.stations.length : path.stations.length - 1;
      for (let k = 0; k < n; k++) {
        const key = segmentKey(path.stations[k], path.stations[(k + 1) % path.stations.length]);
        const users = segments.get(key) ?? [];
        if (!users.includes(line.id)) users.push(line.id);
        segments.set(
          key,
          users.sort((a, b) => a - b),
        );
      }
    }
  }
  for (const line of lines) {
    for (const path of line.paths) computeOffsets(path, stations, segments);
  }

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
  return { stations, lines, byId, segments, bounds: { minX, maxX, minY, maxY } };
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

/** Décalage de chaque station d'un parcours : moyenne des décalages des deux tronçons qui l'encadrent. */
function computeOffsets(path: Path, stations: Station[], segments: Map<string, number[]>): void {
  const ids = path.stations;
  const n = ids.length;
  const shift = (k: number) => {
    const a = stations[ids[k]];
    const b = stations[ids[(k + 1) % n]];
    const users = segments.get(segmentKey(a.index, b.index))!;
    const slot = users.indexOf(path.line) - (users.length - 1) / 2;
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
