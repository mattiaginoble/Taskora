import { Component, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api';
import { Task, TaskStatus } from '../../core/models';
import { PeopleService } from '../../core/people';
import { SessionService } from '../../core/session';
import { DueBucket, countByStatus, dueBucket, isOverdue } from '../../core/task-utils';
import { ToastService } from '../../core/toast';
import { WorkService } from '../../core/work';
import { StatusDonut } from '../../shared/status-donut';
import { BarRow, BarSelection, BarSeries, StackedBars } from '../../shared/stacked-bars';
import { TimeChart, TimeSeries } from '../../shared/time-chart';
import { DeadlineTimeline, TimelineRow } from './deadline-timeline';
import { HoursRow, lastWeeks, weeklyHours, weeklyTrend } from './trend';

/** Filtro "Senza settore": task create prima che il settore fosse obbligatorio. */
const NO_SECTOR = '__none__';

const PERIODS = [
  { weeks: 12, label: 'Ultime 12 settimane' },
  { weeks: 26, label: 'Ultimi 6 mesi' },
  { weeks: 52, label: 'Ultimo anno' },
];

/** Urgenza delle task aperte: stessi colori della gravità dei segnali. */
const DUE_SERIES: (BarSeries & { key: DueBucket })[] = [
  { key: 'overdue', label: 'Scadute', color: 'var(--chart-sev-high)' },
  { key: 'soon', label: 'Entro 7 giorni', color: 'var(--chart-sev-medium)' },
  { key: 'later', label: 'Più avanti', color: 'var(--chart-sev-info)' },
  { key: 'none', label: 'Senza scadenza', color: 'var(--chart-todo)' },
];

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
  imports: [StatusDonut, TimeChart, StackedBars, DeadlineTimeline],
  templateUrl: './stats.html',
  styleUrl: './stats.scss',
})
export class StatsPage {
  protected readonly work = inject(WorkService);
  protected readonly session = inject(SessionService);
  private readonly people = inject(PeopleService);
  private readonly toast = inject(ToastService);
  private readonly api = inject(ApiService);

  protected readonly loading = signal(true);
  protected readonly sector = signal('');
  protected readonly noSector = NO_SECTOR;
  protected readonly periods = PERIODS;
  /** Andamento nel tempo: settimane mostrate e persona scelta (vuoto = tutti). */
  protected readonly weeksCount = signal(12);
  protected readonly trendPerson = signal('');
  /** Scadenze e carico: persona scelta dal grafico del carico (vuoto = tutti). */
  protected readonly loadPerson = signal('');
  protected readonly dueSeries = DUE_SERIES;
  /** Ore registrate per giorno; null se non è stato possibile caricarle. */
  private readonly hours = signal<HoursRow[] | null>([]);

  protected readonly hasNoSector = computed(() => this.work.tasks().some((t) => !t.settore));

  private readonly tasks = computed(() => {
    const sector = this.sector();
    const tasks = this.work.tasks();
    if (!sector) return tasks;
    return tasks.filter((t) => (sector === NO_SECTOR ? !t.settore : t.settore === sector));
  });

  protected readonly weeks = computed(() => lastWeeks(this.weeksCount()));
  protected readonly weekLabels = computed(() => this.weeks().map((w) => w.label));
  protected readonly weekTitles = computed(() =>
    this.weeks().map((w, i, all) =>
      i === all.length - 1 ? `Settimana in corso (dal ${w.label})` : `Settimana dal ${w.label}`,
    ),
  );

  private readonly trendTasks = computed(() => {
    const person = this.trendPerson();
    return person
      ? this.tasks().filter((t) => (t.utente || 'Sconosciuto') === person)
      : this.tasks();
  });

  private readonly trend = computed(() => weeklyTrend(this.trendTasks(), this.weeks()));

  protected readonly flowSeries = computed<TimeSeries[]>(() => [
    {
      key: 'created',
      label: 'Create',
      color: 'var(--chart-progress)',
      values: this.trend().created,
    },
    {
      key: 'completed',
      label: 'Completate',
      color: 'var(--chart-done)',
      values: this.trend().completed,
    },
  ]);

  protected readonly openSeries = computed<TimeSeries[]>(() => [
    { key: 'open', label: 'Aperte', color: 'var(--color-primary)', values: this.trend().open },
  ]);

  protected readonly hoursAvailable = computed(() => this.hours() !== null);
  protected readonly hoursSeries = computed<TimeSeries[]>(() => {
    const sector = this.sector();
    const person = this.trendPerson();
    const rows = (this.hours() ?? []).filter(
      (row) =>
        (!person || row.username === person) &&
        (!sector || (sector === NO_SECTOR ? !row.settore : row.settore === sector)),
    );
    return [
      {
        key: 'hours',
        label: 'Ore',
        color: 'var(--color-primary)',
        values: weeklyHours(rows, this.weeks()),
      },
    ];
  });

  /** Frase di sintesi sotto i grafici: il lavoro accumulato cresce o cala? */
  protected readonly trendSummary = computed(() => {
    const { created, completed, open } = this.trend();
    const sum = (values: number[]) => values.reduce((total, v) => total + v, 0);
    const createdTotal = sum(created);
    const completedTotal = sum(completed);
    const first = open[0] ?? 0;
    const last = open[open.length - 1] ?? 0;
    const direction =
      last > first
        ? `le task aperte sono salite da ${first} a ${last}`
        : last < first
          ? `le task aperte sono scese da ${first} a ${last}`
          : `le task aperte sono rimaste ${last}`;
    return `${createdTotal} create, ${completedTotal} completate: ${direction}.`;
  });

  private readonly openTasks = computed(() => this.tasks().filter((t) => t.stato !== 'Completato'));

  /** Carico: task aperte per persona, divise per urgenza; prima chi ne ha di più. */
  protected readonly loadRows = computed<BarRow[]>(() => {
    const rows = new Map<string, BarRow>();
    for (const task of this.openTasks()) {
      const username = task.utente || 'Sconosciuto';
      const row = rows.get(username) ?? {
        id: username,
        label: this.people.name(username),
        values: {},
      };
      const bucket = dueBucket(task);
      row.values[bucket] = (row.values[bucket] ?? 0) + 1;
      rows.set(username, row);
    }
    const total = (row: BarRow) => Object.values(row.values).reduce((n, v) => n + v, 0);
    return [...rows.values()].sort(
      (a, b) =>
        total(b) - total(a) || a.label.localeCompare(b.label, 'it', { sensitivity: 'base' }),
    );
  });

  protected readonly timelineRows = computed<TimelineRow[]>(() =>
    this.loadRows()
      .filter((row) => !this.loadPerson() || row.id === this.loadPerson())
      .map((row) => ({
        id: row.id,
        label: row.label,
        tasks: this.openTasks().filter((t) => (t.utente || 'Sconosciuto') === row.id),
      }))
      .sort((a, b) => a.label.localeCompare(b.label, 'it', { sensitivity: 'base' })),
  );

  protected selectLoad({ row }: BarSelection): void {
    this.loadPerson.set(row);
  }

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
    // Un anno di ore basta per tutti i periodi
    firstValueFrom(this.api.get<{ hours: HoursRow[] }>('stats.php', { days: '371' }))
      .then((result) => this.hours.set(result.hours))
      .catch(() => this.hours.set(null));
  }

  protected avatar(name: string): string {
    return name.charAt(0).toUpperCase();
  }
}
