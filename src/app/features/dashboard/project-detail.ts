import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { Task } from '../../core/models';
import { PeopleService } from '../../core/people';
import { formatDate, formatHours, isOverdue, summarizeProject } from '../../core/task-utils';
import { PriorityBadge, StatusBadge } from '../../shared/badges';
import { Dialog } from '../../shared/dialog';
import { ScheduleBar } from '../../shared/schedule-bar';
import { NewTask } from '../tasks/new-task';
import { TaskEditor } from '../tasks/task-editor';

const STATUS_ORDER = { 'In corso': 0, Bloccato: 1, 'Da fare': 2, Completato: 3 } as const;

/** Un progetto: riepilogo in alto, le sue task a sinistra e la task scelta a destra. */
@Component({
  selector: 'app-project-detail',
  imports: [Dialog, StatusBadge, PriorityBadge, ScheduleBar, TaskEditor, NewTask],
  templateUrl: './project-detail.html',
  styleUrl: './project-detail.scss',
})
export class ProjectDetail {
  private readonly people = inject(PeopleService);

  /** Task del progetto (sempre aggiornate dal genitore). */
  readonly records = input.required<Task[]>();
  readonly closed = output<void>();

  protected readonly formatDate = formatDate;
  protected readonly summary = computed(() => summarizeProject(this.records()));
  protected readonly eyebrow = computed(() =>
    [
      this.summary().settori.join(', ') || 'Senza settore',
      this.people.names(this.records().map((r) => r.utente)),
    ]
      .filter(Boolean)
      .join(' · '),
  );
  protected readonly done = computed(
    () => this.records().filter((r) => r.stato === 'Completato').length,
  );
  protected readonly hours = computed(() => formatHours(this.summary().ore_lavorate));

  /** Prima quelle in corso e bloccate, poi da fare e completate; a parità, la scadenza più vicina. */
  protected readonly tasks = computed(() =>
    [...this.records()]
      .sort(
        (a, b) =>
          STATUS_ORDER[a.stato] - STATUS_ORDER[b.stato] ||
          String(a.scadenza).localeCompare(String(b.scadenza)) ||
          String(a.created_at).localeCompare(String(b.created_at)),
      )
      .map((task) => ({
        task,
        overdue: isOverdue(task.scadenza, task.stato),
        owner: this.people.name(task.utente),
      })),
  );

  protected readonly selectedId = signal('');
  protected readonly selected = computed(
    () => this.records().find((r) => r.id === this.selectedId()) ?? null,
  );
  protected readonly creating = signal(false);

  constructor() {
    // Se la task scelta non c'è più (eliminata o passata a un altro owner) si prende la prima
    effect(() => {
      if (!this.selected()) this.selectedId.set(this.tasks()[0]?.task.id ?? '');
    });
  }

  /** Su schermi stretti la task scelta sta sotto l'elenco: ci si sposta lì. */
  protected select(id: string, panel: HTMLElement): void {
    this.selectedId.set(id);
    if (window.matchMedia('(max-width: 760px)').matches) {
      setTimeout(() => panel.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
  }

  protected onCreated(task: Task): void {
    this.selectedId.set(task.id);
  }
}
