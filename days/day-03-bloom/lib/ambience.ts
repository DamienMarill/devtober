import { Conditions } from './weather';

/**
 * L'ambiance sonore, entièrement synthétisée (aucun fichier) : du bruit blanc filtré. La rivière est un
 * grondement grave et constant, le vent un souffle qui suit les rafales, la pluie un crépitement aigu, le
 * tonnerre une salve grave qui roule après l'éclair.
 */

export interface Levels {
  river: number;
  wind: number;
  /** Fréquence centrale du souffle (Hz) : plus aiguë quand ça souffle fort. */
  windTone: number;
  /** Côté d'où vient le vent dans le casque (-1 gauche, 1 droite). */
  windPan: number;
  rain: number;
}

/** Les volumes pour une météo et un vent instantané (m/s) donnés. */
export function levels(c: Conditions, wind: number, gust: number, windX: number): Levels {
  const w = Math.min(1, Math.max(0, (wind - 0.4) / 12)) ** 1.1;
  const falling =
    c.precip === 'rain' ? 1 : c.precip === 'drizzle' ? 0.45 : c.precip === 'snow' ? 0.08 : 0;
  return {
    river: 0.12,
    wind: 0.55 * w,
    windTone: 260 + wind * 30 + gust * 260,
    // Le vent qui va vers la droite vient de la gauche.
    windPan: Math.max(-0.6, Math.min(0.6, -windX / 10)),
    rain: Math.min(0.7, falling * (0.15 + 0.55 * c.intensity)),
  };
}

const SMOOTH = 0.6;
/** Volume général (0–1) : tout passe par lui, tonnerre compris. */
const VOLUME = 0.3;

export class Ambience {
  private ctx?: AudioContext;
  private master?: GainNode;
  private noise?: AudioBuffer;
  private river?: GainNode;
  private wind?: { gain: GainNode; filter: BiquadFilterNode; pan: StereoPannerNode };
  private rain?: GainNode;

  get running(): boolean {
    return this.ctx?.state === 'running';
  }

  /** À appeler depuis un geste de l'utilisateur (règle d'autoplay des navigateurs). */
  async start(): Promise<void> {
    if (!this.ctx) this.build();
    await this.ctx!.resume();
    this.master!.gain.setTargetAtTime(VOLUME, this.ctx!.currentTime, 0.8);
  }

  stop(): void {
    if (!this.ctx) return;
    this.master!.gain.setTargetAtTime(0, this.ctx.currentTime, 0.25);
    const ctx = this.ctx;
    setTimeout(() => void ctx.suspend(), 900);
  }

  set(l: Levels): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    this.river!.gain.setTargetAtTime(l.river, t, SMOOTH);
    this.wind!.gain.gain.setTargetAtTime(l.wind, t, SMOOTH);
    this.wind!.filter.frequency.setTargetAtTime(l.windTone, t, SMOOTH);
    this.wind!.pan.pan.setTargetAtTime(l.windPan, t, 2);
    this.rain!.gain.setTargetAtTime(l.rain, t, SMOOTH);
  }

  /** Un coup de tonnerre, `delay` secondes après l'éclair (le son va moins vite que la lumière). */
  thunder(delay: number, strength = 1): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || !this.noise) return;
    const t = ctx.currentTime + delay;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(420, t);
    filter.frequency.exponentialRampToValueAtTime(70, t + 4);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.9 * strength, t + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.35 * strength, t + 0.9);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 5.5);
    source.connect(filter).connect(gain).connect(this.master!);
    source.start(t, Math.random() * 2);
    source.stop(t + 6);
  }

  dispose(): void {
    void this.ctx?.close();
    this.ctx = undefined;
  }

  private build(): void {
    const ctx = new AudioContext();
    this.ctx = ctx;
    const length = ctx.sampleRate * 4;
    const noise = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    this.noise = noise;

    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(ctx.destination);

    const loop = (offset: number) => {
      const s = ctx.createBufferSource();
      s.buffer = noise;
      s.loop = true;
      s.start(0, offset);
      return s;
    };
    const filter = (type: BiquadFilterType, frequency: number, q = 0.7) => {
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = frequency;
      f.Q.value = q;
      return f;
    };

    // Rivière : grave et sourde.
    this.river = ctx.createGain();
    this.river.gain.value = 0;
    loop(0)
      .connect(filter('lowpass', 380))
      .connect(filter('lowpass', 520))
      .connect(this.river)
      .connect(this.master);

    // Vent : un souffle en bande étroite, qui se déplace avec les rafales.
    const windFilter = filter('bandpass', 400, 1.4);
    const windGain = ctx.createGain();
    windGain.gain.value = 0;
    const pan = ctx.createStereoPanner();
    loop(1.3).connect(windFilter).connect(windGain).connect(pan).connect(this.master);
    this.wind = { gain: windGain, filter: windFilter, pan };

    // Pluie : crépitement aigu.
    this.rain = ctx.createGain();
    this.rain.gain.value = 0;
    loop(2.6)
      .connect(filter('highpass', 1400))
      .connect(filter('lowpass', 7500))
      .connect(this.rain)
      .connect(this.master);
  }
}
