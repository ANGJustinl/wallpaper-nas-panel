import type { SteamLoginState } from '../../../../packages/shared/src';
import type Database from 'better-sqlite3';

const defaultLoginState: SteamLoginState = {
  status: 'idle',
  steamAccountName: 'anonymous',
};

function sanitizeErrorMessage(errorMessage: string | null) {
  if (!errorMessage) {
    return undefined;
  }

  const normalizedLines = errorMessage
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^(unknown_error:\s*)?"@(?:ShutdownOnFailedCommand|NoPromptForPassword)"\s*=\s*"[^"]*"$/i.test(line));

  if (!normalizedLines.length) {
    return 'unknown_error: 上次错误消息不可用，请重新登录以刷新诊断信息。';
  }

  return normalizedLines.join('\n');
}

export class SteamLoginStore {
  constructor(private readonly database: Database.Database) {}

  seedDefaults(steamAccountName: string) {
    this.database.prepare(
      `
        INSERT OR IGNORE INTO steam_login_state (
          id,
          status,
          steam_account_name,
          last_attempt_at,
          last_success_at,
          error_message
        ) VALUES (1, @status, @steamAccountName, NULL, NULL, NULL)
      `,
    ).run({
      status: defaultLoginState.status,
      steamAccountName,
    });
  }

  getState(): SteamLoginState {
    const row = this.database
      .prepare(
        `
          SELECT status, steam_account_name, last_attempt_at, last_success_at, error_message
          FROM steam_login_state
          WHERE id = 1
        `,
      )
      .get() as
      | {
          status: SteamLoginState['status'];
          steam_account_name: string;
          last_attempt_at: string | null;
          last_success_at: string | null;
          error_message: string | null;
        }
      | undefined;

    if (!row) {
      return defaultLoginState;
    }

    return {
      status: row.status,
      steamAccountName: row.steam_account_name,
      lastAttemptAt: row.last_attempt_at ?? undefined,
      lastSuccessAt: row.last_success_at ?? undefined,
      errorMessage: sanitizeErrorMessage(row.error_message),
    };
  }

  updateState(patch: Partial<SteamLoginState>) {
    const current = this.getState();
    const next: SteamLoginState = {
      ...current,
      ...patch,
      steamAccountName: patch.steamAccountName ?? current.steamAccountName,
      status: patch.status ?? current.status,
      lastAttemptAt: patch.lastAttemptAt ?? current.lastAttemptAt,
      lastSuccessAt: patch.lastSuccessAt ?? current.lastSuccessAt,
      errorMessage: patch.errorMessage ?? current.errorMessage,
    };

    this.database.prepare(
      `
        INSERT INTO steam_login_state (
          id,
          status,
          steam_account_name,
          last_attempt_at,
          last_success_at,
          error_message
        ) VALUES (
          1,
          @status,
          @steamAccountName,
          @lastAttemptAt,
          @lastSuccessAt,
          @errorMessage
        )
        ON CONFLICT(id) DO UPDATE SET
          status = excluded.status,
          steam_account_name = excluded.steam_account_name,
          last_attempt_at = excluded.last_attempt_at,
          last_success_at = excluded.last_success_at,
          error_message = excluded.error_message
      `,
    ).run({
      status: next.status,
      steamAccountName: next.steamAccountName,
      lastAttemptAt: next.lastAttemptAt ?? null,
      lastSuccessAt: next.lastSuccessAt ?? null,
      errorMessage: next.errorMessage ?? null,
    });

    return next;
  }
}
