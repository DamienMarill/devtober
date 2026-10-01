import {
  Hct,
  MaterialDynamicColors,
  QuantizerCelebi,
  SchemeTonalSpot,
  Score,
  TonalPalette,
  argbFromRgb,
  hexFromArgb,
} from '@material/material-color-utilities';

/** Rôles Material 3 qu'on expose (suffisant pour piloter l'UI du jukebox). */
export const THEME_ROLES = [
  'primary',
  'onPrimary',
  'primaryContainer',
  'onPrimaryContainer',
  'secondary',
  'secondaryContainer',
  'tertiary',
  'tertiaryContainer',
  'background',
  'surface',
  'surfaceContainer',
  'surfaceContainerHigh',
  'onSurface',
  'onSurfaceVariant',
  'outline',
] as const satisfies readonly (keyof MaterialDynamicColors)[];

export type ThemeRole = (typeof THEME_ROLES)[number];

/**
 * Fond de page : la teinte de la pochette, mais bien plus sombre que le
 * `background` Material (tonalité ≈ 6) pour que les effets visuels ressortent.
 * La chroma garde un soupçon de couleur malgré la faible luminosité.
 */
const BACKDROP_TONE = 2;
const BACKDROP_CHROMA = 7;

export interface CoverTheme {
  /** Couleurs candidates tirées de la pochette, de la plus adaptée à la moins adaptée. */
  candidates: string[];
  /** Couleur source retenue (la meilleure candidate). */
  source: string;
  /** Fond de page sombre à la teinte de la pochette. */
  backdrop: string;
  /** Rôles du thème sombre, en hexadécimal. */
  roles: Record<ThemeRole, string>;
}

/** Résolution de travail : la quantification n'a pas besoin de plus. */
const SAMPLE_SIZE = 128;
const MAX_COLORS = 128;
const FALLBACK = 0xff4285f4;

/**
 * Pixels RGBA → thème. Même chaîne que Material You sur Android :
 * quantification (Celebi), classement des couleurs adaptées à une UI (Score),
 * puis schéma TonalSpot (celui d'Android 12/13) en mode sombre.
 */
export function themeFromPixels(rgba: Uint8ClampedArray): CoverTheme {
  const pixels: number[] = [];
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] < 255) continue; // on ignore le transparent
    pixels.push(argbFromRgb(rgba[i], rgba[i + 1], rgba[i + 2]));
  }
  const ranked = Score.score(QuantizerCelebi.quantize(pixels, MAX_COLORS), {
    desired: 5,
    fallbackColorARGB: FALLBACK,
  });
  const source = ranked[0] ?? FALLBACK;
  const scheme = new SchemeTonalSpot(Hct.fromInt(source), true, 0);

  const roles = {} as Record<ThemeRole, string>;
  for (const role of THEME_ROLES) {
    roles[role] = hexFromArgb(scheme.colors[role]().getArgb(scheme));
  }
  const backdrop = TonalPalette.fromHueAndChroma(scheme.primaryPalette.hue, BACKDROP_CHROMA).tone(
    BACKDROP_TONE,
  );
  return {
    candidates: ranked.map(hexFromArgb),
    source: hexFromArgb(source),
    backdrop: hexFromArgb(backdrop),
    roles,
  };
}

/** Charge la pochette (CORS anonyme), la réduit sur un canvas, et en tire le thème. */
export async function themeFromCover(url: string, signal?: AbortSignal): Promise<CoverTheme> {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.decoding = 'async';
  await new Promise<void>((resolve, reject) => {
    const onAbort = () => reject(signal?.reason ?? new DOMException('Annulé', 'AbortError'));
    if (signal?.aborted) return onAbort();
    signal?.addEventListener('abort', onAbort, { once: true });
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Pochette illisible.'));
    img.src = url;
  });

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SAMPLE_SIZE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas indisponible.');
  ctx.drawImage(img, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
  return themeFromPixels(ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data);
}
