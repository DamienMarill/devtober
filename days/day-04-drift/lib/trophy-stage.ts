import {
  afterNextRender,
  Component,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { BananaEmblem } from './art';
import type { Plaque } from '../trophy/plinth';
import type { TrophyScene } from '../trophy/scene';

/**
 * Le canvas du trophée. Un seul contexte WebGL pour toute la page : quand on change de mois, on regrave
 * la plaque et on rejoue l'entrée, sans reconstruire la scène.
 */
@Component({
  selector: 'app-trophy-stage',
  imports: [BananaEmblem],
  host: { class: 'relative block' },
  template: `
    <canvas
      #canvas
      class="block size-full cursor-grab active:cursor-grabbing"
      role="img"
      aria-label="Le trophée : une peau de banane en or, souriante, posée sur une coupe de Grand Prix"
    ></canvas>
    @if (failed()) {
      <div class="absolute inset-0 grid place-items-center text-(--gold)">
        <app-banana-emblem class="size-40" />
      </div>
    }
  `,
})
export class TrophyStage {
  readonly plaque = input.required<Plaque>();
  /**
   * Clé de la révélation : `null` cache le trophée, une valeur le fait entrer en dérapant (et rejoue
   * l'entrée chaque fois qu'elle change).
   */
  readonly revealKey = input<string | null>(null);

  protected readonly failed = signal(false);
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly scene = signal<TrophyScene | null>(null);

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(async () => {
      try {
        // three.js ne se charge qu'ici, avec le jour 4.
        const { TrophyScene } = await import('../trophy/scene');
        const canvas = this.canvas().nativeElement;
        if (destroyRef.destroyed) return;
        const scene = new TrophyScene(canvas);
        canvas.style.touchAction = 'pan-y';
        this.scene.set(scene);
        destroyRef.onDestroy(() => scene.dispose());
      } catch {
        this.failed.set(true);
      }
    });

    effect(() => {
      const scene = this.scene();
      const plaque = this.plaque();
      scene?.setPlaque(plaque);
    });

    effect(() => {
      const scene = this.scene();
      const key = this.revealKey();
      if (!scene) return;
      untracked(() => (key === null ? scene.hide() : scene.reveal()));
    });
  }
}
