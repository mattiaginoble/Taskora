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
  completed_without_tasks: 'Completata senza task',
  progress_jump: 'Salto di avanzamento',
  due_date_postponed: 'Scadenza posticipata',
  history_edited: 'Storico riscritto',
  deleted: 'Eliminata',
  burst: 'Task inserite in blocco',
  inactive_user: 'Nessun aggiornamento',
};

const PERIODS = [
  { days: 7, label: 'Ultimi 7 giorni' },
  { days: 30, label: 'Ultimi 30 giorni' },
  { days: 90, label: 'Ultimi 90 giorni' },
  { days: 365, label: 'Ultimo anno' },
];

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

  protected readonly users = computed(() =>
    [...(this.report()?.users ?? [])]
      .map((user) => ({ ...user, name: this.people.name(user.username) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'it', { sensitivity: 'base' })),
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

  protected readonly period = computed(() => {
    const report = this.report();
    if (!report) return '';
    return `Dal ${formatDate(report.period.from.slice(0, 10))} al ${formatDate(report.period.to.slice(0, 10))} · clic su una riga per vederne i segnali`;
  });

  protected readonly thresholds = computed(() => {
    const t = this.report()?.thresholds;
    if (!t) return '';
    return `Soglie: attività ferma da ${t.stale_days} giorni, salto di avanzamento di ${t.progress_jump} punti, ${t.burst_count} task in ${t.burst_minutes} minuti. Il registro eventi parte dall'aggiornamento del sistema: salti, riscritture ed eliminazioni precedenti non sono rilevabili.`;
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

  protected setDays(value: string): void {
    this.days.set(Number(value));
    this.load();
  }

  protected setSector(value: string): void {
    this.sector.set(value);
    this.load();
  }

  protected showSignals(user: ReportUser): void {
    this.signalUser.set(user.username);
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
