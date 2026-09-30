import { Injectable, signal } from '@angular/core';

/** Nomi da mostrare: username → nome visualizzato (vuoto = username). */
@Injectable({ providedIn: 'root' })
export class PeopleService {
  private readonly people = signal<Record<string, string>>({});

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
