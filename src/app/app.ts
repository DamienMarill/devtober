import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/**
 * Racine de l'app : un simple point d'entrée du routage. La barre de navigation vit dans la coque
 * (`layout/shell.ts`), ce qui laisse des pages entières, comme `/capture/<jour>`, hors de la coque.
 */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: `<router-outlet />`,
})
export class App {}
