export interface Options {
  /** `?debug` : images par seconde, incidence, poussée. */
  debug: boolean;
  /** `?auto` : le pilote automatique aux commandes dès l'ouverture. */
  auto: boolean;
  /** `?seed=42` : une autre turbulence (et d'autres bonbons). */
  seed: number;
}

/** Lit l'adresse ; les valeurs invalides sont ignorées. */
export function parseOptions(search: string): Options {
  const params = new URLSearchParams(search);
  const seed = Number(params.get('seed'));
  return {
    debug: params.has('debug'),
    auto: params.has('auto'),
    seed: params.has('seed') && Number.isInteger(seed) && seed >= 0 ? seed : 9,
  };
}
