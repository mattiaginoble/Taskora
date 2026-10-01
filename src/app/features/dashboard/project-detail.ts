import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TASK_STATUSES, Task, TaskEvent, TaskStatus } from '../../core/models';
import { PeopleService } from '../../core/people';
import { SessionService } from '../../core/session';
import {
  clampProgress,
  describeSchedule,
  formatDate,
  formatDateTime,
  formatHours,
  parseTaskEntries,
  summarizeProject,
} from '../../core/task-utils';
import { ToastService } from '../../core/toast';
import { WorkService } from '../../core/work';
import { PriorityBadge, StatusBadge } from '../../shared/badges';
import { Dialog } from '../../shared/dialog';
import { ScheduleBar } from '../../shared/schedule-bar';

const FIELD_LABELS: Record<string, string> = {
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

/** Dettaglio di un progetto: riepilogo, task, aggiornamento e registro. */
@Component({
  selector: 'app-project-detail',
  imports: [Dialog, FormsModule, StatusBadge, PriorityBadge, ScheduleBar],
  templateUrl: './project-detail.html',
  styleUrl: './project-detail.scss',
})
export class ProjectDetail {
  private readonly work = inject(WorkService);
  private readonly toast = inject(ToastService);
  protected readonly people = inject(PeopleService);
  protected readonly session = inject(SessionService);

  /** Attività del progetto (aggiornate dal genitore dopo ogni salvataggio). */
  readonly records = input.required<Task[]>();
  readonly closed = output<void>();

  protected readonly statuses = TASK_STATUSES;
  protected readonly formatDate = formatDate;
  protected readonly summary = computed(() => summarizeProject(this.records()));
  protected readonly eyebrow = computed(() => {
    const count = this.records().length;
    return [
      this.summary().settori.join(', ') || 'Senza settore',
      count > 1 ? `${count} attività` : '',
    ]
      .filter(Boolean)
      .join(' · ');
  });
  protected readonly schedule = computed(() => describeSchedule(this.summary()));
  protected readonly employees = computed(
    () => this.people.names(this.records().map((r) => r.utente)) || '-',
  );
  protected readonly assignedBy = computed(
    () => this.people.names(this.records().map((r) => r.creato_da)) || '-',
  );
  protected readonly hours = computed(() => formatHours(this.summary().ore_lavorate));
  protected readonly lastUpdate = computed(() => formatDateTime(this.summary().updated_at));

  /** Task di tutte le attività, dalla più recente; con più attività riportano stato e scadenza. */
  protected readonly entries = computed(() => {
    const showRecord = this.records().length > 1;
    return this.records()
      .flatMap((record, recordIndex) =>
        parseTaskEntries(record.note).map((entry, entryIndex) => ({
          ...entry,
          author: this.people.name(entry.user),
          record: showRecord ? record : null,
          recordIndex,
          entryIndex,
        })),
      )
      .sort(
        (a, b) =>
          b.sortKey.localeCompare(a.sortKey) ||
          a.recordIndex - b.recordIndex ||
          b.entryIndex - a.entryIndex,
      );
  });

  /** Attività aggiornabili: prima le aperte, poi le più recenti. */
  protected readonly options = computed(() =>
    [...this.records()]
      .sort(
        (a, b) =>
          Number(a.stato === 'Completato') - Number(b.stato === 'Completato') ||
          String(b.created_at).localeCompare(String(a.created_at)),
      )
      .map((record) => {
        const last = parseTaskEntries(record.note).pop()?.message ?? '-';
        return {
          id: record.id,
          label: `${record.stato} · scad. ${formatDate(record.scadenza)} · ${last.length > 50 ? last.slice(0, 50) + '…' : last}`,
        };
      }),
  );

  // Modulo di aggiornamento
  protected readonly selectedId = signal('');
  protected note = '';
  protected hoursInput: number | null = null;
  protected stato: TaskStatus = 'Da fare';
  protected avanzamento = 0;
  protected readonly saving = signal(false);

  // Registro modifiche (solo admin)
  protected readonly events = signal<TaskEvent[] | null>(null);
  protected readonly eventsError = signal('');

  constructor() {
    // Sceglie la prima attività aperta e ne copia stato e avanzamento
    effect(() => {
      const options = this.options();
      const current = this.selectedId();
      if (!options.some((o) => o.id === current)) this.selectRecord(options[0]?.id ?? '');
    });
  }

  protected selectRecord(id: string): void {
    this.selectedId.set(id);
    const record = this.records().find((r) => r.id === id);
    if (record) {
      this.stato = record.stato;
      this.avanzamento = clampProgress(record.avanzamento);
    }
  }

  protected async save(): Promise<void> {
    const record = this.records().find((r) => r.id === this.selectedId());
    if (!record) return;
    const note = this.note.trim();
    const ore = this.hoursInput ? String(this.hoursInput) : '';
    if (
      !note &&
      !ore &&
      this.stato === record.stato &&
      this.avanzamento === clampProgress(record.avanzamento)
    ) {
      this.toast.show('Nessuna modifica da salvare', true);
      return;
    }
    this.saving.set(true);
    try {
      await this.work.update({
        id: record.id,
        stato: this.stato,
        avanzamento: this.avanzamento,
        note_append: note,
        ore,
      });
      this.note = '';
      this.hoursInput = null;
      this.events.set(null);
      this.toast.show('Attività aggiornata');
    } catch (error) {
      this.toast.error(error);
    } finally {
      this.saving.set(false);
    }
  }

  protected async loadEvents(open: boolean): Promise<void> {
    if (!open || this.events()) return;
    this.eventsError.set('');
    try {
      this.events.set(await this.work.events(this.records().map((r) => r.id)));
    } catch (error) {
      this.eventsError.set(error instanceof Error ? error.message : String(error));
    }
  }

  protected describeEvent(event: TaskEvent): string {
    const value = (field: string | null, raw: string | null): string => {
      if (raw === null || raw === '') return '—';
      if (field === 'scadenza') return formatDate(raw);
      if (field === 'avanzamento') return `${raw}%`;
      if (field === 'assegnato_a' || field === 'utente') return this.people.name(raw);
      return raw;
    };
    switch (event.event_type) {
      case 'created':
        return "ha creato l'attività";
      case 'task_added':
        return `ha aggiunto la task: «${event.new_value ?? ''}»`;
      case 'hours_logged':
        return `ha registrato ${formatHours(event.new_value)} di lavoro`;
      case 'field_changed':
        return `ha cambiato ${FIELD_LABELS[event.field ?? ''] ?? event.field}: ${value(event.field, event.old_value)} → ${value(event.field, event.new_value)}`;
      case 'history_edited':
        return 'ha riscritto lo storico delle task';
      case 'deleted':
        return "ha eliminato l'attività";
      default:
        return event.event_type;
    }
  }

  protected eventMeta(event: TaskEvent): string {
    return `${this.people.name(event.username)} - ${formatDateTime(event.created_at)}`;
  }
}
