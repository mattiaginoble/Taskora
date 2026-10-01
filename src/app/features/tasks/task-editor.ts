import {
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
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
import { SessionService } from '../../core/session';
import {
  clampProgress,
  formatDate,
  formatDateTime,
  formatHours,
  parseTaskEntries,
} from '../../core/task-utils';
import { ToastService } from '../../core/toast';
import { WorkService } from '../../core/work';
import { PriorityBadge, StatusBadge } from '../../shared/badges';
import { EventLog } from '../../shared/event-log';
import { ScheduleBar } from '../../shared/schedule-bar';

/**
 * Una task: dati, note e modifica. L'owner aggiorna stato, avanzamento, ore e note;
 * gli admin anche testo, owner, progetto, settore, scadenza e priorità, e possono eliminarla.
 */
@Component({
  selector: 'app-task-editor',
  imports: [FormsModule, StatusBadge, PriorityBadge, ScheduleBar, EventLog],
  templateUrl: './task-editor.html',
  styleUrl: './task-editor.scss',
})
export class TaskEditor {
  protected readonly work = inject(WorkService);
  protected readonly people = inject(PeopleService);
  protected readonly session = inject(SessionService);
  private readonly toast = inject(ToastService);

  readonly task = input.required<Task>();
  /** Dopo l'eliminazione la task non esiste più: chi la mostra deve chiuderla. */
  readonly removed = output<void>();

  protected readonly statuses = TASK_STATUSES;
  protected readonly priorities = TASK_PRIORITIES;
  protected readonly formatDate = formatDate;

  protected readonly owner = computed(() => this.people.name(this.task().utente) || '-');
  protected readonly assignedBy = computed(() => this.people.name(this.task().creato_da) || '-');
  protected readonly created = computed(() => formatDateTime(this.task().created_at));
  protected readonly lastUpdate = computed(() =>
    formatDateTime(this.task().updated_at || this.task().created_at),
  );
  protected readonly hours = computed(() => formatHours(this.task().ore_lavorate));
  protected readonly notes = computed(() =>
    parseTaskEntries(this.task().note)
      .map((entry) => ({ ...entry, author: this.people.name(entry.user) }))
      .reverse(),
  );

  // Modulo
  protected titolo = '';
  protected utente = '';
  protected progetto = '';
  protected settore = '';
  protected scadenza = '';
  protected priorita: TaskPriority = 'Media';
  protected stato: TaskStatus = 'Da fare';
  protected avanzamento = 0;
  protected nota = '';
  protected ore: number | null = null;
  protected storico = '';

  protected readonly saving = signal(false);
  protected readonly confirmDelete = signal(false);

  constructor() {
    // Il modulo riparte dai valori della task ogni volta che cambia (altra task o salvataggio)
    effect(() => {
      const task = this.task();
      untracked(() => this.reset(task));
    });
  }

  private reset(task: Task): void {
    this.titolo = task.titolo;
    this.utente = task.utente;
    this.progetto = task.progetto;
    this.settore = task.settore ?? '';
    this.scadenza = task.scadenza ?? '';
    this.priorita = task.priorita;
    this.stato = task.stato;
    this.avanzamento = clampProgress(task.avanzamento);
    this.nota = '';
    this.ore = null;
    this.storico = task.note ?? '';
    this.confirmDelete.set(false);
  }

  /** Solo i campi cambiati, così il registro contiene solo le modifiche reali. */
  private changes(): TaskUpdatePayload {
    const task = this.task();
    const payload: TaskUpdatePayload = { id: task.id };
    if (this.stato !== task.stato) payload.stato = this.stato;
    if (this.avanzamento !== clampProgress(task.avanzamento))
      payload.avanzamento = this.avanzamento;
    if (this.nota.trim()) payload.note_append = this.nota.trim();
    if (this.ore) payload.ore = String(this.ore);
    if (this.session.isAdmin()) {
      if (this.titolo.trim() !== task.titolo) payload.titolo = this.titolo.trim();
      if (this.utente && this.utente !== task.utente) payload.utente = this.utente;
      if (this.progetto.trim() !== task.progetto) payload.progetto = this.progetto.trim();
      if (this.settore !== (task.settore ?? '')) payload.settore = this.settore;
      if (this.scadenza !== (task.scadenza ?? '')) payload.scadenza = this.scadenza;
      if (this.priorita !== task.priorita) payload.priorita = this.priorita;
      if (this.storico.trim() !== (task.note ?? '').trim()) payload.note = this.storico;
    }
    return payload;
  }

  protected async save(): Promise<void> {
    const payload = this.changes();
    if (Object.keys(payload).length === 1) {
      this.toast.show('Nessuna modifica da salvare', true);
      return;
    }
    if (payload.titolo === '' || payload.progetto === '') {
      this.toast.show('Testo della task e progetto sono obbligatori', true);
      return;
    }
    this.saving.set(true);
    try {
      await this.work.update(payload);
      this.toast.show('Task aggiornata');
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
      this.toast.show('Task eliminata');
      this.removed.emit();
    } catch (error) {
      this.toast.error(error);
    } finally {
      this.saving.set(false);
    }
  }
}
