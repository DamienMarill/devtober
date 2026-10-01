import { Injectable, OnDestroy, signal } from '@angular/core';
import type { DeezerTrack } from './deezer';

/** 16 bins seulement : on veut une énergie globale, pas un spectre précis. */
const FFT_SIZE = 32;
/** Volume d'écoute, comme dans l'ancien lecteur. */
const OUTPUT_GAIN = 0.5;
/**
 * L'analyseur ne reçoit que 10 % du signal sortant : getByteFrequencyData
 * plafonne à −30 dB, un signal à pleine puissance saturerait en permanence sur
 * les morceaux qui tapent fort. C'est ce qui garde l'effet dynamique.
 */
const ANALYSER_GAIN = 0.1;

/**
 * Énergie moyenne (0..1) du spectre, sans le premier bin (continu) ni les 6
 * derniers (aigus, peu d'énergie) : la même fenêtre `slice(1, -6)` que l'ancien lecteur.
 */
export function averageEnergy(bins: ArrayLike<number>): number {
  const from = 1;
  const to = bins.length - 6;
  if (to <= from) return 0;
  let sum = 0;
  for (let i = from; i < to; i++) sum += bins[i];
  return sum / ((to - from) * 255);
}

/** Lecteur d'extraits + analyse du rythme, branchés sur un unique <audio>. */
@Injectable()
export class PulseAudio implements OnDestroy {
  /** Intensité du morceau, entre 0 et 1. */
  readonly level = signal(0);
  readonly playing = signal(false);
  readonly current = signal<DeezerTrack | null>(null);

  private readonly audio = new Audio();
  private ctx?: AudioContext;
  private analyser?: AnalyserNode;
  private bins?: Uint8Array<ArrayBuffer>;
  private frame = 0;

  constructor() {
    // Sans CORS accepté, createMediaElementSource renverrait du silence.
    this.audio.crossOrigin = 'anonymous';
    this.audio.addEventListener('play', () => this.playing.set(true));
    this.audio.addEventListener('pause', () => this.playing.set(false));
    this.audio.addEventListener('ended', () => this.stopLoop());
  }

  /** À appeler depuis un geste utilisateur (politique d'autoplay). */
  async play(track: DeezerTrack): Promise<void> {
    if (!track.preview) return;
    this.setupGraph();
    await this.ctx?.resume();
    this.current.set(track);
    this.audio.src = track.preview;
    await this.audio.play();
    this.startLoop();
  }

  async toggle(): Promise<void> {
    if (!this.current()) return;
    if (this.audio.paused) {
      await this.ctx?.resume();
      await this.audio.play();
      this.startLoop();
    } else {
      this.audio.pause();
      this.stopLoop();
    }
  }

  stop(): void {
    this.audio.pause();
    this.stopLoop();
    this.current.set(null);
  }

  ngOnDestroy(): void {
    this.audio.pause();
    this.audio.removeAttribute('src');
    cancelAnimationFrame(this.frame);
    void this.ctx?.close();
  }

  /** createMediaElementSource n'accepte qu'un appel par élément : on le fait une fois. */
  private setupGraph(): void {
    if (this.ctx) return;
    const ctx = (this.ctx = new AudioContext());
    const source = ctx.createMediaElementSource(this.audio);

    const output = ctx.createGain();
    output.gain.value = OUTPUT_GAIN;
    source.connect(output).connect(ctx.destination);

    // Branche d'analyse, atténuée, en dérivation : elle ne change rien au son.
    const analysisGain = ctx.createGain();
    analysisGain.gain.value = ANALYSER_GAIN;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = FFT_SIZE;
    this.bins = new Uint8Array(this.analyser.frequencyBinCount);
    output.connect(analysisGain).connect(this.analyser);
  }

  private startLoop(): void {
    cancelAnimationFrame(this.frame);
    const tick = () => {
      if (this.analyser && this.bins) {
        this.analyser.getByteFrequencyData(this.bins);
        this.level.set(averageEnergy(this.bins));
      }
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  private stopLoop(): void {
    cancelAnimationFrame(this.frame);
    this.level.set(0);
  }
}
