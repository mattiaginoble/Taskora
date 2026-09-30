import { Routes } from '@angular/router';
import { pageTitle } from './core/app-name';
import { adminGuard, authGuard, guestGuard } from './core/guards';
import { Shell } from './layout/shell';

export const routes: Routes = [
  {
    path: 'login',
    title: pageTitle('Accedi'),
    canActivate: [guestGuard],
    loadComponent: () => import('./features/login/login').then((m) => m.LoginPage),
  },
  {
    path: '',
    component: Shell,
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        title: pageTitle('Dashboard'),
        loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.DashboardPage),
      },
      {
        path: 'attivita',
        title: pageTitle('Attività'),
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./features/activities/activities').then((m) => m.ActivitiesPage),
      },
      {
        path: 'riepilogo',
        title: pageTitle('Riepilogo'),
        canActivate: [adminGuard],
        loadComponent: () => import('./features/report/report').then((m) => m.ReportPage),
      },
      {
        path: 'gestione',
        title: pageTitle('Gestione'),
        canActivate: [adminGuard],
        loadComponent: () => import('./features/admin/admin').then((m) => m.AdminPage),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
