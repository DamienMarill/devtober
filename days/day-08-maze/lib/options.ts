export interface Options {
  /** `?debug` : l'overlay F3 dès l'ouverture (et `window.day08` pour la console). */
  debug: boolean;
  /** `?seed=42` : une autre semaine, à l'identique. */
  seed: number | null;
  /** `?jour=2` : commencer directement au mardi (après le dépôt du spécimen s'il manque). */
  jour: number | null;
  /** `?zen` : la pile ne s'effondre jamais (aménagement de poste). */
  zen: boolean;
  /** `?large` : tolérances larges pour la signature et les tampons (trackpad). */
  large: boolean;
}

/** Lit l'adresse ; les valeurs invalides sont ignorées. */
export function parseOptions(search: string): Options {
  const params = new URLSearchParams(search);
  const seed = Number(params.get('seed'));
  const jour = Number(params.get('jour'));
  return {
    debug: params.has('debug'),
    seed: params.has('seed') && Number.isInteger(seed) && seed >= 0 ? seed : null,
    jour: Number.isInteger(jour) && jour >= 1 && jour <= 2 ? jour : null,
    zen: params.has('zen'),
    large: params.has('large'),
  };
}
