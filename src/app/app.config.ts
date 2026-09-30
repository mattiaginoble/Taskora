import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideRouter, withComponentInputBinding, withHashLocation } from '@angular/router';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withFetch()),
    // Indirizzi con # (index.html#/attivita): funzionano in qualsiasi cartella del server
    // senza regole di riscrittura.
    provideRouter(routes, withComponentInputBinding(), withHashLocation()),
  ],
};
