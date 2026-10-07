import { Component, computed, input, output, signal } from '@angular/core';
import { todayIso } from '../../core/task-utils';

/** Oltre questi giorni una colonna vale una settimana, altrimenti la mappa diventa illeggibile. */
const MAX_DAILY_COLUMNS = 92;

/** Soglie dei quattro livelli di colore: azioni in un giorno o in una settimana. */
const DAY_LEVELS = [1, 3, 6, 10];
const WEEK_LEVELS = [1, 5, 15, 30];

const MONTHS = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
const WEEKDAYS = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];

export interface ActivityColumn {
  /** Primo giorno della colonna (AAAA-MM-GG). */
  key: string;
  /** Giorni compresi nella colonna (uno, o fino a sette per le settimane). */
  days: string[];
  /** Etichetta sopra la colonna, solo ogni tanto per non affollare. */
  label: string;
  weekend: boolean;
}

export interface ActivityRow {
  id: string;
  label: string;
  counts: Record<string, number>;
  /** Segnali legati a un giorno preciso (es. note scritte in blocco), per giorno. */
  marks: Record<string, string[]>;
}

const parseDay = (day: string): Date => {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year, month - 1, date);
};

const shortDate = (date: Date): string => `${date.getDate()} ${MONTHS[date.getMonth()]}`;

/**
 * Colonne della mappa tra due giorni compresi: una per giorno, o una per settimana
 * (da lunedì) se il periodo è lungo.
 */
export const activityColumns = (from: string, to: string): ActivityColumn[] => {
  const days: string[] = [];
  for (let date = parseDay(from); todayIso(date) <= to; date.setDate(date.getDate() + 1)) {
    days.push(todayIso(date));
  }
  if (days.length <= MAX_DAILY_COLUMNS) {
    return days.map((day, index) => {
      const date = parseDay(day);
      const weekday = date.getDay();
      return {
        key: day,
        days: [day],
        // Un'etichetta al lunedì (e sul primo giorno), come un calendario
        label: weekday === 1 || index === 0 ? shortDate(date) : '',
        weekend: weekday === 0 || weekday === 6,
      };
    });
  }
  const columns: ActivityColumn[] = [];
  let lastMonth = -1;
  for (const day of days) {
    const date = parseDay(day);
    if (columns.length === 0 || date.getDay() === 1) {
      // Etichetta solo sulla prima settimana di ogni mese
      const label = date.getMonth() !== lastMonth ? MONTHS[date.getMonth()] : '';
      lastMonth = date.getMonth();
      columns.push({ key: day, days: [], label, weekend: false });
    }
    columns[columns.length - 1].days.push(day);
  }
  return columns;
};

/** Livello di colore (0-4) per un numero di azioni. */
export const activityLevel = (count: number, weekly: boolean): number =>
  (weekly ? WEEK_LEVELS : DAY_LEVELS).filter((threshold) => count >= threshold).length;

interface Tooltip {
  text: string;
  x: number;
  y: number;
}

/**
 * Mappa dell'attività: una riga per dipendente, una casella per giorno (o settimana),
 * più scura quante più azioni ha registrato. I giorni con un segnale hanno un bordo.
 */
@Component({
  selector: 'app-activity-map',
  template: `
    <div class="scroll">
      <div class="map" [style.--columns]="columns().length" [class.weekly]="weekly()">
        <span></span>
        <div class="header" aria-hidden="true">
          @for (column of columns(); track column.key) {
            <span class="column-label">{{ column.label }}</span>
          }
        </div>
        @for (row of cells(); track row.id) {
          <button
            type="button"
            class="name"
            [title]="'Mostra i segnali di ' + row.label"
            [class.selected]="selectedRow() === row.id"
            (click)="selected.emit(selectedRow() === row.id ? '' : row.id)"
          >
            {{ row.label }}
          </button>
          <div class="cells" role="img" [attr.aria-label]="row.summary">
            @for (cell of row.cells; track cell.key) {
              <span
                class="cell"
                [class]="'cell level-' + cell.level"
                [class.weekend]="cell.weekend && cell.level === 0"
                [class.marked]="cell.marks.length > 0"
                (mouseenter)="showTip($event, row.label, cell)"
                (mousemove)="moveTip($event)"
                (mouseleave)="tip.set(null)"
              ></span>
            }
          </div>
        }
      </div>
    </div>
    <div class="legend">
      <span>Meno</span>
      @for (level of [0, 1, 2, 3, 4]; track level) {
        <span class="cell" [class]="'cell level-' + level" [title]="levelLabel(level)"></span>
      }
      <span>Più</span>
      <span class="muted"
        >· {{ weekly() ? 'una casella per settimana' : 'una casella per giorno' }}</span
      >
      <span class="key"
        ><span class="cell marked" aria-hidden="true"></span> giorno con un segnale</span
      >
    </div>
    @if (tip(); as t) {
      <div class="tooltip" role="tooltip" [style.left.px]="t.x" [style.top.px]="t.y">
        {{ t.text }}
      </div>
    }
  `,
  styles: `
    :host {
      display: grid;
      gap: var(--space-3);
      min-width: 0;
    }
    .scroll {
      overflow-x: auto;
    }
    .map {
      display: grid;
      grid-template-columns: minmax(90px, 150px) minmax(calc(var(--columns) * 9px), 1fr);
      align-items: center;
      gap: 3px var(--space-3);
    }
    .header,
    .cells {
      display: grid;
      grid-template-columns: repeat(var(--columns), minmax(0, 1fr));
      gap: 2px;
    }
    .column-label {
      overflow: visible;
      color: var(--color-text-muted);
      font-size: 0.65rem;
      white-space: nowrap;
    }
    .name {
      overflow: hidden;
      padding: 0;
      border: 0;
      background: none;
      color: var(--color-text);
      font-size: var(--text-sm);
      text-align: left;
      text-overflow: ellipsis;
      white-space: nowrap;
      cursor: pointer;

      &:hover,
      &.selected {
        color: var(--color-primary-text);
        text-decoration: underline;
      }
    }
    .cell {
      display: block;
      height: 16px;
      border-radius: 3px;
      background: var(--heat-0);

      .weekly & {
        height: 14px;
      }
      &.weekend {
        background: var(--heat-weekend);
      }
      &.level-1 {
        background: var(--heat-1);
      }
      &.level-2 {
        background: var(--heat-2);
      }
      &.level-3 {
        background: var(--heat-3);
      }
      &.level-4 {
        background: var(--heat-4);
      }
      &.marked {
        box-shadow:
          inset 0 0 0 2px var(--chart-sev-high),
          inset 0 0 0 3px var(--color-surface-2);
      }
    }
    .legend {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-1) 4px;
      color: var(--color-text-muted);
      font-size: var(--text-xs);

      .cell {
        width: 14px;
        height: 14px;
      }
    }
    .key {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      margin-left: var(--space-3);
    }
    .tooltip {
      position: fixed;
      z-index: 70;
      padding: var(--space-1) var(--space-2);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
      background: var(--color-surface-2);
      box-shadow: var(--shadow-md);
      color: var(--color-text);
      font-size: var(--text-xs);
      white-space: nowrap;
      pointer-events: none;
      transform: translate(-50%, calc(-100% - 10px));
    }
  `,
})
export class ActivityMap {
  readonly from = input.required<string>();
  readonly to = input.required<string>();
  readonly rows = input.required<ActivityRow[]>();
  readonly selectedRow = input('');
  readonly selected = output<string>();

  protected readonly tip = signal<Tooltip | null>(null);

  protected readonly columns = computed(() => activityColumns(this.from(), this.to()));
  protected readonly weekly = computed(() => this.columns().some((c) => c.days.length > 1));

  protected readonly cells = computed(() => {
    const weekly = this.weekly();
    return this.rows().map((row) => {
      let total = 0;
      let activeDays = 0;
      const cells = this.columns().map((column) => {
        const count = column.days.reduce((sum, day) => sum + (row.counts[day] ?? 0), 0);
        activeDays += column.days.filter((day) => (row.counts[day] ?? 0) > 0).length;
        total += count;
        return {
          key: column.key,
          days: column.days,
          count,
          level: activityLevel(count, weekly),
          weekend: column.weekend,
          marks: column.days.flatMap((day) => row.marks[day] ?? []),
        };
      });
      const summary = `${row.label}: ${total} azioni in ${activeDays} giorni`;
      return { ...row, cells, summary };
    });
  });

  protected levelLabel(level: number): string {
    const levels = this.weekly() ? WEEK_LEVELS : DAY_LEVELS;
    if (level === 0) return 'Nessuna azione';
    const next = levels[level];
    return next ? `${levels[level - 1]}-${next - 1} azioni` : `${levels[level - 1]} o più azioni`;
  }

  protected showTip(
    event: MouseEvent,
    name: string,
    cell: { days: string[]; count: number; marks: string[] },
  ): void {
    const first = parseDay(cell.days[0]);
    const when =
      cell.days.length > 1
        ? `settimana dal ${shortDate(first)}`
        : `${WEEKDAYS[first.getDay()]} ${shortDate(first)}`;
    const actions = cell.count === 1 ? '1 azione' : `${cell.count} azioni`;
    const marks = cell.marks.length ? ` · ${[...new Set(cell.marks)].join(', ')}` : '';
    this.tip.set({
      text: `${name} · ${when}: ${actions}${marks}`,
      x: event.clientX,
      y: event.clientY,
    });
  }

  protected moveTip(event: MouseEvent): void {
    this.tip.update((tip) => (tip ? { ...tip, x: event.clientX, y: event.clientY } : tip));
  }
}
