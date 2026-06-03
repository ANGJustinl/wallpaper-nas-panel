import { EventEmitter } from 'node:events';
import type Database from 'better-sqlite3';
import type { SteamCmdLogEvent, SteamCmdLogScope, SteamCmdLogSource } from '../../../../packages/shared/src';

interface SteamCmdLogRow {
  sequence: number;
  scope: SteamCmdLogScope;
  task_id: string | null;
  workshop_item_id: string | null;
  source: SteamCmdLogSource;
  message: string;
  created_at: string;
}

interface AppendLogInput {
  scope: SteamCmdLogScope;
  source: SteamCmdLogSource;
  message: string;
  taskId?: string;
  workshopItemId?: string;
  secrets?: string[];
}

const defaultRetention = 1000;

function sanitizeMessage(message: string, secrets: string[] = []) {
  let sanitized = message.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trimEnd();

  secrets
    .map((secret) => secret.trim())
    .filter(Boolean)
    .sort((left, right) => right.length - left.length)
    .forEach((secret) => {
      sanitized = sanitized.split(secret).join('[redacted]');
    });

  return sanitized;
}

function rowToEvent(row: SteamCmdLogRow): SteamCmdLogEvent {
  return {
    sequence: row.sequence,
    scope: row.scope,
    source: row.source,
    message: row.message,
    createdAt: row.created_at,
    taskId: row.task_id ?? undefined,
    workshopItemId: row.workshop_item_id ?? undefined,
  };
}

export class SteamCmdLogStore {
  private readonly emitter = new EventEmitter();

  constructor(
    private readonly database: Database.Database,
    private readonly retention = defaultRetention,
  ) {
    this.emitter.setMaxListeners(100);
  }

  append(input: AppendLogInput) {
    const message = sanitizeMessage(input.message, input.secrets);
    if (!message) {
      return null;
    }

    const createdAt = new Date().toISOString();
    const result = this.database.prepare(
      `
        INSERT INTO steamcmd_log_events (
          scope,
          task_id,
          workshop_item_id,
          source,
          message,
          created_at
        ) VALUES (
          @scope,
          @task_id,
          @workshop_item_id,
          @source,
          @message,
          @created_at
        )
      `,
    ).run({
      scope: input.scope,
      task_id: input.taskId ?? null,
      workshop_item_id: input.workshopItemId ?? null,
      source: input.source,
      message,
      created_at: createdAt,
    });

    const event: SteamCmdLogEvent = {
      sequence: Number(result.lastInsertRowid),
      scope: input.scope,
      source: input.source,
      message,
      createdAt,
      taskId: input.taskId,
      workshopItemId: input.workshopItemId,
    };

    this.trim(input.scope, input.taskId);
    this.emitter.emit('event', event);
    return event;
  }

  listTaskLogs(taskId: string, options: { after?: number; limit?: number } = {}) {
    const after = Math.max(0, Math.floor(options.after ?? 0));
    const limit = Math.max(1, Math.min(1000, Math.floor(options.limit ?? 500)));
    const rows = this.database.prepare(
      `
        SELECT
          sequence,
          scope,
          task_id,
          workshop_item_id,
          source,
          message,
          created_at
        FROM steamcmd_log_events
        WHERE scope = 'download'
          AND task_id = ?
          AND sequence > ?
        ORDER BY sequence ASC
        LIMIT ?
      `,
    ).all(taskId, after, limit) as SteamCmdLogRow[];

    return rows.map(rowToEvent);
  }

  listLoginLogs(options: { after?: number; limit?: number } = {}) {
    const after = Math.max(0, Math.floor(options.after ?? 0));
    const limit = Math.max(1, Math.min(1000, Math.floor(options.limit ?? 500)));
    const rows = this.database.prepare(
      `
        SELECT
          sequence,
          scope,
          task_id,
          workshop_item_id,
          source,
          message,
          created_at
        FROM steamcmd_log_events
        WHERE scope = 'login'
          AND sequence > ?
        ORDER BY sequence ASC
        LIMIT ?
      `,
    ).all(after, limit) as SteamCmdLogRow[];

    return rows.map(rowToEvent);
  }

  subscribe(listener: (event: SteamCmdLogEvent) => void) {
    this.emitter.on('event', listener);
    return () => {
      this.emitter.off('event', listener);
    };
  }

  private trim(scope: SteamCmdLogScope, taskId?: string) {
    if (scope === 'download' && taskId) {
      this.database.prepare(
        `
          DELETE FROM steamcmd_log_events
          WHERE scope = 'download'
            AND task_id = @task_id
            AND sequence NOT IN (
              SELECT sequence
              FROM steamcmd_log_events
              WHERE scope = 'download'
                AND task_id = @task_id
              ORDER BY sequence DESC
              LIMIT @retention
            )
        `,
      ).run({ task_id: taskId, retention: this.retention });
      return;
    }

    if (scope === 'login') {
      this.database.prepare(
        `
          DELETE FROM steamcmd_log_events
          WHERE scope = 'login'
            AND sequence NOT IN (
              SELECT sequence
              FROM steamcmd_log_events
              WHERE scope = 'login'
              ORDER BY sequence DESC
              LIMIT @retention
            )
        `,
      ).run({ retention: this.retention });
    }
  }
}
