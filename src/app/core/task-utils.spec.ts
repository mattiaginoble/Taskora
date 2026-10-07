import { Task } from './models';
import {
  countByStatus,
  describeSchedule,
  dueBucket,
  formatDateTime,
  groupByProject,
  groupStatus,
  isOverdue,
  parseTaskEntries,
  scheduleInfo,
  summarizeProject,
  timeProgress,
} from './task-utils';

const task = (overrides: Partial<Task>): Task => ({
  id: 't',
  titolo: 'Installare il server',
  utente: 'mario',
  progetto: 'HDM Scan',
  descrizione: '-',
  scadenza: '2026-10-10',
  creato_da: 'admin',
  assegnato_a: '',
  priorita: 'Media',
  settore: 'IT',
  note: '',
  stato: 'Da fare',
  avanzamento: 0,
  ore_lavorate: 0,
  created_at: '2026-10-01 10:00:00',
  started_at: null,
  completed_at: null,
  updated_at: null,
  ...overrides,
});

describe('parseTaskEntries', () => {
  it('legge data, autore e testo, anche su più righe', () => {
    const entries = parseTaskEntries(
      '[2026-09-10 10:00] mario: Sopralluogo\n[2026-09-11 09:30] luca: Rete ok\nmanca test',
    );
    expect(entries).toEqual([
      {
        date: '10/09/2026 10:00',
        sortKey: '2026-09-10 10:00',
        user: 'mario',
        message: 'Sopralluogo',
      },
      {
        date: '11/09/2026 09:30',
        sortKey: '2026-09-11 09:30',
        user: 'luca',
        message: 'Rete ok\nmanca test',
      },
    ]);
  });

  it('gestisce note vuote e righe senza data', () => {
    expect(parseTaskEntries(null)).toEqual([]);
    expect(parseTaskEntries('testo libero')[0]).toMatchObject({
      date: 'Data non disponibile',
      message: 'testo libero',
    });
  });
});

describe('formatDateTime', () => {
  it('formatta date e date con ora', () => {
    expect(formatDateTime('2026-09-30 11:32:05')).toBe('30/09/2026 11:32');
    expect(formatDateTime('2026-09-30')).toBe('30/09/2026');
    expect(formatDateTime('')).toBe('-');
  });
});

describe('scadenze e avanzamento', () => {
  const now = new Date('2026-10-06T12:00:00');

  it('isOverdue ignora le attività completate', () => {
    expect(isOverdue('2026-10-05', 'In corso', now)).toBe(true);
    expect(isOverdue('2026-10-05', 'Completato', now)).toBe(false);
    expect(isOverdue('2026-10-06', 'In corso', now)).toBe(false);
  });

  it('timeProgress misura il tempo trascorso fino a fine scadenza', () => {
    expect(timeProgress('2026-10-01 00:00:00', '2026-10-10', now)).toBe(55);
    expect(timeProgress(null, '2026-10-10', now)).toBeNull();
  });

  it('scheduleInfo segnala ritardi e scadenze superate', () => {
    expect(
      scheduleInfo(task({ avanzamento: 10, created_at: '2026-10-01 00:00:00' }), now).status,
    ).toBe('behind');
    expect(
      scheduleInfo(task({ avanzamento: 60, created_at: '2026-10-01 00:00:00' }), now).status,
    ).toBe('on-track');
    expect(scheduleInfo(task({ scadenza: '2026-10-02' }), now).status).toBe('late');
    expect(scheduleInfo(task({ stato: 'Completato' }), now).status).toBe('done');
    expect(describeSchedule(task({ stato: 'Completato', avanzamento: 100 }), now)).toContain(
      'Completata',
    );
  });
});

describe('riepilogo per progetto', () => {
  it('groupStatus: Bloccato > In corso > Da fare; Completato solo se tutte', () => {
    expect(groupStatus([{ stato: 'In corso' }, { stato: 'Bloccato' }])).toBe('Bloccato');
    expect(groupStatus([{ stato: 'Da fare' }, { stato: 'In corso' }])).toBe('In corso');
    expect(groupStatus([{ stato: 'Completato' }, { stato: 'Da fare' }])).toBe('Da fare');
    expect(groupStatus([{ stato: 'Completato' }, { stato: 'Completato' }])).toBe('Completato');
  });

  it('summarizeProject: media, scadenza aperta più vicina, priorità più alta tra le aperte, ore sommate', () => {
    const summary = summarizeProject([
      task({
        stato: 'Da fare',
        avanzamento: 0,
        scadenza: '2026-08-31',
        priorita: 'Media',
        ore_lavorate: 1.5,
      }),
      task({
        stato: 'In corso',
        avanzamento: 50,
        scadenza: '2026-10-15',
        priorita: 'Alta',
        ore_lavorate: 2,
      }),
      task({ stato: 'Completato', avanzamento: 100, scadenza: '2026-08-01', priorita: 'Bassa' }),
    ]);
    expect(summary).toMatchObject({
      stato: 'In corso',
      avanzamento: 50,
      scadenza: '2026-08-31',
      priorita: 'Alta',
      ore_lavorate: 3.5,
    });
  });

  it('groupByProject unisce i progetti senza distinguere le maiuscole e mette prima quelli in corso', () => {
    const groups = groupByProject([
      task({ progetto: 'ACA', stato: 'Da fare', created_at: '2026-10-05 10:00:00' }),
      task({ progetto: 'HDM Scan', stato: 'In corso' }),
      task({ progetto: 'hdm scan', stato: 'Da fare' }),
    ]);
    expect(groups.map((g) => [g.progetto, g.records.length])).toEqual([
      ['HDM Scan', 2],
      ['ACA', 1],
    ]);
  });
});

describe('countByStatus', () => {
  it('conta le task per stato, con zero per gli stati assenti', () => {
    expect(
      countByStatus([
        task({ stato: 'In corso' }),
        task({ stato: 'In corso' }),
        task({ stato: 'Completato' }),
      ]),
    ).toEqual({ 'Da fare': 0, 'In corso': 2, Completato: 1, Bloccato: 0 });
  });
});

describe('dueBucket', () => {
  const now = new Date(2026, 9, 7);
  it('divide le task aperte per urgenza', () => {
    expect(dueBucket({ scadenza: '2026-10-06', stato: 'In corso' }, now)).toBe('overdue');
    expect(dueBucket({ scadenza: '2026-10-07', stato: 'In corso' }, now)).toBe('soon');
    expect(dueBucket({ scadenza: '2026-10-14', stato: 'Da fare' }, now)).toBe('soon');
    expect(dueBucket({ scadenza: '2026-10-15', stato: 'Da fare' }, now)).toBe('later');
    expect(dueBucket({ scadenza: '', stato: 'Da fare' }, now)).toBe('none');
  });
});
