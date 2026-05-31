import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { WorkshopItemSummary } from '../../../../packages/shared/src';

export const WORKSHOP_NFO_FILENAME = 'workshop.nfo';

interface WriteWorkshopNfoInput {
  workshopItem: WorkshopItemSummary;
  outputPath: string;
  downloadedAt?: string;
  taskId?: string;
  generatedAt?: string;
}

function normalizeXmlText(value: string) {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

function escapeXml(value: string | number) {
  return normalizeXmlText(String(value))
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function tag(name: string, value: string | number | undefined) {
  if (value === undefined || value === '') {
    return [];
  }

  return [`  <${name}>${escapeXml(value)}</${name}>`];
}

function repeatedTag(name: string, values: string[]) {
  return values
    .filter((value) => value.trim().length > 0)
    .map((value) => `  <${name}>${escapeXml(value)}</${name}>`);
}

function uniqueValues(values: Array<string | undefined>) {
  const seen = new Set<string>();
  return values.filter((value): value is string => {
    const normalized = value?.trim();
    if (!normalized || seen.has(normalized)) {
      return false;
    }

    seen.add(normalized);
    return true;
  });
}

export function createWorkshopNfo({
  workshopItem,
  outputPath,
  downloadedAt,
  taskId,
  generatedAt = new Date().toISOString(),
}: WriteWorkshopNfoInput) {
  const steamWorkshopUrl = `https://steamcommunity.com/sharedfiles/filedetails/?id=${workshopItem.id}`;
  const metadata = workshopItem.metadata;
  const tags = uniqueValues([
    ...workshopItem.tags,
    ...metadata.miscellaneous,
    metadata.type,
    metadata.category,
    metadata.resolution,
  ]);
  const genres = uniqueValues(metadata.genre);
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<movie>',
    ...tag('title', workshopItem.title),
    ...tag('originaltitle', workshopItem.title),
    `  <uniqueid type="steam_workshop" default="true">${escapeXml(workshopItem.id)}</uniqueid>`,
    ...tag('id', workshopItem.id),
    ...tag('studio', workshopItem.author),
    ...tag('plot', workshopItem.description),
    ...tag('rating', workshopItem.rating > 0 ? workshopItem.rating.toFixed(1) : undefined),
    ...repeatedTag('tag', tags),
    ...repeatedTag('genre', genres),
    ...tag('mpaa', metadata.ageRating),
    ...tag('thumb', workshopItem.previewUrl),
    ...tag('website', steamWorkshopUrl),
    ...tag('path', outputPath),
    ...tag('dateadded', downloadedAt),
    ...tag('taskid', taskId),
    ...tag('generated', generatedAt),
    '  <set>',
    '    <name>Wallpaper Engine Workshop</name>',
    '  </set>',
    '</movie>',
    '',
  ];

  return `${lines.join('\n')}`;
}

export function writeWorkshopNfo(input: WriteWorkshopNfoInput) {
  mkdirSync(input.outputPath, { recursive: true });
  const nfoPath = resolve(input.outputPath, WORKSHOP_NFO_FILENAME);
  writeFileSync(nfoPath, createWorkshopNfo(input), 'utf8');
  return nfoPath;
}
