import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { TaskEvent } from '../core/models';
import { PeopleService } from '../core/people';
import { formatDate, formatDateTime, formatHours } from '../core/task-utils';
import { WorkService } from '../core/work';

const FIELD_LABELS: Record<string, string> = {
  titolo: 'testo della task',
  utente: 'owner del task',
  progetto: 'progetto',
  descrizione: 'descrizione',
  scadenza: 'scadenza',
  assegnato_a: 'responsabile',
  priorita: 'priorità',
  settore: 'settore',
  stato: 'stato',
  avanzamento: 'avanzamento',
};

/** Registro modifiche di una o più task (solo admin), caricato quando si apre. */
@Component({
  selector: 'app-event-log',
  template: `
    <details class="events" (toggle)="load($any($event.target).open)">
      <summary>Registro modifiche</summary>
      @if (error()) {
        <p class="muted">{{ error() }}</p>
      } @else if (events() === null) {
        <p class="muted">Caricamento...</p>
      } @else if (events()!.length === 0) {
        <p class="muted">
          Nessuna modifica registrata (il registro parte dall'aggiornamento del sistema).
        </p>
      } @else {
        <ul class="entry-list">
          @for (event of events(); track event.id) {
            <li
              class="entry"
              [class.warning]="
                event.event_type === 'history_edited' || event.event_type === 'deleted'
              "
            >
              <p class="entry-meta">{{ meta(event) }}</p>
              <p class="entry-text">{{ describe(event) }}</p>
            </li>
          }
        </ul>
      }
    </details>
  `,
  styles: `
    .events summary {
      margin-bottom: var(--space-3);
      font-weight: 700;
      cursor: pointer;
    }
    .entry-list {
      max-height: 300px;
      overflow-y: auto;
    }
  `,
})
export class EventLog {
  private readonly work = inject(WorkService);
  private readonly people = inject(PeopleService);

  readonly taskIds = input.required<string[]>();
  /** Cambia quando la task viene salvata, così il registro si ricarica. */
  readonly version = input<string | null>(null);

  protected readonly events = signal<TaskEvent[] | null>(null);
  protected readonly error = signal('');
  private readonly key = computed(() => `${this.taskIds().join(',')}|${this.version()}`);
  private readonly open = signal(false);
  private loadedKey = '';

  constructor() {
    // Si carica all'apertura e di nuovo se la task cambia mentre è aperto
    effect(() => {
      const key = this.key();
      if (this.open() && key !== this.loadedKey) untracked(() => this.fetch(key));
    });
  }

  protected load(open: boolean): void {
    this.open.set(open);
  }

  private async fetch(key: string): Promise<void> {
    this.loadedKey = key;
    this.error.set('');
    this.events.set(null);
    try {
      this.events.set(await this.work.events(this.taskIds()));
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : String(error));
    }
  }

  protected meta(event: TaskEvent): string {
    return `${this.people.name(event.username)} - ${formatDateTime(event.created_at)}`;
  }

  protected describe(event: TaskEvent): string {
    const value = (field: string | null, raw: string | null): string => {
      if (raw === null || raw === '') return '—';
      if (field === 'scadenza') return formatDate(raw);
      if (field === 'avanzamento') return `${raw}%`;
      if (field === 'assegnato_a' || field === 'utente') return this.people.name(raw);
      return raw;
    };
    switch (event.event_type) {
      case 'created':
        return 'ha creato la task';
      case 'note_added':
        return `ha aggiunto una nota: «${event.new_value ?? ''}»`;
      case 'task_added':
        return `ha scritto: «${event.new_value ?? ''}»`;
      case 'hours_logged':
        return `ha registrato ${formatHours(event.new_value)} di lavoro`;
      case 'field_changed':
        return `ha cambiato ${FIELD_LABELS[event.field ?? ''] ?? event.field}: ${value(event.field, event.old_value)} → ${value(event.field, event.new_value)}`;
      case 'history_edited':
        return 'ha riscritto le note';
      case 'deleted':
        return 'ha eliminato la task';
      default:
        return event.event_type;
    }
  }
}
