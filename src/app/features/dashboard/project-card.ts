import { Component, computed, input, output } from '@angular/core';
import { ProjectSummary, formatDate, isOverdue } from '../../core/task-utils';
import { StatusBadge } from '../../shared/badges';
import { ScheduleBar } from '../../shared/schedule-bar';

/** Card compatta di un progetto: stato, nome, avanzamento e scadenza su un rigo. */
@Component({
  selector: 'app-project-card',
  imports: [StatusBadge, ScheduleBar],
  template: `
    <div
      class="card"
      [class.is-overdue]="overdue()"
      [class.is-completed]="project().stato === 'Completato'"
      role="button"
      tabindex="0"
      [attr.aria-label]="'Apri ' + project().progetto"
      (click)="open.emit()"
      (keydown.enter)="open.emit()"
      (keydown.space)="$event.preventDefault(); open.emit()"
    >
      <app-status-badge [status]="project().stato" />
      <button
        type="button"
        class="badge tag project"
        [title]="'Mostra solo ' + project().progetto"
        (click)="$event.stopPropagation(); filterProject.emit(project().progetto)"
      >
        {{ project().progetto }}
      </button>
      <app-schedule-bar class="progress" [task]="project()" />
      <span
        class="due"
        [class.overdue]="overdue()"
        [title]="overdue() ? 'Scadenza superata' : 'Scadenza'"
      >
        {{ dueDate() }}
      </span>
    </div>
  `,
  styleUrl: './project-card.scss',
})
export class ProjectCard {
  readonly project = input.required<ProjectSummary>();
  readonly open = output<void>();
  readonly filterProject = output<string>();

  protected readonly overdue = computed(() =>
    isOverdue(this.project().scadenza, this.project().stato),
  );
  protected readonly dueDate = computed(() => formatDate(this.project().scadenza));
}
