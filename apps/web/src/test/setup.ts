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
  | 'clearTaskHistory'
  | 'steamLoginState'
  | 'steamLogin';

const mockApiState = {
  failures: new Set<MockFailureRoute>(),
};

Object.assign(globalThis, {
  __panelMockApi: {
    failRoute(route: MockFailureRoute) {
      mockApiState.failures.add(route);
    },
    reset() {
      mockApiState.failures.clear();
    },
  },
});

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
  proxy: {
    enabled: true,
    url: 'http://10.100.1.4:7890',
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

  if (url.includes('/api/library/') && init?.method === 'DELETE' && mockApiState.failures.has('deleteDownloadedContent')) {
    return new Response(JSON.stringify({ error: 'library delete rejected' }), { status: 502, headers: { 'Content-Type': 'application/json' } });
  }

  if (url.includes('/api/library/') && init?.method === 'DELETE') {
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  if (url.includes('/api/library') && mockApiState.failures.has('library')) {
    return new Response(JSON.stringify({ error: 'library backend unavailable' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  }

  if (url.includes('/api/library')) {
    return new Response(JSON.stringify({ items: defaultLibrary }), { status: 200, headers: { 'Content-Type': 'application/json' } });
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
    const nextSettings = { ...defaultSettings, ...payload, proxy: { ...defaultSettings.proxy, ...payload.proxy } };
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

  if (url.includes('/api/steam/login') && mockApiState.failures.has('steamLogin')) {
    return new Response(JSON.stringify({ error: 'steam login failed' }), { status: 502, headers: { 'Content-Type': 'application/json' } });
  }

  if (url.includes('/api/steam/login')) {
    return new Response(JSON.stringify({ state: { ...defaultLoginState, status: 'authenticated', steamAccountName: 'demo-user' } }), { status: 202, headers: { 'Content-Type': 'application/json' } });
  }

  return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
}) as typeof fetch;
