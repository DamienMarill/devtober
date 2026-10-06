import { Preset, findPreset } from './presets';
import { boundingBox, crop, encodeRle, parseRle } from './rle';
import { CONWAY, Rule, formatRule, parseRule, sameRule } from './rule';
import { StartId, isRandomStart, isStartId } from './seed';

/** Plafond de `cells` : au-delà, le dessin n'est pas mis dans l'adresse (le lien garde règle et semis). */
export const MAX_CELLS_PARAM = 1500;

/** Un dessin à la main : le corps RLE de ses cellules vivantes, posé en `(x, y)`. */
export interface Drawing {
  x: number;
  y: number;
  rle: string;
}

/** Ce que porte l'adresse : de quoi rejouer exactement la même boîte. */
export interface ShareState {
  rule: Rule;
  start: StartId;
  density: number;
  seed: number | null;
  drawing: Drawing | null;
}

export interface Options extends Partial<ShareState> {
  debug: boolean;
}

/** Semis et densité par défaut d'une règle : ceux de sa souche, ou une soupe à 35 % pour une règle perso. */
export function defaultsFor(rule: Rule): Pick<Preset, 'start' | 'density'> {
  return findPreset(rule) ?? { start: 'soup', density: 0.35 };
}

/** Lit `cells=x.y.<rle>` ; null si invalide. */
function parseDrawing(value: string | null): Drawing | null {
  const m = value && /^(\d{1,3})\.(\d{1,3})\.([0-9bo$!]+)$/.exec(value);
  if (!m || !parseRle(m[3])) return null;
  return { x: Number(m[1]), y: Number(m[2]), rle: m[3] };
}

/**
 * Lit l'adresse : `?rule=B36/S23&start=soup&density=0.4&seed=1234`, `cells=12.30.bo$2bo$3o!` pour un dessin,
 * et `?debug`. Les valeurs invalides sont ignorées ; ce qui manque garde sa valeur par défaut.
 */
export function parseOptions(search: string): Options {
  const params = new URLSearchParams(search);
  const options: Options = { debug: params.has('debug') };
  const rule = parseRule(params.get('rule') ?? '');
  if (rule) options.rule = rule;
  const start = params.get('start');
  if (start && isStartId(start)) options.start = start;
  const density = Number(params.get('density'));
  if (params.has('density') && Number.isFinite(density) && density > 0 && density <= 1) {
    options.density = density;
  }
  const seed = Number(params.get('seed'));
  if (params.has('seed') && Number.isInteger(seed) && seed >= 0) options.seed = seed;
  const drawing = parseDrawing(params.get('cells'));
  if (drawing) options.drawing = drawing;
  return options;
}

/**
 * Les paramètres d'adresse d'un état, sans ce qui vaut sa valeur par défaut (null = paramètre retiré) :
 * Conway avec son « TINY » donne une adresse nue. La graine n'est utile qu'aux semis au hasard, et un dessin
 * remplace le semis.
 */
export function toQueryParams(state: ShareState): Record<string, string | null> {
  const defaults = defaultsFor(state.rule);
  const random = isRandomStart(state.start);
  return {
    rule: sameRule(state.rule, CONWAY) ? null : formatRule(state.rule),
    start: state.drawing || state.start === defaults.start ? null : state.start,
    density:
      state.drawing || !random || state.density === defaults.density
        ? null
        : String(Math.round(state.density * 100) / 100),
    seed: state.drawing || !random || state.seed === null ? null : String(state.seed),
    cells: state.drawing ? `${state.drawing.x}.${state.drawing.y}.${state.drawing.rle}` : null,
  };
}

/** Le dessin d'une grille pour l'adresse, ou null s'il est vide ou trop long. */
export function drawingOf(cells: Uint8Array, width: number, height: number): Drawing | null {
  const box = boundingBox(cells, width, height);
  if (!box) return null;
  const rle = encodeRle(crop(cells, width, box));
  return rle.length > MAX_CELLS_PARAM ? null : { x: box.x, y: box.y, rle };
}
