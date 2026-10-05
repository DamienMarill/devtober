import { CONFIG } from './config';
import type { Field } from './field';
import type { Glow } from './glows';
import { ramp, smoothstep } from './math';

const A = CONFIG.audio;

interface Voice {
  oscs: OscillatorNode[];
  gain: GainNode;
  pan: StereoPannerNode;
}

/**
 * Synthèse entièrement procédurale : turbulence (bruit brun filtré), drone (deux paires d'oscillateurs
 * désaccordées de 2 Hz : le beat), highTone, une voix par glow, un accord qui s'ouvre au contact et une
 * quarte brève qui reste en suspens. Tous les nœuds sont créés une fois ; la boucle ne fait que
 * déplacer des cibles (`setTargetAtTime`).
 */
export class Sound {
  private ctx?: AudioContext;
  private disposed = false;
  private hidden = false;

  private master!: GainNode;
  private lowpass!: BiquadFilterNode;
  private turbulence!: GainNode;
  private turbulenceFilter!: BiquadFilterNode;
  private drone!: GainNode;
  private highTone!: GainNode;
  private voices: Voice[] = [];
  private bloom!: Voice;
  private inertVoice!: Voice;

  get running(): boolean {
    return this.ctx?.state === 'running';
  }

  /** À appeler depuis un geste (règle d'autoplay des navigateurs) : le son entre en fondu. */
  async start(): Promise<void> {
    if (this.disposed || this.ctx) return;
    this.build();
    const ctx = this.ctx!;
    try {
      await ctx.resume();
    } catch {
      return;
    }
    if (this.disposed) {
      void ctx.close();
      return;
    }
    this.master.gain.setTargetAtTime(this.hidden ? 0 : A.volume, ctx.currentTime, A.fadeIn);
  }

  setHidden(hidden: boolean): void {
    this.hidden = hidden;
    const ctx = this.ctx;
    if (!ctx) return;
    this.master.gain.setTargetAtTime(hidden ? 0 : A.volume, ctx.currentTime, hidden ? 0.3 : 1);
  }

  /** Recopie l'état du monde dans les paramètres audio (appelé ~20 fois par seconde). */
  update(field: Field): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const tau = A.smoothing;
    const d = field.density.audio;
    const clearing = field.density.clearingAudio;

    const cutoff = ramp(A.lowpass, smoothstep(0, 1, d)) * (1 + (A.lowpassClearing - 1) * clearing);
    this.lowpass.frequency.setTargetAtTime(Math.min(16000, cutoff), now, tau);

    const swell = 1 + field.pulse * field.params.pulseAmount * 2;
    this.turbulence.gain.setTargetAtTime(ramp(A.turbulence.gain, d) * swell, now, tau);
    this.turbulenceFilter.frequency.setTargetAtTime(ramp(A.turbulence.cutoff, d), now, tau);

    const drone = ramp(A.drone.gain, d, A.drone.window) * (1 - A.drone.clearingCut * clearing);
    this.drone.gain.setTargetAtTime(drone, now, tau);
    this.highTone.gain.setTargetAtTime(ramp(A.highTone.gain, d, A.highTone.window), now, tau * 4);

    const glows = field.glows.pool;
    for (let i = 0; i < this.voices.length; i++) {
      const v = this.voices[i];
      const g = glows[i];
      const level = g.active && g.phase !== 'bloom' && g.phase !== 'extinguish' ? g.alpha : 0;
      const gain = level * (0.35 + 0.65 * g.proximity) * A.voices.gain;
      v.gain.gain.setTargetAtTime(gain, now, 0.25);
      if (g.active) {
        v.pan.pan.setTargetAtTime(g.pan * 0.7, now, 0.3);
        this.tune(v, A.voices.notes[g.note], now);
      }
    }
    this.bloom.gain.gain.setTargetAtTime(clearing * A.bloom.gain, now, 0.2);
  }

  /** Contact d'un glow inert : la note et sa quarte, brèves, sans résolution. */
  inert(g: Glow): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const f = A.voices.notes[g.note];
    this.inertVoice.oscs[0].frequency.setValueAtTime(f, now);
    this.inertVoice.oscs[1].frequency.setValueAtTime(f * A.inert.interval, now);
    this.inertVoice.pan.pan.setValueAtTime(g.pan * 0.7, now);
    const gain = this.inertVoice.gain.gain;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(gain.value, now);
    gain.linearRampToValueAtTime(A.inert.gain, now + 0.03);
    gain.setTargetAtTime(0, now + 0.06, A.inert.decay / 4);
  }

  /** Contact d'un glow coherent : l'accord prend la note du glow (son gain suit le clearing). */
  bloomFrom(g: Glow): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const f = A.voices.notes[g.note] / 2;
    const now = ctx.currentTime;
    const ratios = [1, 1.5, 2, 3];
    this.bloom.oscs.forEach((o, i) => o.frequency.setTargetAtTime(f * ratios[i], now, 0.05));
  }

  dispose(): void {
    this.disposed = true;
    void this.ctx?.close();
    this.ctx = undefined;
  }

  private tune(v: Voice, f: number, now: number): void {
    v.oscs[0].frequency.setTargetAtTime(f, now, 0.05);
    v.oscs[1].frequency.setTargetAtTime(f * A.voices.detune, now, 0.05);
  }

  private build(): void {
    const ctx = new AudioContext();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(ctx.destination);
    this.lowpass = ctx.createBiquadFilter();
    this.lowpass.type = 'lowpass';
    this.lowpass.frequency.value = A.lowpass[0];
    this.lowpass.Q.value = 0.5;
    this.lowpass.connect(this.master);

    // Bruit brun : intégration d'un bruit blanc avec une légère fuite, en boucle.
    const length = ctx.sampleRate * 6;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      data[i] = last * 3.5;
    }
    // Raccord de boucle : fondu sur les derniers échantillons vers le premier.
    const seam = Math.floor(ctx.sampleRate * 0.05);
    for (let i = 0; i < seam; i++) {
      const t = i / seam;
      data[length - seam + i] = data[length - seam + i] * (1 - t) + data[i] * t;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    this.turbulenceFilter = ctx.createBiquadFilter();
    this.turbulenceFilter.type = 'lowpass';
    this.turbulenceFilter.frequency.value = A.turbulence.cutoff[0];
    this.turbulence = ctx.createGain();
    this.turbulence.gain.value = 0;
    noise.connect(this.turbulenceFilter).connect(this.turbulence).connect(this.lowpass);
    noise.start();

    this.drone = ctx.createGain();
    this.drone.gain.value = 0;
    this.drone.connect(this.lowpass);
    A.drone.freqs.forEach((f, i) => {
      const osc = ctx.createOscillator();
      osc.type = i < 2 ? 'sine' : 'triangle';
      osc.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = i < 2 ? 0.5 : 0.5 * A.drone.harmonicShare;
      osc.connect(g).connect(this.drone);
      osc.start();
    });

    // Le highTone contourne le lowpass général : il reste perceptible quand tout le reste se ferme.
    const high = ctx.createOscillator();
    high.frequency.value = A.highTone.freq;
    this.highTone = ctx.createGain();
    this.highTone.gain.value = 0;
    high.connect(this.highTone).connect(this.master);
    high.start();

    const voice = (types: OscillatorType[], frequency: number): Voice => {
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const pan = ctx.createStereoPanner();
      gain.connect(pan).connect(this.lowpass);
      const oscs = types.map((type) => {
        const osc = ctx.createOscillator();
        osc.type = type;
        osc.frequency.value = frequency;
        const share = ctx.createGain();
        share.gain.value = 1 / types.length;
        osc.connect(share).connect(gain);
        osc.start();
        return osc;
      });
      return { oscs, gain, pan };
    };
    this.voices = Array.from({ length: CONFIG.glows.pool }, () =>
      voice(['sine', 'sine'], A.voices.notes[0]),
    );
    this.bloom = voice(['sine', 'sine', 'triangle', 'sine'], A.voices.notes[0] / 2);
    this.inertVoice = voice(['triangle', 'sine'], A.voices.notes[0]);
  }
}
