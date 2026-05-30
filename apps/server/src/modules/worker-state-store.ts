import type { DownloaderWorkerSnapshot } from '../../../../packages/shared/src';
import type Database from 'better-sqlite3';

const heartbeatFreshMs = 15_000;

interface WorkerStateRow {
  status: DownloaderWorkerSnapshot['status'];
  runner_id: string | null;
  started_at: string | null;
  heartbeat_at: string | null;
  active_task_id: string | null;
  active_task_title: string | null;
  last_error: string | null;
}

const defaultWorkerState: DownloaderWorkerSnapshot = {
  online: false,
  status: 'offline',
};

export class WorkerStateStore {
  constructor(private readonly database: Database.Database) {}

  seedDefaults() {
    this.database.prepare(
      `
        INSERT OR IGNORE INTO downloader_worker_state (
          id,
          status,
          runner_id,
          started_at,
          heartbeat_at,
          active_task_id,
          active_task_title,
          last_error
        ) VALUES (1, 'offline', NULL, NULL, NULL, NULL, NULL, NULL)
      `,
    ).run();
  }

  getSnapshot(): DownloaderWorkerSnapshot {
    const row = this.database
      .prepare(
        `
          SELECT
            status,
            runner_id,
            started_at,
            heartbeat_at,
            active_task_id,
            active_task_title,
            last_error
          FROM downloader_worker_state
          WHERE id = 1
        `,
      )
      .get() as WorkerStateRow | undefined;

    if (!row) {
      return defaultWorkerState;
    }

    const heartbeatAt = row.heartbeat_at ?? undefined;
    const online = Boolean(
      row.status !== 'offline'
      && heartbeatAt
      && Date.now() - new Date(heartbeatAt).getTime() <= heartbeatFreshMs,
    );

    return {
      online,
      status: online ? row.status : 'offline',
      runnerId: row.runner_id ?? undefined,
      startedAt: row.started_at ?? undefined,
      heartbeatAt,
      activeTaskId: row.active_task_id ?? undefined,
      activeTaskTitle: row.active_task_title ?? undefined,
      lastError: row.last_error ?? undefined,
    };
  }

  updateSnapshot(patch: Partial<DownloaderWorkerSnapshot>) {
    const current = this.getSnapshot();
    const next: DownloaderWorkerSnapshot = {
      ...current,
      ...patch,
      online: patch.online ?? current.online,
      status: patch.status ?? current.status,
      runnerId: Object.prototype.hasOwnProperty.call(patch, 'runnerId') ? patch.runnerId : current.runnerId,
      startedAt: Object.prototype.hasOwnProperty.call(patch, 'startedAt') ? patch.startedAt : current.startedAt,
      heartbeatAt: Object.prototype.hasOwnProperty.call(patch, 'heartbeatAt') ? patch.heartbeatAt : current.heartbeatAt,
      activeTaskId: Object.prototype.hasOwnProperty.call(patch, 'activeTaskId') ? patch.activeTaskId : current.activeTaskId,
      activeTaskTitle: Object.prototype.hasOwnProperty.call(patch, 'activeTaskTitle') ? patch.activeTaskTitle : current.activeTaskTitle,
      lastError: Object.prototype.hasOwnProperty.call(patch, 'lastError') ? patch.lastError : current.lastError,
    };

    this.database.prepare(
      `
        INSERT INTO downloader_worker_state (
          id,
          status,
          runner_id,
          started_at,
          heartbeat_at,
          active_task_id,
          active_task_title,
          last_error
        ) VALUES (
          1,
          @status,
          @runnerId,
          @startedAt,
          @heartbeatAt,
          @activeTaskId,
          @activeTaskTitle,
          @lastError
        )
        ON CONFLICT(id) DO UPDATE SET
          status = excluded.status,
          runner_id = excluded.runner_id,
          started_at = excluded.started_at,
          heartbeat_at = excluded.heartbeat_at,
          active_task_id = excluded.active_task_id,
          active_task_title = excluded.active_task_title,
          last_error = excluded.last_error
      `,
    ).run({
      status: next.status,
      runnerId: next.runnerId ?? null,
      startedAt: next.startedAt ?? null,
      heartbeatAt: next.heartbeatAt ?? null,
      activeTaskId: next.activeTaskId ?? null,
      activeTaskTitle: next.activeTaskTitle ?? null,
      lastError: next.lastError ?? null,
    });

    return next;
  }
}
