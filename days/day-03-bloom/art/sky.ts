import { Component, ElementRef, computed, input, viewChild } from '@angular/core';
import { BLEED, Camera, toScreen, viewBox } from '../lib/camera';
import { circle, fmt } from '../lib/paint';
import { seeded } from '../lib/random';

/** Période de la bande de nuages (unités) : elle est dessinée deux fois et défile en boucle. */
export const CLOUD_PERIOD = 2400;

/** Rayon de la lune (unités). Elle est dessinée autour de l'origine, puis posée et inclinée par le CSS. */
const MOON_RADIUS = 16;

const random = seeded(77);
/** Les étoiles : positions tirées une fois pour toutes, dans le haut du ciel. */
const STARS = Array.from({ length: 140 }, () => {
  const x = BLEED.x + random() * BLEED.w;
  const y = BLEED.y + random() ** 1.4 * 640;
  return circle(x, y, 0.7 + random() ** 3 * 1.6);
});
const STARS_A = STARS.filter((_, i) => i % 3 !== 0).join('');
const STARS_B = STARS.filter((_, i) => i % 3 === 0).join('');

/** Un nuage d'anime : base plate, sommet en bulles ; ombre en dessous, lumière au-dessus. */
function cloud(x: number, y: number, w: number, rnd: () => number): { lit: string; shade: string } {
  let lit = '';
  let shade = '';
  const n = 4 + Math.floor(rnd() * 4);
  for (let i = 0; i < n; i++) {
    const k = (i + 0.5) / n;
    const cx = x + (k - 0.5) * w;
    // Les bulles du milieu montent plus haut.
    const r = w * (0.12 + 0.16 * Math.sin(Math.PI * k) * (0.7 + rnd() * 0.6));
    const cy = y - r * 0.6;
    shade += circle(cx, cy + r * 0.35, r);
    lit += circle(cx - r * 0.08, cy - r * 0.05, r * 0.86);
  }
  // Base plate.
  shade += `M${fmt(x - w * 0.5)} ${fmt(y)}h${fmt(w)}v${fmt(w * 0.05)}h${fmt(-w)}Z`;
  return { lit, shade };
}

function cloudSet(count: number, seed: number, yMin: number, yMax: number) {
  const rnd = seeded(seed);
  let lit = '';
  let shade = '';
  for (let i = 0; i < count; i++) {
    const x = ((i + rnd() * 0.6) / count) * CLOUD_PERIOD;
    const y = yMin + rnd() * (yMax - yMin);
    // Plus bas = plus loin = plus petit et plus plat.
    const w = 120 + (1 - (y - yMin) / (yMax - yMin)) * 260 * (0.6 + rnd() * 0.6);
    for (const offset of [0, CLOUD_PERIOD]) {
      const c = cloud(x + offset, y, w, seeded(seed * 31 + i));
      lit += c.lit;
      shade += c.shade;
    }
  }
  return { lit, shade };
}

const FEW = cloudSet(6, 4, 40, 430);
const MANY = cloudSet(14, 9, -60, 470);

/**
 * Plan du CIEL : le dégradé (une div CSS, qui ne craint pas le `<base href>`), le halo du soleil, la lune,
 * les étoiles et la bande de nuages qui défile avec le vent.
 */
@Component({
  selector: 'app-bloom-sky',
  host: { class: 'pointer-events-none absolute inset-0 block overflow-hidden' },
  template: `
    <div class="absolute inset-0" [style.background]="gradient()"></div>
    <div class="sun absolute rounded-full"></div>
    <svg
      class="absolute inset-0 block size-full"
      [attr.viewBox]="box()"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path class="stars" [attr.d]="starsA" style="fill: #fff8ef; opacity: var(--stars)" />
      <path class="stars twinkle" [attr.d]="starsB" style="fill: #fff8ef; opacity: var(--stars)" />
      <g
        style="opacity: var(--moon, 0); transform: translate(calc(var(--moon-x, 0) * 1px), calc(var(--moon-y, 0) * 1px)) rotate(calc(var(--moon-tilt, 0) * 1deg))"
      >
        <path [attr.d]="moonDisc" style="fill: var(--sky-mid); opacity: 0.45" />
        <path [attr.d]="moonLit()" style="fill: #fff6e0" />
      </g>
    </svg>
    <svg
      #clouds
      class="clouds absolute block"
      [style.left.px]="band().left"
      [style.top.px]="band().top"
      [style.width.px]="band().width"
      [style.height.px]="band().height"
      [attr.viewBox]="'0 -150 ' + 2 * period + ' 650'"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <g style="opacity: var(--clouds-few)">
        <path [attr.d]="few.shade" style="fill: var(--cloud-shade)" />
        <path [attr.d]="few.lit" style="fill: var(--cloud-lit)" />
      </g>
      <g style="opacity: var(--clouds-many)">
        <path [attr.d]="many.shade" style="fill: var(--cloud-shade)" />
        <path [attr.d]="many.lit" style="fill: var(--cloud-lit)" />
      </g>
    </svg>
  `,
  styles: `
    .sun {
      left: var(--sun-x);
      top: var(--sun-y);
      width: var(--sun-size);
      height: var(--sun-size);
      translate: -50% -50%;
      opacity: var(--sun-alpha);
      background: radial-gradient(
        circle,
        #fffdf4 0 3%,
        color-mix(in srgb, var(--sun-glow) 85%, white) 4.5%,
        color-mix(in srgb, var(--sun-glow) 45%, transparent) 14%,
        transparent 62%
      );
    }
    .clouds {
      will-change: transform;
    }
    .twinkle {
      animation: twinkle 3.2s ease-in-out infinite alternate;
    }
    @keyframes twinkle {
      to {
        opacity: calc(var(--stars) * 0.35);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .twinkle {
        animation: none;
      }
    }
  `,
})
export class Sky {
  readonly camera = input.required<Camera>();
  /** Lunaison (0 = nouvelle lune, 0,5 = pleine lune). */
  readonly moonPhase = input(0.5);

  protected readonly period = CLOUD_PERIOD;
  protected readonly starsA = STARS_A;
  protected readonly starsB = STARS_B;
  protected readonly few = FEW;
  protected readonly many = MANY;
  protected readonly moonDisc = circle(0, 0, MOON_RADIUS);

  protected readonly box = computed(() => viewBox(this.camera()));
  private readonly clouds = viewChild.required<ElementRef<SVGSVGElement>>('clouds');

  /** Fait défiler les nuages : `offset` en unités de composition (boucle sur une période). */
  drift(offset: number): void {
    const period = CLOUD_PERIOD;
    const m = ((offset % period) + period) % period;
    this.clouds().nativeElement.style.transform = `translate3d(${(m * this.camera().scale).toFixed(1)}px, 0, 0)`;
  }

  /** Dégradé calé sur l'horizon : zénith en haut du débord, horizon sur la ligne d'horizon. */
  protected readonly gradient = computed(() => {
    const cam = this.camera();
    const y = (v: number) => `${Math.round(toScreen(cam, 0, v).y)}px`;
    return `linear-gradient(to bottom, var(--sky-top) ${y(-150)}, var(--sky-mid) ${y(380)}, var(--sky-low) ${y(600)})`;
  });

  /** La bande de nuages en pixels : deux périodes, de la gauche du débord, sous le haut du ciel. */
  protected readonly band = computed(() => {
    const cam = this.camera();
    const origin = toScreen(cam, BLEED.x - CLOUD_PERIOD, -150);
    return {
      left: origin.x,
      top: origin.y,
      width: 2 * CLOUD_PERIOD * cam.scale,
      height: 650 * cam.scale,
    };
  });

  /** La partie éclairée de la lune, dessinée côté droit ; `--moon-tilt` la tourne vers le soleil. */
  protected readonly moonLit = computed(() => moonPath(this.moonPhase()));
}

/**
 * Le côté éclairé de la lune autour de l'origine, toujours à droite : la forme ne dépend que de la part
 * éclairée (croissant, quartier, gibbeuse), `phase` et `1 - phase` donnent le même dessin. Le sens, lui,
 * vient de la rotation.
 */
export function moonPath(phase: number, r = MOON_RADIUS): string {
  const k = Math.cos(2 * Math.PI * phase);
  const rx = Math.abs(k) * r;
  const inner = k > 0 ? 0 : 1;
  return `M0 ${fmt(-r)}A${fmt(r)} ${fmt(r)} 0 0 1 0 ${fmt(r)}A${fmt(rx)} ${fmt(r)} 0 0 ${inner} 0 ${fmt(-r)}Z`;
}
