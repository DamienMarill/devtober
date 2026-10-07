/**
 * Tous les réglages du jour, au même endroit. Temps en minutes simulées (sauf mention contraire), un point de la
 * foule vaut `riderSize` voyageurs.
 */

/** Ce que représente une station pour la demande : d'où partent les gens, où ils vont. */
export type StationKind =
  'home' | 'park' | 'centre' | 'campus' | 'hospital' | 'office' | 'shopping' | 'rail' | 'leisure';

/** Courbe sur 24 h à partir de points d'appui `[heure, valeur]` (interpolation linéaire, 0 ailleurs). */
function curve(points: readonly (readonly [number, number])[]): number[] {
  const out = new Array<number>(24).fill(0);
  for (let h = 0; h < 24; h++) {
    for (let i = 0; i + 1 < points.length; i++) {
      const [h0, v0] = points[i];
      const [h1, v1] = points[i + 1];
      if (h >= h0 && h <= h1) out[h] = v0 + ((v1 - v0) * (h - h0)) / (h1 - h0 || 1);
    }
  }
  return out;
}

/** Le matin, le midi, le soir, la nuit : les quatre « marées » d'une journée de semaine. */
const MORNING = curve([
  [5, 0],
  [6, 0.25],
  [7, 0.85],
  [8, 1],
  [9, 0.55],
  [10, 0.25],
  [11, 0.15],
  [12, 0],
]);
const MIDDAY = curve([
  [9, 0],
  [10, 0.35],
  [12, 0.6],
  [14, 0.55],
  [16, 0.4],
  [17, 0],
]);
const EVENING = curve([
  [14, 0],
  [15, 0.35],
  [16, 0.7],
  [17, 1],
  [18, 0.95],
  [19, 0.55],
  [20, 0.25],
  [21, 0.1],
  [22, 0],
]);
const NIGHT = curve([
  [18, 0],
  [19, 0.2],
  [20, 0.35],
  [21, 0.35],
  [22, 0.3],
  [23, 0.2],
]);
/** Après minuit (0 h 00 – 0 h 59, indice 0), il reste un filet de noctambules. */
NIGHT[0] = 0.12;

const mix = (...parts: [number[], number][]) =>
  Array.from({ length: 24 }, (_, h) => parts.reduce((s, [c, w]) => s + c[h] * w, 0));

/** Départs (émission) et arrivées (attraction) par type de station, heure par heure. */
const HOME_OUT = mix([MORNING, 1], [MIDDAY, 0.45], [EVENING, 0.3], [NIGHT, 0.35]);
const HOME_IN = mix([MORNING, 0.15], [MIDDAY, 0.45], [EVENING, 1], [NIGHT, 0.8]);
const WORK_OUT = mix([MORNING, 0.12], [MIDDAY, 0.55], [EVENING, 1], [NIGHT, 0.3]);
const WORK_IN = mix([MORNING, 1], [MIDDAY, 0.5], [EVENING, 0.15], [NIGHT, 0.05]);
const TOWN_OUT = mix([MORNING, 0.3], [MIDDAY, 0.7], [EVENING, 0.9], [NIGHT, 1]);
const TOWN_IN = mix([MORNING, 0.7], [MIDDAY, 0.8], [EVENING, 0.5], [NIGHT, 0.7]);
const BOTH = mix([MORNING, 0.7], [MIDDAY, 0.6], [EVENING, 0.7], [NIGHT, 0.4]);

export const CONFIG = {
  /** La journée jouée : 6 h → 0 h 30 (24 h 30). */
  day: { start: 6 * 60, end: 24 * 60 + 30, label: 'Mercredi 7 octobre' },

  /** Minutes simulées par seconde réelle à ×1, ×2, ×4 (une journée ≈ 4 min 30 à ×1). */
  speeds: [4, 8, 16],
  /** Pas fixe de la simulation (3 s simulées). */
  step: 0.05,
  /** Plafond de pas par image (onglet ralenti, vieux téléphone). */
  maxStepsPerFrame: 24,

  /** Un point de la foule = 10 voyageurs. */
  riderSize: 10,

  tram: {
    /** Places en points : rames longues de 300 places sur la 1, ~210 ailleurs. */
    capacity: { 1: 30 } as Readonly<Record<number, number>>,
    defaultCapacity: 21,
    /** Arrêt minimal en station, battement au terminus, arrêt de régulation de la 4 à Garcia Lorca. */
    dwell: 0.35,
    layover: 2.5,
    loopStop: 1,
    /** Un arrêt ne dure jamais plus que ça : la rame part même si la foule continue d'arriver. */
    maxDwell: 2,
    /** Montées et descentes, en points par minute (8 portes doubles : ~10 voyageurs par seconde). */
    boardRate: 60,
    alightRate: 80,
    /** Régulation au terminus : pas de départ avant cette fraction de l'intervalle prévu. */
    regulation: 0.7,
    /** Écart minimal entre deux rames sur un même tronçon, en minutes de parcours. */
    spacing: 0.7,
    /** Rames simultanées à un quai de terminus. */
    terminusPlatforms: 3,
  },

  depot: {
    /** Délai de sortie de dépôt jusqu'au terminus, et de retour d'une rame retirée. */
    deploy: 5,
    back: 4,
  },

  riders: {
    /** Patience avant d'abandonner (tirée entre les deux bornes). */
    patience: [16, 26] as const,
    /** Contrôle des patiences toutes les… */
    patienceEvery: 0.5,
    /** Coût d'une correspondance dans le calcul d'itinéraire (marche + attente). */
    transfer: 5,
    /** Demande globale : points émis par minute pour un poids de station de 1 au pic. */
    rate: 0.7,
  },

  /** Poids de base par type de station (multiplié par l'offre réelle des lignes qui la desservent). */
  kindWeight: {
    home: 1,
    park: 1.6,
    centre: 1.5,
    campus: 2.2,
    hospital: 1.7,
    office: 1.5,
    shopping: 1.6,
    rail: 2.4,
    leisure: 1.2,
  } as Readonly<Record<StationKind, number>>,

  emission: {
    home: HOME_OUT,
    park: HOME_OUT,
    centre: TOWN_OUT,
    campus: WORK_OUT,
    hospital: mix([WORK_OUT, 0.8], [BOTH, 0.3]),
    office: WORK_OUT,
    shopping: TOWN_OUT,
    rail: BOTH,
    leisure: TOWN_OUT,
  } as Readonly<Record<StationKind, readonly number[]>>,

  attraction: {
    home: HOME_IN,
    park: HOME_IN,
    centre: TOWN_IN,
    campus: WORK_IN,
    hospital: mix([WORK_IN, 0.8], [BOTH, 0.3]),
    office: WORK_IN,
    shopping: mix([MIDDAY, 1], [EVENING, 0.5], [NIGHT, 0.4]),
    rail: BOTH,
    leisure: mix([MIDDAY, 0.6], [EVENING, 0.4], [NIGHT, 0.9]),
  } as Readonly<Record<StationKind, readonly number[]>>,

  /** Ce qui n'est pas listé est `home`. */
  kinds: {
    comedie: 'centre',
    corum: 'centre',
    observatoire: 'centre',
    'du-guesclin': 'centre',
    antigone: 'centre',
    'louis-blanc-agora-de-la-danse': 'centre',
    'peyrou-arc-de-triomphe': 'centre',
    'saint-guilhem-courreau': 'centre',
    gambetta: 'centre',
    rondelet: 'centre',
    'place-de-l-europe': 'centre',
    'albert-1er-jardin-des-plantes': 'centre',
    'gare-saint-roch': 'rail',
    'gare-sud-de-france': 'rail',
    'universite-montpellier-triolet': 'campus',
    'universite-paul-valery': 'campus',
    'saint-eloi': 'campus',
    'pole-chimie-balard': 'campus',
    agropolis: 'campus',
    'boutonnet-cite-des-arts': 'campus',
    'hopital-lapeyronie': 'hospital',
    'occitanie-hopitaux-facultes': 'hospital',
    euromedecine: 'hospital',
    'moulares-hotel-de-ville': 'office',
    'georges-freche-hotel-de-ville': 'office',
    'port-marianne': 'office',
    millenaire: 'office',
    'hotel-du-departement': 'office',
    'cite-creative-parc-montcalm': 'office',
    'rives-du-lez': 'office',
    odysseum: 'shopping',
    'place-de-france': 'shopping',
    'cnrs-zoo-de-lunaret': 'leisure',
    'parc-expo': 'leisure',
    'stade-de-la-mosson': 'leisure',
    ovalie: 'leisure',
    mosson: 'park',
    juvignac: 'park',
    'saint-jean-de-vedas-centre': 'park',
    jacou: 'park',
    'notre-dame-de-sablassou': 'park',
    'gres-de-montpellier': 'park',
    clapiers: 'park',
    'perols-etang-de-l-or': 'park',
    'lattes-centre': 'park',
    'garcia-lorca': 'park',
    sabines: 'park',
  } as Readonly<Record<string, StationKind>>,

  map: {
    /** Centre de la loupe (la Comédie) et son rayon : r' = r0 · asinh(r / r0), en km. */
    lens: { lat: 43.608486, lon: 3.879846, r0: 0.75 },
    /** Noms courts des étiquettes (sinon : le nom avant « - » ou « ( »). */
    short: {
      'universite-montpellier-triolet': 'Triolet',
      'occitanie-hopitaux-facultes': 'Hôpitaux-Facultés',
      'saint-jean-de-vedas-centre': 'St-Jean-de-Védas',
      'perols-etang-de-l-or': "Pérols Étang de l'Or",
      'universite-paul-valery': 'Paul-Valéry',
      'cnrs-zoo-de-lunaret': 'Zoo de Lunaret',
      'gres-de-montpellier': 'Grès',
      'notre-dame-de-sablassou': 'Sablassou',
      'gare-sud-de-france': 'Gare Sud de France',
      'moulares-hotel-de-ville': 'Moularès',
      'georges-freche-hotel-de-ville': 'Hôtel de Ville',
    } as Readonly<Record<string, string>>,
    /** Étiquettes toujours affichées (les terminus le sont aussi). */
    labels: [
      'comedie',
      'gare-saint-roch',
      'corum',
      'place-de-l-europe',
      'port-marianne',
      'odysseum',
      'universite-montpellier-triolet',
      'universite-paul-valery',
      'stade-de-la-mosson',
      'parc-expo',
      'observatoire',
    ],
    /** Couleurs d'affichage sur fond nuit (les officielles de la 1 et de la 4 sont trop sombres). */
    display: {
      1: '#3d8fe6',
      2: '#f08a1c',
      3: '#c8d400',
      4: '#c08a52',
      5: '#3fae5a',
    } as Readonly<Record<number, string>>,
  },

  /** Seuils d'alerte : foule à quai (en points) et anneau de saturation. */
  crowd: { alert: 45, saturated: 70 },

  /** Pilote automatique : une décision toutes les… et l'écart (en rames) qui déclenche un transfert. */
  autopilot: {
    every: 4,
    minPerLine: { 1: 6, 2: 4, 3: 4, 4: 2, 5: 3 } as Readonly<Record<number, number>>,
  },

  /** Fil du PC : au plus une réplique drôle par tranche de… */
  feed: { jokeEvery: 75, keep: 6 },
} as const;
