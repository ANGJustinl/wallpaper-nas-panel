import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import type { DownloadTask, WorkshopItemSummary } from '../../../../packages/shared/src';
import { migrateDatabase } from './database';
import { TaskStore } from './task-store';

function createTask(id: string, workshopItemId: string, workshopTitle: string, createdAt: string): DownloadTask {
  return {
    id,
    workshopItemId,
    workshopTitle,
    status: 'pending',
    attempts: 0,
    createdAt,
    updatedAt: createdAt,
    logExcerpt: 'waiting',
  };
}

function createWorkshopItem(id: string, title: string): WorkshopItemSummary {
  return {
    id,
    title,
    author: 'tester',
    previewUrl: '',
    rating: 5,
    tags: [],
    description: 'desc',
    source: 'featured',
    metadata: {
      miscellaneous: [],
      genre: [],
      ageRating: '',
      type: '',
      resolution: '',
      category: '',
      assetType: '',
      assetGenre: '',
      scriptType: '',
    },
  };
}

function createStore() {
  const database = new Database(':memory:');
  migrateDatabase(database);
  return new TaskStore(database);
}

test('claimPendingTasks claims oldest pending tasks once per batch', () => {
  const store = createStore();
  store.upsertTask(createTask('task-1', '101', 'first', '2026-05-30T10:00:00.000Z'), createWorkshopItem('101', 'first'));
  store.upsertTask(createTask('task-2', '102', 'second', '2026-05-30T10:00:01.000Z'), createWorkshopItem('102', 'second'));
  store.upsertTask(createTask('task-3', '103', 'third', '2026-05-30T10:00:02.000Z'), createWorkshopItem('103', 'third'));

  const claimed = store.claimPendingTasks(2, 'runner-a');
  assert.equal(claimed.length, 2);
  assert.deepEqual(claimed.map((task) => task.id), ['task-1', 'task-2']);
  assert.ok(claimed.every((task) => task.status === 'running'));
  assert.ok(claimed.every((task) => task.runnerId === 'runner-a'));
  assert.ok(claimed.every((task) => task.attempts === 1));
  assert.ok(claimed.every((task) => task.logExcerpt.includes('steamcmd 批次')));

  const secondClaim = store.claimPendingTasks(2, 'runner-b');
  assert.equal(secondClaim.length, 1);
  assert.equal(secondClaim[0]?.id, 'task-3');
  assert.equal(secondClaim[0]?.runnerId, 'runner-b');
});

test('requeueInterruptedTasks moves running tasks back to pending', () => {
  const store = createStore();
  store.upsertTask(createTask('task-1', '101', 'first', '2026-05-30T10:00:00.000Z'), createWorkshopItem('101', 'first'));

  const claimed = store.claimPendingTasks(1, 'runner-a')[0];
  assert.ok(claimed);
  assert.equal(store.getTask('task-1')?.status, 'running');

  store.requeueInterruptedTasks();
  const requeued = store.getTask('task-1');
  assert.equal(requeued?.status, 'pending');
  assert.equal(requeued?.runnerId, undefined);
  assert.equal(requeued?.claimedAt, undefined);
  assert.equal(requeued?.startedAt, undefined);
  assert.equal(requeued?.finishedAt, undefined);
  assert.match(requeued?.logExcerpt ?? '', /重新排队/);
});
