import { Component, computed, input, output, signal } from '@angular/core';

/** Una serie del grafico: chiave, nome in legenda e colore (variabile CSS). */
export interface BarSeries {
  key: string;
  label: string;
  color: string;
}

/** Una riga: etichetta e valore per ogni serie (le chiavi mancanti valgono zero). */
export interface BarRow {
  id: string;
  label: string;
  values: Record<string, number>;
}

export interface BarSelection {
  row: string;
  /** Serie cliccata, vuota se si è cliccato sul nome della riga. */
  series: string;
}

interface Tooltip {
  text: string;
  x: number;
  y: number;
}

/**
 * Barre orizzontali impilate, una riga per voce (es. un dipendente). Con una sola serie
 * diventa un normale grafico a barre. Righe e segmenti sono cliccabili per filtrare.
 */
@Component({
  selector: 'app-stacked-bars',
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
    <ul class="rows" [attr.aria-label]="label()">
      @for (row of visibleRows(); track row.id) {
        <li class="row" [class.dim]="selectedRow() && selectedRow() !== row.id">
          <button
            type="button"
            class="name"
            [title]="row.label"
            [attr.aria-pressed]="selectedRow() === row.id && !selectedSeries()"
            (click)="pick(row.id, '')"
          >
            {{ row.label }}
          </button>
          <div class="track">
            <div class="bar" [style.width.%]="(row.total / max()) * 100">
              @for (segment of row.segments; track segment.key) {
                <button
                  type="button"
                  class="segment"
                  [style.flex-grow]="segment.value"
                  [style.background]="segment.color"
                  [class.dim]="selectedSeries() && selectedSeries() !== segment.key"
                  [attr.aria-label]="row.label + ', ' + segment.label + ': ' + segment.value"
                  (click)="pick(row.id, series().length > 1 ? segment.key : '')"
                  (mouseenter)="showTip($event, row.label, segment.label, segment.value)"
                  (mousemove)="moveTip($event)"
                  (mouseleave)="tip.set(null)"
                ></button>
              }
            </div>
            <span class="total">{{ row.total }}</span>
          </div>
        </li>
      } @empty {
        <li class="muted">{{ empty() }}</li>
      }
    </ul>
    @if (rows().length > limit()) {
      <button type="button" class="btn btn-sm more" (click)="expanded.set(!expanded())">
        {{ expanded() ? 'Mostra meno' : 'Mostra tutti (' + rows().length + ')' }}
      </button>
    }
    @if (tip(); as t) {
      <div class="tooltip" role="tooltip" [style.left.px]="t.x" [style.top.px]="t.y">
        {{ t.text }}
      </div>
    }
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
      font-size: var(--text-xs);
      color: var(--color-text-muted);

      li {
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
    }
    .swatch {
      width: 10px;
      height: 10px;
      border-radius: 3px;
    }
    .rows {
      display: grid;
      gap: 6px;
    }
    .row {
      display: grid;
      grid-template-columns: minmax(80px, var(--label-width, 160px)) minmax(0, 1fr);
      align-items: center;
      gap: var(--space-3);
      transition: opacity var(--transition);

      &.dim {
        opacity: 0.35;
      }
    }
    .name {
      overflow: hidden;
      padding: 2px 0;
      border: 0;
      background: none;
      color: var(--color-text);
      font-size: var(--text-sm);
      text-align: left;
      text-overflow: ellipsis;
      white-space: nowrap;
      cursor: pointer;

      &:hover,
      &[aria-pressed='true'] {
        color: var(--color-primary-text);
        text-decoration: underline;
      }
    }
    .track {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      min-width: 0;
    }
    .bar {
      display: flex;
      gap: 2px;
      min-width: 6px;
      height: 16px;
    }
    .segment {
      flex-basis: 0;
      min-width: 4px;
      padding: 0;
      border: 0;
      cursor: pointer;
      transition: opacity var(--transition);

      &:last-child {
        border-radius: 0 4px 4px 0;
      }
      &.dim {
        opacity: 0.3;
      }
      &:hover {
        filter: brightness(1.1);
      }
      &:focus-visible {
        outline: 2px solid var(--color-text);
        outline-offset: 1px;
      }
    }
    .total {
      color: var(--color-text);
      font-size: var(--text-xs);
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }
    .more {
      justify-self: start;
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
export class StackedBars {
  readonly rows = input.required<BarRow[]>();
  readonly series = input.required<BarSeries[]>();
  /** Descrizione del grafico per chi usa un lettore di schermo. */
  readonly label = input('');
  readonly empty = input('Nessun dato');
  /** Righe mostrate prima di "Mostra tutti". */
  readonly limit = input(8);
  readonly selectedRow = input('');
  readonly selectedSeries = input('');
  readonly selected = output<BarSelection>();

  protected readonly expanded = signal(false);
  protected readonly tip = signal<Tooltip | null>(null);

  private readonly prepared = computed(() =>
    this.rows().map((row) => {
      const segments = this.series()
        .map((s) => ({ key: s.key, label: s.label, color: s.color, value: row.values[s.key] ?? 0 }))
        .filter((s) => s.value > 0);
      return { ...row, segments, total: segments.reduce((sum, s) => sum + s.value, 0) };
    }),
  );

  protected readonly max = computed(() => Math.max(1, ...this.prepared().map((r) => r.total)));

  protected readonly visibleRows = computed(() => {
    const rows = this.prepared();
    if (this.expanded() || rows.length <= this.limit()) return rows;
    // La riga scelta resta visibile anche se è oltre il limite
    const visible = rows.slice(0, this.limit());
    const selected = rows.find((r) => r.id === this.selectedRow());
    return selected && !visible.includes(selected) ? [...visible, selected] : visible;
  });

  /** Un secondo clic sulla stessa scelta la toglie. */
  protected pick(row: string, series: string): void {
    const same = this.selectedRow() === row && this.selectedSeries() === series;
    this.selected.emit(same ? { row: '', series: '' } : { row, series });
  }

  protected showTip(event: MouseEvent, row: string, series: string, value: number): void {
    const text = this.series().length > 1 ? `${row} · ${series}: ${value}` : `${row}: ${value}`;
    this.tip.set({ text, x: event.clientX, y: event.clientY });
  }

  protected moveTip(event: MouseEvent): void {
    this.tip.update((tip) => (tip ? { ...tip, x: event.clientX, y: event.clientY } : tip));
  }
}
