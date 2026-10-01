import { Component, OnInit, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TASK_PRIORITIES, TASK_STATUSES, Task, TaskPriority, TaskStatus } from '../../core/models';
import { PeopleService } from '../../core/people';
import { SessionService } from '../../core/session';
import { addDaysIso, todayIso } from '../../core/task-utils';
import { ToastService } from '../../core/toast';
import { WorkService } from '../../core/work';
import { Dialog } from '../../shared/dialog';

/**
 * Nuova task: testo, progetto, settore, scadenza e (per gli admin) owner, priorità,
 * stato e avanzamento. "Assegnato da" non si sceglie: è chi crea la task.
 */
@Component({
  selector: 'app-new-task',
  imports: [Dialog, FormsModule],
  templateUrl: './new-task.html',
  styles: `
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      margin-top: var(--space-1);
    }
    .chip {
      padding: 2px var(--space-3);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-full);
      background: var(--color-surface-2);
      font-size: var(--text-xs);
      font-weight: 700;
      cursor: pointer;
    }
    .chip:hover {
      border-color: var(--color-primary);
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      padding-top: var(--space-3);
      border-top: 1px solid var(--color-border);
    }
  `,
})
export class NewTask implements OnInit {
  protected readonly work = inject(WorkService);
  protected readonly session = inject(SessionService);
  protected readonly people = inject(PeopleService);
  private readonly toast = inject(ToastService);

  /** Valori proposti (es. aprendo da un progetto o da una scheda di settore). */
  readonly sector = input('');
  readonly project = input('');
  readonly owner = input('');
  readonly closed = output<void>();
  /** La task appena creata. */
  readonly created = output<Task>();

  protected readonly statuses = TASK_STATUSES;
  protected readonly priorities = TASK_PRIORITIES;
  protected readonly today = todayIso();

  protected titolo = '';
  protected utente = '';
  protected progetto = '';
  protected settore = '';
  protected scadenza = '';
  protected ore: number | null = null;
  protected priorita: TaskPriority = 'Media';
  protected stato: TaskStatus = 'Da fare';
  protected avanzamento = 0;
  protected readonly saving = signal(false);

  ngOnInit(): void {
    if (this.work.sectors().includes(this.sector())) this.settore = this.sector();
    this.progetto = this.project();
    // Di partenza la task è di chi la crea; l'admin può assegnarla a un altro
    this.utente = this.owner() || this.session.user()?.username || '';
  }

  protected setDue(days: number): void {
    this.scadenza = addDaysIso(days);
  }

  protected async save(): Promise<void> {
    if (!this.titolo.trim()) {
      this.toast.show('Scrivi il testo della task', true);
      return;
    }
    this.saving.set(true);
    try {
      const task = await this.work.create({
        titolo: this.titolo.trim(),
        progetto: this.progetto.trim(),
        settore: this.settore,
        scadenza: this.scadenza || todayIso(),
        ore: this.ore ? String(this.ore) : '',
        // I campi riservati vengono comunque ignorati dal server per i dipendenti
        ...(this.session.isAdmin()
          ? {
              utente: this.utente,
              priorita: this.priorita,
              stato: this.stato,
              avanzamento: this.avanzamento,
            }
          : {}),
      });
      this.toast.show('Task creata');
      this.created.emit(task);
      this.closed.emit();
    } catch (error) {
      this.toast.error(error);
    } finally {
      this.saving.set(false);
    }
  }
}
