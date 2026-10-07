export interface Options {
  /** `?debug` : images par seconde, points, rames. */
  debug: boolean;
  /** `?seed=42` : une autre journée (la demande est tirée au hasard, mais à graine). */
  seed: number | null;
  /** `?start=17:30` : prendre le service plus tard (avance rapide au pilote automatique jusque-là). */
  start: number | null;
}

/** Lit l'adresse ; les valeurs invalides sont ignorées. */
export function parseOptions(search: string): Options {
  const params = new URLSearchParams(search);
  const seed = Number(params.get('seed'));
  const start = /^(\d{1,2})[:h](\d{2})$/.exec(params.get('start') ?? '');
  const minute = start ? Number(start[1]) * 60 + Number(start[2]) : NaN;
  return {
    debug: params.has('debug'),
    seed: params.has('seed') && Number.isInteger(seed) && seed >= 0 ? seed : null,
    start: minute >= 6 * 60 && minute < 24 * 60 ? minute : null,
  };
}
