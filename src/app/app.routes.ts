import { Routes } from '@angular/router';
import { DAYS } from './days';

export const routes: Routes = [
  {
    path: '',
    title: 'Devtober 2026',
    loadComponent: () => import('./home/home'),
  },
  ...DAYS.filter((day) => day.load).map((day) => ({
    path: day.slug,
    title: `Devtober · ${day.number} ${day.word}`,
    data: { day: day.number },
    loadComponent: () => import('./day-page/day-page'),
    children: [{ path: '', loadComponent: day.load }],
  })),
  { path: '**', redirectTo: '' },
];
