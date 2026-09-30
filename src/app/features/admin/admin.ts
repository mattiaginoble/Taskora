import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api';
import { AdminData, ManagedUser } from '../../core/models';
import { SessionService } from '../../core/session';
import { formatDate } from '../../core/task-utils';
import { ToastService } from '../../core/toast';
import { Dialog } from '../../shared/dialog';

type Role = 'user' | 'administrator';

const ADMIN_ROLES = ['administrator', 'admin', 'amministratore'];

/** Password temporanea casuale, senza caratteri facili da confondere. */
export const generatePassword = (): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const values = crypto.getRandomValues(new Uint32Array(12));
  return Array.from(values, (v) => chars[v % chars.length]).join('');
};

/** Gestione (solo admin): utenti, settori e progetti. */
@Component({
  selector: 'app-admin',
  imports: [FormsModule, Dialog],
  templateUrl: './admin.html',
  styleUrl: './admin.scss',
})
export class AdminPage {
  private readonly api = inject(ApiService);
  private readonly session = inject(SessionService);
  private readonly toast = inject(ToastService);

  protected readonly data = signal<AdminData | null>(null);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);

  protected readonly users = computed(() =>
    (this.data()?.users ?? []).map((user) => ({
      ...user,
      role: (ADMIN_ROLES.includes(String(user.role).toLowerCase())
        ? 'administrator'
        : 'user') as Role,
      isSelf: user.username === this.session.user()?.username,
      pending: Number(user.must_change_password) === 1,
      created: this.date(user.created_at),
    })),
  );

  // Nuovo utente
  protected newName = '';
  protected newUsername = '';
  protected newRole: Role = 'user';
  protected newPassword = '';
  // Nuovi settore e progetto
  protected newSector = '';
  protected newProject = '';
  // Reimpostazione password
  protected readonly resetting = signal<ManagedUser | null>(null);
  protected resetPassword = '';

  constructor() {
    this.load();
  }

  protected date(value: string | null): string {
    return value ? formatDate(value.slice(0, 10)) : '-';
  }

  private async load(): Promise<void> {
    try {
      this.data.set(await firstValueFrom(this.api.get<AdminData>('admin.php')));
    } catch (error) {
      this.toast.error(error);
    } finally {
      this.loading.set(false);
    }
  }

  /** Esegue un'azione di api/admin.php; true se è andata a buon fine. */
  private async run(body: Record<string, string>, message: string): Promise<boolean> {
    this.busy.set(true);
    try {
      await firstValueFrom(this.api.post('admin.php', body));
      this.toast.show(message);
      await this.load();
      return true;
    } catch (error) {
      this.toast.error(error);
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  protected generate(): void {
    this.newPassword = generatePassword();
  }

  protected async createUser(): Promise<void> {
    const username = this.newUsername.trim();
    const ok = await this.run(
      {
        action: 'create_user',
        username,
        display_name: this.newName.trim(),
        role: this.newRole,
        password: this.newPassword,
      },
      `Utente ${username} creato: comunica la password temporanea`,
    );
    if (ok) {
      this.newName = '';
      this.newUsername = '';
      this.newRole = 'user';
      this.newPassword = '';
    }
  }

  protected async saveName(user: ManagedUser, input: HTMLInputElement): Promise<void> {
    const value = input.value.trim();
    if (value === (user.display_name ?? '')) return;
    const ok = await this.run(
      { action: 'set_display_name', username: user.username, display_name: value },
      value
        ? `${user.username} ora compare come "${value}"`
        : `${user.username} compare con il nome utente`,
    );
    if (!ok) input.value = user.display_name ?? '';
    else if (user.username === this.session.user()?.username) await this.session.refresh();
  }

  protected async setRole(
    user: ManagedUser,
    role: string,
    select: HTMLSelectElement,
  ): Promise<void> {
    const ok = await this.run(
      { action: 'set_role', username: user.username, role },
      `Ruolo di ${user.display_name || user.username} aggiornato`,
    );
    if (!ok)
      select.value = ADMIN_ROLES.includes(String(user.role).toLowerCase())
        ? 'administrator'
        : 'user';
  }

  protected openReset(user: ManagedUser): void {
    this.resetPassword = generatePassword();
    this.resetting.set(user);
  }

  protected async confirmReset(): Promise<void> {
    const user = this.resetting();
    if (!user) return;
    const ok = await this.run(
      { action: 'reset_password', username: user.username, password: this.resetPassword },
      `Password di ${user.display_name || user.username} reimpostata`,
    );
    if (ok) this.resetting.set(null);
  }

  protected async createSector(): Promise<void> {
    if (
      await this.run({ action: 'create_sector', nome: this.newSector.trim() }, 'Settore creato')
    ) {
      this.newSector = '';
    }
  }

  protected async createProject(): Promise<void> {
    if (
      await this.run({ action: 'create_project', nome: this.newProject.trim() }, 'Progetto creato')
    ) {
      this.newProject = '';
    }
  }
}
