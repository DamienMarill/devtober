import { Rule, formatRule, parseRule } from './rule';
import { StartId } from './seed';

/** Une souche : une règle connue, son nom, une phrase, et le semis qui la met en valeur. */
export interface Preset {
  id: string;
  name: string;
  /** Règle en notation canonique (vérifiée sur LifeWiki et dans Golly). */
  rule: string;
  blurb: string;
  start: StartId;
  /** Densité de la soupe ou de la goutte. */
  density: number;
}

export const PRESETS: readonly Preset[] = [
  {
    id: 'conway',
    name: 'Conway',
    rule: 'B3/S23',
    blurb: 'La règle d’origine (1970) : naître à 3 voisins, survivre à 2 ou 3.',
    start: 'tiny',
    density: 0.35,
  },
  {
    id: 'highlife',
    name: 'HighLife',
    rule: 'B36/S23',
    blurb:
      'Conway, plus une naissance à 6 : ce réplicateur de 12 cellules se recopie en diagonale.',
    start: 'replicator',
    density: 0.35,
  },
  {
    id: 'daynight',
    name: 'Day & Night',
    rule: 'B3678/S34678',
    blurb: 'Symétrique : échange les vivantes et les mortes, la règle reste la même.',
    start: 'soup',
    density: 0.5,
  },
  {
    id: 'maze',
    name: 'Labyrinthe',
    rule: 'B3/S12345',
    blurb: 'On survit presque toujours : une poignée de cellules cristallise en couloirs.',
    start: 'drop',
    density: 0.4,
  },
  {
    id: 'coral',
    name: 'Corail',
    rule: 'B3/S45678',
    blurb: 'Il faut être entouré pour tenir : ça pousse lentement, comme du corail.',
    start: 'drop',
    density: 0.5,
  },
  {
    id: 'lwod',
    name: 'Vie sans mort',
    rule: 'B3/S012345678',
    blurb: 'Personne ne meurt : 5 cellules s’étalent comme une tache d’encre.',
    start: 'rpentomino',
    density: 0.35,
  },
  {
    id: 'diamoeba',
    name: 'Diamoeba',
    rule: 'B35678/S5678',
    blurb: 'De grands losanges aux bords qui bouillonnent… et qui finissent par se dévorer.',
    start: 'soup',
    // Tout se joue au centième : à 0,5 les losanges remplissent tout l'écran, à 0,45 ils meurent vite.
    density: 0.48,
  },
  {
    id: 'anneal',
    name: 'Recuit',
    rule: 'B4678/S35678',
    blurb:
      'Un vote de majorité un peu tordu : les taches s’arrondissent comme dans une lampe à lave.',
    start: 'soup',
    density: 0.5,
  },
  {
    id: 'walled',
    name: 'Cités fortifiées',
    rule: 'B45678/S2345',
    blurb: 'Des foyers d’agitation qui se bâtissent des murailles.',
    start: 'soup',
    density: 0.45,
  },
  {
    id: 'gnarl',
    name: 'Gnarl',
    rule: 'B1/S1',
    blurb: 'Une seule cellule suffit : elle se ramifie en un motif sans fin.',
    start: 'cell',
    density: 0.35,
  },
  {
    id: 'serviettes',
    name: 'Serviettes',
    rule: 'B234/S',
    blurb: 'Un bloc de 4 cellules se déplie en tapis persans.',
    start: 'block',
    density: 0.35,
  },
  {
    id: 'brain',
    name: 'Brian’s Brain',
    rule: 'B2/S/C3',
    blurb: 'Prête, allumée, épuisée : presque tout devient vaisseau.',
    start: 'soup',
    density: 0.3,
  },
  {
    id: 'starwars',
    name: 'Star Wars',
    rule: 'B2/S345/C4',
    blurb: 'Des batailles spatiales entre vaisseaux et forteresses.',
    start: 'soup',
    density: 0.4,
  },
  {
    id: 'bloomerang',
    name: 'Bloomerang',
    rule: 'B34678/S234/C24',
    blurb: 'Une goutte qui s’ouvre en rosaces douces, sur 24 états.',
    start: 'drop',
    density: 0.5,
  },
  {
    id: 'fireworks',
    name: 'Feux d’artifice',
    rule: 'B13/S2/C21',
    blurb: 'Une étincelle qui retombe en gerbes, avec 19 états de traîne.',
    start: 'glider',
    density: 0.35,
  },
  {
    id: 'spirals',
    name: 'Spirales',
    rule: 'B234/S2/C5',
    blurb: 'Une soupe clairsemée qui s’enroule en spirales.',
    start: 'soup',
    density: 0.1,
  },
  {
    id: 'hexlife',
    name: 'Hexa Life',
    rule: 'B2/S34H',
    blurb: 'Six voisins au lieu de huit : un monde d’alvéoles et d’oscillateurs.',
    start: 'soup',
    density: 0.3,
  },
];

/** La souche par défaut (Conway, et le « TINY » de l'intro). */
export const DEFAULT_PRESET = PRESETS[0];

export function presetRule(preset: Preset): Rule {
  return parseRule(preset.rule)!;
}

export function presetById(id: string): Preset | undefined {
  return PRESETS.find((p) => p.id === id);
}

/** La souche qui a exactement cette règle, s'il y en a une. */
export function findPreset(rule: Rule): Preset | undefined {
  const text = formatRule(rule);
  return PRESETS.find((p) => p.rule === text);
}
