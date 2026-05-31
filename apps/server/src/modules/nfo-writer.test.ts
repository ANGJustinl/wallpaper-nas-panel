import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import type { SettingsSnapshot, WorkshopItemSummary } from '../../../../packages/shared/src';
import { createWorkshopNfo, inspectContentLibraryHealth, WORKSHOP_NFO_FILENAME, writeWorkshopMetadata, writeWorkshopNfo } from './nfo-writer';

function createWorkshopItem(): WorkshopItemSummary {
  return {
    id: '123456',
    title: 'A&B <Wallpaper>',
    author: 'Creator "One"',
    previewUrl: 'https://example.test/preview.jpg?x=1&y=2',
    rating: 4.75,
    tags: ['Relax', 'Relax', 'Sci-Fi'],
    description: 'Line one with <xml> & quotes.',
    source: 'featured',
    metadata: {
      miscellaneous: ['Audio Responsive'],
      genre: ['Landscape'],
      ageRating: 'Everyone',
      type: 'Scene',
      resolution: '3840 x 2160',
      category: 'Wallpaper',
      assetType: '',
      assetGenre: '',
      scriptType: '',
    },
  };
}

function createSettings(preserveExistingSidecars = true): SettingsSnapshot {
  return {
    steamAccountName: 'tester',
    downloadRoot: '/downloads/431960',
    metadataLanguage: 'en-US',
    requestIntervalMs: 1000,
    autoGenerateNfo: true,
    mediaLibrary: {
      jellyfinSidecars: true,
      videoOnlySidecars: true,
      preserveExistingSidecars,
    },
    contentLibrary: {
      deleteFilesDefault: false,
    },
    proxy: {
      enabled: false,
      url: '',
    },
  };
}

test('createWorkshopNfo serializes workshop metadata as escaped XML', () => {
  const xml = createWorkshopNfo({
    workshopItem: createWorkshopItem(),
    outputPath: '/downloads/431960/123456',
    downloadedAt: '2026-05-31T10:00:00.000Z',
    taskId: 'task-123',
    generatedAt: '2026-05-31T10:01:00.000Z',
  });

  assert.match(xml, /<title>A&amp;B &lt;Wallpaper&gt;<\/title>/);
  assert.match(xml, /<studio>Creator &quot;One&quot;<\/studio>/);
  assert.match(xml, /<uniqueid type="steam_workshop" default="true">123456<\/uniqueid>/);
  assert.match(xml, /<website>https:\/\/steamcommunity\.com\/sharedfiles\/filedetails\/\?id=123456<\/website>/);
  assert.match(xml, /<genre>Landscape<\/genre>/);
  assert.match(xml, /<tag>Sci-Fi<\/tag>/);
  assert.match(xml, /<dateadded>2026-05-31T10:00:00\.000Z<\/dateadded>/);
  assert.match(xml, /<taskid>task-123<\/taskid>/);
});

test('writeWorkshopNfo writes workshop.nfo into the content directory', () => {
  const outputPath = mkdtempSync(resolve(tmpdir(), 'workshop-nfo-'));
  const nfoPath = writeWorkshopNfo({
    workshopItem: createWorkshopItem(),
    outputPath,
    downloadedAt: '2026-05-31T10:00:00.000Z',
    taskId: 'task-123',
    generatedAt: '2026-05-31T10:01:00.000Z',
  });

  assert.equal(nfoPath, resolve(outputPath, WORKSHOP_NFO_FILENAME));
  assert.equal(existsSync(nfoPath), true);
  assert.match(readFileSync(nfoPath, 'utf8'), /<movie>/);
});

test('writeWorkshopMetadata writes Jellyfin sidecars for playable video content', () => {
  const outputPath = mkdtempSync(resolve(tmpdir(), 'workshop-sidecars-video-'));
  writeFileSync(resolve(outputPath, 'preview.jpg'), 'preview', 'utf8');
  writeFileSync(resolve(outputPath, 'loop.mp4'), 'video', 'utf8');

  const health = writeWorkshopMetadata({
    workshopItem: createWorkshopItem(),
    outputPath,
    downloadedAt: '2026-05-31T10:00:00.000Z',
    taskId: 'task-123',
    generatedAt: '2026-05-31T10:01:00.000Z',
    settings: createSettings(),
  });

  assert.equal(existsSync(resolve(outputPath, 'workshop.nfo')), true);
  assert.equal(existsSync(resolve(outputPath, 'movie.nfo')), true);
  assert.equal(existsSync(resolve(outputPath, 'poster.jpg')), true);
  assert.equal(existsSync(resolve(outputPath, 'folder.jpg')), true);
  assert.equal(health.jellyfinSidecarsStatus, 'ready');
  assert.equal(health.playableFileCount, 1);
});

test('writeWorkshopMetadata keeps non-video content as workshop-only metadata', () => {
  const outputPath = mkdtempSync(resolve(tmpdir(), 'workshop-sidecars-scene-'));
  writeFileSync(resolve(outputPath, 'preview.jpg'), 'preview', 'utf8');
  writeFileSync(resolve(outputPath, 'scene.pkg'), 'scene', 'utf8');

  const health = writeWorkshopMetadata({
    workshopItem: createWorkshopItem(),
    outputPath,
    downloadedAt: '2026-05-31T10:00:00.000Z',
    taskId: 'task-123',
    generatedAt: '2026-05-31T10:01:00.000Z',
    settings: createSettings(),
  });

  assert.equal(existsSync(resolve(outputPath, 'workshop.nfo')), true);
  assert.equal(existsSync(resolve(outputPath, 'movie.nfo')), false);
  assert.equal(existsSync(resolve(outputPath, 'poster.jpg')), false);
  assert.equal(existsSync(resolve(outputPath, 'folder.jpg')), false);
  assert.equal(health.jellyfinSidecarsStatus, 'not_applicable');
});

test('writeWorkshopMetadata preserves existing Jellyfin sidecars when configured', () => {
  const outputPath = mkdtempSync(resolve(tmpdir(), 'workshop-sidecars-preserve-'));
  writeFileSync(resolve(outputPath, 'preview.jpg'), 'new-preview', 'utf8');
  writeFileSync(resolve(outputPath, 'loop.mp4'), 'video', 'utf8');
  writeFileSync(resolve(outputPath, 'movie.nfo'), 'custom movie nfo', 'utf8');
  writeFileSync(resolve(outputPath, 'poster.jpg'), 'custom poster', 'utf8');

  writeWorkshopMetadata({
    workshopItem: createWorkshopItem(),
    outputPath,
    downloadedAt: '2026-05-31T10:00:00.000Z',
    taskId: 'task-123',
    generatedAt: '2026-05-31T10:01:00.000Z',
    settings: createSettings(true),
  });

  assert.equal(readFileSync(resolve(outputPath, 'movie.nfo'), 'utf8'), 'custom movie nfo');
  assert.equal(readFileSync(resolve(outputPath, 'poster.jpg'), 'utf8'), 'custom poster');
  assert.equal(inspectContentLibraryHealth(outputPath).jellyfinSidecarsStatus, 'ready');
});
