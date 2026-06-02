import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import type { WorkshopItemSummary } from '../../../../packages/shared/src';
import { listPlayableVideoFiles } from './nfo-writer';
import { normalizeWorkshopMetadata } from './workshop-item-metadata';

interface SteamWorkshopProjectJson {
  title?: unknown;
  description?: unknown;
  tags?: unknown;
  type?: unknown;
  contentrating?: unknown;
}

export interface IdentifiedSteamWorkshopFolder {
  item: WorkshopItemSummary;
  outputPath: string;
  discoveredAt: string;
}

export interface SteamWorkshopFolderIdentificationResult {
  workshopContentDir: string;
  scannedCount: number;
  folders: IdentifiedSteamWorkshopFolder[];
  errors: Array<{
    id: string;
    path: string;
    message: string;
  }>;
}

function toStringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function toStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => toStringValue(entry))
    .filter(Boolean);
}

function uniqueValues(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const normalized = value.trim();
    const lookup = normalized.toLowerCase();
    if (!normalized || seen.has(lookup)) {
      return false;
    }

    seen.add(lookup);
    return true;
  });
}

function normalizeProjectType(value: string, hasPlayableVideo: boolean) {
  switch (value.toLowerCase()) {
    case 'video':
      return 'Video';
    case 'scene':
      return 'Scene';
    case 'application':
      return 'Application';
    case 'web':
      return 'Web';
    default:
      return hasPlayableVideo ? 'Video' : '';
  }
}

function readProjectJson(path: string) {
  const projectJsonPath = resolve(path, 'project.json');
  if (!existsSync(projectJsonPath)) {
    return {};
  }

  return JSON.parse(readFileSync(projectJsonPath, 'utf8')) as SteamWorkshopProjectJson;
}

function identifyFolder(workshopItemId: string, outputPath: string): IdentifiedSteamWorkshopFolder {
  const project = readProjectJson(outputPath);
  const hasPlayableVideo = listPlayableVideoFiles(outputPath).length > 0;
  const type = normalizeProjectType(toStringValue(project.type), hasPlayableVideo);
  const ageRating = toStringValue(project.contentrating);
  const tags = uniqueValues([
    ...toStringArray(project.tags),
    type,
    'Wallpaper',
    ageRating,
  ]);
  const directoryStats = statSync(outputPath);
  const item: WorkshopItemSummary = {
    id: workshopItemId,
    title: toStringValue(project.title) || `Steam Workshop ${workshopItemId}`,
    author: 'Steam Workshop',
    previewUrl: '',
    rating: 0,
    tags,
    description: toStringValue(project.description) || '本地 project.json 未提供描述。',
    source: 'featured',
    metadata: normalizeWorkshopMetadata(undefined, tags),
  };

  return {
    item,
    outputPath,
    discoveredAt: directoryStats.mtime.toISOString(),
  };
}

export function identifySteamWorkshopFolders(workshopContentDir: string): SteamWorkshopFolderIdentificationResult {
  const resolvedWorkshopContentDir = resolve(workshopContentDir);

  if (!existsSync(resolvedWorkshopContentDir)) {
    return {
      workshopContentDir: resolvedWorkshopContentDir,
      scannedCount: 0,
      folders: [],
      errors: [{
        id: '',
        path: resolvedWorkshopContentDir,
        message: 'Steam workshop content directory does not exist.',
      }],
    };
  }

  const entries = readdirSync(resolvedWorkshopContentDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name))
    .sort((left, right) => left.name.localeCompare(right.name));
  const folders: IdentifiedSteamWorkshopFolder[] = [];
  const errors: SteamWorkshopFolderIdentificationResult['errors'] = [];

  entries.forEach((entry) => {
    const outputPath = resolve(resolvedWorkshopContentDir, entry.name);

    try {
      folders.push(identifyFolder(entry.name, outputPath));
    } catch (error) {
      errors.push({
        id: entry.name,
        path: outputPath,
        message: error instanceof Error ? error.message : 'Unknown Steam workshop folder identification error',
      });
    }
  });

  return {
    workshopContentDir: resolvedWorkshopContentDir,
    scannedCount: entries.length,
    folders,
    errors,
  };
}
