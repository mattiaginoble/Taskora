import { Component, computed, inject, signal } from '@angular/core';
import { Task, TaskStatus } from '../../core/models';
import { PeopleService } from '../../core/people';
import { SessionService } from '../../core/session';
import { countByStatus, isOverdue } from '../../core/task-utils';
import { ToastService } from '../../core/toast';
import { WorkService } from '../../core/work';
import { StatusDonut } from '../../shared/status-donut';

/** Filtro "Senza settore": task create prima che il settore fosse obbligatorio. */
const NO_SECTOR = '__none__';

interface Totals {
  total: number;
  completed: number;
  completedPercent: number;
  inProgress: number;
  blocked: number;
  overdue: number;
}

interface PersonStats {
  username: string;
  name: string;
  counts: Record<TaskStatus, number>;
  totals: Totals;
}

const totalsOf = (tasks: Task[], counts: Record<TaskStatus, number>): Totals => ({
  total: tasks.length,
  completed: counts.Completato,
  completedPercent: tasks.length ? Math.round((counts.Completato / tasks.length) * 100) : 0,
  inProgress: counts['In corso'],
  blocked: counts.Bloccato,
  overdue: tasks.filter((t) => isOverdue(t.scadenza, t.stato)).length,
});

/** Grafici sugli stati delle task: in generale e per persona. */
@Component({
  selector: 'app-stats',
  imports: [StatusDonut],
  templateUrl: './stats.html',
  styleUrl: './stats.scss',
})
export class StatsPage {
  protected readonly work = inject(WorkService);
  protected readonly session = inject(SessionService);
  private readonly people = inject(PeopleService);
  private readonly toast = inject(ToastService);

  protected readonly loading = signal(true);
  protected readonly sector = signal('');
  protected readonly noSector = NO_SECTOR;

  protected readonly hasNoSector = computed(() => this.work.tasks().some((t) => !t.settore));

  private readonly tasks = computed(() => {
    const sector = this.sector();
    const tasks = this.work.tasks();
    if (!sector) return tasks;
    return tasks.filter((t) => (sector === NO_SECTOR ? !t.settore : t.settore === sector));
  });

  protected readonly counts = computed(() => countByStatus(this.tasks()));
  protected readonly totals = computed(() => totalsOf(this.tasks(), this.counts()));

  /** Una scheda per persona (owner delle task), in ordine di nome. */
  protected readonly persons = computed<PersonStats[]>(() => {
    const byPerson = new Map<string, Task[]>();
    for (const task of this.tasks()) {
      const username = task.utente || 'Sconosciuto';
      byPerson.set(username, [...(byPerson.get(username) ?? []), task]);
    }
    return [...byPerson.entries()]
      .map(([username, list]) => {
        const counts = countByStatus(list);
        return {
          username,
          name: this.people.name(username),
          counts,
          totals: totalsOf(list, counts),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'it', { sensitivity: 'base' }));
  });

  constructor() {
    this.work
      .load()
      .catch((error) => this.toast.error(error))
      .finally(() => this.loading.set(false));
  }

  protected avatar(name: string): string {
    return name.charAt(0).toUpperCase();
  }
}
