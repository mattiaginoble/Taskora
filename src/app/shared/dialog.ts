import { Component, ElementRef, afterNextRender, inject, input, output } from '@angular/core';

/**
 * Finestra di dialogo: si chiude con Esc, con il clic sullo sfondo o con
 * "Chiudi" (se `closable`). Il contenuto arriva dal componente che la usa.
 */
@Component({
  selector: 'app-dialog',
  template: `
    <div class="dialog-backdrop" (click)="onBackdrop($event)" (keydown.escape)="close()">
      <section
        class="dialog"
        [class]="'dialog ' + size()"
        role="dialog"
        aria-modal="true"
        [attr.aria-label]="title()"
      >
        <header class="dialog-header">
          <div>
            @if (eyebrow()) {
              <p class="eyebrow">{{ eyebrow() }}</p>
            }
            <h2>{{ title() }}</h2>
          </div>
          @if (closable()) {
            <button type="button" class="btn btn-sm" (click)="close()">Chiudi</button>
          }
        </header>
        <div class="dialog-body">
          <ng-content />
        </div>
      </section>
    </div>
  `,
  styles: `
    .eyebrow {
      color: var(--color-text-muted);
      font-size: var(--text-xs);
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
  `,
})
export class Dialog {
  readonly title = input.required<string>();
  readonly eyebrow = input('');
  readonly size = input<'sm' | 'md' | 'lg'>('md');
  readonly closable = input(true);
  readonly closed = output<void>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    // Porta il focus nel dialogo per tastiera e lettori di schermo
    afterNextRender(() => {
      const target = this.host.nativeElement.querySelector<HTMLElement>(
        '[autofocus], .dialog-body input, .dialog-body textarea, .dialog-body select, .dialog-body button',
      );
      target?.focus();
    });
  }

  close(): void {
    if (this.closable()) this.closed.emit();
  }

  protected onBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.close();
  }
}
