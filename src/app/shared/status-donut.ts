import { Component, computed, input, signal } from '@angular/core';
import { TASK_STATUSES, TaskStatus } from '../core/models';

/** Colore di ogni stato: stesse tinte dei badge, regolate per i grafici (vedi styles.scss). */
const STATUS_COLOR: Record<TaskStatus, string> = {
  'Da fare': 'var(--chart-todo)',
  'In corso': 'var(--chart-progress)',
  Completato: 'var(--chart-done)',
  Bloccato: 'var(--chart-blocked)',
};

/** Geometria nel viewBox 0 0 120 120: raggio, spessore dell'anello e spazio tra le fette. */
const RADIUS = 48;
const STROKE = 16;
const GAP = 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

interface Slice {
  status: TaskStatus;
  count: number;
  percent: number;
  color: string;
  dash: string;
  offset: number;
}

/**
 * Diagramma circolare (a ciambella) delle task per stato, con legenda.
 * Passando sopra una fetta o una voce della legenda il centro mostra quello stato.
 */
@Component({
  selector: 'app-status-donut',
  template: `
    <div class="chart" [class.sm]="size() === 'sm'">
      <svg viewBox="0 0 120 120" role="img" [attr.aria-label]="description()">
        @if (total() === 0) {
          <circle class="track" cx="60" cy="60" [attr.r]="radius" [attr.stroke-width]="stroke" />
        }
        @for (slice of slices(); track slice.status) {
          <circle
            class="slice"
            cx="60"
            cy="60"
            [attr.r]="radius"
            [attr.stroke-width]="stroke"
            [attr.stroke]="slice.color"
            [attr.stroke-dasharray]="slice.dash"
            [attr.stroke-dashoffset]="slice.offset"
            [class.dim]="active() && active() !== slice.status"
            (mouseenter)="active.set(slice.status)"
            (mouseleave)="active.set(null)"
          >
            <title>{{ slice.status }}: {{ slice.count }} ({{ slice.percent }}%)</title>
          </circle>
        }
      </svg>
      <div class="center" aria-hidden="true">
        @if (activeSlice(); as slice) {
          <strong>{{ slice.count }}</strong>
          <span>{{ slice.status }} · {{ slice.percent }}%</span>
        } @else {
          <strong>{{ total() }}</strong>
          <span>task</span>
        }
      </div>
    </div>
    <ul class="legend" [class.sm]="size() === 'sm'">
      @for (item of legend(); track item.status) {
        <li
          tabindex="0"
          [class.dim]="active() && active() !== item.status"
          (mouseenter)="active.set(item.status)"
          (mouseleave)="active.set(null)"
          (focus)="active.set(item.status)"
          (blur)="active.set(null)"
        >
          <span class="swatch" [style.background]="item.color" aria-hidden="true"></span>
          <span class="label">{{ item.status }}</span>
          <span class="count">{{ item.count }}</span>
          <span class="percent">{{ item.percent }}%</span>
        </li>
      }
    </ul>
  `,
  styles: `
    :host {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-4) var(--space-5);
    }
    .chart {
      position: relative;
      flex: none;
      width: 200px;
      height: 200px;

      &.sm {
        width: 112px;
        height: 112px;
      }
    }
    svg {
      display: block;
      width: 100%;
      height: 100%;
      transform: rotate(-90deg);
    }
    circle {
      fill: none;
    }
    .track {
      stroke: var(--color-border);
    }
    .slice {
      cursor: pointer;
      transition: opacity var(--transition);
    }
    .dim {
      opacity: 0.3;
    }
    .center {
      position: absolute;
      inset: 0;
      display: grid;
      place-content: center;
      padding: 0 22%;
      text-align: center;
      pointer-events: none;

      strong {
        font-size: 2rem;
        line-height: 1.1;
        font-variant-numeric: tabular-nums;
      }
      span {
        color: var(--color-text-muted);
        font-size: var(--text-xs);
        line-height: 1.3;
      }
      .sm & strong {
        font-size: var(--text-lg);
      }
      .sm & span {
        font-size: 0.65rem;
      }
    }
    .legend {
      display: grid;
      flex: 1 1 180px;
      gap: var(--space-1);
      min-width: 0;
      font-size: var(--text-sm);

      &.sm {
        flex-basis: 130px;
        font-size: var(--text-xs);
        gap: 2px;
      }
      li {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto 3rem;
        align-items: center;
        gap: var(--space-2);
        padding: 2px var(--space-2);
        border-radius: var(--radius-sm);
        transition: opacity var(--transition);

        &:hover,
        &:focus-visible {
          background: var(--color-primary-soft);
          outline: none;
        }
      }
      &.sm li {
        grid-template-columns: auto minmax(0, 1fr) auto 2.25rem;
        gap: 6px;
        padding: 1px var(--space-1);
      }
    }
    .swatch {
      width: 10px;
      height: 10px;
      border-radius: 3px;
    }
    .label {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .count {
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      text-align: right;
    }
    .percent {
      color: var(--color-text-muted);
      font-variant-numeric: tabular-nums;
      text-align: right;
    }
  `,
})
export class StatusDonut {
  readonly counts = input.required<Record<TaskStatus, number>>();
  readonly size = input<'lg' | 'sm'>('lg');

  protected readonly radius = RADIUS;
  protected readonly stroke = STROKE;
  protected readonly active = signal<TaskStatus | null>(null);

  protected readonly total = computed(() =>
    TASK_STATUSES.reduce((sum, status) => sum + (this.counts()[status] ?? 0), 0),
  );

  /** Tutti gli stati, anche a zero: la legenda resta uguale da un grafico all'altro. */
  protected readonly legend = computed(() => {
    const total = this.total();
    return TASK_STATUSES.map((status) => {
      const count = this.counts()[status] ?? 0;
      return {
        status,
        count,
        percent: total ? Math.round((count / total) * 100) : 0,
        color: STATUS_COLOR[status],
      };
    });
  });

  /** Fette dell'anello, una per stato presente, con uno spazio tra l'una e l'altra. */
  protected readonly slices = computed<Slice[]>(() => {
    const total = this.total();
    const present = this.legend().filter((item) => item.count > 0);
    const gap = present.length > 1 ? GAP : 0;
    let start = 0;
    return present.map((item) => {
      const length = (item.count / total) * CIRCUMFERENCE;
      const visible = Math.max(length - gap, 0.5);
      const slice: Slice = {
        ...item,
        dash: `${visible} ${CIRCUMFERENCE - visible}`,
        offset: -start,
      };
      start += length;
      return slice;
    });
  });

  protected readonly activeSlice = computed(() => {
    const status = this.active();
    return status ? this.legend().find((item) => item.status === status) : undefined;
  });

  protected readonly description = computed(() => {
    const parts = this.legend().map((item) => `${item.status} ${item.count}`);
    return `Task per stato, totale ${this.total()}: ${parts.join(', ')}`;
  });
}
