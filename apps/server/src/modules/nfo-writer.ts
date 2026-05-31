import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { extname, relative, resolve } from 'node:path';
import type { ContentLibraryHealth, SettingsSnapshot, WorkshopItemSummary } from '../../../../packages/shared/src';

export const WORKSHOP_NFO_FILENAME = 'workshop.nfo';
export const JELLYFIN_MOVIE_NFO_FILENAME = 'movie.nfo';
export const JELLYFIN_POSTER_FILENAME = 'poster.jpg';
export const JELLYFIN_FOLDER_FILENAME = 'folder.jpg';
export const LOCAL_PREVIEW_FILENAME = 'preview.jpg';
export const VIDEO_FILE_EXTENSIONS = ['.mp4', '.webm', '.mkv', '.mov', '.m4v', '.avi'];

interface WriteWorkshopNfoInput {
  workshopItem: WorkshopItemSummary;
  outputPath: string;
  downloadedAt?: string;
  taskId?: string;
  generatedAt?: string;
}

interface WriteWorkshopMetadataInput extends WriteWorkshopNfoInput {
  settings: SettingsSnapshot;
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

function shouldWriteSidecar(path: string, preserveExistingSidecars: boolean) {
  return !preserveExistingSidecars || !existsSync(path);
}

function writeFileSidecar(path: string, content: string, preserveExistingSidecars: boolean) {
  if (!shouldWriteSidecar(path, preserveExistingSidecars)) {
    return false;
  }

  writeFileSync(path, content, 'utf8');
  return true;
}

function copySidecar(sourcePath: string, targetPath: string, preserveExistingSidecars: boolean) {
  if (!existsSync(sourcePath) || !shouldWriteSidecar(targetPath, preserveExistingSidecars)) {
    return false;
  }

  copyFileSync(sourcePath, targetPath);
  return true;
}

function isPlayableVideoFile(path: string) {
  return VIDEO_FILE_EXTENSIONS.includes(extname(path).toLowerCase());
}

export function listPlayableVideoFiles(outputPath: string) {
  const resolvedOutputPath = resolve(outputPath);
  if (!existsSync(resolvedOutputPath)) {
    return [];
  }

  const rootStats = statSync(resolvedOutputPath);
  if (!rootStats.isDirectory()) {
    return isPlayableVideoFile(resolvedOutputPath) ? [resolvedOutputPath] : [];
  }

  const playableFiles: string[] = [];
  const stack = [resolvedOutputPath];

  while (stack.length) {
    const currentPath = stack.pop();
    if (!currentPath) {
      continue;
    }

    const children = readdirSync(currentPath, { withFileTypes: true });
    children.forEach((entry) => {
      const childPath = resolve(currentPath, entry.name);
      if (entry.isDirectory()) {
        stack.push(childPath);
        return;
      }

      if (entry.isFile() && isPlayableVideoFile(childPath)) {
        playableFiles.push(relative(resolvedOutputPath, childPath) || childPath);
      }
    });
  }

  return playableFiles.sort((left, right) => left.localeCompare(right));
}

export function inspectContentLibraryHealth(outputPath: string): ContentLibraryHealth {
  const resolvedOutputPath = resolve(outputPath);
  const pathExists = existsSync(resolvedOutputPath);
  const playableFileCount = pathExists ? listPlayableVideoFiles(resolvedOutputPath).length : 0;
  const workshopNfoExists = existsSync(resolve(resolvedOutputPath, WORKSHOP_NFO_FILENAME));
  const movieNfoExists = existsSync(resolve(resolvedOutputPath, JELLYFIN_MOVIE_NFO_FILENAME));
  const posterExists = existsSync(resolve(resolvedOutputPath, JELLYFIN_POSTER_FILENAME));
  const folderExists = existsSync(resolve(resolvedOutputPath, JELLYFIN_FOLDER_FILENAME));
  const jellyfinSidecarsStatus = playableFileCount === 0
    ? 'not_applicable'
    : movieNfoExists && posterExists && folderExists
      ? 'ready'
      : 'missing';

  return {
    pathExists,
    playableFileCount,
    workshopNfoExists,
    jellyfinSidecarsStatus,
    jellyfinSidecars: {
      movieNfoExists,
      posterExists,
      folderExists,
    },
  };
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

export function writeWorkshopMetadata(input: WriteWorkshopMetadataInput) {
  mkdirSync(input.outputPath, { recursive: true });
  writeWorkshopNfo(input);

  const { mediaLibrary } = input.settings;
  if (!mediaLibrary.jellyfinSidecars) {
    return inspectContentLibraryHealth(input.outputPath);
  }

  const playableFiles = listPlayableVideoFiles(input.outputPath);
  if (mediaLibrary.videoOnlySidecars && playableFiles.length === 0) {
    return inspectContentLibraryHealth(input.outputPath);
  }

  const preserveExistingSidecars = mediaLibrary.preserveExistingSidecars;
  writeFileSidecar(
    resolve(input.outputPath, JELLYFIN_MOVIE_NFO_FILENAME),
    createWorkshopNfo(input),
    preserveExistingSidecars,
  );

  const previewPath = resolve(input.outputPath, LOCAL_PREVIEW_FILENAME);
  copySidecar(previewPath, resolve(input.outputPath, JELLYFIN_POSTER_FILENAME), preserveExistingSidecars);
  copySidecar(previewPath, resolve(input.outputPath, JELLYFIN_FOLDER_FILENAME), preserveExistingSidecars);

  return inspectContentLibraryHealth(input.outputPath);
}
