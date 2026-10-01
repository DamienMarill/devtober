import { Injectable, OnDestroy, signal } from '@angular/core';
import type { DeezerTrack } from './deezer';
import {
  KICK_OPTIONS,
  OnsetDetector,
  PERCUSSION_OPTIONS,
  PERCUSSION_WEIGHT,
  bandEnergy,
  percussionStrength,
} from './onset-detector';

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
 * Un analyseur par canal stéréo (gauche, droite) pour les attaques (grosses caisses
 * et percussions) : fenêtre longue pour résoudre les graves
 * (~43 Hz par bin), pas de lissage (on veut les attaques) et une plage de dB
 * plus large que celle par défaut, qui plafonne dès −30 dB.
 */
const BASS_FFT_SIZE = 1024;
const BASS_MIN_DB = -90;
const BASS_MAX_DB = -10;
const BASS_LO_HZ = 30;
const BASS_HI_HZ = 110;

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

interface BassChannel {
  analyser: AnalyserNode;
  bins: Uint8Array<ArrayBuffer>;
  /** Spectre de l'image précédente, pour mesurer la montée entre deux images. */
  previous: Uint8Array<ArrayBuffer>;
  hasPrevious: boolean;
  kick: OnsetDetector;
  percussion: OnsetDetector;
}

/** Lecteur d'extraits + analyse du rythme, branchés sur un unique <audio>. */
@Injectable()
export class PulseAudio implements OnDestroy {
  /** Intensité du morceau, entre 0 et 1. */
  readonly level = signal(0);
  /** Flash du canal gauche (0..1) : nul la plupart du temps, bref sur une grosse caisse ou une percussion. */
  readonly flashLeft = signal(0);
  /** Idem pour le canal droit. */
  readonly flashRight = signal(0);
  readonly playing = signal(false);
  readonly current = signal<DeezerTrack | null>(null);

  private readonly audio = new Audio();
  private ctx?: AudioContext;
  private analyser?: AnalyserNode;
  private bins?: Uint8Array<ArrayBuffer>;
  /** [gauche, droite] */
  private bass: BassChannel[] = [];
  private frame = 0;
  private lastTime = 0;

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
    this.bass.forEach((c) => {
      c.kick.reset();
      c.percussion.reset();
      c.hasPrevious = false;
    });
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

    // Les graves sont analysés avant le gain de sortie : le volume d'écoute
    // ne doit pas décaler les seuils. Un splitter isole les canaux gauche et droit
    // (une source mono est dupliquée sur les deux).
    const splitter = ctx.createChannelSplitter(2);
    source.connect(splitter);
    this.bass = [0, 1].map((channel) => {
      const analyser = ctx.createAnalyser();
      analyser.fftSize = BASS_FFT_SIZE;
      analyser.minDecibels = BASS_MIN_DB;
      analyser.maxDecibels = BASS_MAX_DB;
      analyser.smoothingTimeConstant = 0;
      splitter.connect(analyser, channel);
      const size = analyser.frequencyBinCount;
      return {
        analyser,
        bins: new Uint8Array(size),
        previous: new Uint8Array(size),
        hasPrevious: false,
        kick: new OnsetDetector(KICK_OPTIONS),
        percussion: new OnsetDetector(PERCUSSION_OPTIONS),
      };
    });
  }

  private startLoop(): void {
    cancelAnimationFrame(this.frame);
    this.lastTime = 0;
    const tick = (now: number) => {
      const dt = this.lastTime ? Math.min(now - this.lastTime, 100) : 1000 / 60;
      this.lastTime = now;
      if (this.analyser && this.bins) {
        this.analyser.getByteFrequencyData(this.bins);
        this.level.set(averageEnergy(this.bins));
      }
      const rate = this.ctx?.sampleRate ?? 44_100;
      const flashes = this.bass.map((channel) => {
        const { analyser, bins, previous } = channel;
        analyser.getByteFrequencyData(bins);
        const kick = channel.kick.next(bandEnergy(bins, rate, BASS_FFT_SIZE, BASS_LO_HZ, BASS_HI_HZ), dt);
        // Il faut deux images pour mesurer une montée : la première sert d'amorce.
        const perc = channel.hasPrevious
          ? channel.percussion.next(percussionStrength(previous, bins, rate, BASS_FFT_SIZE), dt)
          : 0;
        previous.set(bins);
        channel.hasPrevious = true;
        return Math.max(kick, perc * PERCUSSION_WEIGHT);
      });
      if (flashes.length === 2) {
        this.flashLeft.set(flashes[0]);
        this.flashRight.set(flashes[1]);
      }
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  private stopLoop(): void {
    cancelAnimationFrame(this.frame);
    this.level.set(0);
    this.flashLeft.set(0);
    this.flashRight.set(0);
  }
}
