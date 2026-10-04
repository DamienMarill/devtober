import { Component, DestroyRef, inject, input, output, signal } from '@angular/core';
import { BananaEmblem } from './art';

/**
 * L'enveloppe scellée à la cire dans laquelle se cache le lauréat du mois. Un clic (ou Entrée) brise le
 * sceau, rabat le volet et sort la carte ; une fois fini, elle prévient (`opened`) et la page révèle le nom.
 */
@Component({
  selector: 'app-envelope',
  imports: [BananaEmblem],
  host: { class: 'block w-[min(22rem,86vw)]' },
  styles: `
    .envelope {
      position: relative;
      display: block;
      width: 100%;
      aspect-ratio: 3 / 2;
      perspective: 900px;
      cursor: pointer;
      transition: transform 0.3s;
      filter: drop-shadow(0 28px 28px rgb(0 0 0 / 0.55));
    }
    .envelope:not(:disabled):hover {
      transform: translateY(-5px) rotate(-1deg);
    }
    .envelope:focus-visible {
      outline: 2px solid var(--gold);
      outline-offset: 8px;
    }
    .part {
      position: absolute;
      inset: 0;
    }
    .back {
      background: linear-gradient(145deg, #efe3c8, #d6c394);
      border-radius: 3px;
    }
    .letter {
      inset: 7% 6% 9%;
      display: grid;
      place-items: center;
      background: #fffaf0;
      color: #3a0a12;
      font: 600 1.05rem/1.2 var(--gala);
      transition: transform 0.85s 0.4s cubic-bezier(0.3, 0.7, 0.2, 1);
      z-index: 1;
    }
    .front {
      background: linear-gradient(180deg, #e8d9b7, #d3bf8e);
      clip-path: polygon(0 0, 50% 54%, 100% 0, 100% 100%, 0 100%);
      border-radius: 3px;
      z-index: 2;
    }
    .flap {
      bottom: 45%;
      background: linear-gradient(#f6ecd2, #d9c690);
      clip-path: polygon(0 0, 100% 0, 50% 100%);
      transform-origin: top;
      transition:
        transform 0.7s cubic-bezier(0.4, 0, 0.2, 1),
        z-index 0s 0.35s;
      z-index: 3;
    }
    .seal {
      inset: auto;
      left: 50%;
      top: 43%;
      width: 4.4rem;
      aspect-ratio: 1;
      display: grid;
      place-items: center;
      padding: 0.9rem;
      border-radius: 50%;
      color: #e8c873;
      background: radial-gradient(circle at 35% 30%, #a3142a, #5a0914 70%);
      box-shadow:
        inset 0 0 0 3px rgb(0 0 0 / 0.18),
        0 3px 8px rgb(0 0 0 / 0.5);
      translate: -50% -50%;
      z-index: 4;
      transition:
        opacity 0.3s,
        scale 0.3s;
    }
    .label {
      inset: auto 0 9% 0;
      text-align: center;
      font: 600 0.62rem/1.5 var(--gala);
      letter-spacing: 0.3em;
      text-transform: uppercase;
      color: #5b4320;
      z-index: 2;
    }
    .opening .flap {
      transform: rotateX(180deg);
      z-index: 0;
    }
    .opening .letter {
      transform: translateY(-62%);
    }
    .opening .seal {
      opacity: 0;
      scale: 1.35;
    }
    @media (prefers-reduced-motion: reduce) {
      .envelope *,
      .envelope {
        transition: none !important;
      }
    }
  `,
  template: `
    <button
      type="button"
      class="envelope"
      [class.opening]="opening()"
      [disabled]="opening()"
      [attr.aria-label]="'Ouvrir l’enveloppe : ' + label()"
      (click)="open()"
    >
      <span class="part back"></span>
      <span class="part letter">Et le gagnant est…</span>
      <span class="part front"></span>
      <span class="part flap"></span>
      <span class="part seal"><app-banana-emblem class="size-full" /></span>
      <span class="part label">{{ label() }}<br />sous pli scellé</span>
    </button>
  `,
})
export class Envelope {
  /** Texte de l'enveloppe, ex. « Dérapaward de mars ». */
  readonly label = input.required<string>();
  /** Déclenché quand la carte est sortie : on peut révéler le nom. */
  readonly opened = output<void>();

  protected readonly opening = signal(false);
  private readonly destroyRef = inject(DestroyRef);

  protected open() {
    if (this.opening()) return;
    this.opening.set(true);
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = setTimeout(() => this.opened.emit(), reduced ? 0 : 1250);
    this.destroyRef.onDestroy(() => clearTimeout(timer));
  }
}
