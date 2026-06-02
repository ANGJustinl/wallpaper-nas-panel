import type {
  ContentLibraryDeleteResponse,
  ContentLibraryIdentifySteamResponse,
  ContentLibraryRescanResponse,
  CreateTaskResponse,
  DownloadedContentsResponse,
  RetryTaskResponse,
  SettingsResponse,
  SettingsSnapshot,
  SteamLoginRequest,
  SteamLoginStateResponse,
  TasksResponse,
  WorkshopBrowseFilters,
  WorkshopItemSummary,
  WorkshopItemsResponse,
} from '../../../../packages/shared/src';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? '';

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
  const response = await fetch(`${apiBaseUrl}${path}`, init);
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

export function fetchDownloadedContents() {
  return readJson<DownloadedContentsResponse>('/api/library');
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
