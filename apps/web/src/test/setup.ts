import '@testing-library/jest-dom/vitest';

type MockFailureRoute =
  | 'workshop'
  | 'tasks'
  | 'library'
  | 'settings'
  | 'createTask'
  | 'retryTask'
  | 'deleteTask'
  | 'deleteDownloadedContent'
  | 'rescanDownloadedContents'
  | 'identifySteamWorkshopContents'
  | 'clearTaskHistory'
  | 'steamLoginState'
  | 'steamLogin';

const mockApiState = {
  failures: new Set<MockFailureRoute>(),
  deletedLibraryIds: new Set<string>(),
  deletedFilePaths: new Set<string>(),
  movedFilePaths: new Map<string, string>(),
  steamPathIdentified: false,
};

Object.assign(globalThis, {
  __panelMockApi: {
    failRoute(route: MockFailureRoute) {
      mockApiState.failures.add(route);
    },
    reset() {
      mockApiState.failures.clear();
      mockApiState.deletedLibraryIds.clear();
      mockApiState.deletedFilePaths.clear();
      mockApiState.movedFilePaths.clear();
      mockApiState.steamPathIdentified = false;
    },
  },
});

Object.defineProperty(navigator, 'clipboard', {
  configurable: true,
  value: {
    writeText: vi.fn(async () => undefined),
  },
});

class MockEventSource {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;
  readonly url: string;
  readyState = MockEventSource.OPEN;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  private readonly listeners = new Map<string, Array<(event: Event) => void>>();

  constructor(url: string) {
    this.url = url;
    window.setTimeout(() => {
      this.onopen?.(new Event('open'));
      this.listeners.get('open')?.forEach((listener) => listener(new Event('open')));
    }, 0);
  }

  addEventListener(type: string, listener: (event: Event) => void) {
    const current = this.listeners.get(type) ?? [];
    current.push(listener);
    this.listeners.set(type, current);
  }

  removeEventListener(type: string, listener: (event: Event) => void) {
    this.listeners.set(type, (this.listeners.get(type) ?? []).filter((entry) => entry !== listener));
  }

  close() {
    this.readyState = MockEventSource.CLOSED;
  }
}

Object.assign(globalThis, { EventSource: MockEventSource });

const defaultItems = [
  {
    id: '3648823629',
    title: 'Neon Drift Corridor',
    author: 'Aural Frame',
    previewUrl: 'https://images.steamusercontent.com/neon-drift.jpg',
    rating: 4.8,
    tags: ['Cyberpunk', 'Scene', 'Wallpaper', 'Ultrawide 3440 x 1440', 'Approved', 'Audio responsive'],
    description: 'High-contrast tunnel visuals tuned for ultrawide idle displays and ambient NAS dashboards.',
    source: 'featured',
    metadata: {
      miscellaneous: ['Approved', 'Audio responsive'],
      genre: ['Cyberpunk'],
      ageRating: '',
      type: 'Scene',
      resolution: 'Ultrawide 3440 x 1440',
      category: 'Wallpaper',
      assetType: '',
      assetGenre: '',
      scriptType: '',
    },
  },
  {
    id: '3688886669',
    title: 'Paper Koi Garden',
    author: 'Moss Pattern',
    previewUrl: 'https://images.steamusercontent.com/paper-koi.jpg',
    rating: 4.4,
    tags: ['Nature', 'Scene', 'Wallpaper', '1920 x 1080', 'Everyone', 'Relaxing'],
    description: 'Layered paper textures with slow koi motion for a quieter secondary screen atmosphere.',
    source: 'featured',
    metadata: {
      miscellaneous: [],
      genre: ['Nature'],
      ageRating: 'Everyone',
      type: 'Scene',
      resolution: '1920 x 1080',
      category: 'Wallpaper',
      assetType: '',
      assetGenre: '',
      scriptType: '',
    },
  },
  {
    id: '3691746167',
    title: 'Signal Bloom Array',
    author: 'Vector Habit',
    previewUrl: 'https://images.steamusercontent.com/signal-bloom.jpg',
    rating: 4.9,
    tags: ['Abstract', 'Sci-Fi', 'Scene', 'Wallpaper', '3840 x 2160', 'Customizable'],
    description: 'Reactive bloom lattice inspired by instrument clusters and broadcast calibration walls.',
    source: 'featured',
    metadata: {
      miscellaneous: ['Customizable'],
      genre: ['Abstract', 'Sci-Fi'],
      ageRating: '',
      type: 'Scene',
      resolution: '3840 x 2160',
      category: 'Wallpaper',
      assetType: '',
      assetGenre: '',
      scriptType: '',
    },
  },
];

const defaultLibrary = [
  {
    id: '3648823629',
    title: 'Neon Drift Corridor',
    author: 'Aural Frame',
    previewUrl: 'https://images.steamusercontent.com/neon-drift.jpg',
    rating: 4.8,
    tags: ['Cyberpunk', 'Scene', 'Wallpaper', 'Ultrawide 3440 x 1440', 'Approved', 'Audio responsive'],
    description: 'High-contrast tunnel visuals tuned for ultrawide idle displays and ambient NAS dashboards.',
    source: 'featured',
    metadata: {
      miscellaneous: ['Approved', 'Audio responsive'],
      genre: ['Cyberpunk'],
      ageRating: '',
      type: 'Scene',
      resolution: 'Ultrawide 3440 x 1440',
      category: 'Wallpaper',
      assetType: '',
      assetGenre: '',
      scriptType: '',
    },
    outputPath: '/data/downloads/431960/3648823629',
    downloadedAt: '2026-05-29T08:30:00.000Z',
    entryCount: 17,
    fileCount: 9,
    totalBytes: 158472913,
    lastTaskId: 'task-3648823629',
    libraryHealth: {
      pathExists: true,
      playableFileCount: 1,
      workshopNfoExists: true,
      jellyfinSidecarsStatus: 'ready',
      jellyfinSidecars: {
        movieNfoExists: true,
        posterExists: true,
        folderExists: true,
      },
    },
  },
];

const defaultTasks = [
  {
    id: 'task-001',
    workshopItemId: '3691746167',
    workshopTitle: 'Signal Bloom Array',
    status: 'running',
    attempts: 1,
    createdAt: '2026-05-28T09:12:00.000Z',
    updatedAt: '2026-05-28T09:14:00.000Z',
    claimedAt: '2026-05-28T09:12:20.000Z',
    startedAt: '2026-05-28T09:12:20.000Z',
    runnerId: 'test-runner',
    logExcerpt: 'steamcmd authenticated, download in progress, waiting for project.json',
  },
  {
    id: 'task-002',
    workshopItemId: '3648823629',
    workshopTitle: 'Neon Drift Corridor',
    status: 'failed',
    attempts: 2,
    createdAt: '2026-05-28T08:10:00.000Z',
    updatedAt: '2026-05-28T08:17:00.000Z',
    claimedAt: '2026-05-28T08:12:00.000Z',
    startedAt: '2026-05-28T08:12:00.000Z',
    finishedAt: '2026-05-28T08:17:00.000Z',
    runnerId: 'test-runner',
    failureCode: 'download_failed',
    errorMessage: 'ERROR! Download item 3648823629 failed (Timeout).',
    logExcerpt: 'Downloading item 3648823629 ...\u001b[0m',
  },
];

const defaultSettings = {
  steamAccountName: 'nas-panel-operator',
  downloadRoot: '/data/downloads/431960',
  metadataLanguage: 'en-US',
  requestIntervalMs: 1250,
  autoGenerateNfo: true,
  mediaLibrary: {
    jellyfinSidecars: true,
    videoOnlySidecars: true,
    preserveExistingSidecars: true,
  },
  contentLibrary: {
    deleteFilesDefault: false,
  },
  proxy: {
    enabled: true,
    url: 'http://127.0.0.1:7890',
  },
};

const defaultRuntime = {
  available: false,
  steamCmdScriptPath: 'C:/steamcmd/steamcmd.sh',
  appId: '431960',
  workshopContentDir: '/data/downloads/431960',
  availabilityError: 'steamcmd script not found at C:/steamcmd/steamcmd.sh',
  worker: {
    online: true,
    status: 'processing',
    runnerId: 'test-runner',
    startedAt: '2026-05-28T09:12:00.000Z',
    heartbeatAt: '2026-05-28T09:14:00.000Z',
    activeTaskId: 'task-001',
    activeTaskTitle: 'Signal Bloom Array',
  },
};

const defaultLoginState = {
  status: 'idle',
  steamAccountName: 'anonymous',
};

const defaultTaskLogs = {
  events: [
    {
      sequence: 1,
      scope: 'download',
      source: 'system',
      message: '任务已被 worker 接管，等待 steamcmd 输出。',
      createdAt: '2026-05-28T09:12:20.000Z',
      taskId: 'task-001',
      workshopItemId: '3691746167',
    },
    {
      sequence: 2,
      scope: 'download',
      source: 'stdout',
      message: 'Downloading item 3691746167 ...',
      createdAt: '2026-05-28T09:12:21.000Z',
      taskId: 'task-001',
      workshopItemId: '3691746167',
    },
  ],
  nextSequence: 2,
};

const defaultLoginLogs = {
  events: [
    {
      sequence: 3,
      scope: 'login',
      source: 'system',
      message: '开始登录 Steam 账号：anonymous',
      createdAt: '2026-05-28T09:10:00.000Z',
    },
  ],
  nextSequence: 3,
};

const defaultFiles = {
  id: '3648823629',
  path: '',
  parentPath: null,
  page: 1,
  pageSize: 100,
  total: 3,
  totalPages: 1,
  entries: [
    {
      name: 'assets',
      type: 'directory',
      relativePath: 'assets',
      absolutePath: '/data/downloads/431960/3648823629/assets',
      size: 0,
      modifiedAt: '2026-05-29T08:30:00.000Z',
      extension: '',
      isPlayableVideo: false,
      isMetadataSidecar: false,
    },
    {
      name: 'loop.mp4',
      type: 'file',
      relativePath: 'loop.mp4',
      absolutePath: '/data/downloads/431960/3648823629/loop.mp4',
      size: 1200000,
      modifiedAt: '2026-05-29T08:31:00.000Z',
      extension: '.mp4',
      isPlayableVideo: true,
      isMetadataSidecar: false,
    },
    {
      name: 'movie.nfo',
      type: 'file',
      relativePath: 'movie.nfo',
      absolutePath: '/data/downloads/431960/3648823629/movie.nfo',
      size: 1024,
      modifiedAt: '2026-05-29T08:32:00.000Z',
      extension: '.nfo',
      isPlayableVideo: false,
      isMetadataSidecar: true,
    },
  ],
};

function readBody(init?: RequestInit) {
  return JSON.parse(String(init?.body ?? '{}')) as { paths?: string[]; targetPath?: string };
}

function currentFileEntries(path: string) {
  return defaultFiles.entries
    .map((entry) => {
      const movedPath = mockApiState.movedFilePaths.get(entry.relativePath);
      return movedPath ? { ...entry, relativePath: movedPath, name: movedPath.split('/').pop() ?? entry.name } : entry;
    })
    .filter((entry) => !mockApiState.deletedFilePaths.has(entry.relativePath))
    .filter((entry) => {
      if (!path) {
        return !entry.relativePath.includes('/');
      }

      return entry.relativePath.startsWith(`${path}/`) && !entry.relativePath.slice(path.length + 1).includes('/');
    });
}

globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);

  if (url.includes('/api/workshop/items') && mockApiState.failures.has('workshop')) {
    return new Response(JSON.stringify({ error: 'workshop backend unavailable' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  }

  if (url.includes('/api/workshop/items')) {
    const parsed = new URL(url, 'http://localhost');
    const query = parsed.searchParams.get('q')?.toLowerCase() ?? '';
    const category = parsed.searchParams.get('category') ?? '';
    const sort = parsed.searchParams.get('sort') ?? 'trend';
    const period = parsed.searchParams.get('period') ?? '30d';
    const miscellaneous = parsed.searchParams.getAll('miscellaneous');
    const genre = parsed.searchParams.getAll('genre');
    const items = query
      ? defaultItems.filter((item) => [item.title, item.author, item.description, ...item.tags].join(' ').toLowerCase().includes(query))
      : defaultItems;
    return new Response(JSON.stringify({
      items,
      total: items.length,
      query,
      sort,
      period,
      filters: {
        miscellaneous,
        genre,
        ageRating: parsed.searchParams.get('ageRating') ?? '',
        type: parsed.searchParams.get('type') ?? '',
        resolution: parsed.searchParams.get('resolution') ?? '',
        category,
        assetType: parsed.searchParams.get('assetType') ?? '',
        assetGenre: parsed.searchParams.get('assetGenre') ?? '',
        scriptType: parsed.searchParams.get('scriptType') ?? '',
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  if (url.includes('/api/tasks/') && url.includes('/retry') && init?.method === 'POST' && mockApiState.failures.has('retryTask')) {
    return new Response(JSON.stringify({ error: 'retry request rejected' }), { status: 502, headers: { 'Content-Type': 'application/json' } });
  }

  if (url.includes('/api/tasks/') && url.includes('/logs')) {
    return new Response(JSON.stringify(defaultTaskLogs), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  if (url.includes('/api/library/') && init?.method === 'DELETE' && mockApiState.failures.has('deleteDownloadedContent')) {
    return new Response(JSON.stringify({ error: 'library delete rejected' }), { status: 502, headers: { 'Content-Type': 'application/json' } });
  }

  if (url.includes('/api/library/') && url.includes('/files/delete') && init?.method === 'POST') {
    const body = readBody(init);
    (body.paths ?? []).forEach((path) => mockApiState.deletedFilePaths.add(path));
    return new Response(JSON.stringify({ ok: true, deletedCount: body.paths?.length ?? 0, paths: body.paths ?? [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  if (url.includes('/api/library/') && url.includes('/files/move') && init?.method === 'POST') {
    const body = readBody(init);
    const moved = (body.paths ?? []).map((path) => {
      const to = body.targetPath ? `${body.targetPath}/${path.split('/').pop() ?? path}` : path.split('/').pop() ?? path;
      mockApiState.movedFilePaths.set(path, to);
      return { from: path, to };
    });
    return new Response(JSON.stringify({ ok: true, movedCount: moved.length, moved }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  if (url.includes('/api/library/') && url.includes('/files')) {
    const parsed = new URL(url, 'http://localhost');
    const path = parsed.searchParams.get('path') ?? '';
    const entries = currentFileEntries(path);

    return new Response(JSON.stringify({
      ...defaultFiles,
      path,
      parentPath: path ? '' : null,
      total: entries.length,
      entries,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  if (url.includes('/api/library/') && init?.method === 'DELETE') {
    const contentId = url.split('/api/library/')[1]?.split('?')[0]?.split('/')[0] ?? '';
    mockApiState.deletedLibraryIds.add(decodeURIComponent(contentId));
    return new Response(JSON.stringify({ ok: true, deletedFiles: url.includes('deleteFiles=true') }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  if (url.includes('/api/library/rescan') && init?.method === 'POST' && mockApiState.failures.has('rescanDownloadedContents')) {
    return new Response(JSON.stringify({ error: 'rescan rejected' }), { status: 502, headers: { 'Content-Type': 'application/json' } });
  }

  if (url.includes('/api/library/rescan') && init?.method === 'POST') {
    return new Response(JSON.stringify({ ok: true, updatedCount: defaultLibrary.length, items: defaultLibrary, errors: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  if (url.includes('/api/library/identify-steam') && init?.method === 'POST' && mockApiState.failures.has('identifySteamWorkshopContents')) {
    return new Response(JSON.stringify({ error: 'steam folder scan rejected' }), { status: 502, headers: { 'Content-Type': 'application/json' } });
  }

  if (url.includes('/api/library/identify-steam') && init?.method === 'POST') {
    mockApiState.steamPathIdentified = true;
    return new Response(JSON.stringify({
      ok: true,
      workshopContentDir: '/home/steam/Steam/steamapps/workshop/content/431960',
      scannedCount: defaultLibrary.length,
      importedCount: defaultLibrary.length,
      items: defaultLibrary.map((item) => ({
        ...item,
        outputPath: `/home/steam/Steam/steamapps/workshop/content/431960/${item.id}`,
      })),
      errors: [],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  if (url.includes('/api/library') && mockApiState.failures.has('library')) {
    return new Response(JSON.stringify({ error: 'library backend unavailable' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  }

  if (url.includes('/api/library')) {
    const parsed = new URL(url, 'http://localhost');
    const page = Number(parsed.searchParams.get('page') ?? 1);
    const pageSize = Number(parsed.searchParams.get('pageSize') ?? 50);
    const query = parsed.searchParams.get('q')?.toLowerCase() ?? '';
    const visibleLibrary = defaultLibrary
      .filter((item) => !mockApiState.deletedLibraryIds.has(item.id))
      .map((item) => mockApiState.steamPathIdentified
        ? { ...item, outputPath: `/home/steam/Steam/steamapps/workshop/content/431960/${item.id}` }
        : item);
    const items = query
      ? visibleLibrary.filter((item) => [item.id, item.title, item.author].join(' ').toLowerCase().includes(query))
      : visibleLibrary;
    return new Response(JSON.stringify({ items, page, pageSize, total: items.length, totalPages: 1 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  if (url.includes('/api/tasks/history') && init?.method === 'DELETE' && mockApiState.failures.has('clearTaskHistory')) {
    return new Response(JSON.stringify({ error: 'history clear rejected' }), { status: 502, headers: { 'Content-Type': 'application/json' } });
  }

  if (url.includes('/api/tasks/history') && init?.method === 'DELETE') {
    return new Response(JSON.stringify({ ok: true, deletedCount: 1 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  if (/\/api\/tasks\/[^/]+$/.test(url) && init?.method === 'DELETE' && mockApiState.failures.has('deleteTask')) {
    return new Response(JSON.stringify({ error: 'delete request rejected' }), { status: 502, headers: { 'Content-Type': 'application/json' } });
  }

  if (/\/api\/tasks\/[^/]+$/.test(url) && init?.method === 'DELETE') {
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  if (url.includes('/api/tasks/') && url.includes('/retry') && init?.method === 'POST') {
    const taskId = url.split('/api/tasks/')[1]?.replace('/retry', '') ?? 'task-001';
    return new Response(JSON.stringify({
      task: {
        id: taskId,
        workshopItemId: '3691746167',
        workshopTitle: 'Signal Bloom Array',
        status: 'pending',
        attempts: 2,
        createdAt: '2026-05-28T09:12:00.000Z',
        updatedAt: '2026-05-29T00:00:00.000Z',
        logExcerpt: '已重新加入下载队列，等待 steamcmd worker 执行。',
      },
    }), { status: 202, headers: { 'Content-Type': 'application/json' } });
  }

  if (url.includes('/api/tasks') && init?.method === 'POST' && mockApiState.failures.has('createTask')) {
    return new Response(JSON.stringify({ error: 'queue service offline' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  }

  if (url.includes('/api/tasks') && init?.method === 'POST') {
    const payload = JSON.parse(String(init.body ?? '{}'));
    return new Response(JSON.stringify({
      task: {
        id: `task-${payload.itemId}`,
        workshopItemId: payload.itemId,
        workshopTitle: payload.itemTitle,
        status: 'pending',
        attempts: 0,
        createdAt: '2026-05-29T00:00:00.000Z',
        updatedAt: '2026-05-29T00:00:00.000Z',
        logExcerpt: '已加入下载队列，等待 steamcmd 执行。',
      },
    }), { status: 201, headers: { 'Content-Type': 'application/json' } });
  }

  if (url.includes('/api/tasks') && mockApiState.failures.has('tasks')) {
    return new Response(JSON.stringify({ error: 'task sync unavailable' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  }

  if (url.includes('/api/tasks')) {
    return new Response(JSON.stringify({ tasks: defaultTasks, worker: defaultRuntime.worker }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  if (url.includes('/api/settings') && init?.method === 'PATCH' && mockApiState.failures.has('settings')) {
    return new Response(JSON.stringify({ error: 'settings save failed' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  if (url.includes('/api/settings') && init?.method === 'PATCH') {
    const payload = JSON.parse(String(init.body ?? '{}'));
    const nextSettings = {
      ...defaultSettings,
      ...payload,
      mediaLibrary: { ...defaultSettings.mediaLibrary, ...payload.mediaLibrary },
      contentLibrary: { ...defaultSettings.contentLibrary, ...payload.contentLibrary },
      proxy: { ...defaultSettings.proxy, ...payload.proxy },
    };
    return new Response(JSON.stringify({ settings: nextSettings, runtime: defaultRuntime }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  if (url.includes('/api/settings') && mockApiState.failures.has('settings')) {
    return new Response(JSON.stringify({ error: 'settings backend unavailable' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  }

  if (url.includes('/api/settings')) {
    return new Response(JSON.stringify({ settings: defaultSettings, runtime: defaultRuntime }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  if (url.includes('/api/steam/login-state') && mockApiState.failures.has('steamLoginState')) {
    return new Response(JSON.stringify({ error: 'steam login state unavailable' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  }

  if (url.includes('/api/steam/login-state')) {
    return new Response(JSON.stringify({ state: defaultLoginState }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  if (url.includes('/api/steam/login/logs')) {
    return new Response(JSON.stringify(defaultLoginLogs), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  if (url.includes('/api/steam/login') && mockApiState.failures.has('steamLogin')) {
    return new Response(JSON.stringify({ error: 'steam login failed' }), { status: 502, headers: { 'Content-Type': 'application/json' } });
  }

  if (url.includes('/api/steam/login')) {
    return new Response(JSON.stringify({ state: { ...defaultLoginState, status: 'authenticated', steamAccountName: 'demo-user' } }), { status: 202, headers: { 'Content-Type': 'application/json' } });
  }

  return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
}) as typeof fetch;
