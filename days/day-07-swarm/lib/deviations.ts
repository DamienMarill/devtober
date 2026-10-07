/**
 * Les itinéraires bis connus. La TaM a fait passer la ligne 1 par Les Aubes et Pompignane, sur les voies de la 4,
 * entre Corum et Place de l'Europe (travaux du 30 mai au 24 juin 2022) : Comédie, Gare Saint-Roch, Du Guesclin,
 * Antigone et Léon Blum ne sont alors plus desservies par la 1. C'est la seule déviation documentée que j'ai
 * trouvée ; il suffit d'en ajouter une ligne ici pour en proposer d'autres.
 */
export interface DeviationData {
  id: string;
  line: number;
  /** Nom court affiché dans le panneau de la ligne. */
  label: string;
  /** Entrée et sortie de la déviation, et les stations empruntées entre les deux (de `from` vers `to`). */
  from: string;
  to: string;
  via: readonly string[];
  /** Ligne dont la voie est empruntée (pour le décalage à l'affichage). */
  borrow: number;
  /** Les tronçons empruntés sont plus lents (aiguillages, marche à vue sur la voie d'une autre ligne). */
  slow: number;
}

export const DEVIATIONS: readonly DeviationData[] = [
  {
    id: 'l1-pompignane',
    line: 1,
    label: 'via Pompignane',
    from: 'corum',
    to: 'place-de-l-europe',
    via: ['les-aubes', 'pompignane'],
    borrow: 4,
    slow: 1.6,
  },
];
