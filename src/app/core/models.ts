/** Tipi dei dati restituiti dall'API PHP (api/*.php). */

export type TaskStatus = 'Da fare' | 'In corso' | 'Completato' | 'Bloccato';
export type TaskPriority = 'Bassa' | 'Media' | 'Alta';

export const TASK_STATUSES: readonly TaskStatus[] = [
  'Da fare',
  'In corso',
  'Completato',
  'Bloccato',
];
export const TASK_PRIORITIES: readonly TaskPriority[] = ['Bassa', 'Media', 'Alta'];

/** Una task (riga della tabella `tasks`): appartiene a un progetto e ha le sue note. */
export interface Task {
  id: string;
  /** Testo della task. */
  titolo: string;
  /** Owner del task: chi deve svolgerla. */
  utente: string;
  /** "Assegnato da": chi ha creato la task, impostato dal server. */
  creato_da: string | null;
  progetto: string;
  descrizione: string;
  scadenza: string;
  /** Vecchio "responsabile" scelto a mano: resta nei dati ma non si usa più. */
  assegnato_a: string | null;
  priorita: TaskPriority;
  settore: string | null;
  /** Note scritte durante il lavoro: righe "[AAAA-MM-GG HH:MM] utente: testo". */
  note: string | null;
  stato: TaskStatus;
  avanzamento: number;
  ore_lavorate: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string | null;
}

export interface SessionUser {
  id: number;
  username: string;
  role: string;
  display_name: string;
  email?: string | null;
}

export interface Project {
  id: number;
  nome: string;
}

export interface InitData {
  user: SessionUser;
  projects: Project[];
  sectors: string[];
  people: Record<string, string>;
  tasks: Task[];
}

export type TaskEventType =
  | 'created'
  | 'note_added'
  /** Nome che avevano le note quando le task erano raggruppate in attività. */
  | 'task_added'
  | 'field_changed'
  | 'history_edited'
  | 'deleted'
  | 'hours_logged';

export interface TaskEvent {
  id: number;
  task_id: string;
  username: string;
  event_type: TaskEventType;
  field: string | null;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
}

/** Dati per creare una task (POST api/task.php). */
export interface NewTaskPayload {
  titolo: string;
  /** Owner del task (solo admin; per i dipendenti è sempre chi la crea). */
  utente?: string;
  progetto: string;
  settore: string;
  scadenza: string;
  ore?: string;
  priorita?: TaskPriority;
  stato?: TaskStatus;
  avanzamento?: number;
}

/**
 * Aggiornamento di una task (PUT api/task.php). L'owner può cambiare stato,
 * avanzamento, ore e aggiungere note; gli altri campi sono solo per gli admin.
 * I campi assenti restano invariati.
 */
export interface TaskUpdatePayload {
  id: string;
  titolo?: string;
  utente?: string;
  stato?: TaskStatus;
  avanzamento?: number;
  note_append?: string;
  ore?: string;
  progetto?: string;
  settore?: string;
  scadenza?: string;
  priorita?: TaskPriority;
  /** Riscrive le note: finisce nel registro come modifica sospetta. */
  note?: string;
}

/** Riepilogo per gli admin (GET api/report.php). */
export type SignalSeverity = 'alta' | 'media' | 'info';

export interface ReportUser {
  username: string;
  attivita_aperte: number;
  scadute: number;
  bloccate: number;
  completate_periodo: number;
  task_inserite_periodo: number;
  ore_periodo: number;
  giorni_attivi: number;
  ultimo_aggiornamento: string | null;
  giorni_da_ultimo: number | null;
  tempo_medio_completamento: number | null;
  segnali: number;
}

export interface ReportSignal {
  /** Identifica il segnale, per segnarlo come falso positivo. */
  key: string;
  type: string;
  severity: SignalSeverity;
  username: string;
  task_id: string | null;
  progetto: string | null;
  detail: string;
  at: string | null;
  /** Solo per i falsi positivi: chi e quando l'ha segnato. */
  dismissed_by?: string;
  dismissed_at?: string;
  /** Perché è un falso positivo (facoltativo). */
  dismissed_reason?: string | null;
}

export interface Report {
  sector: string;
  sectors: string[];
  people: Record<string, string>;
  period: { days: number; from: string; to: string };
  thresholds: {
    stale_days: number;
    progress_jump: number;
    burst_count: number;
    burst_minutes: number;
  };
  users: ReportUser[];
  signals: ReportSignal[];
  /** Segnali segnati come falsi positivi: esclusi da signals e dal conteggio per dipendente. */
  dismissed_signals: ReportSignal[];
  /** Attività nel periodo: username → giorno (AAAA-MM-GG) → numero di azioni. */
  activity: Record<string, Record<string, number>>;
}

/** Gestione (GET api/admin.php). */
export interface ManagedUser {
  id: number;
  username: string;
  email: string | null;
  display_name: string | null;
  role: string;
  must_change_password: number | string;
  created_at: string | null;
}

export interface NamedCount {
  id: number;
  nome: string;
  attivita: number | string;
  created_at: string | null;
}

export interface AdminData {
  users: ManagedUser[];
  projects: NamedCount[];
  sectors: NamedCount[];
}
