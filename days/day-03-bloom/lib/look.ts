import { Rgb, add, desaturate, light, luminance, mix, parseHex, rgba, toHex } from './color';
import { ogakiMinutes } from './clock';
import { skyPoint } from './projection';
import { MoonPhase, SunPosition } from './solar';
import { Conditions } from './weather';

/**
 * La lumière du moment. Chaque couleur du décor a sa teinte « en plein jour » (albédo) et une profondeur ;
 * l'éclairage la module (lumière ambiante de la phase du jour, nuages, pluie), le lointain prend la couleur
 * de l'horizon (perspective atmosphérique, brouillard) et les lampes réchauffent ce qui est près d'elles.
 * La nuit décale ainsi les ombres vers le bleu au lieu de simplement tout assombrir.
 */

/** Albédo (couleur de jour), profondeur 0–1 (0 = sous notre nez) et sensibilité aux lampes. */
const MATERIALS: Record<string, [string, number, number?]> = {
  // Fond : les montagnes de l'ouest, bleutées par la distance.
  'mountain-far': ['#b4c6d8', 1],
  'mountain-mid': ['#7790aa', 0.95],
  'mountain-ravine': ['#5d7590', 0.95],
  'mountain-light': ['#a7bccf', 0.95],
  'mountain-near': ['#5d7868', 0.85],
  'mountain-near-ravine': ['#4a6255', 0.85],
  'mountain-near-light': ['#86a08d', 0.85],
  // Le pont
  'rail-back': ['#6a3a2e', 0.55, 0.05],
  'rail-back-hi': ['#a8705c', 0.55, 0.06],
  rail: ['#7f4534', 0.4, 0.1],
  'rail-hi': ['#c98a70', 0.4, 0.12],
  deck: ['#d6d1c6', 0.4, 0.08],
  'deck-hi': ['#efebe3', 0.4, 0.1],
  'deck-shade': ['#8c8881', 0.4, 0.05],
  'deck-stain': ['#bdb7ab', 0.4, 0.05],
  'deck-under': ['#4a4650', 0.4, 0.04],
  // Lanternes (le papier lui-même s'allume la nuit, voir EMISSIVE).
  'lantern-cord': ['#3a3133', 0.3],
  'lantern-pole': ['#b29a68', 0.4, 0.1],
  'lantern-cap': ['#2e2829', 0.3, 0.05],
  // Pétales en vol (sprites des canvases de particules).
  'petal-hi': ['#fff4f7', 0.05, 0.3],
  'petal-mid': ['#f8dde7', 0.05, 0.3],
  'petal-shade': ['#e6b8ca', 0.05, 0.25],
  'petal-heart': ['#de7c9c', 0.05, 0.2],
};

/** Ce qui brille la nuit : couleur de jour, couleur allumée, et quelle lumière l'allume. */
const EMISSIVE: Record<string, [string, string, keyof Lights]> = {
  lantern: ['#fbefe8', '#ffc08a', 'lanterns'],
  'lantern-rib': ['#e3d2cc', '#f29a6a', 'lanterns'],
  'lantern-mark': ['#e2577f', '#ff6a5a', 'lanterns'],
};

/** Couleur des lampes : un blanc chaud, rosé par le papier des lanternes. */
const LAMP: Rgb = parseHex('#ffb784');

interface SkyKey {
  elevation: number;
  zenith: string;
  mid: string;
  horizon: string;
  /** Lumière ambiante (multiplicateur RVB). */
  ambient: [number, number, number];
  /** Halo du soleil. */
  glow: string;
}

/** Le ciel selon la hauteur du soleil : nuit, heure bleue, coucher, heure dorée, jour. */
const SKY: SkyKey[] = [
  {
    elevation: -18,
    zenith: '#04071a',
    mid: '#0a1331',
    horizon: '#18223f',
    ambient: [0.1, 0.12, 0.25],
    glow: '#1a2350',
  },
  {
    elevation: -10,
    zenith: '#0b1538',
    mid: '#1b285a',
    horizon: '#3a3c6e',
    ambient: [0.17, 0.19, 0.38],
    glow: '#4a3d78',
  },
  {
    elevation: -4,
    zenith: '#1c2d6c',
    mid: '#4a4f92',
    horizon: '#c07c97',
    ambient: [0.36, 0.34, 0.56],
    glow: '#e0789a',
  },
  {
    elevation: 0,
    zenith: '#2f4c98',
    mid: '#8c80bb',
    horizon: '#ff9a6a',
    ambient: [0.68, 0.53, 0.56],
    glow: '#ff8550',
  },
  {
    elevation: 5,
    zenith: '#4572bf',
    mid: '#a6b3dc',
    horizon: '#ffc58a',
    ambient: [0.98, 0.82, 0.72],
    glow: '#ffb070',
  },
  {
    elevation: 12,
    zenith: '#4c87d3',
    mid: '#a7cbee',
    horizon: '#f5dcc0',
    ambient: [1.03, 0.96, 0.88],
    glow: '#fff0d0',
  },
  {
    elevation: 25,
    zenith: '#4a8edb',
    mid: '#92c2ec',
    horizon: '#dcebf4',
    ambient: [1.06, 1.05, 1.03],
    glow: '#fffaf0',
  },
  {
    elevation: 90,
    zenith: '#3d84d6',
    mid: '#8bbeeb',
    horizon: '#d4e8f5',
    ambient: [1.09, 1.09, 1.09],
    glow: '#ffffff',
  },
];

export interface Lights {
  /** Lanternes de papier de la fête des cerisiers (du coucher du soleil à 22 h), 0–1. */
  lanterns: number;
}

/** Durée d'allumage ou d'extinction (ms). */
const RAMP = 5 * 60_000;

/**
 * Les lanternes sont-elles allumées ? Elles s'allument au coucher du soleil donné par l'API (sans lui, on
 * se rabat sur la hauteur du soleil) et s'éteignent à 22 h, comme pendant la fête des cerisiers d'Ōgaki.
 */
export function cityLights(
  ms: number,
  elevation: number,
  sunrises: readonly number[],
  sunsets: readonly number[],
  utcOffsetSeconds?: number,
): Lights {
  let dark: number;
  const events = [
    ...sunrises.map((t) => ({ t, on: false })),
    ...sunsets.map((t) => ({ t, on: true })),
  ].sort((a, b) => a.t - b.t);
  const last = events.filter((e) => e.t <= ms).at(-1);
  if (last && events.some((e) => e.t > ms)) {
    const k = Math.min(1, (ms - last.t) / RAMP);
    dark = last.on ? k : 1 - k;
  } else {
    dark = clamp01((-elevation + 0.5) / 3);
  }
  const minutes = ogakiMinutes(ms, utcOffsetSeconds);
  const curfew = minutes >= 22 * 60 || minutes < 5 * 60 ? 0 : 1;
  return { lanterns: dark * curfew };
}

export interface LookInput {
  sun: SunPosition;
  moon: MoonPhase;
  lights: Lights;
  conditions: Conditions;
}

export interface Look {
  /** Variables CSS (`--wall` -> `#7b786f`), à poser sur l'hôte. */
  vars: Record<string, string>;
  /** Le soleil dans la composition et son opacité. */
  sun: { x: number; y: number; alpha: number; glow: string };
  stars: number;
  moon: { alpha: number; phase: number; illumination: number };
  /** Couleurs reprises par les canvases (pétales, pluie). */
  petal: { hi: string; mid: string; shade: string; heart: string };
  rain: string;
  /** Luminosité générale (0–1), pour doser le son et le flash. */
  brightness: number;
  /** Pour les cerisiers peints sur canvas : lumière ambiante, désaturation, voile et sa force par calque. */
  canopy: {
    ambient: [number, number, number];
    desaturate: number;
    haze: string;
    /** Voile par calque (le plus lointain, le plus voilé). */
    far: number;
    mid: number;
    near: number;
    /** Lanternes (0–1), pour leurs halos sur les fleurs. */
    lanterns: number;
  };
}

/** La lumière pour un instant et une météo donnés. */
export function computeLook({ sun, moon, lights, conditions }: LookInput): Look {
  const key = skyAt(sun.elevation);
  const c = conditions;
  const overcast = smoothstep(0.45, 1, c.clouds);
  const wet = c.precip === 'none' ? 0 : 0.4 + c.intensity * 0.6;
  const fog = c.fog;

  // Le ciel : couvert, il vire au gris (plus sombre s'il pleut) ; dans le brouillard, il se fond.
  // Un ciel couvert reste lumineux (comme sur la photo) : un gris clair, à peine bleuté.
  const greyLevel = luminance(key.mid) ** 0.32 * 255;
  const grey: Rgb = [greyLevel * 0.95, greyLevel * 0.97, greyLevel];
  const cloudy = overcast * (0.75 + 0.2 * wet);
  const darken = 1 - 0.25 * wet * overcast;
  let zenith = scale(mix(key.zenith, mix(grey, key.zenith, 0.25), cloudy), darken);
  let mid = scale(mix(key.mid, grey, cloudy), darken);
  let horizon = scale(mix(key.horizon, mix(grey, key.horizon, 0.3), cloudy * 0.9), darken);
  const fogColor = mix(horizon, grey, 0.5);
  zenith = mix(zenith, fogColor, fog * 0.85);
  mid = mix(mid, fogColor, fog * 0.9);
  horizon = mix(horizon, fogColor, fog);

  // La lumière ambiante : désaturée et atténuée par les nuages et la pluie.
  const dim = 1 - 0.16 * overcast - 0.16 * wet - 0.1 * fog;
  const ambientRgb = desaturate(
    [key.ambient[0] * 200, key.ambient[1] * 200, key.ambient[2] * 200],
    overcast * 0.35 + fog * 0.3,
  );
  const ambient: [number, number, number] = [
    (ambientRgb[0] / 200) * dim,
    (ambientRgb[1] / 200) * dim,
    (ambientRgb[2] / 200) * dim,
  ];
  // Le lointain prend la couleur de l'horizon : un peu par beau temps, beaucoup dans le brouillard.
  const haze = 0.22 + 0.2 * overcast + 0.3 * wet + 0.65 * fog;
  const lamps = lights.lanterns;

  const vars: Record<string, string> = {};
  for (const [name, [hex, depth, lampK = 0]] of Object.entries(MATERIALS)) {
    let col = light(parseHex(hex), ambient);
    // Mouillé : plus sombre et plus saturé.
    if (wet) col = scale(col, 1 - 0.18 * wet);
    col = mix(col, horizon, Math.min(0.92, haze * depth ** 1.6));
    if (lamps && lampK) col = add(col, LAMP, lampK * lamps * 0.35);
    vars[`--${name}`] = toHex(col);
  }
  // La brume des vallées, au pied des montagnes (translucide : chaque chaîne s'y noie un peu plus).
  vars['--mist-a'] = rgba(mix(horizon, grey, 0.3), 0.35 + 0.3 * fog);
  vars['--mist-b'] = rgba(mix(horizon, grey, 0.3), 0.6 + 0.3 * fog);
  for (const [name, [day, on, source]] of Object.entries(EMISSIVE)) {
    const lit = light(parseHex(day), ambient);
    vars[`--${name}`] = toHex(mix(lit, parseHex(on), lights[source]));
  }

  // Le ciel et les nuages.
  vars['--sky-top'] = toHex(zenith);
  vars['--sky-mid'] = toHex(mid);
  vars['--sky-low'] = toHex(horizon);
  const cloudLit = mix(
    mix([255, 255, 255], horizon, 0.35),
    scale(key.mid, 0.7),
    sun.elevation < -4 ? 0.7 : 0,
  );
  vars['--cloud-lit'] = toHex(
    scale(mix(cloudLit, grey, cloudy * 0.6), dim * Math.min(1, 0.35 + luminance(key.mid) * 2)),
  );
  vars['--cloud-shade'] = toHex(mix(parseHex(vars['--cloud-lit']), zenith, 0.4));
  vars['--clouds-few'] = String(round(smoothstep(0.05, 0.4, c.clouds) * (1 - fog)));
  vars['--clouds-many'] = String(round(smoothstep(0.35, 0.85, c.clouds) * (1 - fog)));
  vars['--lanterns'] = String(round(lights.lanterns));
  vars['--fog'] = String(round(fog));

  const [sx, sy] = skyPoint(sun.azimuth, sun.elevation);
  const night = clamp01((-sun.elevation - 4) / 8);
  const open = (1 - c.clouds ** 0.8) * (1 - fog);
  const hazeColor = toHex(horizon);
  return {
    vars,
    sun: {
      x: sx,
      y: sy,
      alpha: round(clamp01((sun.elevation + 3) / 5) * (1 - overcast * 0.9) * (1 - fog * 0.8)),
      glow: toHex(scale(mix(parseHex(key.glow), grey, cloudy * 0.7), dim)),
    },
    stars: round(night * open),
    moon: { alpha: round(clamp01((-sun.elevation + 1) / 7) * open), ...moon },
    petal: {
      hi: vars['--petal-hi'],
      mid: vars['--petal-mid'],
      shade: vars['--petal-shade'],
      heart: vars['--petal-heart'],
    },
    rain: rgba(mix(horizon, [255, 255, 255], 0.45), 0.5 + 0.25 * luminance(horizon)),
    brightness: round(luminance(light([200, 200, 200], ambient)) / luminance([200, 200, 200])),
    canopy: {
      // La nuit, les fleurs blanches gardent la lueur de la ville : elles ne tombent jamais dans le noir.
      ambient: [
        round(Math.max(ambient[0], 0.2)),
        round(Math.max(ambient[1], 0.2)),
        round(Math.max(ambient[2], 0.33)),
      ],
      desaturate: round(overcast * 0.22 + wet * 0.1 + fog * 0.3),
      haze: hazeColor,
      far: round(Math.min(0.85, 0.3 + haze * 0.5)),
      mid: round(Math.min(0.7, 0.08 + haze * 0.3)),
      near: round(Math.min(0.5, fog * 0.25)),
      lanterns: round(lights.lanterns),
    },
  };
}

/** Clés du ciel interpolées pour une élévation donnée (en lumière linéaire). */
function skyAt(elevation: number): {
  zenith: Rgb;
  mid: Rgb;
  horizon: Rgb;
  ambient: [number, number, number];
  glow: string;
} {
  const e = Math.min(90, Math.max(-18, elevation));
  let i = SKY.findIndex((k) => k.elevation >= e);
  if (i <= 0) i = 1;
  const a = SKY[i - 1];
  const b = SKY[i];
  const t = (e - a.elevation) / (b.elevation - a.elevation);
  return {
    zenith: mix(parseHex(a.zenith), parseHex(b.zenith), t),
    mid: mix(parseHex(a.mid), parseHex(b.mid), t),
    horizon: mix(parseHex(a.horizon), parseHex(b.horizon), t),
    ambient: [0, 1, 2].map((k) => a.ambient[k] + (b.ambient[k] - a.ambient[k]) * t) as [
      number,
      number,
      number,
    ],
    glow: toHex(mix(parseHex(a.glow), parseHex(b.glow), t)),
  };
}

function scale(c: Rgb, k: number): Rgb {
  return light(c, [k, k, k]);
}

function smoothstep(a: number, b: number, x: number): number {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}
