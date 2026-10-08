import type { Sfx } from './desk';

/**
 * Le son du guichet, synthétisé en Web Audio (aucun fichier) : l'impact sourd du tampon, le grattement du stylo
 * qui suit la vitesse du tracé, le « pshhht » du tube pneumatique, la sonnerie d'école, et en fond le
 * bourdonnement des néons sous la pluie. Le contexte n'est créé qu'au premier geste qui active le son.
 */
export class Guichet implements Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private scratch: { src: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode } | null =
    null;
  private ambience: AudioNode[] = [];
  enabled = false;

  async enable(): Promise<void> {
    this.enabled = true;
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 2;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.startAmbience();
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    this.master!.gain.setTargetAtTime(0.55, this.ctx.currentTime, 0.05);
  }

  disable(): void {
    this.enabled = false;
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
  }

  setHidden(hidden: boolean): void {
    if (!this.ctx) return;
    if (hidden) void this.ctx.suspend();
    else if (this.enabled) void this.ctx.resume();
  }

  dispose(): void {
    void this.ctx?.close();
    this.ctx = null;
  }

  private get on(): boolean {
    return this.enabled && this.ctx !== null && this.master !== null;
  }

  /** Une rafale de bruit filtré : la matière de presque tous les sons du bureau. */
  private burst(opts: {
    type: BiquadFilterType;
    freq: number;
    to?: number;
    q?: number;
    dur: number;
    gain: number;
    attack?: number;
    delay?: number;
  }): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + (opts.delay ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = opts.type;
    filter.frequency.setValueAtTime(opts.freq, t);
    if (opts.to) filter.frequency.exponentialRampToValueAtTime(opts.to, t + opts.dur);
    filter.Q.value = opts.q ?? 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(opts.gain, t + (opts.attack ?? 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur);
    src.connect(filter).connect(g).connect(this.master!);
    src.start(t, Math.random());
    src.stop(t + opts.dur + 0.05);
  }

  private tone(
    freq: number,
    dur: number,
    gain: number,
    type: OscillatorType = 'sine',
    to?: number,
    delay = 0,
  ): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master!);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  stamp(): void {
    if (!this.on) return;
    this.tone(120, 0.16, 0.9, 'sine', 55);
    this.burst({ type: 'lowpass', freq: 900, dur: 0.08, gain: 0.5 });
    this.burst({ type: 'bandpass', freq: 2400, q: 6, dur: 0.18, gain: 0.05, delay: 0.01 });
  }

  paper(): void {
    if (!this.on) return;
    this.burst({
      type: 'highpass',
      freq: 2500,
      dur: 0.12 + Math.random() * 0.08,
      gain: 0.16,
      attack: 0.02,
    });
  }

  slide(): void {
    if (!this.on) return;
    this.burst({
      type: 'bandpass',
      freq: 1400,
      to: 600,
      q: 0.7,
      dur: 0.45,
      gain: 0.22,
      attack: 0.08,
    });
    this.tone(90, 0.12, 0.4, 'sine', 60, 0.42);
  }

  /** Le grattement du stylo : un bruit continu dont le volume suit la vitesse du tracé. */
  pen(speed: number): void {
    if (!this.on) return;
    const ctx = this.ctx!;
    if (!this.scratch) {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 3200;
      filter.Q.value = 1.4;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(filter).connect(gain).connect(this.master!);
      src.start();
      this.scratch = { src, gain, filter };
    }
    const level = Math.min(0.22, speed / 4000);
    this.scratch.gain.gain.setTargetAtTime(level, ctx.currentTime, 0.02);
    this.scratch.filter.frequency.setTargetAtTime(
      2400 + Math.min(2400, speed),
      ctx.currentTime,
      0.05,
    );
  }

  penUp(): void {
    if (!this.scratch || !this.ctx) return;
    this.scratch.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.03);
  }

  tube(): void {
    if (!this.on) return;
    this.burst({ type: 'highpass', freq: 1800, to: 500, dur: 0.7, gain: 0.3, attack: 0.04 });
    this.tone(220, 0.08, 0.35, 'triangle', 140, 0.68);
    this.tone(160, 0.1, 0.4, 'sine', 90, 0.8);
  }

  thud(): void {
    if (!this.on) return;
    this.tone(85, 0.18, 0.55, 'sine', 50);
    this.burst({ type: 'lowpass', freq: 500, dur: 0.12, gain: 0.25 });
  }

  /** La sonnerie d'école de 12 h, 14 h et 17 h. */
  bell(): void {
    if (!this.on) return;
    for (let i = 0; i < 14; i++) {
      this.tone(1180, 0.07, 0.12, 'square', undefined, i * 0.075);
      this.tone(1770, 0.06, 0.05, 'square', undefined, i * 0.075 + 0.02);
    }
  }

  click(): void {
    if (!this.on) return;
    this.tone(1800, 0.025, 0.12, 'square');
  }

  key(): void {
    if (!this.on) return;
    this.burst({
      type: 'bandpass',
      freq: 3000 + Math.random() * 1500,
      q: 3,
      dur: 0.04,
      gain: 0.08,
    });
  }

  drawer(): void {
    if (!this.on) return;
    this.burst({ type: 'bandpass', freq: 600, to: 300, q: 2, dur: 0.5, gain: 0.3, attack: 0.05 });
    this.tone(70, 0.15, 0.5, 'sine', 45, 0.45);
  }

  reink(): void {
    if (!this.on) return;
    this.tone(160, 0.08, 0.3, 'sine', 120);
    this.tone(150, 0.08, 0.3, 'sine', 110, 0.18);
  }

  refuse(): void {
    if (!this.on) return;
    this.tone(180, 0.18, 0.18, 'sawtooth', 120);
  }

  chariot(): void {
    if (!this.on) return;
    for (let i = 0; i < 5; i++)
      this.burst({
        type: 'bandpass',
        freq: 2800 + i * 200,
        q: 12,
        dur: 0.15,
        gain: 0.07,
        delay: i * 0.22,
      });
  }

  /** Le fond : bourdonnement de néon (100 Hz et harmoniques) et pluie fine sur la cour. */
  private startAmbience(): void {
    const ctx = this.ctx!;
    const hum = ctx.createGain();
    hum.gain.value = 0.012;
    for (const [f, a] of [
      [100, 1],
      [200, 0.5],
      [300, 0.25],
    ] as const) {
      const osc = ctx.createOscillator();
      osc.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = a;
      osc.connect(g).connect(hum);
      osc.start();
      this.ambience.push(osc);
    }
    hum.connect(this.master!);
    const rain = ctx.createBufferSource();
    rain.buffer = this.noise;
    rain.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1600;
    const g = ctx.createGain();
    g.gain.value = 0.035;
    rain.connect(lp).connect(g).connect(this.master!);
    rain.start();
    this.ambience.push(rain);
  }

  /** L'avalanche de papier, puis le silence. */
  avalanche(): void {
    if (!this.on) return;
    for (let i = 0; i < 9; i++)
      this.burst({
        type: 'highpass',
        freq: 1500 + Math.random() * 2000,
        dur: 0.5,
        gain: 0.25,
        delay: i * 0.09,
        attack: 0.03,
      });
    this.tone(70, 0.9, 0.6, 'sine', 40);
  }
}
