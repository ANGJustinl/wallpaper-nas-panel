import type { DownloadTask, WorkshopItemSummary } from '../../../../packages/shared/src';
import type Database from 'better-sqlite3';
import { createEmptyWorkshopMetadata, normalizeWorkshopMetadata } from './workshop-item-metadata';

interface TaskRow {
  id: string;
  workshop_item_id: string;
  workshop_title: string;
  author: string;
  preview_url: string;
  rating: number;
  tags_json: string;
  description: string;
  source: WorkshopItemSummary['source'];
  metadata_json: string;
  status: DownloadTask['status'];
  attempts: number;
  created_at: string;
  updated_at: string;
  claimed_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  runner_id: string | null;
  log_excerpt: string;
  failure_code: string | null;
  output_path: string | null;
  error_message: string | null;
}

const taskColumns = `
  id,
  workshop_item_id,
  workshop_title,
  author,
  preview_url,
  rating,
  tags_json,
  description,
  source,
  metadata_json,
  status,
  attempts,
  created_at,
  updated_at,
  claimed_at,
  started_at,
  finished_at,
  runner_id,
  log_excerpt,
  failure_code,
  output_path,
  error_message
`;

function parseJsonValue<T>(input: string, fallback: T) {
  try {
    return JSON.parse(input) as T;
  } catch {
    return fallback;
  }
}

export class TaskStore {
  constructor(private readonly database: Database.Database) {}

  listTasks() {
    const rows = this.database
      .prepare(
        `
          SELECT
            ${taskColumns}
          FROM tasks
          ORDER BY updated_at DESC, created_at DESC
        `,
      )
      .all() as TaskRow[];

    return rows.map((row) => this.toTask(row));
  }

  clearAllTasks() {
    this.database.prepare(`DELETE FROM tasks`).run();
  }

  deleteTask(taskId: string) {
    const task = this.getTask(taskId);
    if (!task || task.status === 'pending' || task.status === 'running') {
      return false;
    }

    const result = this.database.prepare(`DELETE FROM tasks WHERE id = ?`).run(taskId);
    return result.changes > 0;
  }

  deleteFinishedTasks() {
    const result = this.database.prepare(
      `
        DELETE FROM tasks
        WHERE status IN ('succeeded', 'failed')
      `,
    ).run();

    return result.changes;
  }

  getTaskByWorkshopItemId(workshopItemId: string) {
    const row = this.database
      .prepare(
        `
          SELECT
            ${taskColumns}
          FROM tasks
          WHERE workshop_item_id = ?
          ORDER BY updated_at DESC, created_at DESC
          LIMIT 1
        `,
      )
      .get(workshopItemId) as TaskRow | undefined;

    return row ? this.toTask(row) : null;
  }

  getActiveTaskByWorkshopItemId(workshopItemId: string) {
    const row = this.database
      .prepare(
        `
          SELECT
            ${taskColumns}
          FROM tasks
          WHERE workshop_item_id = ?
            AND status IN ('pending', 'running')
          ORDER BY updated_at DESC, created_at DESC
          LIMIT 1
        `,
      )
      .get(workshopItemId) as TaskRow | undefined;

    return row ? this.toTask(row) : null;
  }

  getTask(id: string) {
    const row = this.getTaskRow(id);
    return row ? this.toTask(row) : null;
  }

  getTaskWorkshopItem(id: string) {
    const row = this.getTaskRow(id);
    return row ? this.toWorkshopItem(row) : null;
  }

  listSucceededLibraryCandidates() {
    const rows = this.database
      .prepare(
        `
          SELECT
            ${taskColumns}
          FROM tasks
          WHERE status = 'succeeded'
            AND output_path IS NOT NULL
          ORDER BY finished_at DESC, updated_at DESC
        `,
      )
      .all() as TaskRow[];

    const seen = new Set<string>();
    return rows
      .filter((row) => {
        if (!row.output_path || seen.has(row.workshop_item_id)) {
          return false;
        }

        seen.add(row.workshop_item_id);
        return true;
      })
      .map((row) => ({
        task: this.toTask(row),
        workshopItem: this.toWorkshopItem(row),
      }));
  }

  upsertTask(task: DownloadTask, workshopItem?: WorkshopItemSummary) {
    const currentRow = this.getTaskRow(task.id);
    const normalizedItem = workshopItem
      ? {
          ...workshopItem,
          metadata: normalizeWorkshopMetadata(workshopItem.metadata, workshopItem.tags),
        }
      : currentRow
        ? this.toWorkshopItem(currentRow)
        : null;

    this.database.prepare(
      `
        INSERT INTO tasks (
          id,
          workshop_item_id,
          workshop_title,
          author,
          preview_url,
          rating,
          tags_json,
          description,
          source,
          metadata_json,
          status,
          attempts,
          created_at,
          updated_at,
          claimed_at,
          started_at,
          finished_at,
          runner_id,
          log_excerpt,
          failure_code,
          output_path,
          error_message
        ) VALUES (
          @id,
          @workshop_item_id,
          @workshop_title,
          @author,
          @preview_url,
          @rating,
          @tags_json,
          @description,
          @source,
          @metadata_json,
          @status,
          @attempts,
          @created_at,
          @updated_at,
          @claimed_at,
          @started_at,
          @finished_at,
          @runner_id,
          @log_excerpt,
          @failure_code,
          @output_path,
          @error_message
        )
        ON CONFLICT(id) DO UPDATE SET
          workshop_item_id = excluded.workshop_item_id,
          workshop_title = excluded.workshop_title,
          author = excluded.author,
          preview_url = excluded.preview_url,
          rating = excluded.rating,
          tags_json = excluded.tags_json,
          description = excluded.description,
          source = excluded.source,
          metadata_json = excluded.metadata_json,
          status = excluded.status,
          attempts = excluded.attempts,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at,
          claimed_at = excluded.claimed_at,
          started_at = excluded.started_at,
          finished_at = excluded.finished_at,
          runner_id = excluded.runner_id,
          log_excerpt = excluded.log_excerpt,
          failure_code = excluded.failure_code,
          output_path = excluded.output_path,
          error_message = excluded.error_message
      `,
    ).run({
      id: task.id,
      workshop_item_id: task.workshopItemId,
      workshop_title: task.workshopTitle,
      author: normalizedItem?.author ?? '',
      preview_url: normalizedItem?.previewUrl ?? '',
      rating: normalizedItem?.rating ?? 0,
      tags_json: JSON.stringify(normalizedItem?.tags ?? []),
      description: normalizedItem?.description ?? '',
      source: normalizedItem?.source ?? 'featured',
      metadata_json: JSON.stringify(normalizedItem?.metadata ?? createEmptyWorkshopMetadata()),
      status: task.status,
      attempts: task.attempts,
      created_at: task.createdAt,
      updated_at: task.updatedAt,
      claimed_at: task.claimedAt ?? null,
      started_at: task.startedAt ?? null,
      finished_at: task.finishedAt ?? null,
      runner_id: task.runnerId ?? null,
      log_excerpt: task.logExcerpt,
      failure_code: task.failureCode ?? null,
      output_path: task.outputPath ?? null,
      error_message: task.errorMessage ?? null,
    });
  }

  updateTask(taskId: string, patch: Partial<DownloadTask>) {
    const current = this.getTask(taskId);
    if (!current) {
      return null;
    }

    const has = <K extends keyof DownloadTask>(key: K) => Object.prototype.hasOwnProperty.call(patch, key);

    const merged: DownloadTask = {
      ...current,
      ...patch,
      id: current.id,
      workshopItemId: has('workshopItemId') ? patch.workshopItemId ?? current.workshopItemId : current.workshopItemId,
      workshopTitle: has('workshopTitle') ? patch.workshopTitle ?? current.workshopTitle : current.workshopTitle,
      status: has('status') ? patch.status ?? current.status : current.status,
      attempts: has('attempts') ? patch.attempts ?? current.attempts : current.attempts,
      createdAt: has('createdAt') ? patch.createdAt ?? current.createdAt : current.createdAt,
      updatedAt: has('updatedAt') ? patch.updatedAt ?? current.updatedAt : current.updatedAt,
      claimedAt: has('claimedAt') ? patch.claimedAt : current.claimedAt,
      startedAt: has('startedAt') ? patch.startedAt : current.startedAt,
      finishedAt: has('finishedAt') ? patch.finishedAt : current.finishedAt,
      runnerId: has('runnerId') ? patch.runnerId : current.runnerId,
      logExcerpt: has('logExcerpt') ? patch.logExcerpt ?? current.logExcerpt : current.logExcerpt,
      failureCode: has('failureCode') ? patch.failureCode : current.failureCode,
      outputPath: has('outputPath') ? patch.outputPath : current.outputPath,
      errorMessage: has('errorMessage') ? patch.errorMessage : current.errorMessage,
    };

    this.upsertTask(merged);
    return merged;
  }

  hasPendingTasks() {
    const row = this.database
      .prepare(
        `
          SELECT 1 AS present
          FROM tasks
          WHERE status = 'pending'
          LIMIT 1
        `,
      )
      .get() as { present: number } | undefined;

    return Boolean(row?.present);
  }

  claimPendingTasks(limit: number, runnerId: string) {
    const claimAt = new Date().toISOString();
    const claimTransaction = this.database.transaction((batchLimit: number, batchRunnerId: string, batchClaimAt: string) => {
      const candidateRows = this.database
        .prepare(
          `
            SELECT
              ${taskColumns}
            FROM tasks
            WHERE status = 'pending'
            ORDER BY created_at ASC, updated_at ASC
            LIMIT ?
          `,
        )
        .all(batchLimit) as TaskRow[];

      if (!candidateRows.length) {
        return [] as DownloadTask[];
      }

      const updateStatement = this.database.prepare(
        `
          UPDATE tasks
          SET
            status = 'running',
            attempts = attempts + 1,
            claimed_at = ?,
            started_at = ?,
            finished_at = NULL,
            runner_id = ?,
            updated_at = ?,
            log_excerpt = ?,
            failure_code = NULL,
            output_path = NULL,
            error_message = NULL
          WHERE id = ?
            AND status = 'pending'
        `,
      );

      const claimedTasks: DownloadTask[] = [];
      candidateRows.forEach((row) => {
        const result = updateStatement.run(
          batchClaimAt,
          batchClaimAt,
          batchRunnerId,
          batchClaimAt,
          '已并入当前 steamcmd 批次，等待执行。',
          row.id,
        );

        if (result.changes === 0) {
          return;
        }

        claimedTasks.push(this.toTask({
          ...row,
          status: 'running',
          attempts: row.attempts + 1,
          claimed_at: batchClaimAt,
          started_at: batchClaimAt,
          finished_at: null,
          runner_id: batchRunnerId,
          updated_at: batchClaimAt,
          log_excerpt: '已并入当前 steamcmd 批次，等待执行。',
          failure_code: null,
          output_path: null,
          error_message: null,
        }));
      });

      return claimedTasks;
    });

    return claimTransaction.immediate(limit, runnerId, claimAt);
  }

  claimNextPendingTask(runnerId: string) {
    return this.claimPendingTasks(1, runnerId)[0] ?? null;
  }

  requeueInterruptedTasks() {
    const now = new Date().toISOString();

    this.database.prepare(
      `
        UPDATE tasks
        SET
          status = 'pending',
          updated_at = ?,
          claimed_at = NULL,
          started_at = NULL,
          finished_at = NULL,
          runner_id = NULL,
          log_excerpt = ?,
          failure_code = NULL,
          output_path = NULL,
          error_message = NULL
        WHERE status = 'running'
      `,
    ).run(now, '检测到服务重启，未完成任务已重新排队。');
  }

  retryTask(taskId: string) {
    const current = this.getTask(taskId);
    if (!current || current.status !== 'failed') {
      return null;
    }

    return this.updateTask(taskId, {
      status: 'pending',
      updatedAt: new Date().toISOString(),
      claimedAt: undefined,
      startedAt: undefined,
      finishedAt: undefined,
      runnerId: undefined,
      logExcerpt: '已重新加入下载队列，等待 steamcmd worker 执行。',
      failureCode: undefined,
      outputPath: undefined,
      errorMessage: undefined,
    });
  }

  private getTaskRow(id: string) {
    return this.database
      .prepare(
        `
          SELECT
            ${taskColumns}
          FROM tasks
          WHERE id = ?
        `,
      )
      .get(id) as TaskRow | undefined;
  }

  private toTask(row: TaskRow): DownloadTask {
    return {
      id: row.id,
      workshopItemId: row.workshop_item_id,
      workshopTitle: row.workshop_title,
      status: row.status,
      attempts: row.attempts,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      claimedAt: row.claimed_at ?? undefined,
      startedAt: row.started_at ?? undefined,
      finishedAt: row.finished_at ?? undefined,
      runnerId: row.runner_id ?? undefined,
      logExcerpt: row.log_excerpt,
      failureCode: (row.failure_code ?? undefined) as DownloadTask['failureCode'],
      outputPath: row.output_path ?? undefined,
      errorMessage: row.error_message ?? undefined,
    };
  }

  private toWorkshopItem(row: TaskRow): WorkshopItemSummary {
    return {
      id: row.workshop_item_id,
      title: row.workshop_title,
      author: row.author || '未知作者',
      previewUrl: row.preview_url,
      rating: Number.isFinite(row.rating) ? Number(row.rating) : 0,
      tags: parseJsonValue<string[]>(row.tags_json, []),
      description: row.description || '暂无简介。',
      source: row.source === 'search' ? 'search' : 'featured',
      metadata: normalizeWorkshopMetadata(parseJsonValue(row.metadata_json, createEmptyWorkshopMetadata()), parseJsonValue<string[]>(row.tags_json, [])),
    };
  }
}
