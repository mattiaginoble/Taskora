import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SessionService } from './session';

/** Pagine riservate agli utenti collegati: senza sessione si va al login. */
export const authGuard: CanActivateFn = async () => {
  // inject() va chiamato prima di qualsiasi await
  const router = inject(Router);
  const user = await inject(SessionService).load();
  return user ? true : router.parseUrl('/login');
};

/** Pagine riservate agli amministratori; gli altri tornano alla dashboard. */
export const adminGuard: CanActivateFn = async () => {
  const session = inject(SessionService);
  const router = inject(Router);
  const user = await session.load();
  if (!user) return router.parseUrl('/login');
  return session.isAdmin() ? true : router.parseUrl('/dashboard');
};

/** Il login non serve a chi è già collegato. */
export const guestGuard: CanActivateFn = async () => {
  const router = inject(Router);
  const user = await inject(SessionService).load();
  return user ? router.parseUrl('/dashboard') : true;
};
