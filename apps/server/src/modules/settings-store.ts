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
  proxy: {
    enabled: readBoolean(process.env.PANEL_DEFAULT_PROXY_ENABLED, true),
    url: process.env.PANEL_DEFAULT_PROXY_URL ?? 'http://10.100.1.4:7890',
  },
};

const settingKeys: Array<keyof SettingsSnapshot> = [
  'steamAccountName',
  'downloadRoot',
  'metadataLanguage',
  'requestIntervalMs',
  'autoGenerateNfo',
  'proxy',
];

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

    return {
      steamAccountName: JSON.parse(rowMap.get('steamAccountName') ?? JSON.stringify(settingsDefaults.steamAccountName)) as string,
      downloadRoot: JSON.parse(rowMap.get('downloadRoot') ?? JSON.stringify(settingsDefaults.downloadRoot)) as string,
      metadataLanguage: JSON.parse(rowMap.get('metadataLanguage') ?? JSON.stringify(settingsDefaults.metadataLanguage)) as string,
      requestIntervalMs: JSON.parse(rowMap.get('requestIntervalMs') ?? JSON.stringify(settingsDefaults.requestIntervalMs)) as number,
      autoGenerateNfo: JSON.parse(rowMap.get('autoGenerateNfo') ?? JSON.stringify(settingsDefaults.autoGenerateNfo)) as boolean,
      proxy: JSON.parse(rowMap.get('proxy') ?? JSON.stringify(settingsDefaults.proxy)) as SettingsSnapshot['proxy'],
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
