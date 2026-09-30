import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api';
import { SessionUser } from './models';

const ADMIN_ROLES = ['administrator', 'admin', 'amministratore'];

interface AuthResponse {
  success: boolean;
  user: SessionUser;
  must_change_password: boolean;
}

/** Utente collegato e operazioni sul proprio account. */
@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly api = inject(ApiService);

  readonly user = signal<SessionUser | null>(null);
  readonly mustChangePassword = signal(false);
  readonly isAdmin = computed(() =>
    ADMIN_ROLES.includes(String(this.user()?.role ?? '').toLowerCase()),
  );
  readonly displayName = computed(() => this.user()?.display_name || this.user()?.username || '');

  private loading: Promise<SessionUser | null> | null = null;

  /** Carica la sessione una sola volta; null se non si è collegati. */
  load(): Promise<SessionUser | null> {
    this.loading ??= firstValueFrom(this.api.get<AuthResponse>('auth.php'))
      .then((result) => {
        this.user.set(result.user);
        this.mustChangePassword.set(result.must_change_password);
        return result.user;
      })
      .catch(() => {
        this.loading = null;
        this.user.set(null);
        return null;
      });
    return this.loading;
  }

  async login(username: string, password: string): Promise<void> {
    await firstValueFrom(this.api.post('auth.php', { username, password }));
    // Ricarica la sessione per avere anche il nome visualizzato
    await this.refresh();
  }

  /** Rilegge la sessione dal server (es. dopo che un admin ha cambiato il proprio nome). */
  refresh(): Promise<SessionUser | null> {
    this.loading = null;
    return this.load();
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await firstValueFrom(
      this.api.put('auth.php', { current_password: currentPassword, new_password: newPassword }),
    );
    this.mustChangePassword.set(false);
  }

  async setDisplayName(displayName: string): Promise<void> {
    const result = await firstValueFrom(
      this.api.put<{ display_name: string }>('auth.php', { display_name: displayName }),
    );
    const user = this.user();
    if (user) this.user.set({ ...user, display_name: result.display_name });
  }

  /** Esce e ricarica la pagina, così non resta in memoria nessun dato dell'utente. */
  async logout(): Promise<void> {
    try {
      await firstValueFrom(this.api.delete('auth.php'));
    } finally {
      restartAtLogin();
    }
  }
}

export const restartAtLogin = (): void => {
  window.location.hash = '/login';
  window.location.reload();
};
