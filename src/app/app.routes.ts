import { Routes } from '@angular/router';
import { PUBLISHED_DAYS, padDay } from './days';

export const routes: Routes = [
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
  { path: '**', redirectTo: '' },
];
