/**
 * Tous les réglages du jour, au même endroit. Durées en secondes, couleurs en `[r, g, b]`.
 */
export const CONFIG = {
  /** Le monde : 120 × 90 = 10 800 cellules, quelle que soit la taille de l'écran (liens reproductibles). */
  grid: { width: 120, height: 90 },

  /** L'écran LCD : le monde, une ligne pointillée, puis le bandeau de texte (police 3 × 5 et ses marges). */
  lcd: {
    bandRows: 8,
    /** Temps de réponse des cristaux : ils s'allument vite et s'éteignent lentement (la rémanence). */
    rise: 0.012,
    fall: 0.085,
    /** Rémanence plus longue avec `prefers-reduced-motion` : moins de scintillement. */
    fallReduced: 0.2,
    /** Niveau des pixels éteints (on devine la matrice) et décalage de l'ombre portée, en part du pas. */
    unlit: 0.06,
    shadow: { offset: 0.16, alpha: 0.22 },
    /** Au-delà de ce pas (en pixels physiques), on laisse un interstice entre les pixels. */
    gapFrom: 4,
    /** Niveau d'encre d'un état d'agonie Generations : de `dying[0]` (juste mort) à `dying[1]` (presque éteint). */
    dying: [0.62, 0.08],
  },

  /** Les deux éclairages : rétroéclairage cyan (par défaut) et LCD réfléchissant gris-vert. */
  palettes: {
    backlight: { ink: [14, 10, 53], fade: [52, 64, 158] },
    reflective: { ink: [30, 36, 24], fade: [74, 88, 56] },
  },

  /** Vitesses (générations par seconde), touches 1 à 5. */
  speeds: [4, 8, 15, 30, 60],
  defaultSpeed: 2,
  reducedSpeed: 1,
  /** Pas plus de générations par image (onglet ralenti, vieux téléphone). */
  maxStepsPerFrame: 4,

  /** Pause avant de lancer un semis déterministe : le temps de lire « TINY », ou de voir le motif. */
  hold: { intro: 2, stamp: 0.5 },
  /** Durée d'affichage du nom de la souche dans le bandeau. */
  banner: 1.8,
  /** Rafraîchissement des icônes et des compteurs du DOM. */
  statusEvery: 0.1,

  /** La tournée de démo (touche T) : cinq souches, de quoi remplir les 30 s de la capture. */
  tour: {
    steps: ['conway', 'daynight', 'brain', 'maze', 'starwars'],
    duration: 6,
  },

  /** Les bips du piezo : gamme pentatonique, un bip au plus tous les `gap` s. */
  piezo: { base: 523.25, scale: [0, 2, 4, 7, 9, 12, 14, 16, 19, 21], gap: 0.12, volume: 0.05 },
} as const;
