import { Injectable, signal } from '@angular/core';

type Theme = 'light' | 'dark';
// Stessa chiave della versione precedente, così chi aggiorna ritrova il suo tema.
const STORAGE_KEY = 'todolist-theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<Theme>(this.initialTheme());

  constructor() {
    this.apply();
  }

  toggle(): void {
    this.theme.update((theme) => (theme === 'dark' ? 'light' : 'dark'));
    try {
      localStorage.setItem(STORAGE_KEY, this.theme());
    } catch {
      // archivio del browser non disponibile: il tema vale solo per questa visita
    }
    this.apply();
  }

  private apply(): void {
    document.documentElement.setAttribute('data-theme', this.theme());
  }

  private initialTheme(): Theme {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'dark' || stored === 'light') return stored;
    } catch {
      // ignora
    }
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
}
