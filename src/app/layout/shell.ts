import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { APP_NAME } from '../core/app-name';
import { SessionService } from '../core/session';
import { ThemeService } from '../core/theme';
import { ToastService } from '../core/toast';
import { NameDialog, PasswordDialog } from './account-dialogs';

interface NavLink {
  label: string;
  route: string;
  admin?: boolean;
}

const LINKS: NavLink[] = [
  { label: 'Dashboard', route: '/dashboard' },
  { label: 'Attività', route: '/attivita', admin: true },
  { label: 'Riepilogo', route: '/riepilogo', admin: true },
  { label: 'Gestione', route: '/gestione', admin: true },
];

/** Struttura comune: header con menu, pagina corrente e avvisi. */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, NameDialog, PasswordDialog],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export class Shell {
  protected readonly session = inject(SessionService);
  protected readonly theme = inject(ThemeService);
  protected readonly toasts = inject(ToastService).toasts;
  protected readonly appName = APP_NAME;

  protected readonly links = computed(() =>
    LINKS.filter((link) => !link.admin || this.session.isAdmin()),
  );
  protected readonly menuOpen = signal(false);
  protected readonly dialog = signal<'name' | 'password' | null>(null);

  protected openDialog(which: 'name' | 'password'): void {
    this.menuOpen.set(false);
    this.dialog.set(which);
  }

  /** Dopo un cambio obbligatorio si ricarica, così la pagina carica i dati. */
  protected onForcedPasswordChanged(): void {
    window.location.reload();
  }

  @HostListener('document:click')
  @HostListener('document:keydown.escape')
  protected closeMenu(): void {
    this.menuOpen.set(false);
  }
}
