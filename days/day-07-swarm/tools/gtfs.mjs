// Extrait du GTFS de la TaM ce dont le jour 7 a besoin : les stations des 5 lignes de tram, l'ordre des
// stations de chaque parcours, les temps de parcours entre stations et le nombre de rames en ligne heure par
// heure, un jour de semaine. Écrit `lib/network-data.ts` (à ne pas modifier à la main).
//
// Usage : curl -o /tmp/tam.zip https://gtfsproxy.e-tam.fr/COMMON/GTFS.zip
//         unzip /tmp/tam.zip -d /tmp/tam
//         node days/day-07-swarm/tools/gtfs.mjs /tmp/tam [AAAAMMJJ]   (par défaut le mercredi 7 octobre 2026)
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = process.argv[2];
const date = process.argv[3] ?? '20261007';
if (!dir) {
  console.error('Usage : node days/day-07-swarm/tools/gtfs.mjs <dossier GTFS dézippé> [AAAAMMJJ]');
  process.exit(1);
}

/**
 * Quais d'une même station sous des noms différents selon la ligne ou le sens (moins de 150 m d'écart) :
 * on les fusionne pour que les correspondances existent. Et une coquille du GTFS (« Grés »).
 */
const ALIASES = {
  'Grés de Montpellier': 'Grès de Montpellier',
  'Gambetta - Chaptal': 'Gambetta',
  'Gambetta - Saint-Denis': 'Gambetta',
  'Gare Saint-Roch - République': 'Gare Saint-Roch',
  'Rives du Lez - Consuls de Mer': 'Rives du Lez',
  'Saint-Eloi - Docteur Pezet': 'Saint-Éloi',
};

/** Lecteur CSV minimal (guillemets et virgules dans les champs). */
function readCsv(file) {
  const text = readFileSync(join(dir, file), 'utf8').replace(/^﻿/, '');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field || row.length) rows.push([...row, field]);
  const [header, ...body] = rows;
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

const minutes = (hms) => {
  const [h, m, s] = hms.split(':').map(Number);
  return h * 60 + m + s / 60;
};
const median = (values) => {
  const v = [...values].sort((a, b) => a - b);
  const mid = v.length >> 1;
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
};

// ---------- lecture ----------
const routes = readCsv('routes.txt').filter((r) => r.route_type === '0');
const routeIds = new Set(routes.map((r) => r.route_id));
const services = new Set(
  readCsv('calendar_dates.txt')
    .filter((c) => c.date === date && c.exception_type === '1')
    .map((c) => c.service_id),
);
const trips = new Map(
  readCsv('trips.txt')
    .filter((t) => routeIds.has(t.route_id) && services.has(t.service_id))
    .map((t) => [t.trip_id, t]),
);
if (!trips.size) {
  console.error(`Aucune course de tram le ${date} : choisis une date couverte par ce GTFS.`);
  process.exit(1);
}
const stops = new Map(readCsv('stops.txt').map((s) => [s.stop_id, s]));
const nameOf = (stopId) => {
  const name = stops.get(stopId).stop_name;
  return ALIASES[name] ?? name;
};

/** Les arrêts de chaque course, dans l'ordre. */
const calls = new Map();
for (const st of readCsv('stop_times.txt')) {
  if (!trips.has(st.trip_id)) continue;
  if (!calls.has(st.trip_id)) calls.set(st.trip_id, []);
  calls.get(st.trip_id).push({
    seq: Number(st.stop_sequence),
    stop: st.stop_id,
    arr: minutes(st.arrival_time),
    dep: minutes(st.departure_time),
  });
}
for (const list of calls.values()) list.sort((a, b) => a.seq - b.seq);

// ---------- stations ----------
const coords = new Map();
for (const list of calls.values()) {
  for (const c of list) {
    const s = stops.get(c.stop);
    const name = nameOf(c.stop);
    if (!coords.has(name)) coords.set(name, new Map());
    coords.get(name).set(c.stop, [Number(s.stop_lat), Number(s.stop_lon)]);
  }
}
const slug = (name) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
const stations = [...coords.entries()]
  .map(([name, quays]) => {
    const pts = [...quays.values()];
    const lat = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const lon = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    return { id: slug(name), name, lat: Number(lat.toFixed(6)), lon: Number(lon.toFixed(6)) };
  })
  .sort((a, b) => a.id.localeCompare(b.id));
const idOf = new Map(stations.map((s) => [s.name, s.id]));

// ---------- temps entre stations (médiane, les deux sens confondus) ----------
const hops = new Map();
for (const list of calls.values()) {
  for (let i = 0; i + 1 < list.length; i++) {
    const a = idOf.get(nameOf(list[i].stop));
    const b = idOf.get(nameOf(list[i + 1].stop));
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (!hops.has(key)) hops.set(key, []);
    hops.get(key).push(list[i + 1].arr - list[i].dep);
  }
}
const hop = (a, b) => {
  const values = hops.get(a < b ? `${a}|${b}` : `${b}|${a}`);
  return Math.max(0.5, Math.round(median(values) * 4) / 4);
};

// ---------- parcours ----------
/** `small` est-il une suite contiguë de `big` ? */
const inside = (small, big) => {
  for (let i = 0; i + small.length <= big.length; i++) {
    if (small.every((s, k) => big[i + k] === s)) return true;
  }
  return false;
};

const lines = routes
  .sort((a, b) => Number(a.route_id) - Number(b.route_id))
  .map((route) => {
    const counts = new Map();
    for (const [tripId, list] of calls) {
      const trip = trips.get(tripId);
      if (trip.route_id !== route.route_id || trip.direction_id !== '0') continue;
      const key = list.map((c) => idOf.get(nameOf(c.stop))).join('>');
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const total = [...counts.values()].reduce((s, n) => s + n, 0);
    const patterns = [...counts.entries()]
      .map(([key, n]) => ({ stations: key.split('>'), n }))
      .sort((a, b) => b.stations.length - a.stations.length || b.n - a.n);
    // Les parcours « complets » : ceux qui ne sont pas un morceau d'un autre (on oublie les services partiels).
    const kept = [];
    for (const p of patterns) {
      if (p.n < total * 0.05) continue;
      if (kept.some((k) => inside(p.stations, k.stations))) continue;
      kept.push(p);
    }
    const loop = kept[0].stations[0] === kept[0].stations.at(-1);
    let paths = kept.map((k) => (loop ? k.stations.slice(0, -1) : k.stations));
    // Les branches (ligne 3) partent du même terminus : on oriente les parcours tronc d'abord.
    if (paths.length > 1 && paths[0][0] !== paths[1][0]) paths = paths.map((p) => [...p].reverse());
    return {
      id: Number(route.route_id),
      name: route.route_long_name,
      color: `#${route.route_color}`,
      text: `#${route.route_text_color}`,
      loop,
      routes: paths.map((stations) => ({
        stations,
        minutes: stations
          .slice(0, loop ? undefined : -1)
          .map((s, i) => hop(s, stations[(i + 1) % stations.length])),
      })),
    };
  });

// ---------- rames en ligne, heure par heure (par service voiture, `block_id`) ----------
const blocks = new Map();
for (const [tripId, list] of calls) {
  const trip = trips.get(tripId);
  const key = trip.block_id || tripId;
  if (!blocks.has(key)) blocks.set(key, []);
  blocks.get(key).push({ route: Number(trip.route_id), start: list[0].dep, end: list.at(-1).arr });
}
for (const list of blocks.values()) list.sort((a, b) => a.start - b.start);
for (const line of lines) line.fleet = new Array(24).fill(0);
for (const list of blocks.values()) {
  for (let h = 0; h < 24; h++) {
    // Les services de nuit débordent après minuit (24:30 en GTFS).
    for (const t of [h * 60 + 30, h * 60 + 30 + 1440]) {
      if (t < list[0].start || t > list.at(-1).end) continue;
      const current = list.find((trip) => trip.end >= t);
      lines.find((l) => l.id === current.route).fleet[h]++;
    }
  }
}
const courses = new Map();
for (const trip of trips.values()) {
  courses.set(Number(trip.route_id), (courses.get(Number(trip.route_id)) ?? 0) + 1);
}
for (const line of lines) line.trips = courses.get(line.id);

// ---------- écriture ----------
/** Littéral de chaîne : guillemets simples, doubles si la chaîne contient une apostrophe (comme Prettier). */
const str = (v) => (v.includes("'") ? JSON.stringify(v) : `'${v}'`);
const list = (values, fmt = String) => `[${values.map(fmt).join(', ')}]`;
const iso = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)}`;
const stationLines = stations.map(
  (s) => `  { id: ${str(s.id)}, name: ${str(s.name)}, lat: ${s.lat}, lon: ${s.lon} },`,
);
const lineBlocks = lines.map(
  (l) => `  {
    id: ${l.id},
    name: ${str(l.name)},
    color: ${str(l.color)},
    text: ${str(l.text)},
    loop: ${l.loop},
    routes: [
${l.routes.map((r) => `      {\n        stations: ${list(r.stations, str)},\n        minutes: ${list(r.minutes)},\n      },`).join('\n')}
    ],
    fleet: ${list(l.fleet)},
    trips: ${l.trips},
  },`,
);
const out = `// Généré par tools/gtfs.mjs depuis le GTFS de la TaM (https://transport.data.gouv.fr, réseau urbain TaM),
// horaires du ${iso}. Ne pas modifier à la main : relancer le script.
import type { LineData, StationData } from './network';

/** Le jour de semaine dont viennent les horaires. */
export const GTFS_DATE = '${iso}';

export const STATIONS: readonly StationData[] = [
${stationLines.join('\n')}
];

export const LINES: readonly LineData[] = [
${lineBlocks.join('\n')}
];
`;
const target = join(dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'network-data.ts');
writeFileSync(target, out);
console.log(
  `✔ ${stations.length} stations, ${lines.length} lignes → ${target} (passe Prettier dessus)`,
);
for (const l of lines) {
  console.log(
    `  L${l.id} ${l.loop ? '(boucle) ' : ''}${l.routes.map((r) => `${r.stations.length} st. ${r.minutes.reduce((s, m) => s + m, 0)} min`).join(' / ')} · ${l.trips} courses · rames à 8 h : ${l.fleet[8]}`,
  );
}
