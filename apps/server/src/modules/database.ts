import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import Database from 'better-sqlite3';

const defaultDatabasePath = resolve(process.cwd(), 'data', 'panel.sqlite');
const emptyMetadataJson = JSON.stringify({
  miscellaneous: [],
  genre: [],
  ageRating: '',
  type: '',
  resolution: '',
  category: '',
  assetType: '',
  assetGenre: '',
  scriptType: '',
});

export function getDatabasePath() {
  return process.env.PANEL_DB_PATH ? resolve(process.env.PANEL_DB_PATH) : defaultDatabasePath;
}

export function createDatabase() {
  const filePath = getDatabasePath();
  mkdirSync(dirname(filePath), { recursive: true });
  const database = new Database(filePath);
  database.pragma('journal_mode = WAL');
  return database;
}

export function migrateDatabase(database: Database.Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      workshop_item_id TEXT NOT NULL,
      workshop_title TEXT NOT NULL,
      author TEXT NOT NULL DEFAULT '',
      preview_url TEXT NOT NULL DEFAULT '',
      rating REAL NOT NULL DEFAULT 0,
      tags_json TEXT NOT NULL DEFAULT '[]',
      description TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT 'featured',
      metadata_json TEXT NOT NULL DEFAULT '${emptyMetadataJson.replace(/'/g, "''")}',
      status TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      claimed_at TEXT,
      started_at TEXT,
      finished_at TEXT,
      runner_id TEXT,
      log_excerpt TEXT NOT NULL,
      failure_code TEXT,
      output_path TEXT,
      error_message TEXT
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS steam_login_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      status TEXT NOT NULL,
      steam_account_name TEXT NOT NULL,
      last_attempt_at TEXT,
      last_success_at TEXT,
      error_message TEXT
    );

    CREATE TABLE IF NOT EXISTS downloader_worker_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      status TEXT NOT NULL,
      runner_id TEXT,
      started_at TEXT,
      heartbeat_at TEXT,
      active_task_id TEXT,
      active_task_title TEXT,
      last_error TEXT
    );

    CREATE TABLE IF NOT EXISTS downloaded_contents (
      workshop_item_id TEXT PRIMARY KEY,
      workshop_title TEXT NOT NULL,
      author TEXT NOT NULL,
      preview_url TEXT NOT NULL,
      rating REAL NOT NULL DEFAULT 0,
      tags_json TEXT NOT NULL DEFAULT '[]',
      description TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT 'featured',
      metadata_json TEXT NOT NULL DEFAULT '${emptyMetadataJson.replace(/'/g, "''")}',
      output_path TEXT NOT NULL,
      downloaded_at TEXT NOT NULL,
      entry_count INTEGER NOT NULL DEFAULT 0,
      file_count INTEGER NOT NULL DEFAULT 0,
      total_bytes INTEGER NOT NULL DEFAULT 0,
      last_task_id TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS steamcmd_log_events (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      scope TEXT NOT NULL,
      task_id TEXT,
      workshop_item_id TEXT,
      source TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_steamcmd_log_task_sequence
      ON steamcmd_log_events(task_id, sequence);

    CREATE INDEX IF NOT EXISTS idx_steamcmd_log_scope_sequence
      ON steamcmd_log_events(scope, sequence);
  `);

  ensureTaskColumn(database, 'author', `TEXT NOT NULL DEFAULT ''`);
  ensureTaskColumn(database, 'preview_url', `TEXT NOT NULL DEFAULT ''`);
  ensureTaskColumn(database, 'rating', 'REAL NOT NULL DEFAULT 0');
  ensureTaskColumn(database, 'tags_json', `TEXT NOT NULL DEFAULT '[]'`);
  ensureTaskColumn(database, 'description', `TEXT NOT NULL DEFAULT ''`);
  ensureTaskColumn(database, 'source', `TEXT NOT NULL DEFAULT 'featured'`);
  ensureTaskColumn(database, 'metadata_json', `TEXT NOT NULL DEFAULT '${emptyMetadataJson.replace(/'/g, "''")}'`);
  ensureTaskColumn(database, 'attempts', 'INTEGER NOT NULL DEFAULT 0');
  ensureTaskColumn(database, 'claimed_at', 'TEXT');
  ensureTaskColumn(database, 'started_at', 'TEXT');
  ensureTaskColumn(database, 'finished_at', 'TEXT');
  ensureTaskColumn(database, 'runner_id', 'TEXT');
  ensureTaskColumn(database, 'failure_code', 'TEXT');
}

function ensureTaskColumn(database: Database.Database, columnName: string, definition: string) {
  const columns = database.prepare(`PRAGMA table_info(tasks)`).all() as Array<{ name: string }>;
  const hasColumn = columns.some((column) => column.name === columnName);

  if (!hasColumn) {
    database.exec(`ALTER TABLE tasks ADD COLUMN ${columnName} ${definition}`);
  }
}
