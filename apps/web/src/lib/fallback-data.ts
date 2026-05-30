import type { DownloadTask, DownloadedContentItem, SettingsSnapshot, WorkshopItemMetadata, WorkshopItemSummary } from '../../../../packages/shared/src';

function createMetadata(patch: Partial<WorkshopItemMetadata> = {}): WorkshopItemMetadata {
  return {
    miscellaneous: [],
    genre: [],
    ageRating: '',
    type: '',
    resolution: '',
    category: '',
    assetType: '',
    assetGenre: '',
    scriptType: '',
    ...patch,
  };
}

export const fallbackFeaturedItems: WorkshopItemSummary[] = [];

export const fallbackTasks: DownloadTask[] = [];

export const fallbackDownloadedContents: DownloadedContentItem[] = [
  {
    id: '3648823629',
    title: 'Neon Drift Corridor',
    author: 'Aural Frame',
    previewUrl: 'https://images.steamusercontent.com/neon-drift.jpg',
    rating: 4.8,
    tags: ['Cyberpunk', 'Scene', 'Wallpaper', 'Ultrawide 3440 x 1440', 'Approved', 'Audio responsive'],
    description: 'High-contrast tunnel visuals tuned for ultrawide idle displays and ambient NAS dashboards.',
    source: 'featured',
    metadata: createMetadata({
      miscellaneous: ['Approved', 'Audio responsive'],
      genre: ['Cyberpunk'],
      type: 'Scene',
      resolution: 'Ultrawide 3440 x 1440',
      category: 'Wallpaper',
    }),
    outputPath: '/data/downloads/431960/3648823629',
    downloadedAt: '2026-05-29T08:30:00.000Z',
    entryCount: 17,
    fileCount: 9,
    totalBytes: 158472913,
    lastTaskId: 'task-3648823629',
  },
];

export const fallbackSettings: SettingsSnapshot = {
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
