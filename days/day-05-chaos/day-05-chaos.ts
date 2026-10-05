import {
  afterNextRender,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  viewChild,
} from '@angular/core';
import { Sound } from './lib/audio';
import { CONFIG } from './lib/config';
import { Field } from './lib/field';
import { parseOptions } from './lib/options';
import { Stage } from './lib/stage';

/** Déplacement par position physique de la touche (ZQSD en AZERTY, WASD en QWERTY) et flèches. */
const MOVES: Readonly<Record<string, readonly [number, number]>> = {
  KeyW: [0, -1],
  ArrowUp: [0, -1],
  KeyS: [0, 1],
  ArrowDown: [0, 1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};

@Component({
  selector: 'app-day-05-chaos',
  host: {
    class: 'relative block size-full overflow-hidden select-none bg-[#1c2433]',
    '(document:keydown)': 'onKeydown($event)',
    '(document:keyup)': 'onKeyup($event)',
    '(window:blur)': 'release()',
    '(document:visibilitychange)': 'onVisibility()',
  },
  template: `<canvas #canvas aria-hidden="true" class="absolute inset-0 size-full"></canvas>`,
})
export default class Day05Chaos {
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly options = parseOptions(location.search);
  private readonly field = new Field(
    this.options.seed ?? (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0,
  );
  private readonly sound = new Sound();
  private readonly held = new Set<string>();
  private frame = 0;
  private last = 0;
  private audioClock = 0;
  private fps = 60;

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const destroyRef = inject(DestroyRef);
    if (this.options.density !== null) this.field.density.force(this.options.density);
    this.field.events = {
      inert: (g) => this.sound.inert(g),
      bloom: (g) => this.sound.bloomFrom(g),
    };
    destroyRef.onDestroy(() => {
      cancelAnimationFrame(this.frame);
      this.sound.dispose();
    });

    afterNextRender(() => {
      const stage = new Stage(this.canvas().nativeElement, this.field.seed, {
        reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
        showPicto: !matchMedia('(pointer: coarse)').matches,
      });
      const fit = () => {
        stage.resize(host.clientWidth, host.clientHeight);
        this.field.resize(host.clientWidth, host.clientHeight);
      };
      fit();
      const observer = new ResizeObserver(fit);
      observer.observe(host);
      destroyRef.onDestroy(() => observer.disconnect());

      const tick = (now: number) => {
        this.frame = requestAnimationFrame(tick);
        const dt = this.last ? Math.min((now - this.last) / 1000, 0.05) : 1 / 60;
        this.last = now;
        this.field.step(dt);
        stage.draw(this.field, this.options.debug ? this.hud(dt) : null);
        this.audioClock += dt;
        if (this.audioClock >= CONFIG.audio.update) {
          this.audioClock = 0;
          this.sound.update(this.field);
        }
      };
      this.frame = requestAnimationFrame(tick);
    });
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('input, select, textarea, [contenteditable], [role="dialog"]')) return;
    if (MOVES[event.code]) {
      if (event.code.startsWith('Arrow')) event.preventDefault();
      this.held.add(event.code);
      this.applyInput();
      this.field.moved = true;
    }
    if (!this.field.running) {
      this.field.start();
      void this.sound.start();
    }
    if (this.options.debug && !event.repeat) this.debugKey(event.code);
  }

  protected onKeyup(event: KeyboardEvent): void {
    if (this.held.delete(event.code)) this.applyInput();
  }

  protected release(): void {
    this.held.clear();
    this.applyInput();
  }

  protected onVisibility(): void {
    this.sound.setHidden(document.hidden);
    this.last = 0;
  }

  private applyInput(): void {
    let x = 0;
    let y = 0;
    for (const code of this.held) {
      x += MOVES[code][0];
      y += MOVES[code][1];
    }
    x = Math.max(-1, Math.min(1, x));
    y = Math.max(-1, Math.min(1, y));
    const m = Math.hypot(x, y);
    this.field.inputX = m > 1 ? x / m : x;
    this.field.inputY = m > 1 ? y / m : y;
  }

  private debugKey(code: string): void {
    if (code.startsWith('Digit')) {
      this.field.density.force(Number(code.slice(5)) / 10);
      return;
    }
    if (code === 'KeyP') this.field.density.frozen = !this.field.density.frozen;
    if (code === 'KeyJ') this.field.spawnAhead(true, 'stable');
    if (code === 'KeyK') this.field.spawnAhead(true, 'inert');
    if (code === 'KeyL') this.field.spawnAhead(true, 'unstable');
    if (code === 'KeyH') this.field.spawnAhead(false, null);
  }

  private hud(dt: number): string[] {
    this.fps += (1 / Math.max(dt, 1e-3) - this.fps) * 0.05;
    const f = this.field;
    const d = f.density;
    const glows = f.glows.pool
      .filter((g) => g.active)
      .map((g) => `${g.coherent ? 'C' : 'n'}${g.phase[0]}${g.residual.toFixed(2)}`)
      .join(' ');
    return [
      `density ${d.value.toFixed(3)}  niveau ${d.level.toFixed(3)}  audio ${d.audio.toFixed(3)}`,
      `rate ×${d.rateFactor.toFixed(2)}  épisodes ${d.episodes}${d.frozen ? '  figée' : ''}`,
      `épisode ${d.episode ? `${d.episode.outcome} ${d.phase} ${d.episodeTime.toFixed(1)} s` : '—'}  clearing ${d.clearing.toFixed(2)}`,
      `dernier tirage ${f.lastOutcome ?? '—'}  glows ${glows || '—'}`,
      `current ${f.body.current.toFixed(2)}  temps ${f.time.toFixed(0)} s  ${Math.round(this.fps)} fps  graine ${f.seed}`,
      '0–9 density · P figer · J/K/L glow stable/inert/unstable · H glow non coherent',
    ];
  }
}
