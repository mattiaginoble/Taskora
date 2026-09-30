import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { APP_NAME } from '../../core/app-name';
import { SessionService } from '../../core/session';
import { ThemeService } from '../../core/theme';

/** Accesso con nome utente e password. */
@Component({
  selector: 'app-login',
  imports: [FormsModule],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class LoginPage {
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  // Applica il tema salvato anche fuori dall'area riservata
  protected readonly theme = inject(ThemeService);
  protected readonly appName = APP_NAME;

  protected username = '';
  protected password = '';
  protected readonly error = signal('');
  protected readonly loading = signal(false);

  protected async submit(): Promise<void> {
    const username = this.username.trim();
    if (!username || !this.password) {
      this.error.set('Inserisci nome utente e password');
      return;
    }
    this.error.set('');
    this.loading.set(true);
    try {
      await this.session.login(username, this.password);
      await this.router.navigateByUrl('/dashboard');
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Accesso non riuscito');
      this.password = '';
    } finally {
      this.loading.set(false);
    }
  }
}
