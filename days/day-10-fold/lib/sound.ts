/**
 * Les sons du papier, synthétisés (aucun fichier) : un froissement filtré pendant qu'on plie, un « clac »
 * sec quand le pli est marqué, et un petit carillon pentatonique à la fin du modèle.
 */
export class PaperSound {
  private ctx: AudioContext | null = null;
  private noise: AudioBuffer | null = null;
  private rustleGain: GainNode | null = null;
  private rustleFilter: BiquadFilterNode | null = null;
  private master: GainNode | null = null;
  private muted = false;

  /** À appeler pendant un geste de l'utilisateur : les navigateurs n'ouvrent l'audio qu'à ce moment-là. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    this.master.connect(ctx.destination);

    // Une seconde de bruit blanc, rejouée en boucle ou par petits bouts.
    const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.noise = buffer;

    // Le froissement : du bruit en boucle, filtré, dont on ouvre le volume quand la feuille bouge.
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 2400;
    filter.Q.value = 0.7;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter).connect(gain).connect(this.master);
    src.start();
    this.rustleFilter = filter;
    this.rustleGain = gain;
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.master && this.ctx)
      this.master.gain.setTargetAtTime(muted ? 0 : 0.8, this.ctx.currentTime, 0.05);
  }

  /** Froissement continu : `amount` de 0 (immobile) à 1 (on plie vite). */
  rustle(amount: number) {
    if (!this.ctx || !this.rustleGain || !this.rustleFilter) return;
    const t = this.ctx.currentTime;
    const a = Math.min(1, Math.max(0, amount));
    this.rustleGain.gain.setTargetAtTime(a * 0.22, t, 0.04);
    this.rustleFilter.frequency.setTargetAtTime(1800 + a * 2600, t, 0.06);
  }

  /** Le pli qu'on écrase du doigt : un claquement bref et un souffle grave. */
  crease(strength = 1) {
    const ctx = this.ctx;
    if (!ctx || !this.noise || !this.master) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.9 + Math.random() * 0.2;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1400;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.5 * strength, t + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    src.connect(hp).connect(gain).connect(this.master);
    src.start(t, Math.random() * 0.8, 0.12);

    const thump = ctx.createOscillator();
    thump.frequency.setValueAtTime(140, t);
    thump.frequency.exponentialRampToValueAtTime(60, t + 0.08);
    const tg = ctx.createGain();
    tg.gain.setValueAtTime(0.18 * strength, t);
    tg.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    thump.connect(tg).connect(this.master);
    thump.start(t);
    thump.stop(t + 0.12);
  }

  /** L'obturateur : deux clics secs, le miroir qui se lève puis retombe. */
  shutter() {
    const ctx = this.ctx;
    if (!ctx || !this.noise || !this.master) return;
    for (const [at, gain] of [
      [0, 0.45],
      [0.07, 0.3],
    ] as const) {
      const t = ctx.currentTime + at;
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 3200;
      const g = ctx.createGain();
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.035);
      src.connect(bp).connect(g).connect(this.master);
      src.start(t, Math.random() * 0.8, 0.05);
    }
  }

  /** Le modèle est fini : quatre notes de la gamme pentatonique, comme un petit furin. */
  done() {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const notes = [659.25, 783.99, 987.77, 1318.51];
    notes.forEach((f, i) => {
      const t = ctx.currentTime + i * 0.11;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.12, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
      osc.connect(g).connect(this.master!);
      osc.start(t);
      osc.stop(t + 1.5);
    });
  }

  dispose() {
    void this.ctx?.close();
    this.ctx = null;
  }
}
