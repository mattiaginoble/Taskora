import { Component, computed, input } from '@angular/core';
import { TaskPriority, TaskStatus } from '../core/models';

const STATUS_CLASS: Record<TaskStatus, string> = {
  'Da fare': 'st-todo',
  'In corso': 'st-progress',
  Completato: 'st-done',
  Bloccato: 'st-blocked',
};

const PRIORITY_CLASS: Record<TaskPriority, string> = {
  Alta: 'pr-high',
  Media: 'pr-medium',
  Bassa: 'pr-low',
};

@Component({
  selector: 'app-status-badge',
  template: `<span class="badge" [class]="cssClass()">{{ status() }}</span>`,
})
export class StatusBadge {
  readonly status = input.required<TaskStatus>();
  protected readonly cssClass = computed(() => `badge ${STATUS_CLASS[this.status()] ?? 'st-todo'}`);
}

@Component({
  selector: 'app-priority-badge',
  template: `<span [class]="cssClass()">Priorità {{ priority().toLowerCase() }}</span>`,
})
export class PriorityBadge {
  readonly priority = input.required<TaskPriority>();
  protected readonly cssClass = computed(
    () => `badge ${PRIORITY_CLASS[this.priority()] ?? 'pr-medium'}`,
  );
}
