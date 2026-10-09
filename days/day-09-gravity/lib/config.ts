/**
 * Tous les réglages de la machine, au même endroit. Longueurs en millimètres (une bille de pachinko fait
 * 11 mm), vitesses en mm/s, durées en secondes.
 */

/** Le « 設定 » de la machine : la gravité. Valeurs de g en mm/s². */
export const PLANETS = [
  { id: 'lune', name: 'Lune', kanji: '月', g: 1620 },
  { id: 'mars', name: 'Mars', kanji: '火', g: 3721 },
  { id: 'terre', name: 'Terre', kanji: '地', g: 9807 },
  { id: 'jupiter', name: 'Jupiter', kanji: '木', g: 24790 },
] as const;

export type Planet = (typeof PLANETS)[number];
export type PlanetId = Planet['id'];
export const EARTH: Planet = PLANETS[2];
export const planetById = (id: string): Planet | undefined => PLANETS.find((p) => p.id === id);

export const CONFIG = {
  physics: {
    ballRadius: 5.5,
    /** Une bille ne parcourt jamais plus de… par sous-pas (pas de bille qui traverse un clou). */
    maxTravel: 1.6,
    maxSubsteps: 64,
    /** Frottement de l'air et de la vitre, par seconde. */
    drag: 0.06,
    /**
     * Une bille qui roule ne prend que 5/7 de la gravité le long de la pente : le reste fait tourner la
     * sphère pleine (son moment d'inertie vaut 2/5 m r²).
     */
    rolling: 5 / 7,
    /** En dessous de cette vitesse normale (mm/s), un contact est un appui, pas un choc. */
    restSpeed: 70,
    /** Résistance au roulement (mm/s²). */
    rollResistance: 70,
    /** Choc entre deux billes. */
    ballRestitution: 0.8,
  },

  materials: {
    nail: { e: 0.52, mu: 0.12 },
    rail: { e: 0.3, mu: 0.04 },
    plastic: { e: 0.38, mu: 0.15 },
    rubber: { e: 0.72, mu: 0.1 },
    stage: { e: 0.25, mu: 0.05 },
  },

  board: {
    /** Rayon du rail extérieur (sa surface intérieure). */
    outer: 212,
    /** Rayon du rail intérieur : le couloir de lancement fait 14 mm de large. */
    inner: 198,
    /** Le bout du rail intérieur, d'où la bille sort dans le plateau (en degrés). */
    tip: 205,
    /** Le bas du couloir : la bille y est frappée par le marteau. */
    launchAngle: 121,
    /** Le rail extérieur s'arrête au-dessus de l'アウト口 (en degrés, de `outerFrom` à `outerTo` + 360). */
    outerFrom: 113,
    outerTo: 77,
    innerFrom: 114,
    nailRadius: 0.9,
    /** Le cadre de l'écran (センター役物). */
    ornament: { x: 104, top: -108, shoulder: -86, bottom: 76 },
    /** La ヘソ (start chucker) et ses deux 命釘. */
    heso: { x: 0, y: 108, gap: 14.6 },
  },

  launcher: {
    /** 100 billes par minute : la limite légale au Japon. */
    interval: 0.6,
    /** Vitesse à fond de poignée (mm/s), assez pour passer par-dessus sur Jupiter. */
    vMax: 5400,
    /** Dispersion du marteau (écart type relatif). */
    jitter: 0.004,
  },

  stage: {
    /** Délai dans le tube de la ワープ. */
    warpDelay: 0.42,
    warpSpeed: 170,
    /** Probabilité par seconde de tomber à l'avant de la scène, plus élevée quand la bille ralentit. */
    dropRate: 0.55,
    dropRateSlow: 2.4,
    slowSpeed: 120,
    /** Tombée au centre : droit sur la ヘソ. */
    center: 7,
  },
} as const;
