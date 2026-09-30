import { Task, TaskPriority, TaskStatus } from './models';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Una task del campo `note`: riga "[AAAA-MM-GG HH:MM] utente: testo". */
export interface TaskEntry {
  /** Data leggibile (gg/mm/aaaa hh:mm). */
  date: string;
  /** Data originale, ordinabile come testo. */
  sortKey: string;
  user: string;
  message: string;
}

export const parseTaskEntries = (note: string | null | undefined): TaskEntry[] => {
  const lines = String(note ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const entries: TaskEntry[] = [];
  let current: TaskEntry | null = null;

  for (const line of lines) {
    const match = line.match(/^\[([^\]]+)\]\s*(.*)$/);
    if (match) {
      const [, date, payload] = match;
      const separator = payload.indexOf(':');
      current = {
        date: formatDateTime(date),
        sortKey: date.trim(),
        user: separator === -1 ? '' : payload.slice(0, separator).trim(),
        message: (separator === -1 ? payload : payload.slice(separator + 1)).trim(),
      };
      entries.push(current);
    } else if (current) {
      // Riga di continuazione di una task su più righe
      current.message = current.message ? `${current.message}\n${line}` : line;
    } else {
      entries.push({ date: 'Data non disponibile', sortKey: '', user: '', message: line });
    }
  }
  return entries;
};

/** "2026-09-30 11:32[:00]" → "30/09/2026 11:32"; "2026-09-30" → "30/09/2026". */
export const formatDateTime = (value: string | null | undefined): string => {
  const match = String(value ?? '').match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (!match) return value ? String(value) : '-';
  const [, year, month, day, hours, minutes] = match;
  return hours ? `${day}/${month}/${year} ${hours}:${minutes}` : `${day}/${month}/${year}`;
};

export const formatDate = (value: string | null | undefined): string =>
  value ? formatDateTime(String(value).slice(0, 10)) : 'Non impostata';

export const todayIso = (now = new Date()): string =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

export const addDaysIso = (days: number, from = new Date()): string => {
  const date = new Date(from);
  date.setDate(date.getDate() + days);
  return todayIso(date);
};

export const clampProgress = (value: unknown): number => {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) : 0;
};

export const isOverdue = (
  scadenza: string | null | undefined,
  stato: TaskStatus,
  now = new Date(),
): boolean => {
  if (!scadenza || stato === 'Completato') return false;
  return scadenza < todayIso(now);
};

const parseDateTime = (value: string | null | undefined): Date | null => {
  if (!value) return null;
  const date = new Date(String(value).trim().replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? null : date;
};

/** Percentuale di tempo trascorso tra creazione e fine del giorno di scadenza (0-100), o null. */
export const timeProgress = (
  createdAt: string | null | undefined,
  scadenza: string | null | undefined,
  now = new Date(),
): number | null => {
  const start = parseDateTime(createdAt);
  const dueDay = parseDateTime(scadenza ? `${scadenza}T00:00:00` : '');
  if (!start || !dueDay) return null;
  const total = dueDay.getTime() + DAY_MS - start.getTime();
  if (total <= 0) return 100;
  return Math.min(100, Math.max(0, Math.round(((now.getTime() - start.getTime()) / total) * 100)));
};

export type ScheduleStatus = 'done' | 'late' | 'behind' | 'on-track' | 'unknown';

export interface ScheduleInfo {
  progress: number;
  timeProgress: number | null;
  status: ScheduleStatus;
}

type ScheduleSource = Pick<Task, 'avanzamento' | 'created_at' | 'scadenza' | 'stato'>;

/** Confronta l'avanzamento del lavoro con il tempo trascorso. */
export const scheduleInfo = (task: ScheduleSource, now = new Date()): ScheduleInfo => {
  const progress = clampProgress(task.avanzamento);
  const elapsed = timeProgress(task.created_at, task.scadenza, now);
  let status: ScheduleStatus = 'on-track';
  if (task.stato === 'Completato' || progress >= 100) status = 'done';
  else if (elapsed === null) status = 'unknown';
  else if (isOverdue(task.scadenza, task.stato, now)) status = 'late';
  else if (progress + 10 < elapsed) status = 'behind';
  return { progress, timeProgress: elapsed, status };
};

const SCHEDULE_LABELS: Record<ScheduleStatus, string> = {
  done: 'Completata',
  late: 'Scadenza superata',
  behind: 'In ritardo rispetto al tempo',
  'on-track': 'In linea con i tempi',
  unknown: '',
};

export const describeSchedule = (task: ScheduleSource, now = new Date()): string => {
  const { progress, timeProgress: elapsed, status } = scheduleInfo(task, now);
  return [
    `Avanzamento ${progress}%`,
    elapsed === null ? '' : `Tempo trascorso ${elapsed}%`,
    SCHEDULE_LABELS[status],
  ]
    .filter(Boolean)
    .join(' · ');
};

const PRIORITY_RANK: Record<TaskPriority, number> = { Alta: 3, Media: 2, Bassa: 1 };

/** Stato di un progetto: Bloccato > In corso > Da fare; Completato solo se lo sono tutte. */
export const groupStatus = (tasks: Pick<Task, 'stato'>[]): TaskStatus => {
  const states = tasks.map((t) => t.stato);
  if (states.includes('Bloccato')) return 'Bloccato';
  if (states.includes('In corso')) return 'In corso';
  if (states.every((s) => s === 'Completato')) return 'Completato';
  return 'Da fare';
};

/** Riepilogo delle attività di un progetto per una persona. */
export interface ProjectSummary {
  key: string;
  progetto: string;
  settori: string[];
  stato: TaskStatus;
  priorita: TaskPriority;
  avanzamento: number;
  scadenza: string;
  created_at: string;
  updated_at: string;
  latest: string;
  ore_lavorate: number;
  records: Task[];
}

const unique = <T>(values: (T | null | undefined | '')[]): T[] => [
  ...new Set(values.filter(Boolean) as T[]),
];

export const summarizeProject = (records: Task[]): ProjectSummary => {
  const open = records.filter((r) => r.stato !== 'Completato');
  const relevant = open.length > 0 ? open : records;

  // Scadenza più vicina tra le attività aperte (o l'ultima se tutte completate)
  const dueDates = relevant
    .map((r) => r.scadenza)
    .filter(Boolean)
    .sort();
  const scadenza = open.length > 0 ? (dueDates[0] ?? '') : (dueDates[dueDates.length - 1] ?? '');

  const priorita = relevant.reduce<TaskPriority>(
    (best, r) => ((PRIORITY_RANK[r.priorita] ?? 2) > PRIORITY_RANK[best] ? r.priorita : best),
    'Media',
  );

  return {
    key: String(records[0]?.progetto ?? '')
      .trim()
      .toLowerCase(),
    progetto: records[0]?.progetto ?? '',
    settori: unique(records.map((r) => r.settore)),
    stato: groupStatus(records),
    priorita,
    avanzamento: Math.round(
      records.reduce((sum, r) => sum + clampProgress(r.avanzamento), 0) / records.length,
    ),
    scadenza,
    created_at:
      relevant
        .map((r) => r.created_at)
        .filter(Boolean)
        .sort()[0] ?? '',
    updated_at:
      records
        .map((r) => r.updated_at || r.created_at || '')
        .sort()
        .pop() ?? '',
    latest:
      records
        .map((r) => r.created_at || '')
        .sort()
        .pop() ?? '',
    ore_lavorate: records.reduce((sum, r) => sum + (Number(r.ore_lavorate) || 0), 0),
    records,
  };
};

/** Raggruppa per progetto: prima quelli in corso, poi i più recenti. */
export const groupByProject = (records: Task[]): ProjectSummary[] => {
  const groups = new Map<string, Task[]>();
  for (const record of records) {
    const key = String(record.progetto ?? '')
      .trim()
      .toLowerCase();
    groups.set(key, [...(groups.get(key) ?? []), record]);
  }
  return [...groups.values()].map(summarizeProject).sort((a, b) => {
    const inProgress = Number(b.stato === 'In corso') - Number(a.stato === 'In corso');
    return inProgress || b.latest.localeCompare(a.latest);
  });
};

/** Ordine delle attività: prima quelle in corso, poi le più recenti. */
export const sortTasks = (tasks: Task[]): Task[] =>
  [...tasks].sort((a, b) => {
    const inProgress = Number(b.stato === 'In corso') - Number(a.stato === 'In corso');
    return inProgress || String(b.created_at || '').localeCompare(String(a.created_at || ''));
  });

export const formatHours = (value: number | string | null | undefined): string => {
  const hours = Number(value) || 0;
  return hours === 0
    ? 'nessuna'
    : `${hours.toLocaleString('it-IT', { maximumFractionDigits: 2 })} h`;
};
