/**
 * Tous les réglages du vol, au même endroit. Unités SI (m, s, kg, N, rad), sauf mention contraire.
 *
 * L'avion ressemble à l'A310 Zero G de Novespace, mais ses coefficients sont des ordres de grandeur
 * plausibles (masse, polaire, poussée), pas des données constructeur. Le profil visé est celui que donne
 * le CNES : palier à 6 000 m et 830 km/h, ressource à 1,8 g, injection à 47°, sommet vers 8 500 m à
 * 400 km/h, sortie à −42°, une vingtaine de secondes d'apesanteur.
 */

export const G0 = 9.80665;
export const DEG = Math.PI / 180;

export const CONFIG = {
  aircraft: {
    /** En fin de vol, avec une quarantaine de passagers et le carburant restant. */
    mass: 118_000,
    /** Surface alaire de l'A310. */
    wingArea: 219,
    /** Pente de portance (par radian) et incidence de portance nulle. */
    clAlpha: 5.6,
    alpha0: -2 * DEG,
    /** Décrochage : au-delà, la portance s'effondre. */
    alphaStall: 13 * DEG,
    /** Polaire parabolique : CD = CD0 + k·CL². */
    cd0: 0.021,
    k: 0.045,
    /** Poussée maximale des deux réacteurs au niveau de la mer, et part au ralenti. */
    thrustMax: 2 * 236_000,
    idle: 0.04,
    /** Temps de réponse des réacteurs (s). */
    spool: 1.2,
    /** Temps de réponse de l'incidence au manche (oscillation d'incidence, très amortie). */
    alphaLag: 0.3,
    /** Écart type des rafales verticales (m/s) : un air calme. */
    turbulence: 0.35,
  },

  /** Le manche : la position s ∈ [−1, 1] commande l'incidence, autour de l'incidence de palier. */
  stick: {
    /** Incidence par unité de manche : de quoi tenir 1,8 g du début à la fin de la ressource. */
    gain: 6 * DEG,
    /** Vitesse du manche quand on garde le bouton appuyé : lente au début (les petites retouches), puis plus vive. */
    slow: 0.2,
    fast: 0.5,
    slowFor: 0.35,
  },

  /** Le domaine de vol : ce que le pilote de sécurité ne laisse pas dépasser. */
  envelope: {
    nMax: 2.5,
    nMin: -1,
    /** En dessous, ou au-delà, il reprend la main (vitesses en m/s, assiettes en radians). */
    hFloor: 5000,
    vMax: 250,
    vMin: 80,
    pitchMax: 60 * DEG,
    pitchMin: -55 * DEG,
  },

  /** Le palier de départ. */
  cruise: { altitude: 6000, speed: 830 / 3.6 },

  /** Ce que vise le pilote automatique (chiffres du CNES). */
  profile: {
    pullUpG: 1.8,
    /** Le nez monte à 45°, l'injection est faite à 47°. */
    injectAt: 45 * DEG,
    pullOutAt: -42 * DEG,
    pullOutG: 1.8,
    /** Pause entre deux paraboles (2 minutes en vrai : ici, raccourcie). */
    pause: 9,
  },

  /** Seuils de la détection des phases et des annonces. */
  phases: {
    hyper: 1.45,
    /** Sous ce facteur de charge, on est « en apesanteur » (les vols réels tiennent ±0,01 à 0,05 g). */
    zero: 0.05,
    injection: 0.3,
  },

  /** Le pas fixe de la simulation. */
  dt: 1 / 120,
} as const;
