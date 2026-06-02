import { ProxyAgent, request } from 'undici';
import type { SettingsSnapshot, WorkshopBrowseFilters, WorkshopItemSummary, WorkshopTagFilters } from '../../../../packages/shared/src';
import { normalizeWorkshopMetadata, supportedWorkshopTags } from './workshop-item-metadata';

const workshopBrowseUrl = 'https://steamcommunity.com/workshop/browse/';
const workshopBrowseSection = 'readytouseitems';

interface WorkshopBrowseResultTag {
  tag?: string;
  display_name?: string;
}

interface WorkshopBrowseResult {
  publishedfileid?: string;
  creator?: string;
  preview_url?: string;
  title?: string;
  short_description?: string;
  tags?: WorkshopBrowseResultTag[];
  star_rating?: number;
}

interface WorkshopCreatorDetails {
  public_data?: {
    steamid?: string;
    persona_name?: string;
  };
}

interface WorkshopBrowseState {
  results?: WorkshopBrowseResult[];
  creator_player_link_details?: Record<string, WorkshopCreatorDetails> | WorkshopCreatorDetails[];
}

interface PublishedFileTag {
  tag?: string;
  display_name?: string;
}

interface PublishedFileDetails {
  publishedfileid?: string;
  result?: number;
  title?: string;
  description?: string;
  preview_url?: string;
  tags?: PublishedFileTag[];
}

interface PublishedFileDetailsPayload {
  response?: {
    publishedfiledetails?: PublishedFileDetails[];
  };
}

function mapSort(sort: string, hasQuery: boolean) {
  switch (sort) {
    case 'vote':
      return 'toprated';
    case 'updated':
      return 'lastupdated';
    case 'new':
      return 'mostrecent';
    case 'relevance':
      return hasQuery ? 'textsearch' : 'trend';
    default:
      return 'trend';
  }
}

function mapPeriod(period: string) {
  switch (period) {
    case '7d':
      return '7';
    case '90d':
      return '90';
    case '180d':
      return '180';
    case '365d':
      return '365';
    case 'all':
      return '-1';
    default:
      return '30';
  }
}

function normalizeSingleValue(value: string, allowedValues: readonly string[]) {
  return allowedValues.includes(value) ? value : '';
}

function normalizeMultiValues(values: string[], allowedValues: readonly string[]) {
  return values.filter((value, index) => allowedValues.includes(value) && values.indexOf(value) === index);
}

function collectRequiredTags(filters: WorkshopTagFilters) {
  const required = new Set<string>();

  normalizeMultiValues(filters.miscellaneous, supportedWorkshopTags.miscellaneous).forEach((value) => required.add(value));
  normalizeMultiValues(filters.genre, supportedWorkshopTags.genre).forEach((value) => required.add(value));

  const singleValueFilters = [
    normalizeSingleValue(filters.ageRating, supportedWorkshopTags.ageRating),
    normalizeSingleValue(filters.type, supportedWorkshopTags.type),
    normalizeSingleValue(filters.resolution, supportedWorkshopTags.resolution),
    normalizeSingleValue(filters.category, supportedWorkshopTags.category),
    normalizeSingleValue(filters.assetType, supportedWorkshopTags.assetType),
    normalizeSingleValue(filters.assetGenre, supportedWorkshopTags.assetGenre),
    normalizeSingleValue(filters.scriptType, supportedWorkshopTags.scriptType),
  ];

  singleValueFilters.forEach((value) => {
    if (value) {
      required.add(value);
    }
  });

  return [...required];
}

function extractRenderContextPayload(html: string) {
  const marker = 'window.SSR.renderContext=JSON.parse("';
  const start = html.indexOf(marker);

  if (start === -1) {
    throw new Error('steam workshop SSR payload marker was not found');
  }

  let cursor = start + marker.length;
  let escaped = false;

  for (; cursor < html.length; cursor += 1) {
    const character = html[cursor];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (character === '\\') {
      escaped = true;
      continue;
    }

    if (character === '"') {
      break;
    }
  }

  if (cursor >= html.length) {
    throw new Error('steam workshop SSR payload was truncated');
  }

  const encodedPayload = html.slice(start + marker.length, cursor);
  return JSON.parse(JSON.parse(`"${encodedPayload}"`)) as { queryData?: string };
}

function extractWorkshopBrowseState(html: string) {
  const renderContext = extractRenderContextPayload(html);

  if (!renderContext.queryData) {
    throw new Error('steam workshop query payload is missing');
  }

  const queryData = JSON.parse(renderContext.queryData) as {
    queries?: Array<{
      queryKey?: unknown[];
      state?: {
        data?: WorkshopBrowseState;
      };
    }>;
  };

  const workshopBrowseQuery = queryData.queries?.find((entry) => (
    Array.isArray(entry.queryKey)
    && entry.queryKey[0] === 'workshop_browse'
  ));

  if (!workshopBrowseQuery?.state?.data || !Array.isArray(workshopBrowseQuery.state.data.results)) {
    throw new Error('steam workshop browse results were not present in SSR payload');
  }

  return workshopBrowseQuery.state.data;
}

function createAuthorLookup(details: WorkshopBrowseState['creator_player_link_details']) {
  const lookup = new Map<string, string>();
  const items = Array.isArray(details) ? details : Object.values(details ?? {});

  items.forEach((entry) => {
    const steamId = entry?.public_data?.steamid?.trim();
    const personaName = entry?.public_data?.persona_name?.trim();

    if (steamId && personaName) {
      lookup.set(steamId, personaName);
    }
  });

  return lookup;
}

function normalizeDescription(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed || '暂无简介。';
}

function normalizeSteamDescription(value: string | undefined) {
  return (value ?? '')
    .replace(/\[url=([^\]]+)\]([\s\S]*?)\[\/url\]/gi, '$2 ($1)')
    .replace(/\[img\][\s\S]*?\[\/img\]/gi, '')
    .replace(/\[[^\]]+\]/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizeRating(value: number | undefined) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(5, Number(value)));
}

export async function fetchWorkshopItems(input: WorkshopBrowseFilters, settings: SettingsSnapshot): Promise<WorkshopItemSummary[]> {
  const requestOptions = {
    headers: {
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    },
    dispatcher: settings.proxy.enabled && settings.proxy.url ? new ProxyAgent(settings.proxy.url) : undefined,
  };

  const requiredTags = collectRequiredTags(input);
  const normalizedQuery = input.query.trim();
  const search = new URLSearchParams({
    appid: '431960',
    section: workshopBrowseSection,
    searchtext: normalizedQuery,
    browsesort: mapSort(input.sort, normalizedQuery.length > 0),
    days: mapPeriod(input.period),
  });
  requiredTags.forEach((tag) => search.append('requiredtags[]', tag));

  const response = await request(`${workshopBrowseUrl}?${search.toString()}`, requestOptions);
  if (response.statusCode >= 400) {
    throw new Error(`steam workshop browse request failed with status ${response.statusCode}`);
  }

  const html = await response.body.text();
  const browseState = extractWorkshopBrowseState(html);
  const authorLookup = createAuthorLookup(browseState.creator_player_link_details);
  const results: WorkshopItemSummary[] = [];
  const seen = new Set<string>();

  browseState.results?.forEach((entry) => {
    const id = entry.publishedfileid?.trim() ?? '';
    const title = entry.title?.trim() ?? '';

    if (!id || !title || seen.has(id)) {
      return;
    }

    seen.add(id);
    const tags = entry.tags?.map((tag) => tag.display_name || tag.tag || '').filter(Boolean) ?? [];
    results.push({
      id,
      title,
      author: authorLookup.get(entry.creator?.trim() ?? '') ?? '未知作者',
      previewUrl: entry.preview_url?.trim() ?? '',
      rating: normalizeRating(entry.star_rating),
      tags,
      description: normalizeDescription(entry.short_description),
      source: normalizedQuery ? 'search' : 'featured',
      metadata: normalizeWorkshopMetadata(undefined, tags),
    });
  });

  return results.slice(0, 30);
}

export async function fetchWorkshopItemDetails(ids: string[], settings: SettingsSnapshot): Promise<Map<string, WorkshopItemSummary>> {
  const uniqueIds = [...new Set(ids.map((id) => id.trim()).filter((id) => /^\d+$/.test(id)))];
  const requestOptions = {
    headers: {
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    dispatcher: settings.proxy.enabled && settings.proxy.url ? new ProxyAgent(settings.proxy.url) : undefined,
  };
  const details = new Map<string, WorkshopItemSummary>();

  for (let offset = 0; offset < uniqueIds.length; offset += 50) {
    const batch = uniqueIds.slice(offset, offset + 50);
    const body = new URLSearchParams({ itemcount: String(batch.length), format: 'json' });
    batch.forEach((id, index) => body.append(`publishedfileids[${index}]`, id));

    const response = await request('https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/', {
      ...requestOptions,
      method: 'POST',
      body: body.toString(),
    });
    if (response.statusCode >= 400) {
      throw new Error(`steam workshop details request failed with status ${response.statusCode}`);
    }

    const payload = JSON.parse(await response.body.text()) as PublishedFileDetailsPayload;
    payload.response?.publishedfiledetails?.forEach((entry) => {
      const id = entry.publishedfileid?.trim() ?? '';
      const title = entry.title?.trim() ?? '';
      if (!id || entry.result !== 1 || !title) {
        return;
      }

      const tags = entry.tags?.map((tag) => tag.display_name || tag.tag || '').filter(Boolean) ?? [];
      details.set(id, {
        id,
        title,
        author: 'Steam Workshop',
        previewUrl: entry.preview_url?.trim() ?? '',
        rating: 0,
        tags,
        description: normalizeSteamDescription(entry.description),
        source: 'search',
        metadata: normalizeWorkshopMetadata(undefined, tags),
      });
    });
  }

  return details;
}
