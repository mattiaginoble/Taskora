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
        path: 'statistiche',
        title: pageTitle('Statistiche'),
        loadComponent: () => import('./features/stats/stats').then((m) => m.StatsPage),
      },
      {
        path: 'task',
        title: pageTitle('Task'),
        canActivate: [adminGuard],
        loadComponent: () => import('./features/tasks/tasks-page').then((m) => m.TasksPage),
      },
      // Indirizzo della pagina quando si chiamava "Attività"
      { path: 'attivita', redirectTo: 'task' },
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
