import { Task } from '../../core/models';
import { lastWeeks, weeklyHours, weeklyTrend } from './trend';

const task = (overrides: Partial<Task>): Task => ({
  id: 't',
  titolo: 'Task',
  utente: 'mario',
  creato_da: 'admin',
  progetto: 'P',
  descrizione: '-',
  scadenza: '2026-12-01',
  assegnato_a: null,
  priorita: 'Media',
  settore: 'IT',
  note: null,
  stato: 'Da fare',
  avanzamento: 0,
  ore_lavorate: 0,
  created_at: '2026-09-22 10:00:00',
  started_at: null,
  completed_at: null,
  updated_at: null,
  ...overrides,
});

// Mercoledì 7 ottobre 2026: settimane del 21/9, 28/9 e 5/10
const weeks = lastWeeks(3, new Date(2026, 9, 7));

describe('andamento nel tempo', () => {
  it('fa settimane da lunedì a domenica, l ultima è quella in corso', () => {
    expect(weeks).toEqual([
      { start: '2026-09-21', end: '2026-09-27', label: '21 set' },
      { start: '2026-09-28', end: '2026-10-04', label: '28 set' },
      { start: '2026-10-05', end: '2026-10-11', label: '5 ott' },
    ]);
  });

  it('conta create, completate e aperte a fine settimana', () => {
    const trend = weeklyTrend(
      [
        // Creata la prima settimana, completata la seconda
        task({ stato: 'Completato', completed_at: '2026-09-30 12:00:00' }),
        // Creata la seconda settimana, ancora aperta
        task({ created_at: '2026-09-29 09:00:00', stato: 'In corso' }),
        // Creata prima del periodo, ancora aperta
        task({ created_at: '2026-08-01 09:00:00', stato: 'Bloccato' }),
        // Completata senza data: conta l'ultimo aggiornamento
        task({
          created_at: '2026-10-05 09:00:00',
          stato: 'Completato',
          updated_at: '2026-10-06 09:00:00',
        }),
      ],
      weeks,
    );
    expect(trend.created).toEqual([1, 1, 1]);
    expect(trend.completed).toEqual([0, 1, 1]);
    expect(trend.open).toEqual([2, 2, 2]);
  });

  it('somma le ore per settimana', () => {
    expect(
      weeklyHours(
        [
          { username: 'mario', settore: 'IT', giorno: '2026-09-21', ore: 2.5 },
          { username: 'anna', settore: 'IT', giorno: '2026-09-27', ore: 1 },
          { username: 'mario', settore: 'IT', giorno: '2026-10-07', ore: 4 },
          { username: 'mario', settore: 'IT', giorno: '2026-08-01', ore: 9 },
        ],
        weeks,
      ),
    ).toEqual([3.5, 0, 4]);
  });
});
