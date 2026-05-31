import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import type { WorkshopItemSummary } from '../../../../packages/shared/src';
import { createWorkshopNfo, WORKSHOP_NFO_FILENAME, writeWorkshopNfo } from './nfo-writer';

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
