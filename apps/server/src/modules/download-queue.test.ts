import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import Database from 'better-sqlite3';
import type { WorkshopItemSummary } from '../../../../packages/shared/src';
import { migrateDatabase } from './database';
import { DownloadQueue } from './download-queue';
import { DownloadedContentStore } from './downloaded-content-store';
import { SettingsStore } from './settings-store';
import { SteamCmdAdapter } from './steamcmd-adapter';
import type { SteamCmdConfig } from './steamcmd-config';
import { SteamCmdSocketLock } from './steamcmd-socket-lock';
import { TaskStore } from './task-store';
import { WorkerStateStore } from './worker-state-store';
import { WORKSHOP_NFO_FILENAME } from './nfo-writer';

function createWorkshopItem(id: string): WorkshopItemSummary {
  return {
    id,
    title: 'Queue Test Wallpaper',
    author: 'tester',
    previewUrl: 'https://example.test/preview.jpg',
    rating: 4.5,
    tags: ['Scene', 'Wallpaper'],
    description: 'A queue integration test item.',
    source: 'featured',
    metadata: {
      miscellaneous: [],
      genre: ['Abstract'],
      ageRating: 'Everyone',
      type: 'Scene',
      resolution: '1920 x 1080',
      category: 'Wallpaper',
      assetType: '',
      assetGenre: '',
      scriptType: '',
    },
  };
}

function createConfig(baseDir: string): SteamCmdConfig {
  const steamCmdDir = resolve(baseDir, 'steamcmd');
  const workshopContentDir = resolve(baseDir, 'workshop');
  mkdirSync(steamCmdDir, { recursive: true });
  mkdirSync(workshopContentDir, { recursive: true });
  const steamCmdScriptPath = resolve(steamCmdDir, 'steamcmd.sh');
  writeFileSync(steamCmdScriptPath, '#!/bin/sh\n', 'utf8');

  return {
    steamCmdScriptPath,
    appId: '431960',
    workshopContentDir,
    lockSocketPath: resolve(baseDir, 'steamcmd.sock'),
    batchMaxItems: 20,
    available: true,
  };
}

function createMockSpawn(stdoutChunks: string[], exitCode: number) {
  const spawn = () => {
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const child = new EventEmitter() as EventEmitter & { stdout: PassThrough; stderr: PassThrough };
    child.stdout = stdout;
    child.stderr = stderr;

    process.nextTick(() => {
      stdoutChunks.forEach((chunk) => stdout.write(chunk));
      stdout.end();
      stderr.end();
      child.emit('close', exitCode);
    });

    return child;
  };

  return spawn;
}

async function waitForTaskStatus(store: TaskStore, workshopItemId: string, status: string) {
  const deadline = Date.now() + 1000;

  while (Date.now() < deadline) {
    const task = store.getTaskByWorkshopItemId(workshopItemId);
    if (task?.status === status) {
      return task;
    }

    await new Promise((resolvePromise) => {
      setTimeout(resolvePromise, 10);
    });
  }

  return store.getTaskByWorkshopItemId(workshopItemId);
}

test('DownloadQueue writes NFO when a queued download succeeds', async () => {
  const baseDir = mkdtempSync(resolve(tmpdir(), 'download-queue-nfo-'));
  const database = new Database(':memory:');
  migrateDatabase(database);

  const taskStore = new TaskStore(database);
  const downloadedContentStore = new DownloadedContentStore(database);
  const settingsStore = new SettingsStore(database);
  const workerStateStore = new WorkerStateStore(database);
  settingsStore.seedDefaults();
  workerStateStore.seedDefaults();

  const config = createConfig(baseDir);
  const downloadRoot = resolve(baseDir, 'downloads');
  settingsStore.updateSnapshot({
    ...settingsStore.getSnapshot(),
    steamAccountName: 'tester',
    downloadRoot,
    autoGenerateNfo: true,
    proxy: {
      enabled: false,
      url: '',
    },
  });

  const workshopItem = createWorkshopItem('111');
  const sourcePath = resolve(config.workshopContentDir, workshopItem.id);
  mkdirSync(sourcePath, { recursive: true });
  writeFileSync(resolve(sourcePath, 'project.json'), '{"title":"Queue Test Wallpaper"}', 'utf8');

  const adapter = new SteamCmdAdapter(
    config,
    createMockSpawn([`Downloading item 111 ...\nSuccess. Downloaded item 111 to ${sourcePath}\n`], 0) as never,
  );
  const queue = new DownloadQueue(
    taskStore,
    downloadedContentStore,
    adapter,
    settingsStore,
    workerStateStore,
    new SteamCmdSocketLock(config.lockSocketPath),
    20,
  );

  try {
    queue.createTask(workshopItem);
    queue.startWorkerLoop();

    const task = await waitForTaskStatus(taskStore, workshopItem.id, 'succeeded');
    assert.equal(task?.status, 'succeeded');

    const nfoPath = resolve(downloadRoot, workshopItem.id, WORKSHOP_NFO_FILENAME);
    assert.equal(existsSync(nfoPath), true);
    assert.match(readFileSync(nfoPath, 'utf8'), /<uniqueid type="steam_workshop" default="true">111<\/uniqueid>/);

    const content = downloadedContentStore.listContents()[0];
    assert.equal(content?.id, workshopItem.id);
    assert.equal(content?.fileCount, 2);
  } finally {
    queue.stopWorkerLoop('test done');
  }
});
