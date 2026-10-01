import { Injectable, computed, signal } from '@angular/core';

export interface Person {
  username: string;
  name: string;
}

/** Nomi da mostrare: username → nome visualizzato (vuoto = username). */
@Injectable({ providedIn: 'root' })
export class PeopleService {
  private readonly people = signal<Record<string, string>>({});

  /** Tutti gli utenti, in ordine di nome visualizzato. */
  readonly list = computed<Person[]>(() =>
    Object.entries(this.people())
      .map(([username, name]) => ({ username, name: name || username }))
      .sort((a, b) => a.name.localeCompare(b.name, 'it', { sensitivity: 'base' })),
  );

  set(map: Record<string, string> | null | undefined): void {
    this.people.set(map ?? {});
  }

  name(username: string | null | undefined): string {
    const key = String(username ?? '').trim();
    return key ? this.people()[key] || key : '';
  }

  /** Nomi distinti di un elenco di username, uniti da virgole. */
  names(usernames: (string | null | undefined)[]): string {
    return [...new Set(usernames.map((u) => this.name(u)).filter(Boolean))].join(', ');
  }
}
