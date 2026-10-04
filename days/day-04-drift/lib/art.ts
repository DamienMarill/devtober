import { Component, input } from '@angular/core';

/** L'emblème : la peau de banane souriante, en silhouette (couleur du texte), visage en `--face`. */
@Component({
  selector: 'app-banana-emblem',
  host: { class: 'inline-block', 'aria-hidden': 'true' },
  template: `
    <svg viewBox="0 0 64 64" class="size-full" fill="currentColor">
      <path d="M29 5h6l.8 9c6 2.8 9.2 8.6 9.2 16 0 5-1.6 8.6-4 11H23c-2.4-2.4-4-6-4-11 0-7.4 3.2-13.2 9.2-16z" />
      <path d="M21 41C9 41 3 49 4 57c9 1 18-4 22-13z" />
      <path d="M43 41c12 0 18 8 17 16-9 1-18-4-22-13z" />
      <path d="M25 44c0 9 4 15 7 15s7-6 7-15z" />
      <g fill="var(--face, #0b0907)">
        <ellipse cx="27.5" cy="25" rx="2" ry="3.2" />
        <ellipse cx="36.5" cy="25" rx="2" ry="3.2" />
        <path d="M26.5 32q5.5 5.5 11 0" fill="none" stroke="var(--face, #0b0907)" stroke-width="1.8" stroke-linecap="round" />
      </g>
    </svg>
  `,
})
export class BananaEmblem {}

/** Deux traces de pneu qui serpentent : le séparateur « drift » entre les sections. */
@Component({
  selector: 'app-skid',
  host: { class: 'block', 'aria-hidden': 'true' },
  template: `
    <svg viewBox="0 0 1200 44" preserveAspectRatio="xMidYMid slice" class="h-9 w-full" fill="none" stroke="currentColor">
      <g stroke-width="5" stroke-dasharray="1.6 4.4">
        <path d="M-20 24C140 -4 260 52 420 24S700 -6 860 24s240 22 360 -2" />
        <path d="M-20 35C140 7 260 63 420 35S700 5 860 35s240 22 360 -2" />
      </g>
    </svg>
  `,
})
export class Skid {}

/** Un filet Art déco : deux traits qui se rejoignent sur un losange. */
@Component({
  selector: 'app-deco-rule',
  host: { class: 'flex items-center gap-3', 'aria-hidden': 'true' },
  template: `
    <span class="h-px flex-1 bg-gradient-to-r from-transparent to-current"></span>
    <svg viewBox="0 0 40 12" class="h-3 w-10" fill="currentColor">
      <path d="M20 0l5 6-5 6-5-6z" />
      <path d="M0 6h11M29 6h11" stroke="currentColor" stroke-width="1" />
      <circle cx="3" cy="6" r="1.4" />
      <circle cx="37" cy="6" r="1.4" />
    </svg>
    <span class="h-px flex-1 bg-gradient-to-l from-transparent to-current"></span>
  `,
})
export class DecoRule {}

/** Un demi-laurier ; deux, face à face (le second retourné), encadrent les titres. */
@Component({
  selector: 'app-laurel',
  host: { class: 'inline-block', 'aria-hidden': 'true' },
  template: `
    <svg viewBox="0 0 60 120" class="size-full" fill="currentColor">
      @for (l of leaves; track $index) {
        <ellipse
          [attr.cx]="l.x"
          [attr.cy]="l.y"
          rx="3.6"
          ry="10"
          [attr.transform]="'rotate(' + l.angle + ' ' + l.x + ' ' + l.y + ')'"
        />
      }
      <path d="M44 112C20 98 12 66 22 12" fill="none" stroke="currentColor" stroke-width="1.6" />
    </svg>
  `,
})
export class Laurel {
  /** Les feuilles suivent l'arc de la tige, alternées de chaque côté. */
  protected readonly leaves = Array.from({ length: 12 }, (_, i) => {
    const t = (i + 0.5) / 12;
    const x = 44 - 22 * Math.sin(t * Math.PI * 0.5 * 1.1) - (i % 2 ? 6 : -4);
    const y = 112 - 100 * t;
    return { x, y, angle: -28 + (i % 2 ? -34 : 20) - t * 18 };
  });
}

/** Médaille du lauréat (I, or), de l'accessit (II, argent) ou du prix de bronze (III). */
@Component({
  selector: 'app-medal',
  host: { class: 'inline-block', 'aria-hidden': 'true' },
  template: `
    <svg viewBox="0 0 64 80" class="size-full">
      <defs>
        <linearGradient id="dr-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#fff1c2" />
          <stop offset=".5" stop-color="#c9a24a" />
          <stop offset="1" stop-color="#f0d27c" />
        </linearGradient>
        <linearGradient id="dr-silver" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#f4f4f6" />
          <stop offset=".5" stop-color="#a9acb5" />
          <stop offset="1" stop-color="#e4e6ec" />
        </linearGradient>
        <linearGradient id="dr-bronze" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#f0b98a" />
          <stop offset=".5" stop-color="#a5622f" />
          <stop offset="1" stop-color="#e2a574" />
        </linearGradient>
      </defs>
      <path d="M18 0h12l6 28H24zM46 0H34l-6 28h12z" [attr.fill]="rank() === 1 ? '#5a0914' : rank() === 2 ? '#3a0a12' : '#1d1a2e'" />
      <circle cx="32" cy="50" r="24" [attr.fill]="'url(#dr-' + (rank() === 1 ? 'gold' : rank() === 2 ? 'silver' : 'bronze') + ')'" />
      <circle cx="32" cy="50" r="19" fill="none" stroke="rgba(0,0,0,.35)" stroke-width="1" />
      <text
        x="32"
        y="58"
        text-anchor="middle"
        font-size="24"
        font-weight="700"
        fill="rgba(20,12,4,.8)"
        font-family="'Bodoni Moda', serif"
      >
        {{ rank() === 1 ? 'I' : rank() === 2 ? 'II' : 'III' }}
      </text>
    </svg>
  `,
})
export class Medal {
  readonly rank = input<1 | 2 | 3>(2);
}
