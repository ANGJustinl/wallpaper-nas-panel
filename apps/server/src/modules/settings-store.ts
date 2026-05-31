import type { SettingsSnapshot } from '../../../../packages/shared/src';
import type Database from 'better-sqlite3';

function readBoolean(value: string | undefined, fallback: boolean) {
  if (value === undefined) {
    return fallback;
  }

  return value === '1' || value.toLowerCase() === 'true';
}

function readNumber(value: string | undefined, fallback: number) {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const settingsDefaults: SettingsSnapshot = {
  steamAccountName: process.env.PANEL_DEFAULT_STEAM_ACCOUNT ?? 'nas-panel-operator',
  downloadRoot: process.env.PANEL_DEFAULT_DOWNLOAD_ROOT ?? '/data/downloads/431960',
  metadataLanguage: process.env.PANEL_DEFAULT_METADATA_LANGUAGE ?? 'en-US',
  requestIntervalMs: readNumber(process.env.PANEL_DEFAULT_REQUEST_INTERVAL_MS, 1250),
  autoGenerateNfo: readBoolean(process.env.PANEL_DEFAULT_AUTO_GENERATE_NFO, true),
  mediaLibrary: {
    jellyfinSidecars: readBoolean(process.env.PANEL_DEFAULT_JELLYFIN_SIDECARS, true),
    videoOnlySidecars: readBoolean(process.env.PANEL_DEFAULT_VIDEO_ONLY_SIDECARS, true),
    preserveExistingSidecars: readBoolean(process.env.PANEL_DEFAULT_PRESERVE_EXISTING_SIDECARS, true),
  },
  contentLibrary: {
    deleteFilesDefault: readBoolean(process.env.PANEL_DEFAULT_DELETE_FILES, false),
  },
  proxy: {
    enabled: readBoolean(process.env.PANEL_DEFAULT_PROXY_ENABLED, true),
    url: process.env.PANEL_DEFAULT_PROXY_URL ?? 'http://127.0.0.1:7890',
  },
};

const settingKeys: Array<keyof SettingsSnapshot> = [
  'steamAccountName',
  'downloadRoot',
  'metadataLanguage',
  'requestIntervalMs',
  'autoGenerateNfo',
  'mediaLibrary',
  'contentLibrary',
  'proxy',
];

function parseSetting<T>(rowMap: Map<string, string>, key: string, fallback: T) {
  try {
    return JSON.parse(rowMap.get(key) ?? JSON.stringify(fallback)) as T;
  } catch {
    return fallback;
  }
}

export class SettingsStore {
  constructor(private readonly database: Database.Database) {}

  seedDefaults() {
    const insert = this.database.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`);

    for (const key of settingKeys) {
      insert.run(key, JSON.stringify(settingsDefaults[key]));
    }
  }

  getSnapshot(): SettingsSnapshot {
    const rows = this.database.prepare(`SELECT key, value FROM settings`).all() as Array<{ key: string; value: string }>;
    const rowMap = new Map(rows.map((row) => [row.key, row.value]));
    const mediaLibrary = parseSetting(rowMap, 'mediaLibrary', settingsDefaults.mediaLibrary);
    const contentLibrary = parseSetting(rowMap, 'contentLibrary', settingsDefaults.contentLibrary);
    const proxy = parseSetting(rowMap, 'proxy', settingsDefaults.proxy);

    return {
      steamAccountName: parseSetting(rowMap, 'steamAccountName', settingsDefaults.steamAccountName),
      downloadRoot: parseSetting(rowMap, 'downloadRoot', settingsDefaults.downloadRoot),
      metadataLanguage: parseSetting(rowMap, 'metadataLanguage', settingsDefaults.metadataLanguage),
      requestIntervalMs: parseSetting(rowMap, 'requestIntervalMs', settingsDefaults.requestIntervalMs),
      autoGenerateNfo: parseSetting(rowMap, 'autoGenerateNfo', settingsDefaults.autoGenerateNfo),
      mediaLibrary: {
        ...settingsDefaults.mediaLibrary,
        ...mediaLibrary,
      },
      contentLibrary: {
        ...settingsDefaults.contentLibrary,
        ...contentLibrary,
      },
      proxy: {
        ...settingsDefaults.proxy,
        ...proxy,
      },
    };
  }

  updateSnapshot(snapshot: SettingsSnapshot) {
    const upsert = this.database.prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`);

    for (const key of settingKeys) {
      upsert.run(key, JSON.stringify(snapshot[key]));
    }

    return snapshot;
  }
}
