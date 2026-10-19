import { Component, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SessionService } from '../core/session';
import { ToastService } from '../core/toast';
import { Dialog } from '../shared/dialog';

@Component({
  selector: 'app-name-dialog',
  imports: [Dialog, FormsModule],
  template: `
    <app-dialog title="Nome visualizzato" size="sm" (closed)="closed.emit()">
      <form class="form-stack" (ngSubmit)="save()">
        <label class="field">
          <span>Come vuoi comparire nell'app</span>
          <input
            name="displayName"
            [(ngModel)]="name"
            maxlength="100"
            autocomplete="name"
            autofocus
          />
          <small>Lascia vuoto per usare il nome utente ({{ session.user()?.username }}).</small>
        </label>
        <button type="submit" class="btn btn-primary" [disabled]="saving()">
          {{ saving() ? 'Salvataggio...' : 'Salva nome' }}
        </button>
      </form>
    </app-dialog>
  `,
})
export class NameDialog {
  protected readonly session = inject(SessionService);
  private readonly toast = inject(ToastService);
  readonly closed = output<void>();

  protected name = this.currentName();
  protected readonly saving = signal(false);

  private currentName(): string {
    const user = this.session.user();
    return user && user.display_name !== user.username ? user.display_name : '';
  }

  protected async save(): Promise<void> {
    this.saving.set(true);
    try {
      await this.session.setDisplayName(this.name.trim());
      // Ricarica per aggiornare il nome anche negli elenchi già caricati
      window.location.reload();
    } catch (error) {
      this.toast.error(error);
      this.saving.set(false);
    }
  }
}

@Component({
  selector: 'app-email-dialog',
  imports: [Dialog, FormsModule],
  template: `
    <app-dialog title="Indirizzo email" size="sm" (closed)="closed.emit()">
      <form class="form-stack" (ngSubmit)="save()">
        <p class="muted small" style="margin-top: 0;">
          Riceverai una notifica email a questo indirizzo quando ti viene assegnata una nuova task.
        </p>
        <label class="field">
          <span>Il tuo indirizzo email</span>
          <input
            type="email"
            name="email"
            [(ngModel)]="email"
            maxlength="255"
            autocomplete="email"
            placeholder="nome@azienda.it"
            autofocus
          />
        </label>
        <button type="submit" class="btn btn-primary" [disabled]="saving()">
          {{ saving() ? 'Salvataggio...' : 'Salva email' }}
        </button>
      </form>
    </app-dialog>
  `,
})
export class EmailDialog {
  protected readonly session = inject(SessionService);
  private readonly toast = inject(ToastService);
  readonly closed = output<void>();

  protected email = this.session.user()?.email ?? '';
  protected readonly saving = signal(false);

  protected async save(): Promise<void> {
    this.saving.set(true);
    try {
      await this.session.setEmail(this.email.trim());
      this.toast.show(this.email.trim() ? 'Email aggiornata' : 'Email rimossa');
      this.closed.emit();
    } catch (error) {
      this.toast.error(error);
      this.saving.set(false);
    }
  }
}


@Component({
  selector: 'app-password-dialog',
  imports: [Dialog, FormsModule],
  template: `
    <app-dialog title="Cambia password" size="sm" [closable]="!forced()" (closed)="closed.emit()">
      @if (forced()) {
        <p class="notice warning">
          La password attuale non è sicura o è stata assegnata da un amministratore: scegline una
          nuova per continuare.
        </p>
      }
      <form class="form-stack" (ngSubmit)="save()">
        <label class="field">
          <span>Password attuale</span>
          <input
            type="password"
            name="current"
            [(ngModel)]="current"
            autocomplete="current-password"
            required
            autofocus
          />
        </label>
        <label class="field">
          <span>Nuova password <small>(almeno 8 caratteri)</small></span>
          <input
            type="password"
            name="next"
            [(ngModel)]="next"
            autocomplete="new-password"
            minlength="8"
            required
          />
        </label>
        <label class="field">
          <span>Ripeti la nuova password</span>
          <input
            type="password"
            name="confirm"
            [(ngModel)]="confirm"
            autocomplete="new-password"
            minlength="8"
            required
          />
        </label>
        <button type="submit" class="btn btn-primary" [disabled]="saving()">
          {{ saving() ? 'Salvataggio...' : 'Salva password' }}
        </button>
      </form>
    </app-dialog>
  `,
  styles: `
    .notice {
      margin-bottom: var(--space-4);
    }
  `,
})
export class PasswordDialog {
  private readonly session = inject(SessionService);
  private readonly toast = inject(ToastService);
  readonly forced = input(false);
  readonly closed = output<void>();
  readonly changed = output<void>();

  protected current = '';
  protected next = '';
  protected confirm = '';
  protected readonly saving = signal(false);

  protected async save(): Promise<void> {
    if (this.next !== this.confirm) {
      this.toast.show('Le due password non coincidono', true);
      return;
    }
    this.saving.set(true);
    try {
      await this.session.changePassword(this.current, this.next);
      this.toast.show('Password aggiornata');
      this.changed.emit();
    } catch (error) {
      this.toast.error(error);
    } finally {
      this.saving.set(false);
    }
  }
}
