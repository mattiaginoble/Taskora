import { Component, computed, input, signal } from '@angular/core';
import { Task } from '../../core/models';
import { DueBucket, addDaysIso, dueBucket, formatDate, todayIso } from '../../core/task-utils';

/** Finestra mostrata: quattro settimane indietro e sei avanti; il resto va ai bordi. */
const DAYS_BEFORE = 28;
const DAYS_AFTER = 42;
const DAY_MS = 24 * 60 * 60 * 1000;

const MONTHS = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

const BUCKET_LABEL: Record<DueBucket, string> = {
  overdue: 'Scaduta',
  soon: 'Entro 7 giorni',
  later: 'Più avanti',
  none: 'Senza scadenza',
};

export interface TimelineRow {
  id: string;
  label: string;
  tasks: Task[];
}

interface Tooltip {
  lines: string[];
  x: number;
  y: number;
}

const parseDay = (day: string): Date => {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year, month - 1, date);
};

const shortDate = (day: string): string => {
  const date = parseDay(day);
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
};

/**
 * Linea del tempo delle scadenze: una riga per persona, un pallino per ogni giorno con
 * task aperte in scadenza (con il numero se sono più di una). Le date fuori dalla
 * finestra stanno sul bordo, segnate da un pallino vuoto.
 */
@Component({
  selector: 'app-deadline-timeline',
  template: `
    <ul class="legend">
      @for (item of legend; track item.key) {
        <li>
          <span class="dot sample" [class]="'dot sample ' + item.key" aria-hidden="true"></span>
          {{ item.label }}
        </li>
      }
      <li><span class="dot sample edge" aria-hidden="true"></span> Fuori dalla finestra</li>
    </ul>
    <div class="scroll">
      <div class="timeline">
        <span></span>
        <div class="axis" aria-hidden="true">
          @for (tick of ticks(); track tick.day) {
            <span class="tick" [style.left.%]="tick.left">{{ tick.label }}</span>
          }
          <span class="today-label" [style.left.%]="todayLeft">Oggi</span>
        </div>
        @for (row of groups(); track row.id) {
          <span class="name" [title]="row.label">{{ row.label }}</span>
          <div class="track" role="img" [attr.aria-label]="row.summary">
            @for (tick of ticks(); track tick.day) {
              <span class="grid" [style.left.%]="tick.left"></span>
            }
            <span class="today" [style.left.%]="todayLeft"></span>
            @for (dot of row.dots; track dot.day) {
              <span
                class="dot"
                [class]="'dot ' + dot.bucket"
                [class.edge]="dot.edge"
                [class.many]="dot.tasks.length > 1"
                [style.left.%]="dot.left"
                (mouseenter)="showTip($event, row.label, dot.day, dot.tasks)"
                (mouseleave)="tip.set(null)"
              >
                @if (dot.tasks.length > 1) {
                  {{ dot.tasks.length }}
                }
              </span>
            }
          </div>
        } @empty {
          <span></span>
          <p class="muted">Nessuna task aperta con una scadenza.</p>
        }
      </div>
    </div>
    @if (tip(); as t) {
      <div class="tooltip" role="tooltip" [style.left.px]="t.x" [style.top.px]="t.y">
        @for (line of t.lines; track $index) {
          <span [class.title]="$index === 0">{{ line }}</span>
        }
      </div>
    }
  `,
  styles: `
    :host {
      display: grid;
      gap: var(--space-3);
      min-width: 0;
    }
    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-1) var(--space-4);
      color: var(--color-text-muted);
      font-size: var(--text-xs);

      li {
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
    }
    /* Su schermi stretti la linea scorre di lato invece di schiacciare le date */
    .scroll {
      overflow-x: auto;
    }
    .timeline {
      display: grid;
      min-width: 560px;
      grid-template-columns: minmax(80px, 150px) minmax(0, 1fr);
      align-items: center;
      gap: 6px var(--space-3);
    }
    .axis,
    .track {
      position: relative;
      /* Spazio ai lati: i pallini sui bordi non escono */
      margin: 0 10px;
    }
    .axis {
      height: 16px;
    }
    .tick,
    .today-label {
      position: absolute;
      color: var(--color-text-muted);
      font-size: 0.65rem;
      white-space: nowrap;
      transform: translateX(-50%);
    }
    .today-label {
      color: var(--color-text);
      font-weight: 700;
    }
    .name {
      overflow: hidden;
      font-size: var(--text-sm);
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .track {
      height: 24px;
      border-radius: var(--radius-sm);
      background: var(--heat-weekend);
    }
    .grid,
    .today {
      position: absolute;
      top: 0;
      bottom: 0;
      width: 1px;
      background: var(--color-border);
    }
    .today {
      width: 2px;
      margin-left: -1px;
      background: var(--color-text);
      opacity: 0.6;
    }
    .dot {
      position: absolute;
      top: 50%;
      display: grid;
      place-items: center;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      color: #fff;
      font-size: 0.6rem;
      font-weight: 700;
      box-shadow: 0 0 0 2px var(--color-surface-2);
      transform: translate(-50%, -50%);
      cursor: default;

      &.many {
        width: 18px;
        height: 18px;
      }
      &.overdue {
        background: var(--chart-sev-high);
      }
      &.soon {
        background: var(--chart-sev-medium);
      }
      &.later {
        background: var(--chart-sev-info);
      }
      /* Data fuori dalla finestra: pallino vuoto sul bordo */
      &.edge {
        border: 2px solid currentColor;
        background: var(--color-surface-2);
        color: var(--color-text);

        &.overdue {
          color: var(--chart-sev-high);
        }
        &.later {
          color: var(--chart-sev-info);
        }
      }
      &.sample {
        position: static;
        width: 10px;
        height: 10px;
        box-shadow: none;
        transform: none;
      }
    }
    .tooltip {
      position: fixed;
      z-index: 70;
      display: grid;
      gap: 2px;
      max-width: 320px;
      padding: var(--space-1) var(--space-2);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
      background: var(--color-surface-2);
      box-shadow: var(--shadow-md);
      color: var(--color-text);
      font-size: var(--text-xs);
      pointer-events: none;
      transform: translate(-50%, calc(-100% - 12px));

      span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .title {
        font-weight: 700;
      }
    }
  `,
})
export class DeadlineTimeline {
  readonly rows = input.required<TimelineRow[]>();

  protected readonly tip = signal<Tooltip | null>(null);
  protected readonly legend = (['overdue', 'soon', 'later'] as const).map((key) => ({
    key,
    label: BUCKET_LABEL[key],
  }));

  private readonly today = todayIso();
  private readonly start = addDaysIso(-DAYS_BEFORE);
  private readonly end = addDaysIso(DAYS_AFTER);
  protected readonly todayLeft = this.position(this.today);

  /** Un'etichetta per settimana, al lunedì. */
  protected readonly ticks = computed(() => {
    const ticks: { day: string; label: string; left: number }[] = [];
    for (
      let date = parseDay(this.start);
      todayIso(date) <= this.end;
      date.setDate(date.getDate() + 1)
    ) {
      const day = todayIso(date);
      if (date.getDay() === 1 && Math.abs(this.position(day) - this.todayLeft) > 4) {
        ticks.push({ day, label: shortDate(day), left: this.position(day) });
      }
    }
    return ticks;
  });

  protected readonly groups = computed(() =>
    this.rows()
      .map((row) => {
        const byDay = new Map<string, Task[]>();
        for (const task of row.tasks) {
          if (task.stato === 'Completato' || !task.scadenza) continue;
          const day = task.scadenza.slice(0, 10);
          byDay.set(day, [...(byDay.get(day) ?? []), task]);
        }
        const dots = [...byDay.entries()].map(([day, tasks]) => ({
          day,
          tasks,
          bucket: dueBucket(tasks[0]),
          left: this.position(day),
          edge: day < this.start || day > this.end,
        }));
        const overdue = dots
          .filter((d) => d.bucket === 'overdue')
          .reduce((n, d) => n + d.tasks.length, 0);
        const total = dots.reduce((n, d) => n + d.tasks.length, 0);
        const summary = `${row.label}: ${total} task aperte con scadenza, ${overdue} scadute`;
        return { id: row.id, label: row.label, dots, summary };
      })
      .filter((row) => row.dots.length > 0),
  );

  /** Posizione in percentuale nella finestra, bloccata ai bordi. */
  private position(day: string): number {
    const span = parseDay(this.end).getTime() - parseDay(this.start).getTime();
    const offset = parseDay(day).getTime() - parseDay(this.start).getTime();
    return Math.min(100, Math.max(0, (offset / span) * 100));
  }

  protected showTip(event: MouseEvent, name: string, day: string, tasks: Task[]): void {
    const target = event.currentTarget as HTMLElement;
    const box = target.getBoundingClientRect();
    const days = Math.round((parseDay(day).getTime() - parseDay(this.today).getTime()) / DAY_MS);
    const when =
      days === 0 ? 'oggi' : days < 0 ? `scaduta da ${-days} giorni` : `tra ${days} giorni`;
    const shown = tasks.slice(0, 5).map((t) => `• ${t.titolo} (${t.progetto})`);
    if (tasks.length > shown.length) shown.push(`… e altre ${tasks.length - shown.length}`);
    this.tip.set({
      lines: [`${name} · ${formatDate(day)} (${when})`, ...shown],
      x: box.left + box.width / 2,
      y: box.top,
    });
  }
}
