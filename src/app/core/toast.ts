import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: number;
  message: string;
  error: boolean;
}

/** Messaggi brevi in basso a destra. */
@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);
  private nextId = 1;

  show(message: string, error = false): void {
    const toast = { id: this.nextId++, message, error };
    this.toasts.update((list) => [...list, toast]);
    setTimeout(() => this.toasts.update((list) => list.filter((t) => t.id !== toast.id)), 3500);
  }

  error(error: unknown): void {
    this.show(error instanceof Error ? error.message : String(error), true);
  }
}
