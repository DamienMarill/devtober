export interface Options {
  debug: boolean;
  /** Density imposée au chargement (debug). */
  density: number | null;
  /** Graine des tirages ; sinon une nouvelle à chaque visite. */
  seed: number | null;
}

/** Lit `?debug`, `density=0.6` et `seed=42` ; les valeurs invalides sont ignorées. */
export function parseOptions(search: string): Options {
  const params = new URLSearchParams(search);
  const debug = params.has('debug');
  const density = Number(params.get('density'));
  const seed = Number(params.get('seed'));
  return {
    debug,
    density:
      debug && params.has('density') && Number.isFinite(density) && density >= 0 && density <= 1
        ? density
        : null,
    seed: params.has('seed') && Number.isInteger(seed) ? seed : null,
  };
}
