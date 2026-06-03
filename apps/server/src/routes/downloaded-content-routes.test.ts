import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import Database from 'better-sqlite3';
import type { Request, Response } from 'express';
import type { AppContext } from '../app-context';
import { migrateDatabase } from '../modules/database';
import { DownloadedContentStore } from '../modules/downloaded-content-store';
import { SettingsStore } from '../modules/settings-store';
import { SteamCmdAdapter } from '../modules/steamcmd-adapter';
import type { SteamCmdConfig } from '../modules/steamcmd-config';
import { TaskStore } from '../modules/task-store';
import type { DownloadTask, WorkshopItemSummary } from '../../../../packages/shared/src';
import { createDownloadedContentRoutes } from './downloaded-content-routes';

function createResponse() {
  const response = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };

  return response as Response & typeof response;
}

function createWorkshopItem(id: string): WorkshopItemSummary {
  return {
    id,
    title: 'Route Test Wallpaper',
    author: 'tester',
    previewUrl: '',
    rating: 4,
    tags: ['Video', 'Wallpaper'],
    description: 'desc',
    source: 'featured',
    metadata: {
      miscellaneous: [],
      genre: [],
      ageRating: 'Everyone',
      type: 'Video',
      resolution: '1920 x 1080',
      category: 'Wallpaper',
      assetType: '',
      assetGenre: '',
      scriptType: '',
    },
  };
}

function createTask(id: string, workshopItemId: string, outputPath: string): DownloadTask {
  return {
    id,
    workshopItemId,
    workshopTitle: 'Route Test Wallpaper',
    status: 'succeeded',
    attempts: 1,
    createdAt: '2026-05-31T10:00:00.000Z',
    updatedAt: '2026-05-31T10:01:00.000Z',
    finishedAt: '2026-05-31T10:01:00.000Z',
    outputPath,
    logExcerpt: 'done',
  };
}

function createContext() {
  const database = new Database(':memory:');
  migrateDatabase(database);
  const downloadedContentStore = new DownloadedContentStore(database);
  const settingsStore = new SettingsStore(database);
  const taskStore = new TaskStore(database);
  const baseDir = mkdtempSync(resolve(tmpdir(), 'library-route-context-'));
  const steamCmdScriptPath = resolve(baseDir, 'steamcmd', 'steamcmd.sh');
  const workshopContentDir = resolve(baseDir, 'workshop');
  mkdirSync(resolve(steamCmdScriptPath, '..'), { recursive: true });
  mkdirSync(workshopContentDir, { recursive: true });
  writeFileSync(steamCmdScriptPath, '#!/bin/sh\n', 'utf8');
  const steamCmdConfig: SteamCmdConfig = {
    steamCmdScriptPath,
    appId: '431960',
    workshopContentDir,
    lockSocketPath: resolve(baseDir, 'steamcmd.sock'),
    batchMaxItems: 20,
    available: true,
  };
  const steamCmdAdapter = new SteamCmdAdapter(steamCmdConfig);
  settingsStore.seedDefaults();

  return {
    context: {
      downloadedContentStore,
      settingsStore,
      taskStore,
      steamCmdConfig,
      steamCmdAdapter,
    } as AppContext,
    downloadedContentStore,
    settingsStore,
    taskStore,
    steamCmdConfig,
  };
}

test('DELETE /api/library/:id can remove files when deleteFiles=true', () => {
  const { context, downloadedContentStore } = createContext();
  const outputPath = resolve(mkdtempSync(resolve(tmpdir(), 'library-route-delete-')), '111');
  mkdirSync(outputPath, { recursive: true });
  writeFileSync(resolve(outputPath, 'loop.mp4'), 'video', 'utf8');
  downloadedContentStore.recordDownload(createTask('task-111', '111', outputPath), createWorkshopItem('111'), outputPath);

  const routes = createDownloadedContentRoutes(context);
  const response = createResponse();
  routes.deleteContent({ params: { id: '111' }, query: { deleteFiles: 'true' } } as unknown as Request, response);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, { ok: true, deletedFiles: true, outputPath });
  assert.equal(existsSync(outputPath), false);
});

test('GET /api/library supports pagination and search', () => {
  const { context, downloadedContentStore } = createContext();
  const basePath = mkdtempSync(resolve(tmpdir(), 'library-route-page-'));
  const firstPath = resolve(basePath, '111');
  const secondPath = resolve(basePath, '222');
  mkdirSync(firstPath, { recursive: true });
  mkdirSync(secondPath, { recursive: true });
  downloadedContentStore.recordDownload(createTask('task-111', '111', firstPath), {
    ...createWorkshopItem('111'),
    title: 'Alpha Wallpaper',
    author: 'Alice',
  }, firstPath);
  downloadedContentStore.recordDownload(createTask('task-222', '222', secondPath), {
    ...createWorkshopItem('222'),
    title: 'Beta Wallpaper',
    author: 'Bob',
  }, secondPath);

  const routes = createDownloadedContentRoutes(context);
  const response = createResponse();
  routes.listContents({ query: { page: '1', pageSize: '1', q: 'bob' } } as unknown as Request, response);

  assert.equal(response.statusCode, 200);
  assert.match(JSON.stringify(response.body), /"total":1/);
  assert.match(JSON.stringify(response.body), /"pageSize":1/);
  assert.match(JSON.stringify(response.body), /"title":"Beta Wallpaper"/);
});

test('GET /api/library/:id/files lists safe content files and rejects traversal', () => {
  const { context, downloadedContentStore } = createContext();
  const outputPath = resolve(mkdtempSync(resolve(tmpdir(), 'library-route-files-')), '444');
  mkdirSync(resolve(outputPath, 'assets'), { recursive: true });
  writeFileSync(resolve(outputPath, 'loop.mp4'), 'video', 'utf8');
  writeFileSync(resolve(outputPath, 'movie.nfo'), 'nfo', 'utf8');
  downloadedContentStore.recordDownload(createTask('task-444', '444', outputPath), createWorkshopItem('444'), outputPath);

  const routes = createDownloadedContentRoutes(context);
  const response = createResponse();
  routes.listContentFiles({ params: { id: '444' }, query: { page: '1', pageSize: '10' } } as unknown as Request, response);

  assert.equal(response.statusCode, 200);
  assert.match(JSON.stringify(response.body), /"name":"assets","type":"directory"/);
  assert.match(JSON.stringify(response.body), /"isPlayableVideo":true/);
  assert.match(JSON.stringify(response.body), /"isMetadataSidecar":true/);

  const unsafeResponse = createResponse();
  routes.listContentFiles({ params: { id: '444' }, query: { path: '..' } } as unknown as Request, unsafeResponse);
  assert.equal(unsafeResponse.statusCode, 400);
});

test('POST /api/library/:id/files/delete and move mutate files inside the content root', () => {
  const { context, downloadedContentStore } = createContext();
  const outputPath = resolve(mkdtempSync(resolve(tmpdir(), 'library-route-file-actions-')), '445');
  mkdirSync(resolve(outputPath, 'assets'), { recursive: true });
  writeFileSync(resolve(outputPath, 'loop.mp4'), 'video', 'utf8');
  writeFileSync(resolve(outputPath, 'movie.nfo'), 'nfo', 'utf8');
  downloadedContentStore.recordDownload(createTask('task-445', '445', outputPath), createWorkshopItem('445'), outputPath);

  const routes = createDownloadedContentRoutes(context);
  const moveResponse = createResponse();
  routes.moveContentFiles({
    params: { id: '445' },
    body: { paths: ['loop.mp4'], targetPath: 'assets' },
  } as unknown as Request, moveResponse);

  assert.equal(moveResponse.statusCode, 200);
  assert.equal(existsSync(resolve(outputPath, 'loop.mp4')), false);
  assert.equal(existsSync(resolve(outputPath, 'assets', 'loop.mp4')), true);
  assert.match(JSON.stringify(moveResponse.body), /"from":"loop\.mp4"/);
  assert.match(JSON.stringify(moveResponse.body), /"to":"assets\/loop\.mp4"/);

  const deleteResponse = createResponse();
  routes.deleteContentFiles({
    params: { id: '445' },
    body: { paths: ['movie.nfo'] },
  } as unknown as Request, deleteResponse);

  assert.equal(deleteResponse.statusCode, 200);
  assert.equal(existsSync(resolve(outputPath, 'movie.nfo')), false);

  const unsafeResponse = createResponse();
  routes.deleteContentFiles({
    params: { id: '445' },
    body: { paths: ['../outside.txt'] },
  } as unknown as Request, unsafeResponse);
  assert.equal(unsafeResponse.statusCode, 400);
});

test('POST /api/library/rescan refreshes facts and writes missing sidecars', () => {
  const { context, downloadedContentStore } = createContext();
  const outputPath = resolve(mkdtempSync(resolve(tmpdir(), 'library-route-rescan-')), '222');
  mkdirSync(outputPath, { recursive: true });
  writeFileSync(resolve(outputPath, 'loop.mp4'), 'video', 'utf8');
  writeFileSync(resolve(outputPath, 'preview.jpg'), 'preview', 'utf8');
  downloadedContentStore.recordDownload(createTask('task-222', '222', outputPath), createWorkshopItem('222'), outputPath);

  const routes = createDownloadedContentRoutes(context);
  const response = createResponse();
  routes.rescanContents({} as Request, response);

  assert.equal(response.statusCode, 200);
  assert.equal(existsSync(resolve(outputPath, 'movie.nfo')), true);
  assert.equal(existsSync(resolve(outputPath, 'poster.jpg')), true);
  assert.match(JSON.stringify(response.body), /"updatedCount":1/);
  assert.match(JSON.stringify(response.body), /"jellyfinSidecarsStatus":"ready"/);
});

test('POST /api/library/rescan restores missing output files from Steam workshop cache', () => {
  const { context, downloadedContentStore, steamCmdConfig } = createContext();
  const outputPath = resolve(mkdtempSync(resolve(tmpdir(), 'library-route-rescan-cache-')), '333');
  mkdirSync(outputPath, { recursive: true });
  writeFileSync(resolve(outputPath, 'workshop.nfo'), 'metadata only', 'utf8');
  const sourcePath = resolve(steamCmdConfig.workshopContentDir, '333');
  mkdirSync(sourcePath, { recursive: true });
  writeFileSync(resolve(sourcePath, 'loop.mp4'), 'video', 'utf8');
  writeFileSync(resolve(sourcePath, 'preview.jpg'), 'preview', 'utf8');
  downloadedContentStore.recordDownload(createTask('task-333', '333', outputPath), createWorkshopItem('333'), outputPath);

  const routes = createDownloadedContentRoutes(context);
  const response = createResponse();
  routes.rescanContents({} as Request, response);

  assert.equal(response.statusCode, 200);
  assert.equal(existsSync(resolve(outputPath, 'loop.mp4')), true);
  assert.equal(existsSync(resolve(outputPath, 'preview.jpg')), true);
  assert.equal(existsSync(resolve(outputPath, 'movie.nfo')), true);
  assert.equal(existsSync(resolve(outputPath, 'poster.jpg')), true);
  assert.match(JSON.stringify(response.body), /"fileCount":6/);
  assert.match(JSON.stringify(response.body), /"jellyfinSidecarsStatus":"ready"/);
});

test('POST /api/library/identify-steam imports Steam workshop folders and writes refreshed workshop descriptions', async () => {
  const { context, steamCmdConfig, taskStore } = createContext();
  const sourcePath = resolve(steamCmdConfig.workshopContentDir, '555');
  mkdirSync(sourcePath, { recursive: true });
  writeFileSync(resolve(sourcePath, 'loop.mp4'), 'video', 'utf8');
  writeFileSync(resolve(sourcePath, 'preview.jpg'), 'preview', 'utf8');
  writeFileSync(resolve(sourcePath, 'movie.nfo'), '<movie><title>555</title></movie>', 'utf8');
  writeFileSync(resolve(sourcePath, 'project.json'), JSON.stringify({
    title: 'Steam Cache Video',
    description: 'local project',
    type: 'video',
    contentrating: 'Everyone',
    tags: ['Anime'],
  }), 'utf8');
  taskStore.upsertTask(createTask('task-555', '555', sourcePath), {
    ...createWorkshopItem('555'),
    author: 'Known Creator',
    rating: 4.5,
    previewUrl: 'https://images.steamusercontent.com/known-preview.jpg',
  });

  const routes = createDownloadedContentRoutes(context, {
    fetchWorkshopItemDetails: async (ids) => {
      assert.deepEqual(ids, ['555']);
      return new Map<string, WorkshopItemSummary>([
        ['555', {
          ...createWorkshopItem('555'),
          title: 'Fresh Steam Title',
          author: 'Steam Workshop',
          previewUrl: 'https://images.steamusercontent.com/fresh-preview.jpg',
          rating: 0,
          tags: ['Anime', 'Video', 'Wallpaper', 'Mature'],
          description: 'Fresh workshop description from Steam.',
        }],
      ]);
    },
  });
  const response = createResponse();
  await routes.identifySteamWorkshopContents({} as Request, response);

  assert.equal(response.statusCode, 200);
  assert.equal(existsSync(resolve(sourcePath, 'movie.nfo')), true);
  assert.equal(existsSync(resolve(sourcePath, 'poster.jpg')), true);
  const movieNfo = readFileSync(resolve(sourcePath, 'movie.nfo'), 'utf8');
  assert.match(movieNfo, /<title>Fresh Steam Title<\/title>/);
  assert.match(movieNfo, /<plot>Fresh workshop description from Steam\.<\/plot>/);
  assert.match(movieNfo, /<thumb>poster\.jpg<\/thumb>/);
  assert.match(JSON.stringify(response.body), /"importedCount":1/);
  assert.match(JSON.stringify(response.body), /"detailsFetchedCount":1/);
  assert.match(JSON.stringify(response.body), /"author":"Known Creator"/);
  assert.match(JSON.stringify(response.body), /"rating":4.5/);
  assert.match(JSON.stringify(response.body), new RegExp(`"outputPath":"${sourcePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
  assert.match(JSON.stringify(response.body), /"jellyfinSidecarsStatus":"ready"/);
});

test('POST /api/library/identify-steam falls back to project description when Steam details are missing', async () => {
  const { context, steamCmdConfig, downloadedContentStore } = createContext();
  const sourcePath = resolve(steamCmdConfig.workshopContentDir, '777');
  mkdirSync(sourcePath, { recursive: true });
  writeFileSync(resolve(sourcePath, 'loop.mp4'), 'video', 'utf8');
  writeFileSync(resolve(sourcePath, 'preview.jpg'), 'preview', 'utf8');
  writeFileSync(resolve(sourcePath, 'movie.nfo'), '<movie><plot>从workshop识别</plot></movie>', 'utf8');
  writeFileSync(resolve(sourcePath, 'project.json'), JSON.stringify({
    title: 'Project Title',
    description: 'Project imported description.',
    type: 'video',
    tags: ['Video'],
  }), 'utf8');
  downloadedContentStore.recordContent({
    ...createWorkshopItem('777'),
    description: '从workshop识别',
  }, sourcePath, {
    downloadedAt: '2026-06-01T10:00:00.000Z',
    lastTaskId: 'steam-workshop-777',
  });

  const routes = createDownloadedContentRoutes(context, {
    fetchWorkshopItemDetails: async () => new Map<string, WorkshopItemSummary>(),
  });
  const response = createResponse();
  await routes.identifySteamWorkshopContents({} as Request, response);

  assert.equal(response.statusCode, 200);
  const movieNfo = readFileSync(resolve(sourcePath, 'movie.nfo'), 'utf8');
  assert.match(movieNfo, /<plot>Project imported description\.<\/plot>/);
  assert.doesNotMatch(movieNfo, /从workshop识别/);
  assert.match(JSON.stringify(response.body), /"detailsMissingCount":1/);
});
