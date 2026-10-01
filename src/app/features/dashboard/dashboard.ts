import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Task } from '../../core/models';
import { PeopleService } from '../../core/people';
import { SessionService } from '../../core/session';
import { ProjectSummary, groupByProject, sortTasks } from '../../core/task-utils';
import { ToastService } from '../../core/toast';
import { WorkService } from '../../core/work';
import { NewTask } from '../tasks/new-task';
import { ProjectCard } from './project-card';
import { ProjectDetail } from './project-detail';

/** Scheda "Senza settore": task create prima che il settore fosse obbligatorio. */
const NO_SECTOR = '__none__';

interface EmployeeColumn {
  username: string;
  name: string;
  projects: ProjectSummary[];
  inProgress: number;
}

@Component({
  selector: 'app-dashboard',
  imports: [ProjectCard, ProjectDetail, NewTask],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class DashboardPage {
  protected readonly work = inject(WorkService);
  protected readonly session = inject(SessionService);
  private readonly people = inject(PeopleService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  /** Settore dall'indirizzo (?settore=IT), così il filtro resta nei segnalibri. */
  readonly settore = input<string>();

  protected readonly loading = signal(true);
  protected readonly search = signal('');
  protected readonly showCompleted = signal(true);
  protected readonly selectedProject = signal('');
  protected readonly collapsed = signal(new Set<string>());
  protected readonly creating = signal(false);
  /** Progetto aperto nel dettaglio: owner (colonna) e nome del progetto. */
  private readonly openProjectKey = signal<{ owner: string; project: string } | null>(null);

  /** Scheda scelta: parte dall'indirizzo ma si può cambiare dalla pagina. */
  protected readonly selectedSector = linkedSignal(() => this.settore() ?? '');
  protected readonly searchPlaceholder = computed(() =>
    this.session.isAdmin() ? 'Cerca progetto o dipendente' : 'Cerca progetto',
  );

  /** Task filtrate da ricerca, completate e progetto (non dal settore). */
  private readonly baseTasks = computed(() => {
    const query = this.search().trim().toLowerCase();
    return sortTasks(this.work.tasks()).filter((task) => {
      if (this.selectedProject() && task.progetto !== this.selectedProject()) return false;
      if (!this.showCompleted() && task.stato === 'Completato') return false;
      if (!query) return true;
      return [
        task.utente,
        this.people.name(task.utente),
        task.progetto,
        task.creato_da,
        this.people.name(task.creato_da),
        task.titolo,
        task.priorita,
      ].some((value) =>
        String(value ?? '')
          .toLowerCase()
          .includes(query),
      );
    });
  });

  private readonly matchesSector = (task: Task, sector: string): boolean =>
    sector === NO_SECTOR ? !task.settore : task.settore === sector;

  protected readonly tabs = computed(() => {
    const tasks = this.baseTasks();
    const countProjects = (list: Task[]) =>
      new Set(list.map((t) => `${t.utente}|${String(t.progetto).toLowerCase()}`)).size;
    const tabs = [
      { id: '', label: 'Tutti', count: countProjects(tasks) },
      ...this.work.sectors().map((sector) => ({
        id: sector,
        label: sector,
        count: countProjects(tasks.filter((t) => t.settore === sector)),
      })),
    ];
    const withoutSector = tasks.filter((t) => !t.settore);
    if (withoutSector.length > 0) {
      tabs.push({ id: NO_SECTOR, label: 'Senza settore', count: countProjects(withoutSector) });
    }
    return tabs;
  });

  /** Una colonna per persona (owner delle task), in ordine di nome. */
  protected readonly columns = computed<EmployeeColumn[]>(() => {
    const sector = this.selectedSector();
    const tasks = sector
      ? this.baseTasks().filter((t) => this.matchesSector(t, sector))
      : this.baseTasks();
    const byEmployee = new Map<string, Task[]>();
    for (const task of tasks) {
      const username = task.utente || 'Sconosciuto';
      byEmployee.set(username, [...(byEmployee.get(username) ?? []), task]);
    }
    return [...byEmployee.entries()]
      .map(([username, list]) => {
        const projects = groupByProject(list);
        return {
          username,
          name: this.people.name(username),
          projects,
          inProgress: projects.filter((p) => p.stato === 'In corso').length,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'it', { sensitivity: 'base' }));
  });

  protected readonly totals = computed(() => {
    const columns = this.columns();
    const projects = columns.reduce((sum, c) => sum + c.projects.length, 0);
    const inProgress = columns.reduce((sum, c) => sum + c.inProgress, 0);
    if (projects === 0) return 'Nessun progetto';
    return `${projects} ${projects === 1 ? 'progetto' : 'progetti'}${inProgress ? ` · ${inProgress} in corso` : ''}`;
  });

  /** Task del progetto aperto, sempre aggiornate (nuove, modificate, eliminate). */
  protected readonly openRecords = computed(() => {
    const key = this.openProjectKey();
    if (!key) return [];
    return this.work.tasks().filter(
      (t) =>
        (t.utente || 'Sconosciuto') === key.owner &&
        String(t.progetto ?? '')
          .trim()
          .toLowerCase() === key.project,
    );
  });

  constructor() {
    this.work
      .load()
      .catch((error) => this.toast.error(error))
      .finally(() => this.loading.set(false));
  }

  protected selectSector(id: string): void {
    this.selectedSector.set(id);
    // "Senza settore" resta solo nella pagina, gli altri anche nell'indirizzo
    this.router.navigate([], {
      queryParams: { settore: id && id !== NO_SECTOR ? id : null },
      replaceUrl: true,
    });
  }

  protected toggleColumn(username: string): void {
    this.collapsed.update((set) => {
      const next = new Set(set);
      if (!next.delete(username)) next.add(username);
      return next;
    });
  }

  protected readonly allCollapsed = computed(() => {
    const columns = this.columns();
    return columns.length > 0 && columns.every((c) => this.collapsed().has(c.username));
  });

  protected toggleAllColumns(): void {
    this.collapsed.set(
      this.allCollapsed() ? new Set() : new Set(this.columns().map((c) => c.username)),
    );
  }

  protected openProject(owner: string, project: ProjectSummary): void {
    this.openProjectKey.set({ owner, project: project.key });
  }

  protected closeProject(): void {
    this.openProjectKey.set(null);
  }

  protected avatar(name: string): string {
    return name.charAt(0).toUpperCase();
  }
}
