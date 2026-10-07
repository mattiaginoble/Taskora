import { Task } from '../../core/models';
import { todayIso } from '../../core/task-utils';

const MONTHS = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

/** Una settimana, da lunedì a domenica (AAAA-MM-GG). */
export interface Week {
  start: string;
  end: string;
  /** "12 ott": il lunedì della settimana. */
  label: string;
}

/** Ore registrate in un giorno (api/stats.php). */
export interface HoursRow {
  username: string;
  settore: string | null;
  giorno: string;
  ore: number;
}

export interface WeeklyTrend {
  created: number[];
  completed: number[];
  /** Task non completate alla fine di ogni settimana. */
  open: number[];
}

const addDays = (date: Date, days: number): Date => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

/** Le ultime N settimane, l'ultima è quella in corso. */
export const lastWeeks = (count: number, today = new Date()): Week[] => {
  const monday = addDays(today, -((today.getDay() + 6) % 7));
  return Array.from({ length: count }, (_, index) => {
    const start = addDays(monday, (index - count + 1) * 7);
    return {
      start: todayIso(start),
      end: todayIso(addDays(start, 6)),
      label: `${start.getDate()} ${MONTHS[start.getMonth()]}`,
    };
  });
};

/** Indice della settimana che contiene il giorno, o -1. */
const weekIndex = (weeks: Week[], day: string): number =>
  weeks.findIndex((week) => day >= week.start && day <= week.end);

const day = (value: string | null | undefined): string => String(value ?? '').slice(0, 10);

/** Giorno di completamento: completed_at, o l'ultimo aggiornamento per i dati più vecchi. */
const completedDay = (task: Task): string =>
  day(task.completed_at || task.updated_at || task.created_at);

export const weeklyTrend = (tasks: Task[], weeks: Week[]): WeeklyTrend => {
  const created = weeks.map(() => 0);
  const completed = weeks.map(() => 0);
  const open = weeks.map(() => 0);
  for (const task of tasks) {
    const createdOn = day(task.created_at);
    const done = task.stato === 'Completato';
    const completedOn = done ? completedDay(task) : '';
    const createdWeek = weekIndex(weeks, createdOn);
    if (createdWeek >= 0) created[createdWeek]++;
    if (done) {
      const completedWeek = weekIndex(weeks, completedOn);
      if (completedWeek >= 0) completed[completedWeek]++;
    }
    weeks.forEach((week, index) => {
      if (createdOn <= week.end && (!done || completedOn > week.end)) open[index]++;
    });
  }
  return { created, completed, open };
};

export const weeklyHours = (rows: HoursRow[], weeks: Week[]): number[] => {
  const hours = weeks.map(() => 0);
  for (const row of rows) {
    const index = weekIndex(weeks, row.giorno);
    if (index >= 0) hours[index] += Number(row.ore) || 0;
  }
  return hours.map((value) => Math.round(value * 100) / 100);
};
