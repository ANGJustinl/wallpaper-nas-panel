import type { WorkshopItemMetadata } from '../../../../packages/shared/src';

export const supportedWorkshopTags = {
  miscellaneous: ['Approved', 'Audio responsive', '3D', 'Customizable', 'Puppet Warp', 'HDR', 'Media Integration', 'User Shortcut', 'Video Texture', 'Asset Pack'],
  genre: ['Abstract', 'Animal', 'Anime', 'Cartoon', 'CGI', 'Cyberpunk', 'Fantasy', 'Game', 'Girls', 'Guys', 'Landscape', 'Medieval', 'Memes', 'MMD', 'Music', 'Nature', 'Pixel art', 'Relaxing', 'Retro', 'Sci-Fi', 'Sports', 'Technology', 'Television', 'Vehicle', 'Unspecified'],
  ageRating: ['Everyone', 'Questionable', 'Mature'],
  type: ['Scene', 'Video', 'Application', 'Web'],
  resolution: ['Dynamic resolution', '1920 x 1080', '2560 x 1440', '3840 x 2160', 'Ultrawide 3440 x 1440', 'Portrait 1080 x 1920'],
  category: ['Wallpaper', 'Preset', 'Asset'],
  assetType: ['Particle', 'Image', 'Sound', 'Model', 'Text', 'Sprite', 'Fullscreen', 'Composite', 'Script', 'Effect', 'Scripted Layer'],
  assetGenre: ['Audio Visualizer', 'Background', 'Character', 'Clock', 'Fire', 'Interactive', 'Magic', 'Post Processing', 'Smoke', 'Space'],
  scriptType: ['Boolean', 'Number', 'Vec2', 'Vec3', 'Vec4', 'String', 'No Animation', 'Oversized'],
} as const;

export function createEmptyWorkshopMetadata(): WorkshopItemMetadata {
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
  };
}

function normalizeSingleValue(value: string, allowedValues: readonly string[]) {
  return allowedValues.includes(value) ? value : '';
}

function normalizeMultiValues(values: string[], allowedValues: readonly string[]) {
  return values.filter((value, index) => allowedValues.includes(value) && values.indexOf(value) === index);
}

function collectMatchedValues(tags: string[], allowedValues: readonly string[]) {
  const normalizedLookup = new Map(tags.map((tag) => [tag.trim().toLowerCase(), tag.trim()]));
  return allowedValues.filter((value) => normalizedLookup.has(value.toLowerCase()));
}

function collectMatchedSingleValue(tags: string[], allowedValues: readonly string[]) {
  return collectMatchedValues(tags, allowedValues)[0] ?? '';
}

export function deriveWorkshopMetadataFromTags(tags: string[]): WorkshopItemMetadata {
  return {
    miscellaneous: collectMatchedValues(tags, supportedWorkshopTags.miscellaneous),
    genre: collectMatchedValues(tags, supportedWorkshopTags.genre),
    ageRating: collectMatchedSingleValue(tags, supportedWorkshopTags.ageRating),
    type: collectMatchedSingleValue(tags, supportedWorkshopTags.type),
    resolution: collectMatchedSingleValue(tags, supportedWorkshopTags.resolution),
    category: collectMatchedSingleValue(tags, supportedWorkshopTags.category),
    assetType: collectMatchedSingleValue(tags, supportedWorkshopTags.assetType),
    assetGenre: collectMatchedSingleValue(tags, supportedWorkshopTags.assetGenre),
    scriptType: collectMatchedSingleValue(tags, supportedWorkshopTags.scriptType),
  };
}

export function normalizeWorkshopMetadata(input?: Partial<WorkshopItemMetadata>, tags: string[] = []): WorkshopItemMetadata {
  const derived = deriveWorkshopMetadataFromTags(tags);

  return {
    miscellaneous: normalizeMultiValues(input?.miscellaneous ?? derived.miscellaneous, supportedWorkshopTags.miscellaneous),
    genre: normalizeMultiValues(input?.genre ?? derived.genre, supportedWorkshopTags.genre),
    ageRating: normalizeSingleValue(input?.ageRating ?? derived.ageRating, supportedWorkshopTags.ageRating),
    type: normalizeSingleValue(input?.type ?? derived.type, supportedWorkshopTags.type),
    resolution: normalizeSingleValue(input?.resolution ?? derived.resolution, supportedWorkshopTags.resolution),
    category: normalizeSingleValue(input?.category ?? derived.category, supportedWorkshopTags.category),
    assetType: normalizeSingleValue(input?.assetType ?? derived.assetType, supportedWorkshopTags.assetType),
    assetGenre: normalizeSingleValue(input?.assetGenre ?? derived.assetGenre, supportedWorkshopTags.assetGenre),
    scriptType: normalizeSingleValue(input?.scriptType ?? derived.scriptType, supportedWorkshopTags.scriptType),
  };
}
