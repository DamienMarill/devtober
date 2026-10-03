import { Component, computed, input } from '@angular/core';
import { Camera, viewBox } from '../lib/camera';
import { Shape } from '../lib/paint';

/**
 * Un plan du décor : un `<svg>` plein cadre dont le `viewBox` suit la caméra. Chaque tracé prend sa
 * couleur dans une variable CSS posée par la lumière du moment.
 */
@Component({
  selector: 'app-bloom-plane',
  host: { class: 'pointer-events-none absolute inset-0 block' },
  template: `
    <svg
      class="block size-full"
      [attr.viewBox]="box()"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      @for (s of shapes(); track $index) {
        <path [attr.d]="s.d" [style.fill]="'var(--' + s.m + ')'" />
      }
    </svg>
  `,
})
export class Plane {
  readonly camera = input.required<Camera>();
  readonly shapes = input.required<readonly Shape[]>();
  protected readonly box = computed(() => viewBox(this.camera()));
}
