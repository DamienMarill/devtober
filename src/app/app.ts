import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SiteNav } from './layout/site-nav';

/** Coque de l'app : barre de navigation fixe, puis la page (accueil ou jour) qui remplit le reste. */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, SiteNav],
  host: { class: 'flex h-dvh flex-col' },
  template: `
    <app-site-nav />
    <main class="relative min-h-0 flex-1 overflow-y-auto">
      <router-outlet />
    </main>
  `,
})
export class App {}
