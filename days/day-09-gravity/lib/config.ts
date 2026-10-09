/**
 * Tous les réglages du vol, au même endroit. Unités SI (m, s, kg, N, rad), sauf mention contraire.
 *
 * Le profil visé vient du guide utilisateur de l'ESA (chapitre « Parabolic Flights ») et du CNES : palier à
 * 6 000 m et 810 km/h, ressource de 20 s à 1,8 g, injection vers 7 500 m à 47° en montée et 650 km/h,
 * sommet vers 8 500 m à 390 km/h, sortie à −42°, une vingtaine de secondes d'apesanteur.
 *
 * Sourcé : surface alaire (219 m²), poussée des CF6-80C2 (≈ 2 × 236 kN), facteurs de charge limites
 * (+2,5 et −1 g, CS-25 / 14 CFR 25.337), hauteur de la zone d'expérience (2,3 m). Hypothèses réglées pour
 * retrouver le profil : la masse en cours de vol et la polaire (CD0, k), que Novespace ne publie pas.
 */

export const G0 = 9.80665;
export const DEG = Math.PI / 180;

export const CONFIG = {
  aircraft: {
    /**
     * Hypothèse : une masse à vide d'environ 80 t, une quarantaine de passagers et leurs expériences, et le
     * carburant restant (la masse maximale de l'avion est de 157 t).
     */
    mass: 110_000,
    /** Surface alaire de l'A310. */
    wingArea: 219,
    /** Pente de portance (par radian) et incidence de portance nulle. */
    clAlpha: 5.6,
    alpha0: -2 * DEG,
    /** Décrochage : au-delà, la portance s'effondre. */
    alphaStall: 13 * DEG,
    /** Polaire parabolique : CD = CD0 + k·CL². */
    cd0: 0.019,
    /** k = 1 / (π·A·e) : allongement A ≈ 8,8, coefficient d'Oswald e ≈ 0,86. */
    k: 0.042,
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

  /**
   * Le manche : la position s ∈ [−1, 1] commande l'incidence, autour de l'incidence de palier, par une loi
   * progressive gain·(linear·s + (1 − linear)·s³) : 1,8 g vers s = 0,3 à la vitesse de croisière, et le
   * décrochage en butée.
   */
  stick: {
    gain: 12.4 * DEG,
    linear: 0.35,
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
    /** Taux de descente (m/s) au-delà duquel il faut déjà être en train de redresser. */
    vsMin: -120,
    vMax: 250,
    vMin: 80,
    pitchMax: 60 * DEG,
    pitchMin: -55 * DEG,
  },

  /** Le palier de départ. */
  cruise: { altitude: 6000, speed: 810 / 3.6 },

  /** Ce que vise le pilote automatique (guide de l'ESA, CNES). */
  profile: {
    pullUpG: 1.8,
    /**
     * Pente de la trajectoire où l'on commence à relâcher : elle continue de monter pendant la transition,
     * et la chute libre commence vers 47-50°.
     */
    injectAt: 47 * DEG,
    pullOutAt: -42 * DEG,
    pullOutG: 1.8,
    /** Pause entre deux paraboles (2 minutes en vrai : ici, raccourcie). */
    pause: 9,
  },

  /** Seuils de la détection des phases et des annonces. */
  phases: {
    hyper: 1.45,
    /**
     * Sous ce facteur de charge, on est « en apesanteur » : en vol réel, le g résiduel oscille entre
     * −0,02 et +0,02 g, avec des pointes à ±0,05 g (guide ESA).
     */
    zero: 0.05,
    injection: 0.3,
  },

  /** Le pas fixe de la simulation. */
  dt: 1 / 120,
} as const;
