import type { Range } from './math';

/**
 * Tous les réglages du jour, au même endroit.
 *
 * - Une paire `[a, b]` donne la valeur à density 0 puis à density 1 ; une `window` borne la plage de
 *   density sur laquelle la valeur passe de l'une à l'autre (lissée).
 * - Distances en `u` (le plus petit côté de la vue), durées en secondes, fréquences en Hz.
 */
export const CONFIG = {
  density: {
    /** Montée par seconde, horloge lancée (0,4 en 3 min). */
    rate: 0.4 / 180,
    /** Facteur appliqué à `rate` après chaque surge, et son plafond cumulé. */
    rateGain: 1.15,
    rateMax: 1.8,
    /** Ajout pour un glow entièrement dissipé à l'approche (proportionnel à la part dissipée). */
    dissipationCost: 0.02,
    /** Ajout par seconde quand l'input pointe pleinement vers un glow visible. */
    alignmentCost: 0.0006,
    /** Ajout au contact d'un glow inert. */
    inertCost: 0.02,
    /** Baisse durable après un épisode stable, hausse durable après un épisode unstable. */
    stableDrop: 0.06,
    unstableRise: 0.08,
    /** Profondeur du clearing sous le niveau de départ, et son plancher. */
    clearingDepth: 0.3,
    clearingDepthMin: 0.08,
    /** À chaque épisode : profondeur et baisse stable × attenuation, hausse unstable × amplification. */
    attenuation: 0.85,
    amplification: 1.15,
    /** Constante de temps des ajouts (s) : rien ne s'applique d'un coup. */
    smoothing: 0.6,
  },

  episode: {
    /** Descente vers le clearing (ease-out). */
    descend: 1.5,
    /** Palier (tiré dans l'intervalle). */
    hold: [2, 4] as Range,
    /** Surge (ease-in, exposant élevé = très raide à la fin). */
    surge: 1.2,
    surgeExponent: 4,
    /** Retour lent après un épisode stable. */
    settle: 6,
    /** Avance de l'audio sur le visuel à partir du palier. */
    audioLead: 0.5,
  },

  /** Tirage au contact d'un glow coherent ; unstable = le reste. Fixe, quelle que soit la density. */
  outcomes: { stable: 0.2, inert: 0.5 },

  /** Ouverture : au plus tard ce numéro de glow est coherent ; le premier coherent atteint est unstable. */
  opening: { coherentBy: 3 },

  body: {
    /** Poussée (u/s²), vitesse max (u/s), drag exponentiel (/s). */
    thrust: [1.4, 0.5] as Range,
    maxSpeed: [0.45, 0.07] as Range,
    drag: [1.6, 6] as Range,
    /** Viscosity : constante de temps du lissage de l'input (s). */
    viscosity: [0.05, 0.35] as Range,
    /** Fenêtre de density où poussée, vitesse max et courant résiduel tombent à 0 : la fin, l'immobilité. */
    stall: [0.75, 0.97] as Range,
    /** Rayon (u), netteté (1 = contour net), luminosité. */
    radius: [0.014, 0.009] as Range,
    crisp: [1, 0] as Range,
    light: [1, 0.45] as Range,
  },

  current: {
    /** Gain du courant transverse (/s), proportionnel à la vitesse. */
    gain: [0, 5] as Range,
    window: [0.03, 1] as Range,
    /** Itérations logistiques par seconde : les variations s'accélèrent. */
    rate: [0.15, 1.2] as Range,
    /** Écart d'orientation maximal autour de la perpendiculaire (rad). */
    spread: [0, Math.PI / 2] as Range,
    /** Courant résiduel à l'arrêt (u/s²). */
    residual: [0, 0.12] as Range,
    residualWindow: [0.55, 1] as Range,
  },

  camera: {
    /** Retard de la caméra sur le body (s). */
    lag: [0.25, 0.5] as Range,
  },

  aperture: {
    /** Rayon libre, en part de la demi-diagonale de la vue. */
    radius: [1.05, 0.22] as Range,
    /** Opacité de l'obscurité au-delà. */
    dark: [0.45, 0.98] as Range,
    /** Élargissement pendant un clearing (part de la demi-diagonale). */
    clearingBoost: 0.5,
    /** Pulsation logistique : amplitude relative du rayon, fenêtre, vitesse, lissage (s). */
    pulse: [0, 0.1] as Range,
    pulseWindow: [0.1, 1] as Range,
    pulseRate: [0.5, 1.4] as Range,
    pulseSmoothing: 0.45,
  },

  glows: {
    pool: 4,
    /** Intervalle entre deux apparitions (s), et sa part aléatoire. */
    interval: [6.5, 14] as Range,
    intervalJitter: 0.5,
    /** Distance d'apparition depuis le centre, en part des demi-dimensions de la vue ; marge aux bords (u). */
    distance: [0.62, 0.95] as Range,
    margin: 0.08,
    /** Rayon (u) et intensité. */
    radius: [0.075, 0.05] as Range,
    intensity: [1, 0.45] as Range,
    /** Probabilité d'être coherent (jamais 0). */
    coherent: [0.5, 0.12] as Range,
    /** Dissipation à l'approche : commence à `dissipateFrom`, complète à `dissipateTo` (u). */
    dissipateFrom: [0.14, 0.6] as Range,
    dissipateTo: [0.05, 0.36] as Range,
    /** Distance de contact (u). */
    contact: 0.035,
    /** Durées : apparition, effacement, extinction (inert), éclosion (contact) ; échelle de l'éclosion. */
    appear: 1.6,
    fade: 2,
    extinguish: 0.6,
    bloom: 1.8,
    bloomScale: 7,
    /** Durée de vie : distance / (vitesse max × speedShare) + margin, bornée. */
    lifeMin: 10,
    lifeMax: 40,
    lifeMargin: 6,
    lifeSpeedShare: 0.5,
    /** Une dissipation à moins de `warmthRange` (u) réchauffe le halo du body, qui retombe en `warmthDecay` s. */
    warmthRange: 0.35,
    warmthDecay: 1.2,
  },

  drifters: {
    count: 5,
    /** Chaque drifter s'estompe au-delà d'un seuil de density réparti dans cet intervalle. */
    thresholds: [0.2, 0.85] as Range,
    /** Distance au body à l'apparition (u), rayon de répulsion (u), distance de recyclage (u). */
    distance: [0.75, 1.5] as Range,
    repel: 0.55,
    respawn: 2.4,
    /** Vitesse d'éloignement en part de la vitesse max du body, errance (u/s). */
    speedShare: 1.15,
    wander: 0.025,
  },

  marks: {
    /** Repères fixes au sol : taille de cellule (u), opacité. */
    cell: 0.16,
    alpha: [0.4, 0] as Range,
    window: [0, 0.55] as Range,
  },

  turbulence: {
    /** Opacité des nappes, parallaxe de chaque nappe, vitesse de glissement (u/s). */
    alpha: [0.12, 0.55] as Range,
    parallax: [0.2, 0.35, 0.5, 0.65],
    drift: 0.012,
    /** Teintes des nappes : neutre (density basse), bordeaux, violet, jaune. */
    tints: [
      [70, 84, 104],
      [78, 36, 52],
      [60, 46, 80],
      [76, 70, 38],
    ],
  },

  grain: {
    alpha: [0.035, 0.17] as Range,
    fps: 24,
    /** Part du grain retirée au plus fort d'un clearing. */
    clearingCut: 0.6,
  },

  palette: {
    /** Fond, de density 0 à 1 (stops régulièrement espacés). */
    background: ['#1e2636', '#1c1d2c', '#1a141d', '#130e15'],
    /** Couleur de l'obscurité au-delà de l'aperture. */
    dark: [4, 3, 6],
  },

  clearing: {
    /** Opacité du voile chaud au plus fort d'un clearing. */
    veil: 0.17,
  },

  picto: {
    alpha: 0.3,
    /** Effacement après la première touche de mouvement (s). */
    fade: 1.2,
  },

  audio: {
    volume: 0.5,
    /** Fondu d'entrée (constante de temps, s), cadence de mise à jour (s), lissage des paramètres (s). */
    fadeIn: 1.4,
    update: 0.05,
    smoothing: 0.12,
    /** Lowpass général (Hz) et ouverture pendant un clearing (facteur). */
    lowpass: [8000, 650] as Range,
    lowpassClearing: 2.4,
    turbulence: {
      gain: [0.03, 0.2] as Range,
      cutoff: [620, 230] as Range,
    },
    drone: {
      /** Deux paires désaccordées de 2 Hz : le battement. */
      freqs: [55, 57, 110, 112],
      harmonicShare: 0.5,
      gain: [0, 0.2] as Range,
      window: [0.04, 0.9] as Range,
      /** Part du drone retirée au plus fort d'un clearing. */
      clearingCut: 0.75,
    },
    highTone: {
      freq: 7800,
      gain: [0, 0.0035] as Range,
      window: [0.5, 1] as Range,
    },
    voices: {
      gain: 0.05,
      /** Gamme pentatonique (Hz) et désaccord de la seconde oscillation. */
      notes: [220, 246.94, 277.18, 329.63, 369.99, 440],
      detune: 1.004,
    },
    bloom: { gain: 0.07 },
    inert: {
      gain: 0.06,
      /** Rapport de la seconde note (quarte), durée de la décroissance (s). */
      interval: 4 / 3,
      decay: 0.7,
    },
  },
} as const;
