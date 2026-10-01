import { Component, computed, inject, input, output } from '@angular/core';
import { PeopleService } from '../../core/people';
import { WorkService } from '../../core/work';
import { Dialog } from '../../shared/dialog';
import { TaskEditor } from './task-editor';

/** Una task in una finestra: si aggiorna da sola dopo ogni salvataggio. */
@Component({
  selector: 'app-task-dialog',
  imports: [Dialog, TaskEditor],
  template: `
    @if (task(); as task) {
      <app-dialog [title]="task.progetto" [eyebrow]="eyebrow()" (closed)="closed.emit()">
        <app-task-editor [task]="task" (removed)="closed.emit()" />
      </app-dialog>
    }
  `,
})
export class TaskDialog {
  private readonly work = inject(WorkService);
  private readonly people = inject(PeopleService);

  readonly taskId = input.required<string>();
  readonly closed = output<void>();

  protected readonly task = computed(
    () => this.work.tasks().find((t) => t.id === this.taskId()) ?? null,
  );
  protected readonly eyebrow = computed(() => {
    const task = this.task();
    return task ? [task.settore || 'Senza settore', this.people.name(task.utente)].join(' · ') : '';
  });
}
