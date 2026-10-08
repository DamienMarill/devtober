import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { NOTES } from '../content/memo';
import { longDate } from './dates';
import type { Releve } from './score';

export type Screen = 'titre' | 'releve' | 'effondrement' | 'pause' | 'suite' | 'licenciement';
export type ScreenAction =
  | 'jouer'
  | 'reprendre'
  | 'demo'
  | 'suivante'
  | 'rejouer'
  | 'continuer'
  | 'titre'
  | 'semaine'
  | 'son';

/**
 * Les écrans hors du bureau, tous en papier administratif : la porte du couloir, le relevé de situation tapé à
 * la machine, le procès-verbal d'effondrement, le formulaire de suspension d'activité.
 */
@Component({
  selector: 'maze-screens',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe],
  host: { class: 'screens' },
  template: `
    @switch (screen()) {
      @case ('titre') {
        <section class="couloir" aria-labelledby="maze-title">
          <div class="porte">
            <div class="vitre"><span class="plaque">GUICHET 7B</span></div>
            <span class="poignee"></span>
          </div>
          <div class="carton">
            <p class="kicker">CAUFD · Centre Administratif Unifié des Formalités Diverses</p>
            <h1 id="maze-title">Dossier Incomplet</h1>
            <p class="pitch">
              Agent de traitement de catégorie C, tu tiens le guichet 7B. Signer, tamponner,
              fouiller les Archives : traite les dossiers avant que la pile ne s'effondre. Ils
              reviendront. Parfois par ta faute.
            </p>
            <div class="actions">
              <button type="button" class="ticket" (click)="act.emit('jouer')">
                Prendre son poste
              </button>
              @if (resume()) {
                <button type="button" class="ticket gris" (click)="act.emit('reprendre')">
                  Reprendre ({{ resume() }})
                </button>
              }
              <button type="button" class="ticket gris" (click)="act.emit('demo')">
                Voir la démo <kbd>T</kbd>
              </button>
            </div>
            <ul class="aide">
              <li>Clic : prendre un dossier, saisir un outil · glisser : déplacer une pièce</li>
              <li>Clic droit maintenu : loupe · clic droit court : reposer l'outil</li>
              <li>Molette : faire pivoter le tampon · double-clic : retourner une pièce</li>
              <li><kbd>Espace</kbd> dossier suivant · <kbd>Échap</kbd> pause · <kbd>M</kbd> son</li>
            </ul>
          </div>
        </section>
      }
      @case ('releve') {
        @if (releve(); as r) {
          <section class="feuille machine" aria-label="Relevé de situation">
            <p class="entete">CAUFD · Service du personnel · Guichet 7B</p>
            <h2>RELEVÉ DE SITUATION</h2>
            <p>Agent 7B · {{ longDate(r.date) }}</p>
            <table>
              <tr>
                <td>Dossiers traités</td>
                <td>{{ r.traites }}</td>
              </tr>
              <tr>
                <td>Retours pour erreur de l'agent</td>
                <td>{{ r.retours.R1 + r.retours.NON_ACCUSE }}</td>
              </tr>
              <tr>
                <td>Retours sans motif</td>
                <td>{{ r.retours.R2 }}</td>
              </tr>
              <tr>
                <td>Pièces égarées par le service</td>
                <td>{{ r.retours.R3 }}</td>
              </tr>
              <tr>
                <td>Classés sans suite</td>
                <td>{{ r.classes }}</td>
              </tr>
              <tr>
                <td>Transférés au guichet 7C</td>
                <td>{{ r.transferes }}</td>
              </tr>
              <tr>
                <td>Temps moyen par dossier</td>
                <td>{{ r.tempsMoyen === null ? '—' : (r.tempsMoyen | number: '1.0-0') + ' s' }}</td>
              </tr>
              <tr class="total">
                <td>Score / objectif</td>
                <td>{{ r.score | number }} / {{ r.objectif | number }}</td>
              </tr>
            </table>
            <p class="note" [attr.data-note]="r.note">{{ r.note }}</p>
            @if (r.note === 'A') {
              <p class="mention">Mention « Agent exemplaire ». Le service n'en revient pas.</p>
            }
            @if (r.avertissement) {
              <p class="avertissement">
                AVERTISSEMENT · objectif du jour non atteint ({{ avertissements() }} sur 3)
              </p>
            }
            @if (r.dossierDuJour; as d) {
              <div class="du-jour">
                <p class="petit">Le dossier de la journée · revenu {{ d.retours }} fois</p>
                <p>
                  <b>{{ d.titre }}</b
                  >, {{ d.nom }} ({{ d.numero }})
                </p>
                <p class="motif">« {{ d.motif }} »</p>
              </div>
            }
            @if (nextNote(); as n) {
              <p class="demain">Demain, note de service n° {{ n.n }} : {{ n.titre }}.</p>
            }
            <div class="actions">
              <button type="button" class="ticket" (click)="act.emit('suivante')">
                {{ r.jour >= lastDay() ? 'Clore la semaine' : 'Journée suivante' }}
              </button>
              <button type="button" class="ticket gris" (click)="act.emit('rejouer')">
                Rejouer la journée
              </button>
            </div>
          </section>
        }
      }
      @case ('effondrement') {
        <section class="feuille machine pv" aria-label="Procès-verbal d'incident">
          <p class="entete">CAUFD · Service de la sécurité des piles</p>
          <h2>PROCÈS-VERBAL D'INCIDENT N° {{ incident() }}</h2>
          <p>
            Le {{ longDate(date()) }}, à {{ heure() }}, la pile Arrivée du guichet 7B a dépassé sa
            capacité réglementaire de 12 unités d'épaisseur. Le bureau est enseveli. L'agent est
            retrouvé indemne, sous un dossier de renouvellement de carte d'identité.
          </p>
          <p>La journée sera reprise depuis 9 h, à l'identique.</p>
          <div class="actions">
            <button type="button" class="ticket" (click)="act.emit('rejouer')">
              Reprendre la journée
            </button>
            <button type="button" class="ticket gris" (click)="act.emit('titre')">
              Quitter le guichet
            </button>
          </div>
        </section>
      }
      @case ('pause') {
        <section class="feuille formulaire" aria-label="Pause">
          <p class="entete">Cerfa n° 00-00 · à remplir en un exemplaire</p>
          <h2>DEMANDE DE SUSPENSION TEMPORAIRE D'ACTIVITÉ</h2>
          <p>L'agent soussigné sollicite (cocher la case utile) :</p>
          <button type="button" class="case" (click)="act.emit('continuer')">
            <span></span> la reprise immédiate du travail
          </button>
          <button type="button" class="case" (click)="act.emit('rejouer')">
            <span></span> le recommencement de la journée, depuis 9 h
          </button>
          <button type="button" class="case" (click)="act.emit('son')">
            <span [class.on]="sound()"></span> le son de l'ambiance de bureau
          </button>
          <button type="button" class="case" (click)="act.emit('titre')">
            <span></span> la sortie du guichet, par le couloir
          </button>
          <p class="petit">Toute suspension non justifiée sera décomptée des congés de l'agent.</p>
        </section>
      }
      @case ('suite') {
        <section class="feuille machine" aria-label="Fin de la démo">
          <p class="entete">CAUFD · Direction</p>
          <h2>LA SUITE EST EN COURS D'INSTRUCTION</h2>
          <p>
            Mercredi (la photocopieuse), jeudi (Gérard est de retour) et vendredi (l'audit, et le
            Bureau 13) ont été déposés au service compétent. Ils reviendront. Probablement pour
            complément d'information.
          </p>
          <div class="actions">
            <button type="button" class="ticket" (click)="act.emit('rejouer')">
              Rejouer mardi
            </button>
            <button type="button" class="ticket gris" (click)="act.emit('semaine')">
              Recommencer la semaine
            </button>
          </div>
        </section>
      }
      @case ('licenciement') {
        <section class="feuille machine" aria-label="Licenciement">
          <p class="entete">CAUFD · Direction des ressources humaines</p>
          <h2>LETTRE DE LICENCIEMENT</h2>
          <p>Trois avertissements en une semaine. L'agent 7B est prié de rendre son tampon.</p>
          <div class="fiche">FICHE DE RETOUR · Pièce manquante : la présente lettre.</div>
          <div class="actions">
            <button type="button" class="ticket" (click)="act.emit('semaine')">
              Recommencer la semaine
            </button>
          </div>
        </section>
      }
    }
  `,
  styles: `
    :host {
      position: absolute;
      inset: 0;
      z-index: 9990;
      display: grid;
      place-items: center;
      background: rgba(14, 12, 10, 0.72);
      color: #24221f;
    }
    .couloir {
      display: flex;
      gap: 48px;
      align-items: center;
    }
    .porte {
      position: relative;
      width: 260px;
      height: 560px;
      background: linear-gradient(90deg, #6a5a44, #7b6950);
      border: 8px solid #4b3d2c;
    }
    .vitre {
      position: absolute;
      inset: 30px 30px 260px;
      background: linear-gradient(135deg, #c9d3cf, #a3b1ac);
      display: grid;
      place-items: center;
    }
    .plaque {
      padding: 8px 14px;
      background: #d9c58a;
      color: #2a2620;
      font:
        22px 'Allerta Stencil',
        sans-serif;
      letter-spacing: 0.12em;
      box-shadow: 0 2px 0 #8f7d4b;
    }
    .poignee {
      position: absolute;
      right: 22px;
      top: 330px;
      width: 40px;
      height: 10px;
      border-radius: 5px;
      background: #c8b98f;
    }
    .carton,
    .feuille {
      max-width: 560px;
      padding: 28px 34px;
      background: #ede6d3;
      box-shadow: 0 18px 40px rgba(0, 0, 0, 0.5);
      font-family: 'Barlow Condensed', sans-serif;
    }
    .feuille {
      max-width: 600px;
      transform: rotate(-0.6deg);
    }
    .machine,
    .machine p,
    .machine td {
      font-family: 'Special Elite', monospace;
      font-size: 15px;
    }
    .kicker,
    .entete {
      margin: 0 0 6px;
      font-size: 13px;
      color: #6b6355;
      letter-spacing: 0.04em;
    }
    h1 {
      margin: 0 0 12px;
      font:
        400 56px/1 'Special Elite',
        monospace;
    }
    h2 {
      margin: 4px 0 12px;
      font:
        400 22px 'Special Elite',
        monospace;
      letter-spacing: 0.04em;
    }
    p {
      margin: 0 0 10px;
      font-size: 17px;
      line-height: 1.35;
    }
    .pitch {
      font-size: 19px;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 18px;
    }
    .ticket {
      padding: 10px 18px;
      border: 2px solid #24221f;
      background: #f3d36b;
      font:
        600 19px 'Barlow Condensed',
        sans-serif;
      cursor: pointer;
      box-shadow: 3px 3px 0 #24221f;
    }
    .ticket.gris {
      background: #d8d0b8;
    }
    .ticket:hover {
      transform: translate(-1px, -1px);
      box-shadow: 4px 4px 0 #24221f;
    }
    kbd {
      padding: 0 5px;
      border: 1px solid #6b6355;
      border-radius: 3px;
      font:
        14px 'Barlow Condensed',
        sans-serif;
    }
    .aide {
      margin: 18px 0 0;
      padding: 0;
      list-style: none;
      font-size: 15px;
      color: #5b554b;
      line-height: 1.5;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 8px 0;
    }
    td {
      padding: 3px 0;
      border-bottom: 1px dotted #9a9080;
    }
    td:last-child {
      text-align: right;
    }
    .total td {
      border-bottom: 2px solid #24221f;
      font-weight: 700;
    }
    .note {
      float: right;
      margin: -6px 0 0 16px;
      width: 74px;
      height: 74px;
      border: 4px double currentColor;
      border-radius: 50%;
      display: grid;
      place-items: center;
      font:
        44px 'Allerta Stencil',
        sans-serif !important;
      color: #2e7d32;
      transform: rotate(-12deg);
    }
    .note[data-note='D'],
    .note[data-note='E'] {
      color: #b3261e;
    }
    .note[data-note='C'],
    .note[data-note='B'] {
      color: #5b3a8c;
    }
    .avertissement {
      color: #b3261e;
      font-weight: 700;
    }
    .mention {
      color: #2e7d32;
    }
    .du-jour {
      clear: both;
      margin: 12px 0;
      padding: 10px 12px;
      background: #f1cbc1;
      transform: rotate(0.8deg);
    }
    .du-jour p {
      margin: 0 0 4px;
    }
    .motif {
      font-style: italic;
    }
    .petit {
      font-size: 13px !important;
      color: #6b6355;
    }
    .demain {
      color: #5b554b;
    }
    .case {
      display: flex;
      gap: 10px;
      align-items: center;
      width: 100%;
      margin: 6px 0;
      padding: 6px 4px;
      border: none;
      background: none;
      font:
        18px 'Barlow Condensed',
        sans-serif;
      text-align: left;
      cursor: pointer;
    }
    .case span {
      width: 16px;
      height: 16px;
      border: 1.5px solid #24221f;
      flex: none;
    }
    .case span.on {
      background: #1f4fa3;
      box-shadow: inset 0 0 0 3px #ede6d3;
    }
    .case:hover span {
      background: rgba(31, 79, 163, 0.25);
    }
    .fiche {
      margin: 12px 0;
      padding: 10px;
      background: #f1cbc1;
      font-family: 'Special Elite', monospace;
    }
  `,
})
export class MazeScreens {
  readonly screen = input.required<Screen>();
  readonly releve = input<Releve | null>(null);
  readonly resume = input<string | null>(null);
  readonly avertissements = input(0);
  readonly sound = input(false);
  readonly incident = input(1);
  readonly date = input('05/10/2026');
  readonly heure = input('');
  readonly lastDay = input(2);
  readonly act = output<ScreenAction>();

  protected readonly longDate = longDate;

  protected nextNote() {
    const r = this.releve();
    return r ? (NOTES[r.jour + 1] ?? null) : null;
  }
}
