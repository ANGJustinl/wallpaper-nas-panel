import { basename, resolve } from 'node:path';
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import type { DownloadTask, DownloadedContentItem, WorkshopItemSummary } from '../../../../packages/shared/src';
import type Database from 'better-sqlite3';
import { inspectContentLibraryHealth } from './nfo-writer';
import { createEmptyWorkshopMetadata, normalizeWorkshopMetadata } from './workshop-item-metadata';

interface DownloadedContentRow {
  workshop_item_id: string;
  workshop_title: string;
  author: string;
  preview_url: string;
  rating: number;
  tags_json: string;
  description: string;
  source: WorkshopItemSummary['source'];
  metadata_json: string;
  output_path: string;
  downloaded_at: string;
  entry_count: number;
  file_count: number;
  total_bytes: number;
  last_task_id: string;
}

function parseJsonValue<T>(input: string, fallback: T) {
  try {
    return JSON.parse(input) as T;
  } catch {
    return fallback;
  }
}

function inspectDirectory(outputPath: string) {
  const resolvedPath = resolve(outputPath);

  if (!existsSync(resolvedPath)) {
    return { entryCount: 0, fileCount: 0, totalBytes: 0 };
  }

  let entryCount = 0;
  let fileCount = 0;
  let totalBytes = 0;
  const stack = [resolvedPath];

  while (stack.length) {
    const currentPath = stack.pop();
    if (!currentPath) {
      continue;
    }

    const stats = statSync(currentPath);
    if (stats.isFile()) {
      fileCount += 1;
      totalBytes += stats.size;
      continue;
    }

    const children = readdirSync(currentPath, { withFileTypes: true });
    entryCount += children.length;

    children.forEach((entry) => {
      stack.push(resolve(currentPath, entry.name));
    });
  }

  return { entryCount, fileCount, totalBytes };
}

function removeOutputDirectory(workshopItemId: string, outputPath: string) {
  const resolvedPath = resolve(outputPath);
  if (!existsSync(resolvedPath)) {
    return false;
  }

  if (resolvedPath === '/' || basename(resolvedPath) !== workshopItemId) {
    throw new Error(`Refusing to delete unsafe content path: ${outputPath}`);
  }

  rmSync(resolvedPath, { recursive: true, force: true });
  return true;
}

export class DownloadedContentStore {
  constructor(private readonly database: Database.Database) {}

  listContents() {
    const rows = this.database
      .prepare(
        `
          SELECT
            workshop_item_id,
            workshop_title,
            author,
            preview_url,
            rating,
            tags_json,
            description,
            source,
            metadata_json,
            output_path,
            downloaded_at,
            entry_count,
            file_count,
            total_bytes,
            last_task_id
          FROM downloaded_contents
          ORDER BY downloaded_at DESC, workshop_title COLLATE NOCASE ASC
        `,
      )
      .all() as DownloadedContentRow[];

    return rows.map((row) => this.toItem(row));
  }

  deleteContent(workshopItemId: string, options: { deleteFiles?: boolean } = {}) {
    const row = this.database.prepare(
      `
        SELECT output_path
        FROM downloaded_contents
        WHERE workshop_item_id = ?
        LIMIT 1
      `,
    ).get(workshopItemId) as { output_path: string } | undefined;

    if (!row) {
      return { recordDeleted: false, deletedFiles: false };
    }

    const deletedFiles = options.deleteFiles ? removeOutputDirectory(workshopItemId, row.output_path) : false;
    const result = this.database.prepare(`DELETE FROM downloaded_contents WHERE workshop_item_id = ?`).run(workshopItemId);
    return { recordDeleted: result.changes > 0, deletedFiles, outputPath: row.output_path };
  }

  refreshDirectoryFacts(workshopItemId: string, outputPath?: string) {
    const row = this.database.prepare(
      `
        SELECT output_path
        FROM downloaded_contents
        WHERE workshop_item_id = ?
        LIMIT 1
      `,
    ).get(workshopItemId) as { output_path: string } | undefined;

    const resolvedOutputPath = outputPath ?? row?.output_path;
    if (!resolvedOutputPath) {
      return false;
    }

    const directoryFacts = inspectDirectory(resolvedOutputPath);
    const result = this.database.prepare(
      `
        UPDATE downloaded_contents
        SET
          entry_count = @entry_count,
          file_count = @file_count,
          total_bytes = @total_bytes
        WHERE workshop_item_id = @workshop_item_id
      `,
    ).run({
      workshop_item_id: workshopItemId,
      entry_count: directoryFacts.entryCount,
      file_count: directoryFacts.fileCount,
      total_bytes: directoryFacts.totalBytes,
    });

    return result.changes > 0;
  }

  backfillFromSucceededTasks(entries: Array<{ task: DownloadTask; workshopItem: WorkshopItemSummary }>) {
    let createdCount = 0;

    entries.forEach(({ task, workshopItem }) => {
      if (!task.outputPath || this.hasContent(workshopItem.id)) {
        return;
      }

      this.recordDownload(task, workshopItem, task.outputPath);
      createdCount += 1;
    });

    return createdCount;
  }

  recordDownload(task: DownloadTask, workshopItem: WorkshopItemSummary, outputPath: string) {
    const directoryFacts = inspectDirectory(outputPath);
    const metadata = normalizeWorkshopMetadata(workshopItem.metadata, workshopItem.tags);

    this.database.prepare(
      `
        INSERT INTO downloaded_contents (
          workshop_item_id,
          workshop_title,
          author,
          preview_url,
          rating,
          tags_json,
          description,
          source,
          metadata_json,
          output_path,
          downloaded_at,
          entry_count,
          file_count,
          total_bytes,
          last_task_id
        ) VALUES (
          @workshop_item_id,
          @workshop_title,
          @author,
          @preview_url,
          @rating,
          @tags_json,
          @description,
          @source,
          @metadata_json,
          @output_path,
          @downloaded_at,
          @entry_count,
          @file_count,
          @total_bytes,
          @last_task_id
        )
        ON CONFLICT(workshop_item_id) DO UPDATE SET
          workshop_title = excluded.workshop_title,
          author = excluded.author,
          preview_url = excluded.preview_url,
          rating = excluded.rating,
          tags_json = excluded.tags_json,
          description = excluded.description,
          source = excluded.source,
          metadata_json = excluded.metadata_json,
          output_path = excluded.output_path,
          downloaded_at = excluded.downloaded_at,
          entry_count = excluded.entry_count,
          file_count = excluded.file_count,
          total_bytes = excluded.total_bytes,
          last_task_id = excluded.last_task_id
      `,
    ).run({
      workshop_item_id: workshopItem.id,
      workshop_title: workshopItem.title,
      author: workshopItem.author,
      preview_url: workshopItem.previewUrl,
      rating: workshopItem.rating,
      tags_json: JSON.stringify(workshopItem.tags),
      description: workshopItem.description,
      source: workshopItem.source,
      metadata_json: JSON.stringify(metadata),
      output_path: outputPath,
      downloaded_at: task.finishedAt ?? new Date().toISOString(),
      entry_count: directoryFacts.entryCount,
      file_count: directoryFacts.fileCount,
      total_bytes: directoryFacts.totalBytes,
      last_task_id: task.id,
    });
  }

  private toItem(row: DownloadedContentRow): DownloadedContentItem {
    const tags = parseJsonValue<string[]>(row.tags_json, []);

    return {
      id: row.workshop_item_id,
      title: row.workshop_title,
      author: row.author || '未知作者',
      previewUrl: row.preview_url,
      rating: Number.isFinite(row.rating) ? Number(row.rating) : 0,
      tags,
      description: row.description || '暂无简介。',
      source: row.source === 'search' ? 'search' : 'featured',
      metadata: normalizeWorkshopMetadata(parseJsonValue(row.metadata_json, createEmptyWorkshopMetadata()), tags),
      outputPath: row.output_path,
      downloadedAt: row.downloaded_at,
      entryCount: row.entry_count,
      fileCount: row.file_count,
      totalBytes: row.total_bytes,
      lastTaskId: row.last_task_id,
      libraryHealth: inspectContentLibraryHealth(row.output_path),
    };
  }

  private hasContent(workshopItemId: string) {
    const row = this.database.prepare(
      `
        SELECT workshop_item_id
        FROM downloaded_contents
        WHERE workshop_item_id = ?
        LIMIT 1
      `,
    ).get(workshopItemId) as { workshop_item_id: string } | undefined;

    return Boolean(row);
  }
}
