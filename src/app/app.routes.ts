import { Routes } from '@angular/router';
import { PUBLISHED_DAYS, padDay } from './days';
import { Shell } from './layout/shell';

export const routes: Routes = [
  // Page de capture : hors de la coque (pas de navbar), voir `capture/capture.ts`.
  {
    path: 'capture/:slug',
    title: 'Devtober · capture',
    loadComponent: () => import('./capture/capture'),
  },
  {
    path: '',
    component: Shell,
    children: [
      {
        path: '',
        title: 'Devtober 2026',
        loadComponent: () => import('./home/home'),
      },
      ...PUBLISHED_DAYS.map((day) => ({
        path: day.slug,
        title: `Devtober · ${padDay(day.number)} ${day.word}`,
        data: { day: day.number },
        loadComponent: day.entry!.component,
      })),
    ],
  },
  { path: '**', redirectTo: '' },
];
