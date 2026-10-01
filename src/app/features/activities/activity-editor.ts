import { Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  Task,
  TaskPriority,
  TaskStatus,
  TaskUpdatePayload,
} from '../../core/models';
import { PeopleService } from '../../core/people';
import {
  clampProgress,
  formatDateTime,
  formatHours,
  parseTaskEntries,
} from '../../core/task-utils';
import { ToastService } from '../../core/toast';
import { WorkService } from '../../core/work';
import { Dialog } from '../../shared/dialog';

/** Modifica completa di un'attività da parte di un admin. */
@Component({
  selector: 'app-activity-editor',
  imports: [Dialog, FormsModule],
  templateUrl: './activity-editor.html',
  styleUrl: './activity-editor.scss',
})
export class ActivityEditor implements OnInit {
  protected readonly work = inject(WorkService);
  protected readonly people = inject(PeopleService);
  private readonly toast = inject(ToastService);

  readonly task = input.required<Task>();
  readonly closed = output<void>();

  protected readonly statuses = TASK_STATUSES;
  protected readonly priorities = TASK_PRIORITIES;

  protected readonly eyebrow = computed(() => {
    const task = this.task();
    return [
      task.creato_da ? `assegnata da ${this.people.name(task.creato_da)}` : '',
      `il ${formatDateTime(task.created_at)}`,
      `ore registrate: ${formatHours(task.ore_lavorate)}`,
    ]
      .filter(Boolean)
      .join(' · ');
  });
  protected readonly entries = computed(() =>
    parseTaskEntries(this.task().note)
      .map((entry) => ({ ...entry, author: this.people.name(entry.user) }))
      .reverse(),
  );

  protected utente = '';
  protected progetto = '';
  protected settore = '';
  protected priorita: TaskPriority = 'Media';
  protected scadenza = '';
  protected stato: TaskStatus = 'Da fare';
  protected avanzamento = 0;
  protected nuovaTask = '';
  protected ore: number | null = null;
  protected storico = '';

  protected readonly saving = signal(false);
  protected readonly confirmDelete = signal(false);

  ngOnInit(): void {
    const task = this.task();
    this.utente = task.utente;
    this.progetto = task.progetto;
    this.settore = task.settore ?? '';
    this.priorita = task.priorita;
    this.scadenza = task.scadenza ?? '';
    this.stato = task.stato;
    this.avanzamento = clampProgress(task.avanzamento);
    this.storico = task.note ?? '';
  }

  /** Solo i campi cambiati, così il registro contiene solo le modifiche reali. */
  private changes(): TaskUpdatePayload {
    const task = this.task();
    const payload: TaskUpdatePayload = { id: task.id };
    if (this.utente && this.utente !== task.utente) payload.utente = this.utente;
    if (this.progetto.trim() !== task.progetto) payload.progetto = this.progetto.trim();
    if (this.settore !== (task.settore ?? '')) payload.settore = this.settore;
    if (this.priorita !== task.priorita) payload.priorita = this.priorita;
    if (this.scadenza !== (task.scadenza ?? '')) payload.scadenza = this.scadenza;
    if (this.stato !== task.stato) payload.stato = this.stato;
    if (this.avanzamento !== clampProgress(task.avanzamento))
      payload.avanzamento = this.avanzamento;
    if (this.storico.trim() !== (task.note ?? '').trim()) payload.note = this.storico;
    if (this.nuovaTask.trim()) payload.note_append = this.nuovaTask.trim();
    if (this.ore) payload.ore = String(this.ore);
    return payload;
  }

  protected async save(): Promise<void> {
    const payload = this.changes();
    if (Object.keys(payload).length === 1) {
      this.toast.show('Nessuna modifica da salvare', true);
      return;
    }
    if (payload.progetto === '') {
      this.toast.show('Il progetto è obbligatorio', true);
      return;
    }
    this.saving.set(true);
    try {
      await this.work.update(payload);
      this.toast.show('Attività aggiornata');
      this.closed.emit();
    } catch (error) {
      this.toast.error(error);
    } finally {
      this.saving.set(false);
    }
  }

  protected async remove(): Promise<void> {
    if (!this.confirmDelete()) {
      this.confirmDelete.set(true);
      return;
    }
    this.saving.set(true);
    try {
      await this.work.remove(this.task().id);
      this.toast.show('Attività eliminata');
      this.closed.emit();
    } catch (error) {
      this.toast.error(error);
      this.saving.set(false);
    }
  }
}
