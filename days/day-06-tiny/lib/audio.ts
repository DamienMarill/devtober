import { CONFIG } from './config';

/**
 * Le buzzer piezo du jouet, en Web Audio : des bips carrés très courts, filtrés pour adoucir l'aigu. Les
 * naissances jouent une note de la gamme pentatonique (plus haute quand elles naissent en haut de l'écran,
 * à gauche ou à droite selon leur barycentre), au plus un bip tous les `CONFIG.piezo.gap` secondes.
 * Le contexte audio n'est créé qu'au premier geste qui active le son.
 */
export class Piezo {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private lastBlip = 0;
  enabled = false;

  /** Active le son (à appeler depuis un geste de l'utilisateur). */
  async enable(): Promise<void> {
    this.enabled = true;
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = CONFIG.piezo.volume;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume();
  }

  disable(): void {
    this.enabled = false;
  }

  /** Suspend le contexte quand l'onglet est caché. */
  setHidden(hidden: boolean): void {
    if (!this.ctx) return;
    if (hidden) void this.ctx.suspend();
    else if (this.enabled) void this.ctx.resume();
  }

  /** Le bip d'une génération : rien sans naissance ni trop tôt après le précédent. */
  generation(births: number, x: number, y: number): void {
    if (!this.enabled || !this.ctx || births === 0) return;
    const now = this.ctx.currentTime;
    if (now - this.lastBlip < CONFIG.piezo.gap) return;
    this.lastBlip = now;
    const scale = CONFIG.piezo.scale;
    const note = scale[Math.min(scale.length - 1, Math.floor((1 - y) * scale.length))];
    const loud = Math.min(1, 0.35 + Math.log10(1 + births) / 3);
    this.blip(CONFIG.piezo.base * Math.pow(2, note / 12), (x - 0.5) * 1.2, 0.03, loud);
  }

  /** Le clic d'un bouton. */
  click(): void {
    if (this.enabled) this.blip(CONFIG.piezo.base * 4, 0, 0.02, 0.6);
  }

  private blip(frequency: number, pan: number, duration: number, loud: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = frequency;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 3200;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(loud, t + 0.003);
    gain.gain.setTargetAtTime(0, t + duration * 0.6, duration * 0.25);
    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    osc.connect(filter).connect(gain).connect(panner).connect(this.master);
    osc.start(t);
    osc.stop(t + duration * 2.5);
  }

  dispose(): void {
    void this.ctx?.close();
    this.ctx = null;
  }
}
