import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api';
import { InitData, NewTaskPayload, Project, Task, TaskEvent, TaskUpdatePayload } from './models';
import { PeopleService } from './people';

/** Attività, progetti e settori, caricati da api/init.php. */
@Injectable({ providedIn: 'root' })
export class WorkService {
  private readonly api = inject(ApiService);
  private readonly people = inject(PeopleService);

  readonly tasks = signal<Task[]>([]);
  readonly projects = signal<Project[]>([]);
  readonly sectors = signal<string[]>([]);
  readonly loaded = signal(false);

  async load(): Promise<void> {
    const data = await firstValueFrom(this.api.get<InitData>('init.php'));
    this.people.set(data.people);
    this.tasks.set(data.tasks);
    this.projects.set(data.projects);
    this.sectors.set(data.sectors);
    this.loaded.set(true);
  }

  async create(payload: NewTaskPayload): Promise<Task> {
    const { task } = await firstValueFrom(this.api.post<{ task: Task }>('task.php', payload));
    this.tasks.update((tasks) => [task, ...tasks]);
    return task;
  }

  async update(payload: TaskUpdatePayload): Promise<Task> {
    const { task } = await firstValueFrom(this.api.put<{ task: Task }>('task.php', payload));
    this.tasks.update((tasks) => tasks.map((t) => (t.id === task.id ? task : t)));
    return task;
  }

  /** Eliminazione logica (solo admin): l'attività resta nel database e nel registro. */
  async remove(id: string): Promise<void> {
    await firstValueFrom(this.api.delete('task.php', { id }));
    this.tasks.update((tasks) => tasks.filter((t) => t.id !== id));
  }

  /** Registro modifiche (solo admin). */
  async events(taskIds: string[]): Promise<TaskEvent[]> {
    const { events } = await firstValueFrom(
      this.api.get<{ events: TaskEvent[] }>('events.php', { task_id: taskIds.join(',') }),
    );
    return events;
  }
}
