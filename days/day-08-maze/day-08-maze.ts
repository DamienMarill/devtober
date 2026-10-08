import { NgTemplateOutlet } from '@angular/common';
import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  signal,
} from '@angular/core';
import { NOTES, REGLES } from './content/memo';
import { SERVICES } from './content/services';
import { Guichet } from './lib/audio';
import { Bureau, type Carry } from './lib/bureau';
import { DAYS } from './lib/config';
import { MazeDecor } from './lib/decor';
import { Demo } from './lib/demo';
import { Desk } from './lib/desk';
import type { Dossier, Piece, Pt } from './lib/model';
import { parseOptions } from './lib/options';
import { MazePaper, strokePath } from './lib/paper';
import { MazePile, type Slab } from './lib/pile';
import { FOLDER, INK_COLOR, PRINT_SIZE } from './lib/scene';
import { releve, type Releve } from './lib/score';
import { MazeScreens, type Screen, type ScreenAction } from './lib/screens';
import { MazeStations } from './lib/stations';
import { STAMP_LABEL } from './lib/rules';
import type { Specimen } from './lib/signature';

const FONTS =
  'https://fonts.googleapis.com/css2?family=Allerta+Stencil&family=Barlow+Condensed:wght@400;600;700&family=Caveat:wght@400;600&family=Reenie+Beanie&family=Special+Elite&display=swap';
const SAVE_KEY = 'devtober-08-guichet-7b';
const LENS = { r: 120, zoom: 2.2 };

/** La campagne : ce qui survit d'une journée à l'autre (et dans la sauvegarde du navigateur). */
interface Campaign {
  v: 1;
  jour: number;
  seed: number;
  avertissements: number;
  /** Les trois signatures déposées le lundi matin (la plus représentative en premier). */
  specimen: Specimen | null;
  /** L'état au début de la journée en cours : la journée se rejoue à l'identique. */
  carry: Carry | null;
}

type Mode = 'titre' | 'specimen' | 'jeu' | 'demo';

@Component({
  selector: 'app-day-08-maze',
  imports: [MazeDecor, MazeStations, MazePile, MazePaper, MazeScreens, NgTemplateOutlet],
  host: {
    class: 'relative block size-full overflow-hidden select-none',
    '[style.background]': 'bands()',
    '(pointerdown)': 'onDown($event)',
    '(pointermove)': 'onMove($event)',
    '(pointerup)': 'onUp($event)',
    '(pointercancel)': 'onUp($event)',
    '(wheel)': 'onWheel($event)',
    '(contextmenu)': '$event.preventDefault()',
    '(document:keydown)': 'onKey($event)',
    '(document:visibilitychange)': 'onVisibility()',
  },
  template: `
    @let d = desk();
    <div
      class="stage"
      [attr.data-rev]="rev()"
      [style.transform]="stageTransform()"
      [class.nocursor]="mode() === 'jeu' || mode() === 'specimen' || mode() === 'demo'"
      [class.pile-hot]="d?.hoverStation === 'pile'"
    >
      <svg class="defs" aria-hidden="true">
        <filter id="maze-ink" x="-10%" y="-20%" width="120%" height="140%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.9"
            numOctaves="2"
            seed="7"
            result="n"
          />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="1.6" />
        </filter>
      </svg>

      <maze-decor [jour]="jour()" [dusk]="dusk()" [neons]="neons()" />
      @if (d) {
        <maze-stations
          [minute]="minute()"
          [tool]="d.tool"
          [stamps]="d.stamps"
          [inkRev]="rev()"
          [dater]="d.dater"
          [dateurActif]="jour() >= 2"
          [score]="score()"
          [jour]="jour()"
          [note]="note().n"
          [regles]="rules().length"
          [hover]="d.hoverStation"
        />
        <maze-pile [slabs]="slabs()" [effondree]="collapsed()" />

        <!-- La chemise ouverte, sous le bordereau. -->
        @if (open(); as o) {
          <div class="chemise-ouverte" [style.background-color]="service(o).couleur">
            <span class="rabat" [class.hot]="d.hoverStation === 'rabat'">▸ Fermer la chemise</span>
          </div>
        }

        <ng-container
          *ngTemplateOutlet="papers; context: { $implicit: d.deskPieces(), lens: false }"
        />

        @if (d.pen; as pen) {
          @if (d.pieces.get(pen.piece); as p) {
            <svg
              class="pen-live"
              [style.width.px]="p.w"
              [style.height.px]="p.h"
              [style.transform]="paperTransform(p)"
              [style.z-index]="p.z + 1"
            >
              <path [attr.d]="penPath()" [attr.stroke]="inkColor(pen.ink)" />
            </svg>
          }
        }

        @if (d.folder && current(); as c) {
          <div
            class="folder"
            [style.left.px]="d.folder.x - folderW / 2"
            [style.top.px]="d.folder.y - folderH / 2"
            [style.z-index]="d.folderZ"
            [style.background-color]="service(c).couleur"
          >
            <ng-container *ngTemplateOutlet="label; context: { $implicit: c }" />
          </div>
        }

        @for (a of d.anims; track a.id) {
          @switch (a.kind) {
            @case ('transmis') {
              <div class="folder envoi" [style.background-color]="serviceOf(a.dossier)"></div>
            }
            @case ('retour') {
              <span class="capsule"></span>
            }
            @case ('classe') {
              <span class="classe">CLASSÉ SANS SUITE</span>
            }
            @case ('points') {
              <span class="delta" [class.neg]="(a.delta ?? 0) < 0"
                >{{ (a.delta ?? 0) > 0 ? '+' : '' }}{{ a.delta }}</span
              >
            }
          }
        }

        @if (d.specimen?.message; as m) {
          <p class="specimen-msg" [class.ok]="d.specimen?.done">{{ m }}</p>
        }
        @if (mode() === 'specimen' && d.tool.k !== 'stylo') {
          <p class="postit guide" style="left: 214px; top: 536px">
            Prenez un stylo dans le pot à crayons.
          </p>
        }

        @for (p of d.postits; track p.id) {
          <p
            class="postit"
            [class.chef]="p.chef"
            [style.left.px]="clampX(p.x)"
            [style.top.px]="p.y"
            [style.--r]="p.rot + 'deg'"
          >
            {{ p.texte }}
          </p>
        }

        @if (d.memoOpen) {
          <section class="memo-zoom" aria-label="Mémo">
            <div class="note-service">
              <p class="entete">NOTE DE SERVICE N° {{ note().n }} · {{ note().titre }}</p>
              @for (l of note().lignes; track $index) {
                <p>{{ l }}</p>
              }
              <p class="signe">Le Chef</p>
            </div>
            <div class="regles">
              <p class="entete">RÈGLES PERMANENTES</p>
              @for (r of rules(); track r.n) {
                <p>
                  <b>n° {{ r.n }}</b> {{ r.texte }}
                </p>
              }
            </div>
          </section>
        }

        @if (d.overlay) {
          <section
            class="tiroir"
            [class.corbeille]="d.overlay === 'corbeille'"
            aria-label="Archives"
          >
            <p class="poignee">
              {{
                d.overlay === 'archives'
                  ? '▴ Refermer le tiroir (Échap)'
                  : '▴ Refermer la corbeille (Échap)'
              }}
            </p>
            <ng-container
              *ngTemplateOutlet="papers; context: { $implicit: d.overlayPieces(), lens: false }"
            />
            <p class="onglet">▾ Dossier en cours : y déposer la pièce</p>
          </section>
        }

        @if (jour() >= 2) {
          <!-- Gérard, agent 7C : on ne voit que son bras en chemisette et sa tasse. Mardi, il ne touche à rien. -->
          <div class="gerard" aria-hidden="true">
            <span class="tasse">MEILLEUR AGENT 1987</span>
          </div>
        }

        <div class="lumiere" [style.opacity]="0.08 + dusk() * 0.3"></div>

        @if (d.lens) {
          <div
            class="loupe"
            [style.left.px]="d.pointer.x - lensR"
            [style.top.px]="d.pointer.y - lensR"
          >
            <div
              class="loupe-in"
              [style.transform]="lensTransform()"
              [class.tiroir-fond]="d.overlay"
            >
              <ng-container
                *ngTemplateOutlet="
                  papers;
                  context: { $implicit: d.overlay ? d.overlayPieces() : d.deskPieces(), lens: true }
                "
              />
            </div>
          </div>
        }

        @if (mode() !== 'titre' && !screen()) {
          <div
            class="curseur"
            [style.transform]="'translate(' + d.pointer.x + 'px,' + d.pointer.y + 'px)'"
          >
            @switch (d.tool.k) {
              @case ('stylo') {
                <svg width="40" height="40" viewBox="0 0 40 40" class="stylo">
                  <path d="M1 39 5 27 29 3l8 8-24 24z" fill="#ece6d8" stroke="#3a3530" />
                  <path
                    d="M1 39l4-12 8 8z"
                    [attr.fill]="inkColor(d.tool.k === 'stylo' ? d.tool.ink : 'bleu')"
                  />
                </svg>
              }
              @case ('tampon') {
                @if (d.tool.k === 'tampon') {
                  <svg
                    class="fantome"
                    [attr.width]="ghost().w + 20"
                    [attr.height]="ghost().h + 20"
                    [style.transform]="'translate(-50%,-50%) rotate(' + d.tool.rot + 'deg)'"
                    [attr.opacity]="d.inkLeft(d.tool.id) > 0 ? 0.55 : 0.25"
                  >
                    <rect
                      x="10"
                      y="10"
                      [attr.width]="ghost().w"
                      [attr.height]="ghost().h"
                      rx="3"
                      fill="none"
                      [attr.stroke]="inkColor(d.stamps[d.tool.id].ink)"
                      stroke-width="2.4"
                      stroke-dasharray="4 3"
                    />
                    <text
                      [attr.x]="ghost().w / 2 + 10"
                      [attr.y]="ghost().h / 2 + 15"
                      text-anchor="middle"
                      [attr.fill]="inkColor(d.stamps[d.tool.id].ink)"
                    >
                      {{ ghostLabel() }}
                    </text>
                  </svg>
                }
              }
              @case ('loupe') {
                <svg width="34" height="34" viewBox="0 0 34 34" class="pointe">
                  <circle
                    cx="13"
                    cy="13"
                    r="10"
                    fill="rgba(200,225,235,.4)"
                    stroke="#3a3530"
                    stroke-width="3"
                  />
                  <path d="M21 21l11 11" stroke="#3a3530" stroke-width="4" />
                </svg>
              }
              @default {
                <svg width="30" height="30" viewBox="0 0 30 30" class="pointe">
                  <path
                    [attr.d]="d.drag?.moved ? fist : hand"
                    fill="#f3ede0"
                    stroke="#2d2a25"
                    stroke-width="1.6"
                    stroke-linejoin="round"
                  />
                </svg>
              }
            }
          </div>
        }
      }

      @if (mode() === 'demo') {
        <p class="demo-badge">
          Démo · le guichet tourne tout seul ·
          <button type="button" (click)="toTitle()">Prendre son poste</button>
        </p>
      }
      @if (debug() && d?.bureau; as b) {
        <pre class="debug">{{ debugText() }}</pre>
      }
      @if (screen(); as s) {
        <maze-screens
          [screen]="s"
          [releve]="report()"
          [resume]="resumeLabel()"
          [avertissements]="warnings()"
          [sound]="sound()"
          [incident]="incident()"
          [date]="params().date"
          [heure]="d?.bureau?.heure() ?? ''"
          [lastDay]="days.length"
          (act)="onScreen($event)"
        />
      }
    </div>

    <ng-template #papers let-list let-lens="lens">
      @for (p of list; track p.uid) {
        <div
          class="paper-wrap"
          [style.transform]="paperTransform(p)"
          [style.z-index]="p.z"
          [class.levee]="!lens && d?.drag?.uid === p.uid && d?.drag?.moved"
        >
          <maze-paper [piece]="p" [v]="p.v" [help]="helpFor(p)" [focus]="focusFor(p)" />
        </div>
      }
    </ng-template>

    <ng-template #label let-c>
      <div class="etiquette">
        <p class="num">{{ service(c).picto }} {{ c.numero }}</p>
        <p class="nom">{{ c.nom }}</p>
        <p class="objet">{{ c.titre }}</p>
        <p class="depot">Déposé le {{ c.depot }}</p>
      </div>
      @if (c.urgent) {
        <span class="ruban"></span>
      }
      @for (g of gommettes(c); track g) {
        <span class="gommette" [style.right.px]="12 + g * 14"></span>
      }
      <span class="hint">glisser dans le bac Sortant · clic : rouvrir</span>
    </ng-template>
  `,
  styles: `
    .stage {
      position: absolute;
      left: 0;
      top: 0;
      width: 1280px;
      height: 720px;
      transform-origin: 0 0;
      overflow: hidden;
      font-family: 'Barlow Condensed', sans-serif;
    }
    .stage.nocursor {
      cursor: none;
    }
    .defs {
      position: absolute;
      width: 0;
      height: 0;
    }
    .paper-wrap {
      position: absolute;
      left: 0;
      top: 0;
      transform-origin: 50% 50%;
      will-change: transform;
    }
    .paper-wrap.levee {
      filter: drop-shadow(0 14px 12px rgba(0, 0, 0, 0.35));
    }
    .pen-live {
      position: absolute;
      left: 0;
      top: 0;
      overflow: visible;
      pointer-events: none;
    }
    .pen-live path {
      fill: none;
      stroke-width: 2.1;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .chemise-ouverte {
      position: absolute;
      left: 218px;
      top: 118px;
      width: 300px;
      height: 452px;
      border-radius: 4px;
      box-shadow: 0 4px 10px rgba(0, 0, 0, 0.35);
    }
    .rabat {
      position: absolute;
      left: 70px;
      top: 452px;
      width: 160px;
      height: 26px;
      border-radius: 0 0 8px 8px;
      background: inherit;
      color: #2d2a25;
      font:
        600 15px/26px 'Barlow Condensed',
        sans-serif;
      text-align: center;
      box-shadow: 0 3px 6px rgba(0, 0, 0, 0.35);
      background-color: inherit;
      filter: brightness(0.92);
    }
    .rabat.hot {
      filter: brightness(1.08);
    }
    .folder {
      position: absolute;
      width: 288px;
      height: 200px;
      border-radius: 4px 10px 6px 4px;
      box-shadow:
        inset 0 -4px 0 rgba(0, 0, 0, 0.18),
        0 10px 18px rgba(0, 0, 0, 0.4);
    }
    .folder.envoi {
      left: 1050px;
      top: 120px;
      z-index: 5000;
      animation: envoi 0.9s ease-in forwards;
    }
    @keyframes envoi {
      to {
        transform: translate(120px, -20px) scale(0.4) rotate(8deg);
        opacity: 0;
      }
    }
    .etiquette {
      position: absolute;
      left: 16px;
      top: 18px;
      width: 200px;
      padding: 6px 8px;
      background: #f3ede0;
      color: #2d2a25;
      font-size: 13px;
      line-height: 16px;
    }
    .etiquette p {
      margin: 0;
    }
    .etiquette .num {
      font-weight: 700;
    }
    .etiquette .objet {
      font-size: 12px;
      color: #5b554b;
    }
    .folder .ruban {
      position: absolute;
      top: 0;
      bottom: 0;
      right: 40px;
      width: 12px;
      background: #c0261e;
    }
    .folder .gommette {
      position: absolute;
      bottom: 14px;
      width: 11px;
      height: 11px;
      border-radius: 50%;
      background: #d62d20;
      box-shadow: 0 0 0 1px #f3ede0;
    }
    .folder .hint {
      position: absolute;
      left: 16px;
      bottom: 10px;
      font-size: 12px;
      color: rgba(30, 28, 25, 0.75);
    }
    .capsule {
      position: absolute;
      left: 58px;
      top: 128px;
      width: 30px;
      height: 14px;
      border-radius: 7px;
      background: linear-gradient(#c7cbd0, #7f868e);
      animation: capsule 0.9s cubic-bezier(0.5, 0, 0.7, 1) forwards;
      z-index: 4000;
    }
    @keyframes capsule {
      60% {
        transform: translateY(var(--chute, 120px)) rotate(200deg);
      }
      to {
        transform: translate(40px, 140px) rotate(320deg);
        opacity: 0;
      }
    }
    .classe {
      position: absolute;
      left: 24px;
      top: 300px;
      padding: 6px 10px;
      border: 4px double #b3261e;
      color: #b3261e;
      font:
        22px 'Allerta Stencil',
        sans-serif;
      transform: rotate(-14deg);
      z-index: 4500;
      animation: classe 2.4s ease-out forwards;
    }
    @keyframes classe {
      from {
        transform: rotate(-14deg) scale(2.4);
        opacity: 0;
      }
      15% {
        transform: rotate(-14deg) scale(1);
        opacity: 1;
      }
      80% {
        opacity: 1;
      }
      to {
        opacity: 0;
      }
    }
    .delta {
      position: absolute;
      left: 880px;
      top: 586px;
      color: #2e7d32;
      font:
        700 22px 'Barlow Condensed',
        sans-serif;
      text-shadow: 0 1px 0 #f3ede0;
      animation: delta 1.6s ease-out forwards;
      z-index: 4500;
    }
    .delta.neg {
      color: #b3261e;
    }
    @keyframes delta {
      to {
        transform: translateY(-40px);
        opacity: 0;
      }
    }
    .postit {
      position: absolute;
      max-width: 230px;
      margin: 0;
      padding: 8px 10px;
      background: #f6e58d;
      color: #2d2a25;
      font:
        18px/1.15 Caveat,
        cursive;
      box-shadow: 0 6px 10px rgba(0, 0, 0, 0.3);
      transform: rotate(var(--r, -3deg));
      z-index: 6000;
      pointer-events: none;
    }
    .postit.chef {
      background: #f8d7a6;
      font-family: 'Reenie Beanie', cursive;
      font-size: 22px;
      z-index: 120;
    }
    .postit.guide {
      --r: -4deg;
    }
    .specimen-msg {
      position: absolute;
      left: 742px;
      top: 430px;
      width: 230px;
      margin: 0;
      padding: 6px 8px;
      background: #f1cbc1;
      font:
        16px 'Special Elite',
        monospace;
      z-index: 5000;
    }
    .specimen-msg.ok {
      background: #cfe3d2;
    }
    .memo-zoom {
      position: absolute;
      left: 250px;
      top: 60px;
      display: flex;
      gap: 18px;
      z-index: 7000;
      pointer-events: none;
    }
    .memo-zoom > div {
      width: 400px;
      padding: 16px 20px;
      background: #efe9da;
      box-shadow: 0 16px 30px rgba(0, 0, 0, 0.45);
      font:
        15px/1.4 'Special Elite',
        monospace;
      color: #24221f;
    }
    .memo-zoom .regles {
      width: 330px;
      background: #f3efe2;
      transform: rotate(1.5deg);
    }
    .memo-zoom p {
      margin: 0 0 8px;
    }
    .memo-zoom .entete {
      font-weight: 700;
      letter-spacing: 0.04em;
    }
    .memo-zoom .signe {
      text-align: right;
      font-family: 'Reenie Beanie', cursive;
      font-size: 20px;
    }
    .tiroir {
      position: absolute;
      inset: 0;
      z-index: 6500;
      background:
        radial-gradient(ellipse at 50% 40%, rgba(60, 50, 40, 0.55), rgba(10, 10, 8, 0.92)), #3b3329;
    }
    .tiroir.corbeille {
      background: radial-gradient(circle at 50% 45%, rgba(40, 36, 30, 0.75), rgba(8, 8, 6, 0.95));
    }
    .poignee,
    .onglet {
      position: absolute;
      left: 50%;
      margin: 0;
      transform: translateX(-50%);
      padding: 8px 18px;
      background: #d8d0b8;
      color: #24221f;
      font:
        600 17px 'Barlow Condensed',
        sans-serif;
      border-radius: 0 0 8px 8px;
      white-space: nowrap;
      z-index: 99999;
    }
    .poignee {
      top: 4px;
    }
    .onglet {
      bottom: 0;
      width: 420px;
      height: 58px;
      line-height: 42px;
      text-align: center;
      border-radius: 10px 10px 0 0;
      background: #f3d36b;
      box-sizing: border-box;
    }
    .gerard {
      position: absolute;
      left: 1330px;
      top: 380px;
      width: 230px;
      height: 46px;
      border-radius: 22px 6px 6px 22px;
      background: linear-gradient(#e8c9a8, #d9b48e);
      box-shadow:
        inset 0 0 0 1px rgba(0, 0, 0, 0.15),
        0 8px 12px rgba(0, 0, 0, 0.3);
      z-index: 3000;
      animation: gerard 47s linear 9s infinite;
      pointer-events: none;
    }
    .gerard::after {
      content: '';
      position: absolute;
      left: 120px;
      top: -6px;
      width: 120px;
      height: 58px;
      background: #eef1f4;
      border-radius: 6px;
    }
    .tasse {
      position: absolute;
      left: -34px;
      top: -10px;
      width: 52px;
      height: 62px;
      padding-top: 18px;
      border-radius: 6px 6px 14px 14px;
      background: #f3ede0;
      color: #b3261e;
      font:
        700 7px/1.1 'Barlow Condensed',
        sans-serif;
      text-align: center;
      box-sizing: border-box;
    }
    @keyframes gerard {
      0%,
      88%,
      100% {
        transform: translateX(0);
      }
      91%,
      95% {
        transform: translateX(-300px);
      }
    }
    .lumiere {
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 8000;
      background:
        radial-gradient(ellipse at 50% 45%, rgba(20, 40, 30, 0) 40%, rgba(8, 18, 14, 0.85) 100%),
        rgba(12, 30, 22, 0.25);
      mix-blend-mode: multiply;
    }
    .loupe {
      position: absolute;
      width: 240px;
      height: 240px;
      border-radius: 50%;
      overflow: hidden;
      z-index: 9000;
      box-shadow:
        0 0 0 6px #3a3530,
        0 0 0 8px #8c8270,
        0 14px 28px rgba(0, 0, 0, 0.5);
      background: #3f5a4d;
      pointer-events: none;
    }
    .loupe-in {
      position: absolute;
      left: 0;
      top: 0;
      width: 1280px;
      height: 720px;
      transform-origin: 0 0;
    }
    .loupe-in.tiroir-fond {
      background: #2e2820;
    }
    .curseur {
      position: absolute;
      left: 0;
      top: 0;
      z-index: 9500;
      pointer-events: none;
    }
    .curseur .stylo {
      position: absolute;
      left: -2px;
      top: -38px;
    }
    .curseur .pointe {
      position: absolute;
      left: -6px;
      top: -4px;
    }
    .curseur .fantome {
      position: absolute;
      left: 0;
      top: 0;
      transform-origin: 0 0;
      overflow: visible;
    }
    .fantome text {
      font:
        17px 'Allerta Stencil',
        sans-serif;
    }
    .demo-badge {
      position: absolute;
      left: 50%;
      top: 116px;
      transform: translateX(-50%);
      margin: 0;
      padding: 6px 14px;
      background: rgba(20, 18, 15, 0.82);
      color: #f3ede0;
      font:
        15px 'Barlow Condensed',
        sans-serif;
      z-index: 9800;
      border-radius: 4px;
    }
    .demo-badge button {
      margin-left: 6px;
      padding: 2px 10px;
      border: none;
      background: #f3d36b;
      font:
        600 15px 'Barlow Condensed',
        sans-serif;
      cursor: pointer;
    }
    .debug {
      position: absolute;
      right: 8px;
      top: 116px;
      margin: 0;
      padding: 8px 10px;
      background: rgba(10, 10, 10, 0.85);
      color: #c8f7c5;
      font:
        11px/1.35 ui-monospace,
        monospace;
      z-index: 9900;
      white-space: pre;
    }
  `,
})
export default class Day08Maze {
  private readonly host = inject(ElementRef<HTMLElement>).nativeElement;
  protected readonly options = parseOptions(typeof location === 'undefined' ? '' : location.search);
  protected readonly days = DAYS;
  protected readonly folderW = FOLDER.w;
  protected readonly folderH = FOLDER.h;
  protected readonly lensR = LENS.r;
  protected readonly hand =
    'M9 27c-3-4-6-9-6-12 0-2 2-3 4-1l3 4V5c0-2 3-2 3 0v8-10c0-2 3-2 3 0v10-8c0-2 3-2 3 0v9-6c0-2 3-2 3 0v12c0 5-2 8-5 10z';
  protected readonly fist = 'M8 27c-3-3-5-7-5-10 0-3 2-5 4-5h15c2 0 4 2 4 4v4c0 4-2 6-5 8z';

  protected readonly mode = signal<Mode>('titre');
  protected readonly screen = signal<Screen | null>('titre');
  protected readonly desk = signal<Desk | null>(null);
  protected readonly rev = signal(0);
  protected readonly report = signal<Releve | null>(null);
  protected readonly sound = signal(false);
  protected readonly debug = signal(this.options.debug);
  protected readonly campaign = signal<Campaign>({
    v: 1,
    jour: 1,
    seed: 0,
    avertissements: 0,
    specimen: null,
    carry: null,
  });
  protected readonly incident = signal(1);
  /** Les avertissements cumulés, relevé du jour compris. */
  protected readonly warnings = signal(0);
  private readonly size = signal({ w: 1280, h: 720 });
  private readonly audio = new Guichet();
  private demo: Demo | null = null;
  private collapseAt = 0;
  private finished = false;
  private last = 0;
  private raf = 0;

  protected readonly jour = computed(() => this.campaign().jour);
  protected readonly params = computed(() => DAYS[this.jour() - 1]);
  protected readonly note = computed(() => NOTES[this.jour()]);
  protected readonly rules = computed(() => REGLES.filter((r) => r.jour <= this.jour()));

  private readonly fit = computed(() => {
    const { w, h } = this.size();
    const s = Math.min(w / 1280, h / 720);
    return { s, x: (w - 1280 * s) / 2, y: (h - 720 * s) / 2 };
  });
  protected readonly stageTransform = computed(() => {
    this.rev();
    const f = this.fit();
    const d = this.desk();
    const shake = d && d.clock < d.shakeUntil ? (Math.random() - 0.5) * 4 : 0;
    return `translate(${f.x + shake}px, ${f.y + shake / 2}px) scale(${f.s})`;
  });
  /** Les bandes autour de la scène prolongent le mur (en haut) et le bureau (en bas), sans bandes noires. */
  protected readonly bands = computed(() => {
    const f = this.fit();
    return `linear-gradient(#c3b388 ${f.y + 60 * f.s}px, #4d3a26 ${f.y + 132 * f.s}px, #775a3b ${f.y + 140 * f.s}px, #6d5134)`;
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() => {
      cancelAnimationFrame(this.raf);
      this.audio.dispose();
    });
    afterNextRender(() => {
      this.loadFonts();
      const observer = new ResizeObserver(() =>
        this.size.set({ w: this.host.clientWidth, h: this.host.clientHeight }),
      );
      observer.observe(this.host);
      destroyRef.onDestroy(() => observer.disconnect());
      if (this.options.debug) Object.assign(window, { day08: this });
      if (this.options.jour) this.newCampaign(this.options.jour);
      const tick = (now: number) => {
        this.raf = requestAnimationFrame(tick);
        const dt = this.last ? Math.min((now - this.last) / 1000, 0.05) : 1 / 60;
        this.last = now;
        this.step(dt);
      };
      this.raf = requestAnimationFrame(tick);
    });
  }

  /* ───────── Boucle ───────── */

  private step(dt: number): void {
    const d = this.desk();
    if (!d) return;
    const running =
      this.mode() === 'demo' ||
      ((this.mode() === 'jeu' || this.mode() === 'specimen') && !this.screen());
    if (running) {
      this.demo?.step(dt);
      d.frame(dt);
      const b = d.bureau;
      if (b?.phase === 'effondre' && !this.collapseAt) {
        this.collapseAt = d.clock;
        this.audio.avalanche();
      }
      if (this.collapseAt && d.clock - this.collapseAt > 1.6 && this.mode() === 'jeu') {
        this.incident.update((n) => n + 1);
        this.screen.set('effondrement');
      }
      if (this.mode() === 'demo' && this.demo?.done) this.startDemo();
      if (b?.phase === 'fini' && !this.finished && this.mode() === 'jeu') this.endDay(b);
    }
    this.rev.update((v) => v + 1);
  }

  private endDay(b: Bureau): void {
    this.finished = true;
    const r = releve(b);
    this.report.set(r);
    const c = this.campaign();
    const avertissements = c.avertissements + (r.avertissement ? 1 : 0);
    const next: Campaign = {
      ...c,
      avertissements,
      jour: Math.min(DAYS.length, c.jour + 1),
      carry: b.carry(),
    };
    this.warnings.set(avertissements);
    this.pending = next;
    if (c.jour < DAYS.length) this.save(next);
    this.screen.set('releve');
  }

  private pending: Campaign | null = null;

  /* ───────── Les journées ───────── */

  private newCampaign(jour = 1): void {
    const prev = this.campaign();
    this.campaign.set({
      v: 1,
      jour,
      seed: this.options.seed ?? Math.floor(Math.random() * 100000),
      avertissements: 0,
      specimen: prev.specimen ?? this.loadSave()?.specimen ?? null,
      carry: null,
    });
    this.startDay();
  }

  /** Ouvre la journée en cours de la campagne (le spécimen d'abord, s'il manque). */
  private startDay(): void {
    const c = this.campaign();
    this.demo = null;
    this.report.set(null);
    this.screen.set(null);
    this.finished = false;
    this.collapseAt = 0;
    if (!c.specimen) {
      const desk = new Desk(null, this.audio, {
        jour: c.jour,
        aide: false,
        dateur: false,
        date: DAYS[c.jour - 1].date,
      });
      desk.startSpecimen();
      desk.onSpecimen = (specimen) => {
        this.campaign.update((x) => ({ ...x, specimen }));
        this.startDay();
      };
      this.desk.set(desk);
      this.mode.set('specimen');
      return;
    }
    const bureau = new Bureau({
      jour: c.jour,
      seed: c.seed,
      specimen: c.specimen,
      carry: c.carry ? structuredClone(c.carry) : null,
      tutoriel: c.jour === 1,
      zen: this.options.zen,
      rules: this.options.large
        ? { seuilSignature: 0.5, toleranceTampon: 24, toleranceRotation: 20 }
        : undefined,
    });
    this.desk.set(
      new Desk(bureau, this.audio, {
        jour: c.jour,
        aide: c.jour === 1,
        dateur: c.jour >= 2,
        date: DAYS[c.jour - 1].date,
      }),
    );
    this.mode.set('jeu');
  }

  private startDemo(): void {
    this.screen.set(null);
    this.report.set(null);
    this.campaign.update((c) => ({ ...c, jour: 2 }));
    this.demo = new Demo(this.audio);
    this.desk.set(this.demo.desk);
    this.mode.set('demo');
    this.collapseAt = 0;
  }

  protected toTitle(): void {
    this.demo = null;
    this.desk.set(null);
    this.mode.set('titre');
    this.screen.set('titre');
  }

  protected onScreen(a: ScreenAction): void {
    void this.enableSound();
    switch (a) {
      case 'jouer':
        return this.newCampaign(1);
      case 'reprendre': {
        const save = this.loadSave();
        if (!save) return this.newCampaign(1);
        this.campaign.set(save);
        return this.startDay();
      }
      case 'demo':
        return this.startDemo();
      case 'suivante': {
        const next = this.pending;
        const c = this.campaign();
        if (!next) return;
        if (next.avertissements >= 3) {
          this.campaign.set(next);
          return this.screen.set('licenciement');
        }
        if (c.jour >= DAYS.length) {
          this.campaign.set({ ...next, jour: c.jour, carry: c.carry });
          return this.screen.set('suite');
        }
        this.campaign.set(next);
        return this.startDay();
      }
      case 'rejouer':
        return this.startDay();
      case 'continuer':
        return this.screen.set(null);
      case 'titre':
        return this.toTitle();
      case 'semaine':
        return this.newCampaign(1);
      case 'son':
        return void this.toggleSound();
    }
  }

  /* ───────── Entrées ───────── */

  private toScene(e: { clientX: number; clientY: number }): Pt {
    const rect = this.host.getBoundingClientRect();
    const f = this.fit();
    return { x: (e.clientX - rect.left - f.x) / f.s, y: (e.clientY - rect.top - f.y) / f.s };
  }

  private interactive(e: Event): boolean {
    const t = e.target as HTMLElement | null;
    if (t?.closest('maze-screens, .demo-badge')) return false;
    return (this.mode() === 'jeu' || this.mode() === 'specimen') && !this.screen();
  }

  protected onDown(e: PointerEvent): void {
    if (this.mode() === 'demo' && !(e.target as HTMLElement).closest('.demo-badge'))
      return this.toTitle();
    if (!this.interactive(e)) return;
    void this.enableSound();
    this.host.setPointerCapture?.(e.pointerId);
    this.desk()?.down(this.toScene(e), e.button);
    e.preventDefault();
  }

  protected onMove(e: PointerEvent): void {
    if (this.mode() === 'demo') return;
    const d = this.desk();
    if (!d || !this.interactive(e)) return;
    for (const ev of e.getCoalescedEvents?.() ?? [e]) d.move(this.toScene(ev));
  }

  protected onUp(e: PointerEvent): void {
    if (!this.interactive(e)) return;
    this.desk()?.up(this.toScene(e), e.button);
  }

  protected onWheel(e: WheelEvent): void {
    if (!this.interactive(e)) return;
    e.preventDefault();
    this.desk()?.wheel(e.deltaY, this.toScene(e));
  }

  protected onKey(e: KeyboardEvent): void {
    const typing = (e.target as HTMLElement | null)?.closest?.('input, textarea');
    if (typing) return;
    const d = this.desk();
    const playing = (this.mode() === 'jeu' || this.mode() === 'specimen') && !this.screen();
    if (playing && d?.focus && d.key(e.key)) {
      e.preventDefault();
      return;
    }
    const k = e.key.toLowerCase();
    // La démo ne coupe pas une journée en cours : depuis le couloir, un écran ou la démo elle-même.
    if (k === 't' && !e.ctrlKey && !e.metaKey && !playing) return this.startDemo();
    if (e.key === 'F3') {
      e.preventDefault();
      this.debug.update((v) => !v);
      return;
    }
    if (k === 'm') return void this.toggleSound();
    if (this.mode() === 'titre' && e.key === 'Enter') return this.onScreen('jouer');
    if (!playing) {
      if (e.key === 'Escape' && this.screen() === 'pause') this.screen.set(null);
      return;
    }
    if (this.debug() && d?.bureau && this.debugKey(e.key, d)) return;
    if (d?.key(e.key)) {
      e.preventDefault();
      return;
    }
    if (e.key === 'Escape') this.screen.set('pause');
  }

  /** F3 : forcer les retours, avancer l'heure, remplir la pile, exporter le journal des gestes. */
  private debugKey(key: string, d: Desk): boolean {
    const b = d.bureau!;
    switch (key) {
      case '1':
        b.forceRetour = 'R1';
        return true;
      case '2':
        b.forceRetour = 'R2';
        return true;
      case '3':
        b.forceRetour = 'R3';
        return true;
      case 'h':
      case 'H':
        b.avancer(60);
        return true;
      case 'p':
      case 'P':
        b.ajouter();
        return true;
      case 'e':
      case 'E': {
        const blob = new Blob([JSON.stringify(d.journal, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `guichet-7b-journal-${b.params.nom.toLowerCase()}.json`;
        a.click();
        return true;
      }
    }
    return false;
  }

  protected onVisibility(): void {
    this.audio.setHidden(document.hidden);
    if (document.hidden && this.mode() === 'jeu' && !this.screen()) this.screen.set('pause');
  }

  private async enableSound(): Promise<void> {
    if (this.sound() || this.mode() === 'demo') return;
    await this.audio.enable();
    this.sound.set(true);
  }

  private async toggleSound(): Promise<void> {
    if (this.sound()) {
      this.audio.disable();
      this.sound.set(false);
    } else {
      await this.audio.enable();
      this.sound.set(true);
    }
  }

  /* ───────── Rendu ───────── */

  protected minute(): number {
    return this.desk()?.bureau?.minute() ?? 9 * 60;
  }
  protected score(): number {
    return this.desk()?.bureau?.score ?? 0;
  }
  protected dusk(): number {
    return Math.max(0, Math.min(1, (this.minute() - 9 * 60) / 480));
  }
  protected neons(): number {
    const b = this.desk()?.bureau;
    if (!b) return 3;
    if (b.phase === 'fini') return 0;
    if (b.phase !== 'grace') return 3;
    return Math.max(0, 3 - Math.floor((b.t - b.params.duree) / 3));
  }
  protected collapsed(): boolean {
    return this.desk()?.bureau?.phase === 'effondre';
  }
  protected current(): Dossier | null {
    return this.desk()?.current() ?? null;
  }
  protected open(): Dossier | null {
    const c = this.current();
    return c && c.etat === 'ouvert' ? c : null;
  }
  protected service(d: Dossier) {
    return SERVICES[d.service];
  }
  protected serviceOf(id: string | undefined): string {
    const d = id ? this.desk()?.bureau?.dossiers.get(id) : undefined;
    return d ? SERVICES[d.service].couleur : '#999';
  }
  protected gommettes(d: Dossier): number[] {
    return Array.from({ length: Math.min(3, d.retours.length) }, (_, i) => i);
  }
  protected slabs(): Slab[] {
    const d = this.desk();
    const b = d?.bureau;
    if (!b) return [];
    const fresh = new Set(
      d.anims
        .filter((a) => (a.kind === 'arrivee' || a.kind === 'retour') && d.clock - a.at < 0.4)
        .map((a) => a.dossier),
    );
    return b.pile.map((id) => {
      const x = b.dossiers.get(id)!;
      const s = SERVICES[x.service];
      return {
        id,
        units: x.epaisseur,
        couleur: s.couleur,
        encre: s.encre,
        picto: s.picto,
        numero: x.numero.slice(-5),
        urgent: x.urgent,
        gommettes: x.retours.length,
        frais: fresh.has(id),
      };
    });
  }
  protected paperTransform(p: Piece): string {
    return `translate(${p.x - p.w / 2}px, ${p.y - p.h / 2}px) rotate(${p.rot}deg)`;
  }
  protected helpFor(p: Piece) {
    const d = this.desk();
    const c = d?.current();
    return c && c.bordereau === p.uid ? d!.help() : null;
  }
  protected focusFor(p: Piece): string | null {
    const f = this.desk()?.focus;
    return f && f.piece === p.uid ? f.champ : null;
  }
  protected penPath(): string {
    const pen = this.desk()?.pen;
    return pen ? strokePath(pen.points) : '';
  }
  protected inkColor(ink: keyof typeof INK_COLOR): string {
    return INK_COLOR[ink];
  }
  protected ghost() {
    const t = this.desk()?.tool;
    return PRINT_SIZE[t?.k === 'tampon' ? t.id : 'VU'];
  }
  protected ghostLabel(): string {
    const d = this.desk();
    const t = d?.tool;
    if (t?.k !== 'tampon') return '';
    return t.id === 'RECU_LE' ? d!.datedText() : STAMP_LABEL[t.id];
  }
  protected lensTransform(): string {
    const p = this.desk()!.pointer;
    return `translate(${LENS.r - p.x * LENS.zoom}px, ${LENS.r - p.y * LENS.zoom}px) scale(${LENS.zoom})`;
  }
  protected clampX(x: number): number {
    return Math.max(8, Math.min(1060, x - 90));
  }
  protected resumeLabel(): string | null {
    const s = this.loadSave();
    return s ? DAYS[s.jour - 1].nom : null;
  }
  protected debugText(): string {
    const d = this.desk()!;
    const b = d.bureau!;
    const lines = [
      `${b.params.nom} · ${b.heure()} · t ${b.t.toFixed(1)} s / ${b.params.duree} s · phase ${b.phase}`,
      `pile ${b.hauteur()} u (${b.pile.length} dossiers) · score ${b.score} / ${b.params.objectif}`,
      `retours en route : ${b.retours.map((r) => `${r.type}@${(r.at - b.t).toFixed(0)}s`).join(' ') || '—'}`,
      `prochaine arrivée : ${(b.arrivees.find((t) => t > b.t) ?? NaN).toFixed(1)} s · ρ≈ ${this.rho(b).toFixed(2)}`,
      `forcé : ${b.forceRetour ?? '—'}   [1][2][3] retour  [H] +1 h  [P] +1 dossier  [E] journal JSON`,
      ...d.journal.slice(-4).map((j) => `  ${j.t.toFixed(1)} ${j.geste} (${j.duree} s)`),
    ];
    return lines.join('\n');
  }
  /** Charge instantanée : temps moyen de traitement mesuré ÷ intervalle effectif des arrivées. */
  private rho(b: Bureau): number {
    const mean = b.stats.durees.length
      ? b.stats.durees.reduce((a, x) => a + x, 0) / b.stats.durees.length
      : 0;
    const hour = b.minute() / 60;
    const slot = [0.8, 1, 1, 0.6, 0.6, 1.2, 1.2, 1.6][
      Math.max(0, Math.min(7, Math.floor(hour - 9)))
    ];
    return mean / (b.params.intervalle / slot);
  }

  /* ───────── Sauvegarde ───────── */

  private save(c: Campaign): void {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(c));
    } catch {
      /* stockage indisponible : la campagne reste en mémoire */
    }
  }

  private loadSave(): Campaign | null {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      const c = raw ? (JSON.parse(raw) as Campaign) : null;
      if (!c || c.v !== 1 || c.jour < 1 || c.jour > DAYS.length) return null;
      // Les premières sauvegardes ne gardaient qu'une signature : on l'enveloppe.
      if (c.specimen && !Array.isArray(c.specimen[0]?.[0]))
        c.specimen = [c.specimen as unknown as Pt[][]];
      return c;
    } catch {
      return null;
    }
  }

  private loadFonts(): void {
    if (document.getElementById('guichet-fonts')) return;
    const link = document.createElement('link');
    link.id = 'guichet-fonts';
    link.rel = 'stylesheet';
    link.href = FONTS;
    document.head.append(link);
  }
}
