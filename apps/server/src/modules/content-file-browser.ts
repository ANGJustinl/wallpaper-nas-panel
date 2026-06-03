import { existsSync, lstatSync, realpathSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { basename, extname, relative, resolve, sep } from 'node:path';
import type { ContentLibraryFileEntry } from '../../../../packages/shared/src';
import { JELLYFIN_FOLDER_FILENAME, JELLYFIN_MOVIE_NFO_FILENAME, JELLYFIN_POSTER_FILENAME, VIDEO_FILE_EXTENSIONS, WORKSHOP_NFO_FILENAME } from './nfo-writer';

interface BrowseContentFilesInput {
  rootPath: string;
  relativePath?: string;
  page?: number;
  pageSize?: number;
}

const metadataSidecarNames = new Set([
  WORKSHOP_NFO_FILENAME,
  JELLYFIN_MOVIE_NFO_FILENAME,
  JELLYFIN_POSTER_FILENAME,
  JELLYFIN_FOLDER_FILENAME,
  'preview.jpg',
  'project.json',
]);

function normalizeRelativePath(input = '') {
  const normalized = input.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
  const parts = normalized.split('/').filter(Boolean);

  if (input.startsWith('/') || parts.some((part) => part === '..' || part === '.')) {
    throw new Error('Unsafe file browser path.');
  }

  return parts.join('/');
}

function isInsideRoot(rootRealPath: string, candidateRealPath: string) {
  return candidateRealPath === rootRealPath || candidateRealPath.startsWith(`${rootRealPath}${sep}`);
}

function resolveSafePath(rootPath: string, requestedRelativePath = '') {
  const rootRealPath = realpathSync(resolve(rootPath));
  const relativePath = normalizeRelativePath(requestedRelativePath);
  const targetPath = relativePath ? resolve(rootRealPath, relativePath) : rootRealPath;
  const targetRealPath = realpathSync(targetPath);

  if (!isInsideRoot(rootRealPath, targetRealPath)) {
    throw new Error('File browser path escapes content root.');
  }

  return { rootRealPath, relativePath, targetPath, targetRealPath };
}

function resolveSafeExistingEntry(rootPath: string, requestedRelativePath: string) {
  const resolvedEntry = resolveSafePath(rootPath, requestedRelativePath);

  if (!resolvedEntry.relativePath) {
    throw new Error('File operation path is required.');
  }

  return resolvedEntry;
}

function resolveSafeDirectory(rootPath: string, requestedRelativePath = '') {
  const resolvedDirectory = resolveSafePath(rootPath, requestedRelativePath);
  const directoryStats = statSync(resolvedDirectory.targetRealPath);

  if (!directoryStats.isDirectory()) {
    throw new Error('Target path is not a directory.');
  }

  return resolvedDirectory;
}

function uniqueRelativePaths(paths: string[]) {
  const seen = new Set<string>();
  return paths.map((path) => normalizeRelativePath(path)).filter((path) => {
    if (!path || seen.has(path)) {
      return false;
    }

    seen.add(path);
    return true;
  });
}

function toRelativePath(rootRealPath: string, absolutePath: string) {
  return relative(rootRealPath, absolutePath).split(sep).join('/');
}

function createEntry(rootRealPath: string, absolutePath: string, name: string): ContentLibraryFileEntry | null {
  const linkStats = lstatSync(absolutePath);
  const realPath = realpathSync(absolutePath);

  if (!isInsideRoot(rootRealPath, realPath)) {
    return null;
  }

  const stats = statSync(absolutePath);
  const extension = extname(name).toLowerCase();
  const type = stats.isDirectory() ? 'directory' : stats.isFile() ? 'file' : 'other';

  return {
    name,
    type,
    relativePath: toRelativePath(rootRealPath, absolutePath),
    absolutePath,
    size: stats.isDirectory() ? 0 : stats.size,
    modifiedAt: stats.mtime.toISOString(),
    extension,
    isPlayableVideo: stats.isFile() && VIDEO_FILE_EXTENSIONS.includes(extension),
    isMetadataSidecar: linkStats.isFile() || linkStats.isSymbolicLink()
      ? metadataSidecarNames.has(name.toLowerCase()) || extension === '.nfo'
      : false,
  };
}

export function browseContentFiles(input: BrowseContentFilesInput) {
  const pageSize = Math.max(1, Math.min(200, Math.floor(input.pageSize ?? 100)));
  const requestedPage = Math.max(1, Math.floor(input.page ?? 1));
  const { rootRealPath, relativePath, targetRealPath } = resolveSafePath(input.rootPath, input.relativePath);
  const targetStats = statSync(targetRealPath);

  if (!targetStats.isDirectory()) {
    throw new Error('File browser path is not a directory.');
  }

  const entries = readdirSync(targetRealPath)
    .map((name) => createEntry(rootRealPath, resolve(targetRealPath, name), name))
    .filter((entry): entry is ContentLibraryFileEntry => Boolean(entry))
    .sort((left, right) => {
      if (left.type !== right.type) {
        return left.type === 'directory' ? -1 : right.type === 'directory' ? 1 : left.type.localeCompare(right.type);
      }

      return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' });
    });
  const total = entries.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const offset = (page - 1) * pageSize;
  const parentPath = relativePath.includes('/')
    ? relativePath.split('/').slice(0, -1).join('/')
    : relativePath
      ? ''
      : null;

  return {
    path: relativePath,
    parentPath,
    page,
    pageSize,
    total,
    totalPages,
    entries: entries.slice(offset, offset + pageSize),
  };
}

export function deleteContentFileEntries(input: { rootPath: string; paths: string[] }) {
  const targets = uniqueRelativePaths(input.paths).map((path) => resolveSafeExistingEntry(input.rootPath, path));

  targets.forEach((target) => {
    rmSync(target.targetPath, { recursive: true });
  });

  return {
    ok: true,
    deletedCount: targets.length,
    paths: targets.map((target) => target.relativePath),
  };
}

export function moveContentFileEntries(input: { rootPath: string; paths: string[]; targetPath?: string }) {
  const targetDirectory = resolveSafeDirectory(input.rootPath, input.targetPath);
  const sources = uniqueRelativePaths(input.paths).map((path) => {
    const source = resolveSafeExistingEntry(input.rootPath, path);
    const destinationPath = resolve(targetDirectory.targetRealPath, basename(source.targetPath));

    if (!isInsideRoot(source.rootRealPath, destinationPath)) {
      throw new Error('File move destination escapes content root.');
    }

    if (source.targetRealPath === destinationPath) {
      throw new Error('File is already in the target directory.');
    }

    if (statSync(source.targetRealPath).isDirectory() && targetDirectory.targetRealPath.startsWith(`${source.targetRealPath}${sep}`)) {
      throw new Error('Cannot move a directory into itself.');
    }

    if (existsSync(destinationPath)) {
      throw new Error(`Destination already exists: ${toRelativePath(source.rootRealPath, destinationPath)}`);
    }

    return {
      source,
      destinationPath,
      destinationRelativePath: toRelativePath(source.rootRealPath, destinationPath),
    };
  });

  sources.forEach(({ source, destinationPath }) => {
    renameSync(source.targetPath, destinationPath);
  });

  return {
    ok: true,
    movedCount: sources.length,
    moved: sources.map(({ source, destinationRelativePath }) => ({
      from: source.relativePath,
      to: destinationRelativePath,
    })),
  };
}
