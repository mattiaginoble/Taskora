import { Component, computed, input } from '@angular/core';
import { TaskStatus } from '../core/models';
import { describeSchedule, scheduleInfo } from '../core/task-utils';

/** Barra di avanzamento con il segno del tempo trascorso tra creazione e scadenza. */
@Component({
  selector: 'app-schedule-bar',
  template: `
    <div class="bar" [class]="'bar is-' + info().status" [title]="description()">
      <span class="fill" [style.width.%]="info().progress"></span>
      @if (info().timeProgress !== null && info().status !== 'done') {
        <span class="marker" [style.left.%]="info().timeProgress" aria-hidden="true"></span>
      }
    </div>
    <span class="value">{{ info().progress }}%</span>
  `,
  styles: `
    :host {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      min-width: 48px;
    }
    .bar {
      position: relative;
      flex: 1;
      height: 8px;
      border-radius: var(--radius-full);
      background: var(--bar-track);
    }
    .fill {
      position: absolute;
      inset: 0 auto 0 0;
      border-radius: inherit;
      background: var(--bar-fill);
    }
    .is-behind .fill {
      background: var(--bar-behind);
    }
    .is-late {
      background: var(--bar-late-track);
    }
    .is-late .fill {
      background: var(--bar-late);
    }
    .marker {
      position: absolute;
      top: -3px;
      bottom: -3px;
      width: 2px;
      margin-left: -1px;
      border-radius: 1px;
      background: var(--color-text);
      opacity: 0.7;
    }
    .value {
      min-width: 2.6rem;
      text-align: right;
      color: var(--color-text-muted);
      font-size: var(--text-xs);
      font-weight: 700;
    }
  `,
})
export class ScheduleBar {
  readonly task = input.required<{
    avanzamento: number;
    created_at: string;
    scadenza: string;
    stato: TaskStatus;
  }>();
  protected readonly info = computed(() => scheduleInfo(this.task()));
  protected readonly description = computed(() => describeSchedule(this.task()));
}
