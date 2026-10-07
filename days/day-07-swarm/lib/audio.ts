/**
 * Les sons du PC, en Web Audio : la cloche du tram (deux coups) pour les annonces, un bip grave pour les
 * alertes, un clic pour les commandes. Coupé par défaut ; le contexte n'est créé qu'au geste qui active le son.
 */
export class Bell {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private last = 0;
  enabled = false;

  async enable(): Promise<void> {
    this.enabled = true;
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.16;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume();
  }

  disable(): void {
    this.enabled = false;
  }

  setHidden(hidden: boolean): void {
    if (!this.ctx) return;
    if (hidden) void this.ctx.suspend();
    else if (this.enabled) void this.ctx.resume();
  }

  /** « Ding-ding » : deux coups de cloche, avec les partiels inharmoniques d'une petite cloche. */
  ding(): void {
    if (!this.ready(0.6)) return;
    this.strike(0, 1);
    this.strike(0.22, 0.8);
  }

  /** Alerte : deux notes descendantes, douces. */
  alert(): void {
    if (!this.ready(1.2)) return;
    this.tone(660, 0, 0.14, 0.5);
    this.tone(494, 0.16, 0.2, 0.5);
  }

  click(): void {
    if (!this.enabled || !this.ctx) return;
    this.tone(1800, 0, 0.025, 0.25);
  }

  /** Pas plus d'un son par `gap` secondes (les alertes arrivent parfois en rafale). */
  private ready(gap: number): boolean {
    if (!this.enabled || !this.ctx) return false;
    const now = this.ctx.currentTime;
    if (now - this.last < gap) return false;
    this.last = now;
    return true;
  }

  private strike(at: number, loud: number): void {
    for (const [ratio, gain, decay] of [
      [1, 1, 0.9],
      [2.76, 0.45, 0.45],
      [5.4, 0.2, 0.25],
    ]) {
      this.tone(1240 * ratio, at, decay, loud * gain);
    }
  }

  private tone(frequency: number, at: number, decay: number, loud: number): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = frequency;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(loud, t + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    osc.connect(gain).connect(this.master!);
    osc.start(t);
    osc.stop(t + decay + 0.05);
  }

  dispose(): void {
    void this.ctx?.close();
    this.ctx = null;
  }
}
