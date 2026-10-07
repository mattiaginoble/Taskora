import { Component, ElementRef, computed, effect, inject, input, signal } from '@angular/core';

export interface TimeSeries {
  key: string;
  label: string;
  color: string;
  values: number[];
}

const MARGIN = { top: 10, right: 8, bottom: 22, left: 34 };
/** Larghezza minima per ogni etichetta dell'asse orizzontale. */
const LABEL_SPACE = 52;

/** Massimo "tondo" dell'asse: 1, 2 o 5 per una potenza di dieci. */
export const niceMax = (value: number): number => {
  if (value <= 1) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 5, 10].find((m) => m * power >= value) ?? 10;
  return step * power;
};

const format = (value: number): string =>
  value.toLocaleString('it-IT', { maximumFractionDigits: 1 });

/**
 * Grafico nel tempo con un solo asse: barre affiancate (una per serie) o linea.
 * Passando sopra una colonna si evidenzia e un riquadro mostra tutti i valori.
 */
@Component({
  selector: 'app-time-chart',
  template: `
    @if (series().length > 1) {
      <ul class="legend">
        @for (item of series(); track item.key) {
          <li>
            <span class="swatch" [style.background]="item.color" aria-hidden="true"></span>
            {{ item.label }}
          </li>
        }
      </ul>
    }
    <div class="plot" [style.height.px]="height()">
      <svg
        [attr.width]="width()"
        [attr.height]="height()"
        role="img"
        [attr.aria-label]="label()"
        (mouseleave)="hovered.set(-1)"
      >
        @for (tick of ticks(); track tick.value) {
          <line
            class="grid"
            [attr.x1]="left"
            [attr.x2]="width() - right"
            [attr.y1]="tick.y"
            [attr.y2]="tick.y"
          />
          <text class="axis" [attr.x]="left - 6" [attr.y]="tick.y + 4" text-anchor="end">
            {{ tick.text }}
          </text>
        }
        @if (hovered() >= 0) {
          <rect
            class="hover-band"
            [attr.x]="left + hovered() * band()"
            [attr.y]="top"
            [attr.width]="band()"
            [attr.height]="plotHeight()"
          />
        }
        @if (kind() === 'bars') {
          @for (bar of bars(); track bar.id) {
            <rect
              class="bar"
              [attr.x]="bar.x"
              [attr.y]="bar.y"
              [attr.width]="bar.width"
              [attr.height]="bar.height"
              [attr.fill]="bar.color"
              rx="2"
            />
          }
        } @else {
          @for (line of lines(); track line.key) {
            <path class="area" [attr.d]="line.area" [attr.fill]="line.color" />
            <path class="line" [attr.d]="line.path" [attr.stroke]="line.color" />
            @if (hovered() >= 0) {
              <circle
                class="dot"
                [attr.cx]="line.points[hovered()].x"
                [attr.cy]="line.points[hovered()].y"
                r="4"
                [attr.fill]="line.color"
              />
            }
          }
        }
        @for (item of xLabels(); track item.index) {
          <text class="axis" [attr.x]="item.x" [attr.y]="height() - 6" text-anchor="middle">
            {{ item.text }}
          </text>
        }
        @for (label of labels(); track $index) {
          <rect
            class="hit"
            [attr.x]="left + $index * band()"
            [attr.y]="0"
            [attr.width]="band()"
            [attr.height]="height()"
            (mouseenter)="hovered.set($index)"
          />
        }
      </svg>
      @if (hovered() >= 0) {
        <div
          class="tooltip"
          role="tooltip"
          [class.flip]="tooltipFlip()"
          [style.left.px]="tooltipX()"
          [style.top.px]="top"
        >
          <strong>{{ titles()[hovered()] ?? labels()[hovered()] }}</strong>
          @for (item of series(); track item.key) {
            <span>
              <span class="swatch" [style.background]="item.color" aria-hidden="true"></span>
              {{ item.label }}: <b>{{ formatValue(item.values[hovered()] ?? 0) }}</b>
            </span>
          }
        </div>
      }
    </div>
    <table class="visually-hidden">
      <caption>
        {{
          label()
        }}
      </caption>
      <tr>
        <th>Periodo</th>
        @for (item of series(); track item.key) {
          <th>{{ item.label }}</th>
        }
      </tr>
      @for (label of labels(); track $index) {
        <tr>
          <td>{{ titles()[$index] ?? label }}</td>
          @for (item of series(); track item.key) {
            <td>{{ formatValue(item.values[$index] ?? 0) }}</td>
          }
        </tr>
      }
    </table>
  `,
  styles: `
    :host {
      display: grid;
      gap: var(--space-2);
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
    .swatch {
      display: inline-block;
      width: 10px;
      height: 10px;
      border-radius: 3px;
    }
    .plot {
      position: relative;
      min-width: 0;
    }
    svg {
      display: block;
      overflow: visible;
    }
    .grid {
      stroke: var(--color-border);
      stroke-dasharray: 2 3;
    }
    .axis {
      fill: var(--color-text-muted);
      font-size: 10px;
    }
    .hover-band {
      fill: var(--color-primary-soft);
    }
    .line {
      fill: none;
      stroke-width: 2;
      stroke-linejoin: round;
      stroke-linecap: round;
    }
    .area {
      opacity: 0.12;
    }
    .dot {
      stroke: var(--color-surface-2);
      stroke-width: 2;
    }
    .hit {
      fill: transparent;
    }
    .tooltip {
      position: absolute;
      top: 0;
      z-index: 5;
      display: grid;
      gap: 2px;
      padding: var(--space-1) var(--space-2);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
      background: var(--color-surface-2);
      box-shadow: var(--shadow-md);
      color: var(--color-text);
      font-size: var(--text-xs);
      white-space: nowrap;
      pointer-events: none;
      transform: translateX(10px);

      /* Nella metà destra il riquadro va a sinistra della colonna */
      &.flip {
        transform: translateX(calc(-100% - 10px));
      }

      span {
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
    }
  `,
})
export class TimeChart {
  /** Etichette brevi dell'asse orizzontale (es. "12 ott"). */
  readonly labels = input.required<string[]>();
  /** Titoli completi per il riquadro al passaggio (es. "Settimana dal 12 ott"). */
  readonly titles = input<string[]>([]);
  readonly series = input.required<TimeSeries[]>();
  readonly kind = input<'bars' | 'line'>('bars');
  readonly height = input(170);
  readonly label = input('');
  /** Unità dopo i valori nel riquadro (es. " h"). */
  readonly unit = input('');

  protected readonly left = MARGIN.left;
  protected readonly right = MARGIN.right;
  protected readonly top = MARGIN.top;
  protected readonly width = signal(300);
  protected readonly hovered = signal(-1);

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    effect((onCleanup) => {
      const observer = new ResizeObserver(([entry]) =>
        this.width.set(Math.max(200, Math.floor(entry.contentRect.width))),
      );
      observer.observe(host);
      onCleanup(() => observer.disconnect());
    });
  }

  protected readonly plotHeight = computed(() => this.height() - MARGIN.top - MARGIN.bottom);
  protected readonly band = computed(
    () => (this.width() - MARGIN.left - MARGIN.right) / Math.max(1, this.labels().length),
  );
  private readonly max = computed(() =>
    niceMax(Math.max(0, ...this.series().flatMap((s) => s.values))),
  );

  private y(value: number): number {
    return MARGIN.top + this.plotHeight() * (1 - value / this.max());
  }

  protected readonly ticks = computed(() =>
    // La metà solo se è un numero intero: con i conteggi "0,5 task" non ha senso
    [0, this.max() / 2, this.max()]
      .filter((value) => Number.isInteger(value))
      .map((value) => ({
        value,
        y: this.y(value),
        text: format(value),
      })),
  );

  protected readonly bars = computed(() => {
    const series = this.series();
    const band = this.band();
    const group = band * 0.72;
    const gap = series.length > 1 ? 2 : 0;
    const width = Math.max(1, (group - gap * (series.length - 1)) / series.length);
    return series.flatMap((s, si) =>
      this.labels().map((_, index) => {
        const value = s.values[index] ?? 0;
        const y = this.y(value);
        return {
          id: `${s.key}-${index}`,
          x: MARGIN.left + index * band + (band - group) / 2 + si * (width + gap),
          y,
          width,
          height: Math.max(0, MARGIN.top + this.plotHeight() - y),
          color: s.color,
        };
      }),
    );
  });

  protected readonly lines = computed(() =>
    this.series().map((s) => {
      const points = this.labels().map((_, index) => ({
        x: MARGIN.left + (index + 0.5) * this.band(),
        y: this.y(s.values[index] ?? 0),
      }));
      const path = points.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' ');
      const base = MARGIN.top + this.plotHeight();
      const area = points.length
        ? `${path} L${points[points.length - 1].x},${base} L${points[0].x},${base} Z`
        : '';
      return { key: s.key, color: s.color, points, path, area };
    }),
  );

  /** Etichette dell'asse diradate perché non si sovrappongano; l'ultima c'è sempre. */
  protected readonly xLabels = computed(() => {
    const labels = this.labels();
    const every = Math.max(1, Math.ceil(LABEL_SPACE / this.band()));
    return labels
      .map((text, index) => ({ text, index, x: MARGIN.left + (index + 0.5) * this.band() }))
      .filter((item) => (labels.length - 1 - item.index) % every === 0);
  });

  /** Il riquadro sta accanto alla colonna, non sopra: così non copre i valori vicini. */
  protected readonly tooltipFlip = computed(() => this.hovered() >= this.labels().length / 2);
  protected readonly tooltipX = computed(() => {
    const index = this.hovered() + (this.tooltipFlip() ? 0 : 1);
    return MARGIN.left + index * this.band();
  });

  protected formatValue(value: number): string {
    return `${format(value)}${this.unit()}`;
  }
}
