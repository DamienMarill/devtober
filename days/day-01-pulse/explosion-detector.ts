/** Passage où le morceau « explose », en secondes depuis le début de l'extrait. */
export interface Explosion {
  start: number;
  end: number;
}

export interface ExplosionOptions {
  /** Pas d'analyse (s). */
  windowS: number;
  /** Fenêtre « maintenant » (s) : le niveau juste après le changement. */
  shortS: number;
  /** Fenêtre « avant » (s) : l'ambiance à laquelle on compare. */
  longS: number;
  /** Poids de la richesse spectrale dans l'intensité : passer de 0 à 1 vaut autant de dB. */
  richnessWeightDb: number;
  /** Hausse minimale de l'intensité (≈ dB) pour parler d'explosion. */
  minRise: number;
  /** Richesse minimale (0..1) : une explosion est dense, un piano solo n'en est pas une. */
  minRichness: number;
  /**
   * Drops répétés : dans un morceau dense, un drop suit souvent un trou bref (un arrêt net de
   * quelques centaines de ms) que la moyenne des `longS` secondes, qui contient encore le passage
   * fort d'avant, ne voit pas. Après une première explosion, on cherche donc ces trous : une
   * fenêtre d'analyse au moins `holeDb` (≈ dB) sous la moyenne des `holeLookbackS` secondes
   * précédentes. 0 pour désactiver.
   */
  holeDb: number;
  holeLookbackS: number;
  /**
   * Un simple éclair après un trou n'est pas un drop répété : le retour doit se maintenir sur les
   * `holdS` secondes suivantes (niveau ≥ celui d'avant le trou − `holdLevelDb`, richesse moyenne
   * ≥ `holdMinRichness`).
   */
  holdS: number;
  holdLevelDb: number;
  holdMinRichness: number;
  /**
   * Une explosion ne s'arrête pas sur une coupure qui n'en est pas une. Un drop répété est rattaché
   * au passage précédent si l'écart est un simple trou (moins de `mergeShortGapS` secondes), ou si
   * ce qui les sépare reste à moins de `mergeGapDb` (≈ dB) sous le niveau de ce passage, et riche.
   */
  mergeShortGapS: number;
  mergeGapDb: number;
  /**
   * Extrait déjà « à fond » dès le début : sans historique, aucune hausse n'est visible. Si RIEN n'a
   * été trouvé et que l'extrait est, dans son ensemble, dense (richesse médiane ≥ `sustainMinRichness`)
   * et fort (volume médian ≥ `sustainMinLoudDb`, en dB RMS), les passages denses et forts de l'extrait
   * comptent comme explosion (volume ≥ médiane − `sustainLevelDb`). Un morceau sobre, lui, n'a rien à
   * détecter. `sustained: false` désactive ce repli.
   */
  sustained: boolean;
  sustainMinRichness: number;
  sustainMinLoudDb: number;
  sustainLevelDb: number;
  /** On sort de l'explosion quand l'intensité retombe sous (niveau d'avant + cette marge). */
  exitMargin: number;
  /** Durée minimale d'une explosion (s). */
  minDurationS: number;
  /** Les extraits sont fondus au début et à la fin : on ignore ces secondes-là. */
  edgeS: number;
}

export const DEFAULT_EXPLOSION_OPTIONS: ExplosionOptions = {
  windowS: 0.25,
  shortS: 0.75,
  longS: 4,
  richnessWeightDb: 12,
  minRise: 4,
  minRichness: 0.45,
  holeDb: 5,
  holeLookbackS: 1.5,
  holdS: 1.5,
  holdLevelDb: 3,
  holdMinRichness: 0.65,
  mergeShortGapS: 1,
  mergeGapDb: 5,
  sustained: true,
  sustainMinRichness: 0.4,
  sustainMinLoudDb: -18,
  sustainLevelDb: 4,
  exitMargin: 2,
  minDurationS: 1,
  edgeS: 1.5,
};

const FFT_SIZE = 4096;
/** Bande où se joue la richesse instrumentale (hors sub-graves et ultra-aigus). */
const RICH_LO_HZ = 100;
const RICH_HI_HZ = 8000;
/** Un bin compte comme « occupé » s'il est à moins de 35 dB du pic de la fenêtre. */
const OCCUPIED_DB = 35;

/** FFT complexe itérative (radix 2), en place. `re` et `im` ont une longueur en puissance de 2. */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const angle = (-2 * Math.PI) / len;
    const wr = Math.cos(angle);
    const wi = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const next = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = next;
      }
    }
  }
}

/**
 * Richesse spectrale (0..1) autour de `center` : part des bins de 100 Hz–8 kHz
 * qui sont « occupés ». Une note seule en occupe peu (fondamental et
 * harmoniques) ; un groupe complet ou un drop en occupe une grande partie.
 */
export function spectralRichness(samples: Float32Array, center: number, sampleRate: number): number {
  const re = new Float64Array(FFT_SIZE);
  const im = new Float64Array(FFT_SIZE);
  const from = Math.floor(center) - FFT_SIZE / 2;
  for (let i = 0; i < FFT_SIZE; i++) {
    const idx = from + i;
    const v = idx >= 0 && idx < samples.length ? samples[idx] : 0;
    re[i] = v * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / FFT_SIZE)); // fenêtre de Hann
  }
  fft(re, im);

  const hz = sampleRate / FFT_SIZE;
  const lo = Math.ceil(RICH_LO_HZ / hz);
  const hi = Math.min(FFT_SIZE / 2 - 1, Math.floor(RICH_HI_HZ / hz));
  let peak = 0;
  for (let k = lo; k <= hi; k++) peak = Math.max(peak, re[k] * re[k] + im[k] * im[k]);
  if (peak <= 0) return 0;
  const floor = peak * Math.pow(10, -OCCUPIED_DB / 10);
  let occupied = 0;
  for (let k = lo; k <= hi; k++) if (re[k] * re[k] + im[k] * im[k] >= floor) occupied++;
  return occupied / (hi - lo + 1);
}

/**
 * Intensité par pas, en dB-équivalent : le niveau sonore (RMS) auquel on ajoute
 * la richesse spectrale. Un passage qui devient à la fois plus fort et plus
 * dense monte vite ; un crescendo de piano solo, peu.
 */
export function intensityEnvelope(
  samples: Float32Array,
  sampleRate: number,
  windowS: number,
  richnessWeightDb: number,
): { intensity: number[]; richness: number[] } {
  const size = Math.max(1, Math.round(windowS * sampleRate));
  const intensity: number[] = [];
  const richness: number[] = [];
  for (let start = 0; start + size <= samples.length; start += size) {
    let power = 0;
    for (let i = start; i < start + size; i++) power += samples[i] * samples[i];
    const r = spectralRichness(samples, start + size / 2, sampleRate);
    richness.push(r);
    intensity.push(10 * Math.log10(power / size + 1e-12) + richnessWeightDb * r);
  }
  return { intensity, richness };
}

const mean = (values: number[], from: number, to: number): number => {
  let sum = 0;
  for (let i = from; i < to; i++) sum += values[i];
  return sum / (to - from);
};

/**
 * Cherche les passages où l'intensité grimpe nettement par rapport à l'ambiance
 * des secondes précédentes (refrain qui arrive, drop, crescendo) ET où le
 * spectre est riche, puis y reste. Il faut un peu d'historique avant
 * l'explosion : un extrait qui démarre déjà « à fond » n'en contient pas.
 *
 * Une seconde passe retrouve les drops *répétés* que la première rate (voir
 * `findRepeats`) ; elle ne modifie jamais ce que la première a trouvé.
 */
export function findExplosions(
  samples: Float32Array,
  sampleRate: number,
  options: Partial<ExplosionOptions> = {},
): Explosion[] {
  const o = { ...DEFAULT_EXPLOSION_OPTIONS, ...options };
  const { intensity, richness } = intensityEnvelope(samples, sampleRate, o.windowS, o.richnessWeightDb);
  const base = findRises(intensity, richness, o);
  if (base.length === 0) return o.sustained ? findSustained(intensity, richness, o) : base;
  if (o.holeDb <= 0) return base;
  const repeats = findRepeats(intensity, richness, o, base);
  return mergeRepeats(base, repeats, intensity, richness, o);
}

/**
 * Rattache chaque drop répété au passage qui le précède quand rien de vraiment calme ne les sépare.
 * Seuls les drops répétés sont concernés : les explosions de la première passe ne sont jamais
 * ni prolongées ni raccourcies, seulement rejointes par les suivantes.
 */
function mergeRepeats(
  base: readonly Explosion[],
  repeats: readonly Explosion[],
  intensity: number[],
  richness: number[],
  o: ExplosionOptions,
): Explosion[] {
  const frame = (seconds: number) => Math.round(seconds / o.windowS);
  const all = [
    ...base.map((e) => ({ ...e, repeat: false })),
    ...repeats.map((e) => ({ ...e, repeat: true })),
  ].sort((a, b) => a.start - b.start);

  const out: Explosion[] = [];
  for (const next of all) {
    const previous = out[out.length - 1];
    if (next.repeat && previous && stillLoud(previous, next.start)) {
      previous.end = Math.max(previous.end, next.end);
    } else {
      out.push({ start: next.start, end: next.end });
    }
  }
  return out;

  /** Vrai si l'écart entre la fin de `previous` et `until` reste fort et riche. */
  function stillLoud(previous: Explosion, until: number): boolean {
    const gapFrom = frame(previous.end);
    const gapTo = frame(until);
    if (gapTo <= gapFrom || until - previous.end <= o.mergeShortGapS) return true; // elles se touchent, ou simple trou
    const plateau = mean(intensity, frame(previous.start), gapFrom);
    return (
      mean(intensity, gapFrom, gapTo) >= plateau - o.mergeGapDb &&
      mean(richness, gapFrom, gapTo) >= o.holdMinRichness
    );
  }
}

const median = (values: number[]): number => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

/**
 * Repli : un extrait qui démarre dans le passage fort n'a aucune hausse à montrer. Si, dans son
 * ensemble, il est dense ET fort, ses passages denses et forts comptent comme explosion. Sinon (piano,
 * voix posée, cordes…), il n'y a rien à détecter et on ne détecte rien.
 */
function findSustained(intensity: number[], richness: number[], o: ExplosionOptions): Explosion[] {
  const edge = Math.round(o.edgeS / o.windowS);
  const short = Math.max(1, Math.round(o.shortS / o.windowS));
  const end = intensity.length - edge;
  if (end - edge < short) return [];

  // Le volume seul (sans la richesse, que `intensity` y ajoute).
  const loud = intensity.map((v, i) => v - o.richnessWeightDb * richness[i]);
  const medianLoud = median(loud.slice(edge, end));
  if (median(richness.slice(edge, end)) < o.sustainMinRichness || medianLoud < o.sustainMinLoudDb) return [];

  const strong: Explosion[] = [];
  let start = -1;
  for (let i = edge; i < end; i++) {
    const from = Math.max(0, i - short + 1);
    const ok = mean(richness, from, i + 1) >= o.minRichness && mean(loud, from, i + 1) >= medianLoud - o.sustainLevelDb;
    if (ok && start < 0) start = Math.max(edge, from);
    else if (!ok && start >= 0) {
      strong.push({ start: start * o.windowS, end: i * o.windowS });
      start = -1;
    }
  }
  if (start >= 0) strong.push({ start: start * o.windowS, end: end * o.windowS });

  // Un trou bref ne coupe pas une explosion ; une explosion trop courte n'en est pas une.
  const merged: Explosion[] = [];
  for (const e of strong) {
    const last = merged[merged.length - 1];
    if (last && e.start - last.end <= o.mergeShortGapS) last.end = e.end;
    else merged.push({ ...e });
  }
  return merged.filter((e) => e.end - e.start >= o.minDurationS);
}

/** Première passe : une hausse nette par rapport à la moyenne des `longS` dernières secondes. */
function findRises(intensity: number[], richness: number[], o: ExplosionOptions): Explosion[] {
  const short = Math.max(1, Math.round(o.shortS / o.windowS));
  const long = Math.max(2, Math.round(o.longS / o.windowS));
  const edge = Math.round(o.edgeS / o.windowS);
  const result: Explosion[] = [];

  let start = -1;
  let ambient = 0;
  for (let i = edge + long; i < intensity.length - edge; i++) {
    const from = Math.max(0, i - short + 1);
    const now = mean(intensity, from, i + 1);
    if (start < 0) {
      const before = mean(intensity, i - short - long + 1, i - short + 1);
      if (now - before >= o.minRise && mean(richness, from, i + 1) >= o.minRichness) {
        start = from;
        ambient = before;
      }
    } else if (now < ambient + o.exitMargin) {
      push(result, start, i, o);
      start = -1;
    }
  }
  if (start >= 0) push(result, start, intensity.length - edge, o);
  return result;
}

/**
 * Seconde passe : les drops répétés. Un trou net, puis un retour au même niveau qui TIENT (niveau et
 * richesse sur les `holdS` secondes suivantes) : c'est la signature d'un drop qui revient. On ne
 * cherche qu'APRÈS une première explosion et HORS des passages déjà trouvés, donc elle ne change
 * jamais ce que la première passe a trouvé. Chaque trou termine l'explosion en cours, pour que
 * chaque retour relance la sienne.
 */
function findRepeats(
  intensity: number[],
  richness: number[],
  o: ExplosionOptions,
  base: readonly Explosion[],
): Explosion[] {
  const lookback = Math.max(1, Math.round(o.holeLookbackS / o.windowS));
  const holdN = Math.max(1, Math.round(o.holdS / o.windowS));
  const edge = Math.round(o.edgeS / o.windowS);
  const inBase = (frame: number) => base.some((e) => frame * o.windowS >= e.start && frame * o.windowS < e.end);
  /** Niveau des `lookback` images avant `frame` : la référence d'un trou. */
  const levelBefore = (frame: number) => mean(intensity, frame - lookback, frame);
  const isHole = (frame: number) => intensity[frame] <= levelBefore(frame) - o.holeDb;

  const result: Explosion[] = [];
  let start = -1;
  for (let i = edge + lookback + 1; i < intensity.length - edge; i++) {
    if (inBase(i)) {
      if (start >= 0) push(result, start, i, o);
      start = -1;
      continue;
    }
    if (start >= 0 && isHole(i)) {
      push(result, start, i, o);
      start = -1;
    }
    // Retour juste après un trou : l'image précédente en est un, celle-ci n'en est plus un.
    if (start >= 0 || isHole(i) || !isHole(i - 1)) continue;
    const previous = result.length > 0 || base.some((e) => e.end <= i * o.windowS);
    if (!previous) continue;
    const to = Math.min(intensity.length, i + holdN);
    const reference = levelBefore(i - 1);
    if (mean(intensity, i, to) >= reference - o.holdLevelDb && mean(richness, i, to) >= o.holdMinRichness) {
      start = i;
    }
  }
  if (start >= 0) push(result, start, intensity.length - edge, o);
  return result;
}

function push(result: Explosion[], from: number, to: number, o: ExplosionOptions): void {
  const startS = from * o.windowS;
  const endS = to * o.windowS;
  if (endS - startS >= o.minDurationS) result.push({ start: startS, end: endS });
}

/** Indique si l'instant `t` (s) tombe dans un passage d'explosion. */
export function isExploding(explosions: readonly Explosion[], t: number): boolean {
  return explosions.some((e) => t >= e.start && t < e.end);
}
