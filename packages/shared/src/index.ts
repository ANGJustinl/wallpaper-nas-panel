export type DownloadTaskStatus = 'pending' | 'running' | 'succeeded' | 'failed';

export type DownloadTaskFailureCode =
  | 'runtime_blocked'
  | 'authentication_failed'
  | 'download_failed'
  | 'interrupted'
  | 'unknown_error';

export interface DownloadTask {
  id: string;
  workshopItemId: string;
  workshopTitle: string;
  status: DownloadTaskStatus;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  claimedAt?: string;
  startedAt?: string;
  finishedAt?: string;
  runnerId?: string;
  logExcerpt: string;
  failureCode?: DownloadTaskFailureCode;
  outputPath?: string;
  errorMessage?: string;
}

export interface SettingsSnapshot {
  steamAccountName: string;
  downloadRoot: string;
  metadataLanguage: string;
  requestIntervalMs: number;
  autoGenerateNfo: boolean;
  mediaLibrary: {
    jellyfinSidecars: boolean;
    videoOnlySidecars: boolean;
    preserveExistingSidecars: boolean;
  };
  contentLibrary: {
    deleteFilesDefault: boolean;
  };
  proxy: {
    enabled: boolean;
    url: string;
  };
}

export interface DownloaderWorkerSnapshot {
  online: boolean;
  status: 'offline' | 'idle' | 'processing';
  runnerId?: string;
  startedAt?: string;
  heartbeatAt?: string;
  activeTaskId?: string;
  activeTaskTitle?: string;
  lastError?: string;
}

export interface DownloaderRuntimeSnapshot {
  available: boolean;
  steamCmdScriptPath: string;
  appId: string;
  workshopContentDir: string;
  availabilityError?: string;
  worker: DownloaderWorkerSnapshot;
}

export interface WorkshopItemMetadata extends WorkshopTagFilters {}

export interface WorkshopItemSummary {
  id: string;
  title: string;
  author: string;
  previewUrl: string;
  rating: number;
  tags: string[];
  description: string;
  source: 'featured' | 'search';
  metadata: WorkshopItemMetadata;
}

export interface DownloadedContentItem extends WorkshopItemSummary {
  outputPath: string;
  downloadedAt: string;
  entryCount: number;
  fileCount: number;
  totalBytes: number;
  lastTaskId: string;
  libraryHealth: ContentLibraryHealth;
}

export interface ContentLibraryHealth {
  pathExists: boolean;
  playableFileCount: number;
  workshopNfoExists: boolean;
  jellyfinSidecarsStatus: 'ready' | 'missing' | 'not_applicable';
  jellyfinSidecars: {
    movieNfoExists: boolean;
    posterExists: boolean;
    folderExists: boolean;
  };
}

export interface WorkshopTagFilters {
  miscellaneous: string[];
  genre: string[];
  ageRating: string;
  type: string;
  resolution: string;
  category: string;
  assetType: string;
  assetGenre: string;
  scriptType: string;
}

export interface WorkshopBrowseFilters extends WorkshopTagFilters {
  query: string;
  sort: 'trend' | 'vote' | 'updated' | 'new' | 'relevance' | string;
  period: '7d' | '30d' | '90d' | '180d' | '365d' | 'all' | string;
}

export interface WorkshopItemsResponse {
  items: WorkshopItemSummary[];
  total: number;
  query: string;
  sort: string;
  period: string;
  filters: WorkshopTagFilters;
}

export interface TasksResponse {
  tasks: DownloadTask[];
  worker: DownloaderWorkerSnapshot;
}

export interface DownloadedContentsResponse {
  items: DownloadedContentItem[];
}

export interface ContentLibraryDeleteResponse {
  ok: boolean;
  deletedFiles: boolean;
  outputPath?: string;
}

export interface ContentLibraryRescanResponse {
  ok: boolean;
  updatedCount: number;
  items: DownloadedContentItem[];
  errors: Array<{
    id: string;
    title: string;
    message: string;
  }>;
}

export interface ContentLibraryIdentifySteamResponse {
  ok: boolean;
  workshopContentDir: string;
  scannedCount: number;
  importedCount: number;
  detailsFetchedCount?: number;
  detailsMissingCount?: number;
  detailLookupError?: string;
  items: DownloadedContentItem[];
  errors: Array<{
    id: string;
    path: string;
    message: string;
  }>;
}

export interface CreateTaskResponse {
  task: DownloadTask;
}

export interface RetryTaskResponse {
  task: DownloadTask;
}

export interface SettingsResponse {
  settings: SettingsSnapshot;
  runtime: DownloaderRuntimeSnapshot;
}

export interface SteamLoginRequest {
  steamAccountName: string;
  steamPassword: string;
  steamGuardCode?: string;
}

export interface SteamLoginState {
  status: 'idle' | 'logging_in' | 'authenticated' | 'failed';
  steamAccountName: string;
  lastAttemptAt?: string;
  lastSuccessAt?: string;
  errorMessage?: string;
}

export interface SteamLoginStateResponse {
  state: SteamLoginState;
}
