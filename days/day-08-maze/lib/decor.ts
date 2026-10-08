import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { PILE, R } from './scene';
import { CONFIG } from './config';

/**
 * Le décor fixe du guichet 7B : un bureau des années 70 jamais rénové. Tôle, néons, lino, lumière froide ; les
 * seules couleurs vives viendront de l'encre et des chemises. Une seule image SVG à l'échelle de la scène.
 */
@Component({
  selector: 'maze-decor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'decor' },
  template: `
    <svg viewBox="0 0 1280 720" width="1280" height="720" aria-hidden="true">
      <defs>
        <linearGradient id="dz-wall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#cdbd93" />
          <stop offset="0.52" stop-color="#c3b388" />
          <stop offset="0.52" stop-color="#8fa89a" />
          <stop offset="1" stop-color="#7f998b" />
        </linearGradient>
        <linearGradient id="dz-desk" x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0" stop-color="#80613f" />
          <stop offset="1" stop-color="#6d5134" />
        </linearGradient>
        <pattern id="dz-grain" width="140" height="18" patternUnits="userSpaceOnUse">
          <path
            d="M0 4c30 2 50-2 80 1s40 2 60-1M0 12c40-2 60 3 90 0s30-1 50 1"
            fill="none"
            stroke="#5f4529"
            stroke-opacity="0.22"
          />
        </pattern>
        <linearGradient id="dz-pad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#3f5a4d" />
          <stop offset="1" stop-color="#334b40" />
        </linearGradient>
        <linearGradient id="dz-metal" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#6b7c73" />
          <stop offset="1" stop-color="#55655d" />
        </linearGradient>
        <linearGradient id="dz-glass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#c9d3cf" />
          <stop offset="1" stop-color="#a9b6b1" />
        </linearGradient>
        <pattern id="dz-brick" width="28" height="14" patternUnits="userSpaceOnUse">
          <rect width="28" height="14" fill="#6e4a3c" />
          <path d="M0 13.5h28M0 6.5h28M7 0v6.5M21 7v7" stroke="#4a3129" stroke-width="1.2" />
        </pattern>
        <clipPath id="dz-window">
          <rect
            [attr.x]="R.fenetre.x + 8"
            [attr.y]="R.fenetre.y + 8"
            [attr.width]="R.fenetre.w - 16"
            [attr.height]="R.fenetre.h - 16"
          />
        </clipPath>
      </defs>

      <!-- Le mur : vert d'eau jusqu'à mi-hauteur, beige nicotine au-dessus, et une fissure qui s'allonge chaque jour. -->
      <rect width="1280" height="106" fill="url(#dz-wall)" />
      <path [attr.d]="crack()" fill="none" stroke="#6d6250" stroke-width="1.2" opacity="0.7" />
      <rect y="102" width="1280" height="6" fill="#4d3a26" />

      <!-- Néons. -->
      @for (n of [0, 1, 2]; track n) {
        <rect
          [attr.x]="140 + n * 400"
          y="0"
          width="300"
          height="5"
          rx="2"
          [attr.fill]="n < neons() ? '#f4f7ee' : '#9aa196'"
          [attr.opacity]="n < neons() ? 1 : 0.7"
          [class.neon]="n < neons()"
        />
      }

      <!-- Affiche, calendrier de 1987, défense de fumer. -->
      <g transform="translate(240 14) rotate(-1.5) scale(0.8)">
        <rect width="88" height="76" fill="#e7dcc0" stroke="#9c8f72" />
        <rect x="8" y="8" width="72" height="34" fill="#8fa3b0" />
        <circle cx="44" cy="28" r="9" fill="#e7dcc0" />
        <text x="44" y="54" text-anchor="middle" class="poster">UN AGENT SATISFAIT</text>
        <text x="44" y="63" text-anchor="middle" class="poster">EST UN AGENT</text>
        <text x="44" y="72" text-anchor="middle" class="poster">PRODUCTIF</text>
      </g>
      <g transform="translate(830 10) rotate(1) scale(0.86)">
        <rect width="74" height="96" fill="#efe9da" stroke="#9c8f72" />
        <rect x="5" y="5" width="64" height="40" fill="#5d7f9b" />
        <path d="M12 38l14-16 10 10 8-8 14 14" fill="none" stroke="#efe9da" stroke-width="2" />
        <text x="37" y="60" text-anchor="middle" class="poster">LA POSTE</text>
        <text x="37" y="80" text-anchor="middle" class="annee">1987</text>
      </g>
      <g transform="translate(930 20)">
        <rect width="70" height="34" rx="3" fill="#efe9da" stroke="#b3261e" stroke-width="2" />
        <text x="35" y="15" text-anchor="middle" class="poster red">DÉFENSE</text>
        <text x="35" y="26" text-anchor="middle" class="poster red">DE FUMER</text>
        <ellipse cx="35" cy="84" rx="20" ry="8" fill="#8b8f96" />
        <path d="M22 82h26M28 79l-5 3M41 79l5 2" stroke="#d8d2c4" stroke-width="2" />
      </g>

      <!-- La fenêtre à barreaux sur la cour : briques, pluie fine, lumière qui baisse. -->
      <rect
        [attr.x]="R.fenetre.x"
        [attr.y]="R.fenetre.y"
        [attr.width]="R.fenetre.w"
        [attr.height]="R.fenetre.h"
        fill="#e6e1d3"
        stroke="#7a7262"
        stroke-width="2"
      />
      <g clip-path="url(#dz-window)">
        <rect
          [attr.x]="R.fenetre.x"
          [attr.y]="R.fenetre.y"
          [attr.width]="R.fenetre.w"
          [attr.height]="R.fenetre.h"
          fill="url(#dz-brick)"
        />
        <rect
          [attr.x]="R.fenetre.x"
          [attr.y]="R.fenetre.y"
          [attr.width]="R.fenetre.w"
          [attr.height]="R.fenetre.h"
          [attr.fill]="'#1b2430'"
          [attr.opacity]="0.15 + 0.6 * dusk()"
        />
        <g class="pluie" [class.forte]="jour() >= 2">
          @for (d of rain; track $index) {
            <line
              [attr.x1]="R.fenetre.x + d.x"
              [attr.y1]="R.fenetre.y + d.y"
              [attr.x2]="R.fenetre.x + d.x - 3"
              [attr.y2]="R.fenetre.y + d.y + 12"
              [style.animation-delay.ms]="d.delay"
            />
          }
        </g>
      </g>
      @for (i of [1, 2, 3, 4, 5]; track i) {
        <rect
          [attr.x]="R.fenetre.x + (i * R.fenetre.w) / 6 - 2"
          [attr.y]="R.fenetre.y + 6"
          width="4"
          [attr.height]="R.fenetre.h - 12"
          fill="#3d4440"
        />
      }

      <!-- La porte vitrée du chef de bureau : une silhouette immobile derrière le verre dépoli. -->
      <rect
        [attr.x]="R.porte.x"
        [attr.y]="R.porte.y"
        [attr.width]="R.porte.w"
        [attr.height]="R.porte.h + 4"
        fill="#6a5a44"
      />
      <rect
        [attr.x]="R.porte.x + 12"
        [attr.y]="R.porte.y + 10"
        [attr.width]="R.porte.w - 24"
        [attr.height]="R.porte.h - 20"
        fill="url(#dz-glass)"
      />
      <g
        [attr.transform]="'translate(' + (R.porte.x + R.porte.w / 2) + ' ' + (R.porte.y + 56) + ')'"
        fill="#5f6a66"
        opacity="0.45"
      >
        <circle cy="-18" r="11" />
        <path d="M-24 40c0-30 10-44 24-44s24 14 24 44z" />
      </g>
      <text
        [attr.x]="R.porte.x + R.porte.w / 2"
        [attr.y]="R.porte.y + 26"
        text-anchor="middle"
        class="pochoir sombre"
      >
        CHEF DE BUREAU
      </text>

      <!-- Le bureau en stratifié imitation bois, écaillé sur les bords. -->
      <rect y="106" width="1280" height="614" fill="url(#dz-desk)" />
      <rect y="106" width="1280" height="614" fill="url(#dz-grain)" />
      <path d="M0 110h1280" stroke="#a37f55" stroke-width="2" opacity="0.6" />
      <path d="M240 107q8 6 18 1M760 107q6 5 14 0M1080 107q10 7 20 1" fill="#4d3a26" />

      <!-- La cloison derrière la pile, avec sa ligne rouge de danger peinte. -->
      <rect
        [attr.x]="R.pile.x"
        [attr.y]="R.pile.y - 30"
        [attr.width]="R.pile.w"
        [attr.height]="R.pile.h + 30"
        rx="4"
        fill="#8fa89a"
        opacity="0.55"
      />
      <line
        [attr.x1]="R.pile.x + 4"
        [attr.x2]="R.pile.x + R.pile.w - 4"
        [attr.y1]="danger"
        [attr.y2]="danger"
        stroke="#b3261e"
        stroke-width="4"
        opacity="0.85"
      />
      <text
        [attr.x]="R.pile.x + R.pile.w - 8"
        [attr.y]="danger - 6"
        text-anchor="end"
        class="pochoir rouge"
      >
        DANGER
      </text>
      <line
        [attr.x1]="R.pile.x + 4"
        [attr.x2]="R.pile.x + R.pile.w - 4"
        [attr.y1]="capacite"
        [attr.y2]="capacite"
        stroke="#b3261e"
        stroke-width="1.5"
        stroke-dasharray="6 5"
        opacity="0.6"
      />
      <rect
        [attr.x]="PILE.x - 8"
        [attr.y]="PILE.base"
        [attr.width]="PILE.w + 16"
        height="6"
        rx="2"
        fill="#4d3a26"
      />
      <text
        [attr.x]="R.pile.x + R.pile.w - 10"
        [attr.y]="R.pile.y - 12"
        text-anchor="end"
        class="pochoir sombre"
      >
        ARRIVÉE
      </text>

      <!-- Le tube pneumatique. -->
      <rect [attr.x]="R.tube.x + 20" y="72" width="36" height="40" fill="url(#dz-metal)" />
      <rect
        [attr.x]="R.tube.x"
        [attr.y]="R.tube.y"
        [attr.width]="R.tube.w"
        [attr.height]="R.tube.h"
        rx="8"
        fill="url(#dz-metal)"
        stroke="#3e4a44"
      />
      <ellipse
        [attr.cx]="R.tube.x + R.tube.w / 2"
        [attr.cy]="R.tube.y + R.tube.h - 4"
        rx="22"
        ry="5"
        fill="#222a26"
      />

      <!-- La corbeille en fil de fer. -->
      <g [attr.transform]="'translate(' + R.corbeille.x + ' ' + R.corbeille.y + ')'">
        <ellipse
          [attr.cx]="R.corbeille.w / 2"
          [attr.cy]="R.corbeille.h / 2"
          [attr.rx]="R.corbeille.w / 2 - 6"
          [attr.ry]="R.corbeille.h / 2 - 4"
          fill="#2c2721"
        />
        <ellipse
          [attr.cx]="R.corbeille.w / 2"
          [attr.cy]="R.corbeille.h / 2"
          [attr.rx]="R.corbeille.w / 2 - 6"
          [attr.ry]="R.corbeille.h / 2 - 4"
          fill="none"
          stroke="#9aa196"
          stroke-width="3"
        />
        <path [attr.d]="basket" fill="none" stroke="#9aa196" stroke-width="1" opacity="0.7" />
      </g>

      <!-- Le sous-main en buvard taché. -->
      <rect
        [attr.x]="R.sousmain.x"
        [attr.y]="R.sousmain.y"
        [attr.width]="R.sousmain.w"
        [attr.height]="R.sousmain.h"
        rx="6"
        fill="url(#dz-pad)"
      />
      <rect
        [attr.x]="R.sousmain.x + 4"
        [attr.y]="R.sousmain.y + 4"
        [attr.width]="R.sousmain.w - 8"
        [attr.height]="R.sousmain.h - 8"
        rx="4"
        fill="none"
        stroke="#7b8f6f"
        stroke-opacity="0.35"
      />
      <circle cx="968" cy="168" r="22" fill="#2b4136" opacity="0.6" />
      <circle cx="262" cy="584" r="14" fill="#2b4136" opacity="0.5" />
      @if (jour() >= 2) {
        <circle
          cx="948"
          cy="540"
          r="28"
          fill="none"
          stroke="#5a3d22"
          stroke-width="5"
          opacity="0.45"
        />
      }

      <!-- Le pot à crayons, le porte-tampons, le casier du compteur. -->
      <ellipse
        [attr.cx]="R.pot.x + R.pot.w / 2"
        [attr.cy]="R.pot.y + R.pot.h - 18"
        [attr.rx]="R.pot.w / 2"
        ry="18"
        fill="#3b4a43"
      />
      <rect
        [attr.x]="R.tampons.x"
        [attr.y]="R.tampons.y + 2"
        [attr.width]="R.tampons.w"
        [attr.height]="R.tampons.h - 4"
        rx="6"
        fill="#5a4129"
        stroke="#3c2b1a"
      />
      <rect
        [attr.x]="R.tampons.x + 354"
        [attr.y]="R.tampons.y + 2"
        [attr.width]="R.tampons.w - 358"
        height="48"
        rx="4"
        fill="#4a3522"
      />

      <!-- Bac Sortant, en fil métallique. -->
      <g [attr.transform]="'translate(' + R.sortant.x + ' ' + R.sortant.y + ')'">
        <rect
          [attr.width]="R.sortant.w"
          [attr.height]="R.sortant.h"
          rx="8"
          fill="#43514b"
          stroke="#2c3732"
          stroke-width="2"
        />
        <rect
          x="10"
          y="10"
          [attr.width]="R.sortant.w - 20"
          [attr.height]="R.sortant.h - 20"
          rx="5"
          fill="#2f3b35"
        />
        @for (i of [1, 2, 3, 4, 5, 6]; track i) {
          <line
            [attr.x1]="10 + i * 34"
            y1="12"
            [attr.x2]="10 + i * 34"
            [attr.y2]="R.sortant.h - 12"
            stroke="#5b6b63"
          />
        }
        <rect
          [attr.x]="R.sortant.w / 2 - 75"
          [attr.y]="R.sortant.h - 28"
          width="150"
          height="22"
          rx="2"
          fill="#d8d0b8"
        />
        <text
          [attr.x]="R.sortant.w / 2"
          [attr.y]="R.sortant.h - 12"
          text-anchor="middle"
          class="pochoir"
        >
          SORTANT
        </text>
      </g>

      <!-- Coin de décor : ficus en plastique, gobelet de café froid, badge de l'agent. -->
      <g [attr.transform]="'translate(' + R.deco.x + ' ' + R.deco.y + ')'">
        <ellipse cx="190" cy="176" rx="40" ry="22" fill="#5b3d2a" />
        @for (l of leaves; track $index) {
          <ellipse
            [attr.cx]="190 + l.x"
            [attr.cy]="138 + l.y"
            rx="16"
            ry="7"
            [attr.transform]="'rotate(' + l.r + ' ' + (190 + l.x) + ' ' + (138 + l.y) + ')'"
            [attr.fill]="l.c"
          />
        }
        <circle cx="52" cy="50" r="26" fill="#e9e3d6" stroke="#b8ae9a" stroke-width="2" />
        <circle cx="52" cy="50" r="19" fill="#4a2f1d" />
        <path d="M38 44q14 6 28 0" stroke="#8c6a4c" stroke-width="2" fill="none" opacity="0.8" />
        <g transform="translate(10 104) rotate(-8)">
          <rect width="112" height="66" rx="5" fill="#ece6d8" stroke="#8c8270" />
          <rect x="8" y="8" width="36" height="44" fill="#b9b2a5" />
          <text x="52" y="22" class="badge">AGENT 7B</text>
          <text x="52" y="36" class="badge petit">Matricule</text>
          <text x="52" y="48" class="badge">C-404-17</text>
        </g>
      </g>

      <!-- L'armoire Archives : classeur métallique, étiquette au pochoir. -->
      <g [attr.transform]="'translate(' + R.archives.x + ' ' + R.archives.y + ')'">
        <rect
          [attr.width]="R.archives.w"
          [attr.height]="R.archives.h"
          rx="6"
          fill="url(#dz-metal)"
          stroke="#36423c"
          stroke-width="2"
        />
        @for (i of [0, 1]; track i) {
          <rect
            x="12"
            [attr.y]="12 + i * 112"
            [attr.width]="R.archives.w - 24"
            height="100"
            rx="4"
            fill="#617269"
            stroke="#3e4b45"
          />
          <rect
            [attr.x]="R.archives.w / 2 - 34"
            [attr.y]="78 + i * 112"
            width="68"
            height="10"
            rx="5"
            fill="#2f3934"
          />
          <rect
            [attr.x]="R.archives.w / 2 - 44"
            [attr.y]="24 + i * 112"
            width="88"
            height="18"
            fill="#d8d0b8"
          />
        }
        <text [attr.x]="R.archives.w / 2" y="38" text-anchor="middle" class="pochoir">
          ARCHIVES
        </text>
        <text [attr.x]="R.archives.w / 2" y="150" text-anchor="middle" class="pochoir">
          1974 – 2027
        </text>
        <circle [attr.cx]="R.archives.w - 22" cy="62" r="4" fill="#3e4b45" />
      </g>
    </svg>
  `,
  styles: `
    :host {
      position: absolute;
      inset: 0;
      pointer-events: none;
    }
    svg {
      display: block;
    }
    .poster {
      font:
        600 6.5px 'Barlow Condensed',
        sans-serif;
      fill: #4c4535;
      letter-spacing: 0.04em;
    }
    .poster.red {
      fill: #b3261e;
      font-size: 8px;
    }
    .annee {
      font:
        700 15px 'Allerta Stencil',
        sans-serif;
      fill: #5d7f9b;
    }
    .pochoir {
      font:
        15px 'Allerta Stencil',
        sans-serif;
      fill: #2a2a26;
      letter-spacing: 0.08em;
    }
    .pochoir.sombre {
      fill: #39443f;
      font-size: 11px;
    }
    .pochoir.rouge {
      fill: #b3261e;
      font-size: 10px;
    }
    .badge {
      font:
        700 9px 'Barlow Condensed',
        sans-serif;
      fill: #2d2a25;
    }
    .badge.petit {
      font-weight: 400;
      font-size: 7px;
    }
    .neon {
      filter: drop-shadow(0 0 6px #f3fbe8);
      animation: neon 7s infinite;
    }
    @keyframes neon {
      0%,
      95%,
      100% {
        opacity: 1;
      }
      96% {
        opacity: 0.55;
      }
      97% {
        opacity: 1;
      }
      98% {
        opacity: 0.7;
      }
    }
    .pluie line {
      stroke: #b9c7d3;
      stroke-width: 1;
      opacity: 0.55;
      animation: pluie 0.9s linear infinite;
    }
    .pluie.forte line {
      animation-duration: 0.6s;
      stroke-width: 1.3;
    }
    @keyframes pluie {
      from {
        transform: translate(0, -40px);
      }
      to {
        transform: translate(-10px, 70px);
      }
    }
  `,
})
export class MazeDecor {
  readonly jour = input(1);
  /** De 0 (9 h) à 1 (17 h) : la cour s'assombrit. */
  readonly dusk = input(0);
  /** Néons encore allumés (ils s'éteignent un par un à la fermeture). */
  readonly neons = input(3);

  protected readonly R = R;
  protected readonly PILE = PILE;
  protected readonly danger = PILE.base - CONFIG.pile.danger * PILE.unit;
  protected readonly capacite = PILE.base - CONFIG.pile.capacite * PILE.unit;
  protected readonly rain = Array.from({ length: 34 }, (_, i) => ({
    x: (i * 53) % 240,
    y: (i * 37) % 90,
    delay: -((i * 173) % 900),
  }));
  protected readonly leaves = Array.from({ length: 13 }, (_, i) => ({
    x: Math.cos(i * 2.4) * (12 + (i % 4) * 7),
    y: Math.sin(i * 2.4) * (10 + (i % 3) * 8) - i * 3,
    r: i * 41,
    c: i % 3 ? '#4f7a4a' : '#6b9460',
  }));
  protected readonly basket = Array.from({ length: 9 }, (_, i) => `M${18 + i * 17} 10v66`).join('');

  protected crack(): string {
    const n = this.jour();
    let d = 'M610 0l6 12-4 9 7 10';
    for (let i = 0; i < n; i++) d += `l${i % 2 ? -5 : 6} ${9 + i * 2}`;
    return d;
  }
}
