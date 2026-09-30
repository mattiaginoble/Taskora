import { Component, computed, inject, signal } from '@angular/core';
import { TASK_STATUSES, Task, TaskStatus } from '../../core/models';
import { PeopleService } from '../../core/people';
import { formatDate, isOverdue, parseTaskEntries } from '../../core/task-utils';
import { ToastService } from '../../core/toast';
import { WorkService } from '../../core/work';
import { PriorityBadge, StatusBadge } from '../../shared/badges';
import { ScheduleBar } from '../../shared/schedule-bar';
import { NewActivity } from '../dashboard/new-activity';
import { ActivityEditor } from './activity-editor';

type SortField =
  | 'utente'
  | 'progetto'
  | 'settore'
  | 'task'
  | 'scadenza'
  | 'priorita'
  | 'avanzamento'
  | 'stato'
  | 'created_at';

interface Row {
  task: Task;
  employee: string;
  lastTask: string;
  overdue: boolean;
}

const PRIORITY_RANK = { Alta: 3, Media: 2, Bassa: 1 } as const;
const STATUS_RANK: Record<TaskStatus, number> = {
  Bloccato: 0,
  'In corso': 1,
  'Da fare': 2,
  Completato: 3,
};

/** Attività (solo admin): tabella completa con filtri, modifica ed eliminazione. */
@Component({
  selector: 'app-activities',
  imports: [StatusBadge, PriorityBadge, ScheduleBar, NewActivity, ActivityEditor],
  templateUrl: './activities.html',
  styleUrl: './activities.scss',
})
export class ActivitiesPage {
  protected readonly work = inject(WorkService);
  private readonly people = inject(PeopleService);
  private readonly toast = inject(ToastService);

  protected readonly statuses = TASK_STATUSES;
  protected readonly formatDate = formatDate;

  protected readonly loading = signal(true);
  protected readonly query = signal('');
  protected readonly status = signal<TaskStatus | ''>('');
  protected readonly sector = signal('');
  protected readonly showCompleted = signal(false);
  protected readonly sort = signal<{ field: SortField; asc: boolean }>({
    field: 'created_at',
    asc: false,
  });
  protected readonly selected = signal(new Set<string>());
  protected readonly creating = signal(false);
  private readonly editingId = signal<string | null>(null);
  protected readonly completing = signal(false);

  protected readonly editing = computed(
    () => this.work.tasks().find((t) => t.id === this.editingId()) ?? null,
  );

  protected readonly rows = computed<Row[]>(() => {
    const query = this.query().trim().toLowerCase();
    const rows = this.work
      .tasks()
      .filter((task) => {
        if (this.status()) {
          if (task.stato !== this.status()) return false;
        } else if (!this.showCompleted() && task.stato === 'Completato') {
          return false;
        }
        if (this.sector() && task.settore !== this.sector()) return false;
        if (!query) return true;
        return [
          task.utente,
          this.people.name(task.utente),
          task.progetto,
          task.assegnato_a,
          this.people.name(task.assegnato_a),
          task.settore,
          task.note,
        ].some((value) =>
          String(value ?? '')
            .toLowerCase()
            .includes(query),
        );
      })
      .map((task) => ({
        task,
        employee: this.people.name(task.utente) || '-',
        lastTask: parseTaskEntries(task.note).pop()?.message ?? '-',
        overdue: isOverdue(task.scadenza, task.stato),
      }));

    const { field, asc } = this.sort();
    const value = (row: Row): string | number => {
      const t = row.task;
      switch (field) {
        case 'utente':
          return row.employee.toLowerCase();
        case 'task':
          return row.lastTask.toLowerCase();
        case 'priorita':
          return PRIORITY_RANK[t.priorita] ?? 2;
        case 'avanzamento':
          return Number(t.avanzamento) || 0;
        case 'stato':
          return STATUS_RANK[t.stato] ?? 9;
        case 'scadenza':
          // Senza scadenza in fondo, in entrambe le direzioni
          return t.scadenza || (asc ? '9999-12-31' : '0000-01-01');
        default:
          return String(t[field] ?? '').toLowerCase();
      }
    };
    return rows.sort((a, b) => {
      const x = value(a);
      const y = value(b);
      const cmp =
        typeof x === 'number' && typeof y === 'number'
          ? x - y
          : String(x).localeCompare(String(y), 'it');
      return asc ? cmp : -cmp;
    });
  });

  protected readonly summary = computed(() => {
    const rows = this.rows();
    const open = rows.filter((r) => r.task.stato !== 'Completato').length;
    const late = rows.filter((r) => r.overdue).length;
    if (rows.length === 0) return 'Nessuna attività';
    return [
      `${rows.length} attività`,
      open !== rows.length ? `${open} aperte` : '',
      late ? `${late} scadute` : '',
    ]
      .filter(Boolean)
      .join(' · ');
  });

  /** Selezionate ancora visibili e non completate. */
  protected readonly selectable = computed(() => {
    const selected = this.selected();
    return this.rows()
      .filter((r) => selected.has(r.task.id) && r.task.stato !== 'Completato')
      .map((r) => r.task);
  });

  protected readonly allSelected = computed(() => {
    const open = this.rows().filter((r) => r.task.stato !== 'Completato');
    return open.length > 0 && open.every((r) => this.selected().has(r.task.id));
  });

  constructor() {
    this.work
      .load()
      .catch((error) => this.toast.error(error))
      .finally(() => this.loading.set(false));
  }

  protected sortBy(field: SortField): void {
    this.sort.update((current) =>
      current.field === field ? { field, asc: !current.asc } : { field, asc: true },
    );
  }

  protected sortIcon(field: SortField): string {
    const { field: active, asc } = this.sort();
    return active === field ? (asc ? '▲' : '▼') : '↕';
  }

  protected toggle(id: string, checked: boolean): void {
    this.selected.update((set) => {
      const next = new Set(set);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  protected toggleAll(checked: boolean): void {
    this.selected.set(
      checked
        ? new Set(
            this.rows()
              .filter((r) => r.task.stato !== 'Completato')
              .map((r) => r.task.id),
          )
        : new Set(),
    );
  }

  protected edit(task: Task): void {
    this.editingId.set(task.id);
  }

  protected closeEditor(): void {
    this.editingId.set(null);
  }

  protected async completeSelected(): Promise<void> {
    const tasks = this.selectable();
    if (tasks.length === 0) return;
    this.completing.set(true);
    try {
      for (const task of tasks) {
        await this.work.update({ id: task.id, stato: 'Completato' });
      }
      this.toast.show(
        tasks.length === 1 ? '1 attività completata' : `${tasks.length} attività completate`,
      );
      this.selected.set(new Set());
    } catch (error) {
      this.toast.error(error);
    } finally {
      this.completing.set(false);
    }
  }
}
