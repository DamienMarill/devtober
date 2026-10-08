import type { ServiceId } from '../lib/model';

/** Les services du CAUFD : la couleur de la chemise, un pictogramme (lisible sans la couleur) et un motif. */
export const SERVICES: Record<
  ServiceId,
  { nom: string; couleur: string; encre: string; picto: string }
> = {
  logement: { nom: 'Logement', couleur: '#A8C5B5', encre: '#2f4a3e', picto: '⌂' },
  etat_civil: { nom: 'État civil', couleur: '#E3CF7A', encre: '#5a4a12', picto: '✶' },
  credit: { nom: 'Crédit et Finances', couleur: '#A8473A', encre: '#f3e6dc', picto: '€' },
};
