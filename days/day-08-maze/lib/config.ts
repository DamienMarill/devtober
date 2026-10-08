/**
 * Tous les nombres du jeu, au même endroit (section « Paramètres réglables » du GDD). Temps en secondes réelles,
 * distances en pixels logiques de la scène 1280 × 720.
 */
export const CONFIG = {
  scene: { w: 1280, h: 720 },
  pile: {
    /** Au-delà, la pile s'effondre (unités d'épaisseur). */
    capacite: 12,
    danger: 9,
    reliquatMax: 4,
    /** Épaisseur d'un dossier selon son nombre de pièces : 1 à 3 → 1, 4 à 6 → 2, 7 et plus → 3. */
    epaisseurs: [3, 6] as const,
  },
  retours: {
    maxParDossier: 3,
    maxAbsurdesParDossier: 2,
    delai: [20, 60] as const,
    /** Au plus un retour absurde par tranche de… (seau à jetons). */
    seauAbsurde: 45,
    /** p_abs × … quand la pile dépasse la ligne de danger (Gérard part en pause café). */
    freinDanger: 0.5,
  },
  signature: {
    seuil: 0.7,
    seuilDemandeur: 0.4,
    seuilSpecimen: 0.65,
    longueurMin: 120,
    /** Part des points qui doivent tomber dans le cadre (à `marge` px près). */
    dansCadre: 0.8,
    marge: 8,
    /** Deux traits restent une même signature si le stylo quitte le papier moins de… */
    pauseMax: 1.5,
    /** Points du nuage $P. */
    points: 32,
    /**
     * Distance $P+ qui vaut une ressemblance nulle. Calibrée sur des signatures de synthèse déformées comme à la
     * souris (proportions écrasées de moitié, boucles inégales) : une même main reste sous 0,28 du meilleur des
     * trois spécimens, un zigzag, un trait, un gribouillis ou un cercle dépassent 0,41. Le seuil de 0,70 tombe à 0,345.
     */
    distanceNulle: 1.15,
  },
  paraphe: { longueurMin: 40 },
  tampon: {
    empreintesParEncrage: 3,
    tolerance: 12,
    toleranceRotation: 10,
    toleranceSuperposition: 6,
    /** Un ANNULÉ neutralise les empreintes antérieures dont le centre est à moins de… */
    rayonAnnule: 26,
    pasRotation: 15,
    reencrage: 0.5,
  },
  corbeille: { videeChaqueHeure: true },
  urgent: { probabilite: 0.15, delai: 60 },
  score: {
    pointsParLigne: 10,
    /** Bonus rapidité : transmis en moins de `parLigne` × lignes + `fixe` secondes après la prise en main. */
    rapidite: { bonus: 0.5, parLigne: 6, fixe: 6 },
    bonusUrgent: 1,
    penaliteR1: 0.5,
    penaliteReliquat: 100,
  },
  arrivees: {
    /** Multiplicateur du débit par tranche horaire (9-10, 10-12, 12-14, 14-16, 16-17). */
    courbe: [
      { de: 9, a: 10, x: 0.8 },
      { de: 10, a: 12, x: 1.0 },
      { de: 12, a: 14, x: 0.6 },
      { de: 14, a: 16, x: 1.2 },
      { de: 16, a: 17, x: 1.6 },
    ],
    jitter: [0.7, 1.3] as const,
  },
  journee: { debut: 9 * 60, fin: 17 * 60, grace: 10 },
  campagne: { avertissementsMax: 3 },
  /** Notes du relevé : part de l'objectif atteinte. */
  notes: [
    { note: 'A', min: 1.3 },
    { note: 'B', min: 1.1 },
    { note: 'C', min: 1.0 },
    { note: 'D', min: 0.8 },
    { note: 'E', min: 0 },
  ] as const,
} as const;

/** Les paramètres de chaque journée (section Équilibrage). */
export interface DayParams {
  numero: number;
  nom: string;
  titre: string;
  /** Date en jeu (la semaine du 5 octobre 2026). */
  date: string;
  duree: number;
  intervalle: number;
  lignes: readonly [number, number];
  pErr: { novice: number; expert: number };
  pAbs: number;
  fouillis: number;
  courrier: number;
  objectif: number;
}

export const DAYS: readonly DayParams[] = [
  {
    numero: 1,
    nom: 'Lundi',
    titre: 'Prise de poste',
    date: '05/10/2026',
    duree: 240,
    intervalle: 26,
    lignes: [2, 3],
    pErr: { novice: 0.15, expert: 0.05 },
    pAbs: 0,
    fouillis: 1,
    courrier: 0,
    objectif: 180,
  },
  {
    numero: 2,
    nom: 'Mardi',
    titre: 'Les Archives',
    date: '06/10/2026',
    duree: 270,
    intervalle: 30,
    lignes: [3, 4],
    pErr: { novice: 0.2, expert: 0.07 },
    pAbs: 0.1,
    fouillis: 1,
    courrier: 2,
    objectif: 300,
  },
];

/** Feuilles du fouillis des Archives avant les pièces utiles (× `fouillis` du jour). */
export const ARCHIVES_FOND = 15;
