/**
 * Le son de la cabine, synthétisé en Web Audio (aucun fichier) : le grondement des réacteurs, qui suit la
 * poussée, le souffle de l'air sur le fuselage, qui suit la pression dynamique, et un carillon à chaque
 * annonce. Les annonces elles-mêmes sont dites par la synthèse vocale du navigateur, en anglais comme à
 * bord. Le contexte n'est créé qu'au premier geste qui active le son.
 */

export type Announce = 'pull-up' | 'injection' | 'pull-out';

const WORDS: Record<Announce, string> = {
  'pull-up': 'Pull up',
  injection: 'Injection',
  'pull-out': 'Pull out',
};

export class CabinSound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private engine: { gain: GainNode; filter: BiquadFilterNode; hum: OscillatorNode } | null = null;
  private wind: { gain: GainNode; filter: BiquadFilterNode } | null = null;
  enabled = false;

  async enable(): Promise<void> {
    this.enabled = true;
    if (!this.ctx) {
      const ctx = new AudioContext();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = 0;
      this.master.connect(ctx.destination);
      const len = ctx.sampleRate * 2;
      const noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noise.getChannelData(0);
      // Bruit brun : plus de graves que de blanc, comme un réacteur entendu à travers la carlingue.
      let last = 0;
      for (let i = 0; i < len; i++) {
        last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
        data[i] = last * 3.5;
      }
      const source = () => {
        const s = ctx.createBufferSource();
        s.buffer = noise;
        s.loop = true;
        s.start(0, Math.random() * 2);
        return s;
      };
      const eGain = ctx.createGain();
      const eFilter = ctx.createBiquadFilter();
      eFilter.type = 'lowpass';
      eFilter.frequency.value = 300;
      const hum = ctx.createOscillator();
      hum.type = 'sawtooth';
      hum.frequency.value = 68;
      const humGain = ctx.createGain();
      humGain.gain.value = 0.05;
      source().connect(eFilter);
      hum.connect(humGain).connect(eFilter);
      hum.start();
      eFilter.connect(eGain).connect(this.master);
      this.engine = { gain: eGain, filter: eFilter, hum };

      const wGain = ctx.createGain();
      const wFilter = ctx.createBiquadFilter();
      wFilter.type = 'bandpass';
      wFilter.Q.value = 0.6;
      source().connect(wFilter).connect(wGain).connect(this.master);
      this.wind = { gain: wGain, filter: wFilter };
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    this.master!.gain.setTargetAtTime(0.5, this.ctx.currentTime, 0.2);
  }

  disable(): void {
    this.enabled = false;
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
    speechSynthesis?.cancel();
  }

  setHidden(hidden: boolean): void {
    if (!this.ctx) return;
    if (hidden) void this.ctx.suspend();
    else if (this.enabled) void this.ctx.resume();
  }

  dispose(): void {
    speechSynthesis?.cancel();
    void this.ctx?.close();
    this.ctx = null;
  }

  /** `thrust` de 0 à 1 (part de la poussée maximale), `q` la pression dynamique (Pa). */
  update(thrust: number, q: number): void {
    if (!this.enabled || !this.ctx || !this.engine || !this.wind) return;
    const t = this.ctx.currentTime;
    this.engine.gain.gain.setTargetAtTime(0.25 + thrust * 0.75, t, 0.3);
    this.engine.filter.frequency.setTargetAtTime(180 + thrust * 520, t, 0.3);
    this.engine.hum.frequency.setTargetAtTime(52 + thrust * 40, t, 0.3);
    const wind = Math.min(1, q / 18_000);
    this.wind.gain.gain.setTargetAtTime(0.05 + wind * 0.5, t, 0.3);
    this.wind.filter.frequency.setTargetAtTime(500 + wind * 1400, t, 0.3);
  }

  announce(kind: Announce): void {
    if (!this.enabled || !this.ctx || !this.master) return;
    // Deux notes de carillon de cabine.
    const t = this.ctx.currentTime;
    [880, 660].forEach((f, i) => {
      const o = this.ctx!.createOscillator();
      const g = this.ctx!.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0, t + i * 0.18);
      g.gain.linearRampToValueAtTime(0.25, t + i * 0.18 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.18 + 0.9);
      o.connect(g).connect(this.master!);
      o.start(t + i * 0.18);
      o.stop(t + i * 0.18 + 1);
    });
    if (typeof speechSynthesis === 'undefined') return;
    const u = new SpeechSynthesisUtterance(WORDS[kind]);
    u.lang = 'en-GB';
    u.rate = 1.05;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  }
}
