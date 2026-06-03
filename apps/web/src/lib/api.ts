import type {
  ContentLibraryDeleteResponse,
  ContentLibraryFileDeleteResponse,
  ContentLibraryFilesResponse,
  ContentLibraryFileMoveResponse,
  ContentLibraryIdentifySteamResponse,
  ContentLibraryRescanResponse,
  CreateTaskResponse,
  DownloadedContentsResponse,
  RetryTaskResponse,
  SettingsResponse,
  SettingsSnapshot,
  SteamLoginRequest,
  SteamLoginStateResponse,
  SteamCmdLogsResponse,
  TasksResponse,
  WorkshopBrowseFilters,
  WorkshopItemSummary,
  WorkshopItemsResponse,
} from '../../../../packages/shared/src';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? '';

export function buildApiUrl(path: string) {
  return `${apiBaseUrl}${path}`;
}

export class ApiError extends Error {
  readonly status: number;
  readonly detail: string;
  readonly path: string;

  constructor(path: string, status: number, detail: string) {
    super(detail ? `${detail} (HTTP ${status})` : `Request failed: ${status}`);
    this.name = 'ApiError';
    this.path = path;
    this.status = status;
    this.detail = detail;
  }
}

async function readErrorDetail(response: Response) {
  const contentType = response.headers.get('Content-Type') ?? '';

  if (contentType.includes('application/json')) {
    try {
      const payload = await response.json() as { error?: string; message?: string };
      return payload.error || payload.message || '';
    } catch {
      return '';
    }
  }

  try {
    return (await response.text()).trim();
  } catch {
    return '';
  }
}

async function readJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(buildApiUrl(path), init);
  if (!response.ok) {
    throw new ApiError(path, response.status, await readErrorDetail(response));
  }

  return response.json() as Promise<T>;
}

export function formatApiError(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    return error.detail ? `${fallback} ${error.detail}` : `${fallback} HTTP ${error.status}`;
  }

  if (error instanceof Error) {
    return error.message ? `${fallback} ${error.message}` : fallback;
  }

  return fallback;
}

export async function fetchWorkshopItems(filters: WorkshopBrowseFilters) {
  const search = new URLSearchParams();
  if (filters.query.trim()) search.set('q', filters.query.trim());
  if (filters.sort) search.set('sort', filters.sort);
  if (filters.period) search.set('period', filters.period);
  filters.miscellaneous.forEach((value) => search.append('miscellaneous', value));
  filters.genre.forEach((value) => search.append('genre', value));
  if (filters.ageRating) search.set('ageRating', filters.ageRating);
  if (filters.type) search.set('type', filters.type);
  if (filters.resolution) search.set('resolution', filters.resolution);
  if (filters.category) search.set('category', filters.category);
  if (filters.assetType) search.set('assetType', filters.assetType);
  if (filters.assetGenre) search.set('assetGenre', filters.assetGenre);
  if (filters.scriptType) search.set('scriptType', filters.scriptType);

  const suffix = search.size ? `?${search.toString()}` : '';
  return readJson<WorkshopItemsResponse>(`/api/workshop/items${suffix}`);
}

export function fetchTasks() {
  return readJson<TasksResponse>('/api/tasks');
}

export function fetchDownloadedContents(options: { page?: number; pageSize?: number; query?: string } = {}) {
  const search = new URLSearchParams();
  if (options.page) search.set('page', String(options.page));
  if (options.pageSize) search.set('pageSize', String(options.pageSize));
  if (options.query?.trim()) search.set('q', options.query.trim());
  const suffix = search.size ? `?${search.toString()}` : '';
  return readJson<DownloadedContentsResponse>(`/api/library${suffix}`);
}

export function fetchTaskLogs(taskId: string, after = 0) {
  const search = new URLSearchParams();
  if (after > 0) search.set('after', String(after));
  const suffix = search.size ? `?${search.toString()}` : '';
  return readJson<SteamCmdLogsResponse>(`/api/tasks/${encodeURIComponent(taskId)}/logs${suffix}`);
}

export function createTaskLogStreamUrl(taskId: string, after = 0) {
  const search = new URLSearchParams();
  if (after > 0) search.set('after', String(after));
  const suffix = search.size ? `?${search.toString()}` : '';
  return buildApiUrl(`/api/tasks/${encodeURIComponent(taskId)}/logs/stream${suffix}`);
}

export function fetchSteamLoginLogs(after = 0) {
  const search = new URLSearchParams();
  if (after > 0) search.set('after', String(after));
  const suffix = search.size ? `?${search.toString()}` : '';
  return readJson<SteamCmdLogsResponse>(`/api/steam/login/logs${suffix}`);
}

export function createSteamLoginLogStreamUrl(after = 0) {
  const search = new URLSearchParams();
  if (after > 0) search.set('after', String(after));
  const suffix = search.size ? `?${search.toString()}` : '';
  return buildApiUrl(`/api/steam/login/logs/stream${suffix}`);
}

export function fetchContentFiles(workshopItemId: string, options: { path?: string; page?: number; pageSize?: number } = {}) {
  const search = new URLSearchParams();
  if (options.path) search.set('path', options.path);
  if (options.page) search.set('page', String(options.page));
  if (options.pageSize) search.set('pageSize', String(options.pageSize));
  const suffix = search.size ? `?${search.toString()}` : '';
  return readJson<ContentLibraryFilesResponse>(`/api/library/${encodeURIComponent(workshopItemId)}/files${suffix}`);
}

export function deleteContentFiles(workshopItemId: string, paths: string[]) {
  return readJson<ContentLibraryFileDeleteResponse>(`/api/library/${encodeURIComponent(workshopItemId)}/files/delete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ paths }),
  });
}

export function moveContentFiles(workshopItemId: string, paths: string[], targetPath: string) {
  return readJson<ContentLibraryFileMoveResponse>(`/api/library/${encodeURIComponent(workshopItemId)}/files/move`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ paths, targetPath }),
  });
}

export function fetchSettings() {
  return readJson<SettingsResponse>('/api/settings');
}

export function updateSettings(settings: Partial<SettingsSnapshot>) {
  return readJson<SettingsResponse>('/api/settings', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(settings),
  });
}

export function fetchSteamLoginState() {
  return readJson<SteamLoginStateResponse>('/api/steam/login-state');
}

export function triggerSteamLogin(payload: SteamLoginRequest) {
  return readJson<SteamLoginStateResponse>('/api/steam/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

export function createTask(item: WorkshopItemSummary) {
  return readJson<CreateTaskResponse>('/api/tasks', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      itemId: item.id,
      itemTitle: item.title,
      author: item.author,
      previewUrl: item.previewUrl,
      rating: item.rating,
      tags: item.tags,
      description: item.description,
      source: item.source,
      metadata: item.metadata,
    }),
  });
}

export function retryTask(taskId: string) {
  return readJson<RetryTaskResponse>(`/api/tasks/${taskId}/retry`, {
    method: 'POST',
  });
}

export function deleteTask(taskId: string) {
  return readJson<{ ok: boolean }>(`/api/tasks/${taskId}`, {
    method: 'DELETE',
  });
}

export function clearTaskHistory() {
  return readJson<{ ok: boolean; deletedCount: number }>('/api/tasks/history', {
    method: 'DELETE',
  });
}

export function deleteDownloadedContent(workshopItemId: string, deleteFiles = false) {
  const suffix = deleteFiles ? '?deleteFiles=true' : '';
  return readJson<ContentLibraryDeleteResponse>(`/api/library/${workshopItemId}${suffix}`, {
    method: 'DELETE',
  });
}

export function rescanDownloadedContents() {
  return readJson<ContentLibraryRescanResponse>('/api/library/rescan', {
    method: 'POST',
  });
}

export function identifySteamWorkshopContents() {
  return readJson<ContentLibraryIdentifySteamResponse>('/api/library/identify-steam', {
    method: 'POST',
  });
}
