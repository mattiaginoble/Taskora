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

/** Un'attività (riga della tabella `tasks`). Le task sono le righe del campo `note`. */
export interface Task {
  id: string;
  utente: string;
  progetto: string;
  descrizione: string;
  scadenza: string;
  assegnato_a: string | null;
  priorita: TaskPriority;
  settore: string | null;
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
}

export interface AdminUser {
  id: number;
  username: string;
  display_name: string;
}

export interface Project {
  id: number;
  nome: string;
}

export interface InitData {
  user: SessionUser;
  users: AdminUser[];
  projects: Project[];
  sectors: string[];
  people: Record<string, string>;
  tasks: Task[];
}

export type TaskEventType =
  'created' | 'task_added' | 'field_changed' | 'history_edited' | 'deleted' | 'hours_logged';

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

/** Dati per creare un'attività (POST api/task.php). */
export interface NewTaskPayload {
  /** Titolare dell'attività (solo admin; per i dipendenti è sempre chi la crea). */
  utente?: string;
  progetto: string;
  settore: string;
  note: string;
  scadenza: string;
  ore?: string;
  assegnato_a?: string;
  priorita?: TaskPriority;
  stato?: TaskStatus;
  avanzamento?: number;
}

/**
 * Aggiornamento di un'attività (PUT api/task.php). Il titolare può cambiare
 * stato, avanzamento, ore e aggiungere task; gli altri campi sono solo per gli admin.
 * I campi assenti restano invariati.
 */
export interface TaskUpdatePayload {
  id: string;
  utente?: string;
  stato?: TaskStatus;
  avanzamento?: number;
  note_append?: string;
  ore?: string;
  progetto?: string;
  settore?: string;
  scadenza?: string;
  assegnato_a?: string;
  priorita?: TaskPriority;
  /** Riscrive lo storico delle task: finisce nel registro come modifica sospetta. */
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
  type: string;
  severity: SignalSeverity;
  username: string;
  task_id: string | null;
  progetto: string | null;
  detail: string;
  at: string | null;
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
}

/** Gestione (GET api/admin.php). */
export interface ManagedUser {
  id: number;
  username: string;
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
