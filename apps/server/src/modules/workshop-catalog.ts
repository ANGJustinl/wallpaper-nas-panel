import type { WorkshopItemSummary } from '../../../../packages/shared/src';
import { normalizeWorkshopMetadata } from './workshop-item-metadata';

export const featuredWorkshopItems: WorkshopItemSummary[] = [
  {
    id: '3648823629',
    title: 'Neon Drift Corridor',
    author: 'Aural Frame',
    previewUrl: 'https://images.steamusercontent.com/neon-drift.jpg',
    rating: 4.8,
    tags: ['Cyberpunk', 'Scene', 'Wallpaper', 'Ultrawide 3440 x 1440', 'Approved', 'Audio responsive'],
    description: 'High-contrast tunnel visuals tuned for ultrawide idle displays and ambient NAS dashboards.',
    source: 'featured',
    metadata: normalizeWorkshopMetadata(undefined, ['Cyberpunk', 'Scene', 'Wallpaper', 'Ultrawide 3440 x 1440', 'Approved', 'Audio responsive']),
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
    metadata: normalizeWorkshopMetadata(undefined, ['Nature', 'Scene', 'Wallpaper', '1920 x 1080', 'Everyone', 'Relaxing']),
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
    metadata: normalizeWorkshopMetadata(undefined, ['Abstract', 'Sci-Fi', 'Scene', 'Wallpaper', '3840 x 2160', 'Customizable']),
  },
];
