import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api';
import { Report, ReportUser, SignalSeverity } from '../../core/models';
import { PeopleService } from '../../core/people';
import { formatDate, formatDateTime } from '../../core/task-utils';
import { ToastService } from '../../core/toast';

const SIGNAL_LABELS: Record<string, string> = {
  overdue: 'Scaduta',
  stale: 'Ferma',
  // Segnale dei riepiloghi precedenti alle task singole
  completed_without_tasks: 'Completata senza task',
  progress_jump: 'Salto di avanzamento',
  due_date_postponed: 'Scadenza posticipata',
  history_edited: 'Note riscritte',
  deleted: 'Eliminata',
  burst: 'Note scritte in blocco',
  inactive_user: 'Nessun aggiornamento',
};

const PERIODS = [
  { days: 7, label: 'Ultimi 7 giorni' },
  { days: 30, label: 'Ultimi 30 giorni' },
  { days: 90, label: 'Ultimi 90 giorni' },
  { days: 365, label: 'Ultimo anno' },
];

/** Segnali mostrati per volta: con tanti dipendenti l'elenco diventa lunghissimo. */
const SIGNALS_PAGE = 25;

type SortField =
  | 'name'
  | 'attivita_aperte'
  | 'scadute'
  | 'bloccate'
  | 'completate_periodo'
  | 'task_inserite_periodo'
  | 'ore_periodo'
  | 'giorni_attivi'
  | 'giorni_da_ultimo'
  | 'tempo_medio_completamento'
  | 'segnali';

const COLUMNS: { field: SortField; label: string; title?: string; num?: boolean }[] = [
  { field: 'name', label: 'Dipendente' },
  { field: 'attivita_aperte', label: 'Aperte', title: 'Task non completate', num: true },
  { field: 'scadute', label: 'Scadute', num: true },
  { field: 'bloccate', label: 'Bloccate', num: true },
  { field: 'completate_periodo', label: 'Completate', title: 'Completate nel periodo', num: true },
  {
    field: 'task_inserite_periodo',
    label: 'Task e note',
    title: 'Task create e note scritte nel periodo',
    num: true,
  },
  { field: 'ore_periodo', label: 'Ore', title: 'Ore registrate nel periodo', num: true },
  {
    field: 'giorni_attivi',
    label: 'Giorni attivi',
    title: 'Giorni con almeno una task creata o una nota scritta',
    num: true,
  },
  { field: 'giorni_da_ultimo', label: 'Ultimo aggiornamento' },
  {
    field: 'tempo_medio_completamento',
    label: 'Tempo medio',
    title: 'Dalla creazione al completamento',
    num: true,
  },
  { field: 'segnali', label: 'Segnali', num: true },
];

type NamedUser = ReportUser & { name: string };

/** Riepilogo per gli admin: andamento per dipendente e segnali da verificare. */
@Component({
  selector: 'app-report',
  templateUrl: './report.html',
  styleUrl: './report.scss',
})
export class ReportPage {
  private readonly api = inject(ApiService);
  private readonly people = inject(PeopleService);
  private readonly toast = inject(ToastService);

  protected readonly periods = PERIODS;
  protected readonly columns = COLUMNS;
  protected readonly formatDateTime = formatDateTime;
  private readonly signalsPanel = viewChild<ElementRef<HTMLElement>>('signalsPanel');

  protected readonly days = signal(30);
  protected readonly sector = signal('');
  protected readonly signalUser = signal('');
  protected readonly severity = signal<SignalSeverity | ''>('');
  protected readonly report = signal<Report | null>(null);
  protected readonly sectors = signal<string[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly query = signal('');
  protected readonly onlyAttention = signal(false);
  protected readonly sort = signal<{ field: SortField; asc: boolean }>({
    field: 'name',
    asc: true,
  });
  protected readonly signalsLimit = signal(SIGNALS_PAGE);

  private readonly allUsers = computed<NamedUser[]>(() =>
    (this.report()?.users ?? []).map((user) => ({
      ...user,
      name: this.people.name(user.username),
    })),
  );

  protected readonly totalUsers = computed(() => this.allUsers().length);

  /** Dipendenti filtrati (ricerca, solo da verificare) e ordinati. */
  protected readonly users = computed(() => {
    const query = this.query().trim().toLowerCase();
    const { field, asc } = this.sort();
    const byName = (a: NamedUser, b: NamedUser) =>
      a.name.localeCompare(b.name, 'it', { sensitivity: 'base' });
    return this.allUsers()
      .filter(
        (user) =>
          (!query ||
            user.name.toLowerCase().includes(query) ||
            user.username.toLowerCase().includes(query)) &&
          (!this.onlyAttention() || this.needsAttention(user)),
      )
      .sort((a, b) => {
        if (field === 'name') return asc ? byName(a, b) : byName(b, a);
        // "Mai aggiornato" conta come il più vecchio, il tempo medio mancante va in fondo
        const missing = field === 'giorni_da_ultimo' ? Infinity : null;
        const va = a[field] ?? missing;
        const vb = b[field] ?? missing;
        if (va === null || vb === null) return va === vb ? byName(a, b) : va === null ? 1 : -1;
        return (asc ? va - vb : vb - va) || byName(a, b);
      });
  });

  protected readonly attentionCount = computed(
    () => this.allUsers().filter((user) => this.needsAttention(user)).length,
  );

  protected readonly signalUsers = computed(() => {
    const report = this.report();
    if (!report) return [];
    const names = new Set([
      ...report.users.map((u) => u.username),
      ...report.signals.map((s) => s.username),
    ]);
    return [...names]
      .map((username) => ({ username, name: this.people.name(username) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'it', { sensitivity: 'base' }));
  });

  protected readonly signals = computed(() =>
    (this.report()?.signals ?? [])
      .filter(
        (s) =>
          (!this.signalUser() || s.username === this.signalUser()) &&
          (!this.severity() || s.severity === this.severity()),
      )
      .map((s) => ({
        ...s,
        label: SIGNAL_LABELS[s.type] ?? s.type,
        name: this.people.name(s.username),
      })),
  );

  protected readonly visibleSignals = computed(() => this.signals().slice(0, this.signalsLimit()));

  protected readonly period = computed(() => {
    const report = this.report();
    if (!report) return '';
    return `Dal ${formatDate(report.period.from.slice(0, 10))} al ${formatDate(report.period.to.slice(0, 10))} · clic su una riga per vederne i segnali`;
  });

  protected readonly thresholds = computed(() => {
    const t = this.report()?.thresholds;
    if (!t) return '';
    return `Soglie: task ferma da ${t.stale_days} giorni, salto di avanzamento di ${t.progress_jump} punti, ${t.burst_count} note in ${t.burst_minutes} minuti. Il registro eventi parte dall'aggiornamento del sistema: salti, riscritture ed eliminazioni precedenti non sono rilevabili.`;
  });

  constructor() {
    this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const report = await firstValueFrom(
        this.api.get<Report>('report.php', {
          days: String(this.days()),
          settore: this.sector(),
        }),
      );
      this.people.set(report.people);
      this.sectors.set(report.sectors);
      this.report.set(report);
      this.signalsLimit.set(SIGNALS_PAGE);
      if (!this.signalUsers().some((u) => u.username === this.signalUser())) {
        this.signalUser.set('');
      }
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : String(error));
      this.toast.error(error);
    } finally {
      this.loading.set(false);
    }
  }

  protected sortBy(field: SortField): void {
    // I numeri partono dal più alto: di solito si cerca chi ha più scadute o segnali
    this.sort.update((current) =>
      current.field === field ? { field, asc: !current.asc } : { field, asc: field === 'name' },
    );
  }

  protected sortIcon(field: SortField): string {
    const { field: active, asc } = this.sort();
    return active === field ? (asc ? '▲' : '▼') : '↕';
  }

  protected setSignalUser(username: string): void {
    this.signalUser.set(username);
    this.signalsLimit.set(SIGNALS_PAGE);
  }

  protected setSeverity(value: SignalSeverity | ''): void {
    this.severity.set(value);
    this.signalsLimit.set(SIGNALS_PAGE);
  }

  protected showMoreSignals(): void {
    this.signalsLimit.update((limit) => limit + SIGNALS_PAGE);
  }

  /** Da guardare: scadute, bloccate, segnali o nessun aggiornamento recente. */
  protected needsAttention(user: ReportUser): boolean {
    return user.scadute > 0 || user.bloccate > 0 || user.segnali > 0 || this.isIdle(user);
  }

  protected setDays(value: string): void {
    this.days.set(Number(value));
    this.load();
  }

  protected setSector(value: string): void {
    this.sector.set(value);
    this.load();
  }

  protected showSignals(user: ReportUser): void {
    this.setSignalUser(user.username);
    this.signalsPanel()?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  protected lastUpdate(user: ReportUser): string {
    if (user.ultimo_aggiornamento === null) return 'Mai';
    const days = user.giorni_da_ultimo;
    return `${formatDateTime(user.ultimo_aggiornamento)} (${days === 0 ? 'oggi' : `${days} gg fa`})`;
  }

  protected isIdle(user: ReportUser): boolean {
    const staleDays = this.report()?.thresholds.stale_days ?? 7;
    return user.ultimo_aggiornamento === null || (user.giorni_da_ultimo ?? 0) >= staleDays;
  }

  protected averageTime(user: ReportUser): string {
    const value = user.tempo_medio_completamento;
    if (value === null) return '-';
    return value < 1 ? 'meno di 1 gg' : `${value.toLocaleString('it-IT')} gg`;
  }

  protected hours(value: number): string {
    return value > 0 ? `${value.toLocaleString('it-IT')} h` : '-';
  }
}
