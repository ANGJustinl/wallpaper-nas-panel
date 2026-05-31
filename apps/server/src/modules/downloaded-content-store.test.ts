import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import Database from 'better-sqlite3';
import type { DownloadTask, WorkshopItemSummary } from '../../../../packages/shared/src';
import { migrateDatabase } from './database';
import { DownloadedContentStore } from './downloaded-content-store';

function createTask(id: string, workshopItemId: string, outputPath: string): DownloadTask {
  return {
    id,
    workshopItemId,
    workshopTitle: 'Test Wallpaper',
    status: 'succeeded',
    attempts: 1,
    createdAt: '2026-05-31T10:00:00.000Z',
    updatedAt: '2026-05-31T10:01:00.000Z',
    finishedAt: '2026-05-31T10:01:00.000Z',
    outputPath,
    logExcerpt: 'done',
  };
}

function createWorkshopItem(id: string): WorkshopItemSummary {
  return {
    id,
    title: 'Test Wallpaper',
    author: 'tester',
    previewUrl: '',
    rating: 4,
    tags: ['Video'],
    description: 'desc',
    source: 'featured',
    metadata: {
      miscellaneous: [],
      genre: [],
      ageRating: '',
      type: 'Video',
      resolution: '',
      category: 'Wallpaper',
      assetType: '',
      assetGenre: '',
      scriptType: '',
    },
  };
}

function createStore() {
  const database = new Database(':memory:');
  migrateDatabase(database);
  return new DownloadedContentStore(database);
}

test('deleteContent removes only the library record by default', () => {
  const store = createStore();
  const root = mkdtempSync(resolve(tmpdir(), 'content-store-record-'));
  const outputPath = resolve(root, '111');
  mkdirSync(outputPath, { recursive: true });
  writeFileSync(resolve(outputPath, 'loop.mp4'), 'video', 'utf8');
  store.recordDownload(createTask('task-111', '111', outputPath), createWorkshopItem('111'), outputPath);

  const result = store.deleteContent('111');

  assert.equal(result.recordDeleted, true);
  assert.equal(result.deletedFiles, false);
  assert.equal(existsSync(outputPath), true);
  assert.equal(store.listContents().length, 0);
});

test('deleteContent can delete the output directory after safety checks', () => {
  const store = createStore();
  const root = mkdtempSync(resolve(tmpdir(), 'content-store-files-'));
  const outputPath = resolve(root, '222');
  mkdirSync(outputPath, { recursive: true });
  writeFileSync(resolve(outputPath, 'loop.mp4'), 'video', 'utf8');
  store.recordDownload(createTask('task-222', '222', outputPath), createWorkshopItem('222'), outputPath);

  const result = store.deleteContent('222', { deleteFiles: true });

  assert.equal(result.recordDeleted, true);
  assert.equal(result.deletedFiles, true);
  assert.equal(existsSync(outputPath), false);
  assert.equal(store.listContents().length, 0);
});
