/**
 * Ce qu'un événement prévu change à la demande (les imprévus, eux, sont dans `incidents.ts`).
 */
export type Effect =
  /** Destinations plus courues : coefficient multiplicateur par station. */
  | { kind: 'attract'; boost: Readonly<Record<string, number>> }
  /** Une foule à évacuer : `riders` points répartis sur la fenêtre, depuis ces stations (part de chacune). */
  | { kind: 'surge'; from: Readonly<Record<string, number>>; riders: number };

export interface ScenarioEvent {
  id: string;
  /** Début et fin de l'effet, en minutes depuis minuit. */
  at: number;
  until: number;
  /** Annonce dans le fil, en minutes avant `at` (0 : au moment même, sans prévenir). */
  lead: number;
  /** Étiquette courte (bandeau, bilan). */
  title: string;
  /** Message d'annonce, au ton du PC. */
  text: string;
  /** Message de fin (facultatif). */
  done?: string;
  effect: Effect;
}

const hm = (h: number, m = 0) => h * 60 + m;

/**
 * Un mercredi d'octobre au PC tram : ce qui est prévu. Les lieux et les horaires des lignes sont réels, les
 * événements sont inventés (mais plausibles). Le soir, c'est match ou concert, tiré au sort à chaque partie.
 */
export const WEDNESDAY: readonly ScenarioEvent[] = [
  {
    id: 'amphis',
    at: hm(7, 40),
    until: hm(9, 30),
    lead: 40,
    title: 'Rentrée des amphis',
    text: '8 h : premiers cours à Paul-Valéry et à Triolet. Grosse affluence attendue sur la 1 et la 5.',
    effect: {
      kind: 'attract',
      boost: {
        'universite-paul-valery': 3,
        'universite-montpellier-triolet': 3,
        'saint-eloi': 2,
        'pole-chimie-balard': 2,
      },
    },
  },
  {
    id: 'mercredi',
    at: hm(13, 30),
    until: hm(17, 0),
    lead: 30,
    title: 'Mercredi après-midi',
    text: 'Mercredi après-midi : centres de loisirs au zoo de Lunaret (ligne 5), cinéma et aquarium à Odysseum (ligne 1).',
    effect: { kind: 'attract', boost: { 'cnrs-zoo-de-lunaret': 6, odysseum: 2.5 } },
  },
  {
    id: 'match-aller',
    at: hm(18, 30),
    until: hm(19, 55),
    lead: 25,
    title: 'Match à la Mosson',
    text: 'Match à 20 h au stade de la Mosson : ouverture des portes à 18 h 30. Lignes 1 et 3 très chargées vers la Mosson.',
    effect: { kind: 'attract', boost: { 'stade-de-la-mosson': 22, mosson: 6 } },
  },
  {
    id: 'concert-aller',
    at: hm(19, 0),
    until: hm(20, 20),
    lead: 30,
    title: 'Concert à l’Arena',
    text: 'Concert à 20 h 30 à la Sud de France Arena : affluence vers Parc Expo (branche Pérols de la 3).',
    effect: { kind: 'attract', boost: { 'parc-expo': 26 } },
  },
  {
    id: 'match-retour',
    at: hm(21, 50),
    until: hm(22, 25),
    lead: 40,
    title: 'Fin du match',
    text: 'Coup de sifflet final vers 21 h 50 : environ 3 000 supporters reprendront le tram à la Mosson (lignes 1 et 3).',
    effect: { kind: 'surge', from: { 'stade-de-la-mosson': 0.6, mosson: 0.4 }, riders: 300 },
  },
  {
    id: 'concert-retour',
    at: hm(23, 5),
    until: hm(23, 35),
    lead: 40,
    title: 'Fin du concert',
    text: 'Fin du concert vers 23 h : environ 1 000 spectateurs repartiront en tram de Parc Expo. Il faudra des rames sur la branche Pérols.',
    effect: { kind: 'surge', from: { 'parc-expo': 1 }, riders: 100 },
  },
];

export type Evening = 'match' | 'concert';

/** La journée prévue avec l'événement du soir choisi (le match ou le concert, pas les deux). */
export function dayEvents(evening: Evening): ScenarioEvent[] {
  const other = evening === 'match' ? 'concert' : 'match';
  return WEDNESDAY.filter((e) => !e.id.startsWith(other));
}
