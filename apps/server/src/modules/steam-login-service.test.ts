import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import type { SettingsSnapshot } from '../../../../packages/shared/src';
import { migrateDatabase } from './database';
import { SettingsStore, settingsDefaults } from './settings-store';
import { SteamCmdAdapter } from './steamcmd-adapter';
import { SteamLoginService } from './steam-login-service';
import { SteamLoginStore } from './steam-login-store';
import { SteamCmdSocketLock } from './steamcmd-socket-lock';
import { SteamCmdLogStore } from './steamcmd-log-store';

function createStores() {
  const database = new Database(':memory:');
  migrateDatabase(database);
  const settingsStore = new SettingsStore(database);
  settingsStore.seedDefaults();
  const steamLoginStore = new SteamLoginStore(database);
  steamLoginStore.seedDefaults(settingsDefaults.steamAccountName);
  const steamCmdLogStore = new SteamCmdLogStore(database);
  return { database, settingsStore, steamLoginStore, steamCmdLogStore };
}

test('SteamLoginService fails fast when download worker is holding the steamcmd lock', async () => {
  const { settingsStore, steamLoginStore, steamCmdLogStore } = createStores();
  const socketPath = resolve(mkdtempSync(resolve(tmpdir(), 'steamcmd-login-lock-')), 'steamcmd.sock');
  const steamCmdLock = new SteamCmdSocketLock(socketPath);
  const heldLock = await steamCmdLock.acquire({
    holderType: 'download',
    runnerId: 'worker-a',
    wait: false,
  });

  let executeLoginCalls = 0;
  const fakeAdapter = {
    async executeLogin() {
      executeLoginCalls += 1;
      return {
        exitCode: 0,
        stdout: '',
        stderr: '',
        message: '',
      };
    },
  } as unknown as SteamCmdAdapter;

  const service = new SteamLoginService(fakeAdapter, steamLoginStore, settingsStore, steamCmdLock, steamCmdLogStore);
  const state = await service.login({
    steamAccountName: 'tester',
    steamPassword: 'secret',
  });

  assert.equal(executeLoginCalls, 0);
  assert.equal(state.status, 'failed');
  assert.match(state.errorMessage ?? '', /^runtime_blocked:/);
  assert.match(state.errorMessage ?? '', /下载器正在占用 steamcmd/);

  await heldLock.release();
});

test('SteamLoginService writes redacted login logs', async () => {
  const { settingsStore, steamLoginStore, steamCmdLogStore } = createStores();
  const socketPath = resolve(mkdtempSync(resolve(tmpdir(), 'steamcmd-login-logs-')), 'steamcmd.sock');
  const steamCmdLock = new SteamCmdSocketLock(socketPath);
  const fakeAdapter = {
    async executeLogin(_credentials: unknown, _settings: unknown, onProgress: (event: { status: 'running'; message: string; source: 'stdout' }) => void) {
      onProgress({ status: 'running', source: 'stdout', message: 'logging in with super-secret and 123456' });
      return {
        exitCode: 0,
        stdout: 'ok',
        stderr: '',
        message: 'ok',
      };
    },
  } as unknown as SteamCmdAdapter;

  const service = new SteamLoginService(fakeAdapter, steamLoginStore, settingsStore, steamCmdLock, steamCmdLogStore);
  const state = await service.login({
    steamAccountName: 'tester',
    steamPassword: 'super-secret',
    steamGuardCode: '123456',
  });

  assert.equal(state.status, 'authenticated');
  const logs = steamCmdLogStore.listLoginLogs();
  assert.ok(logs.some((entry) => entry.message.includes('[redacted]')));
  assert.equal(logs.some((entry) => entry.message.includes('super-secret') || entry.message.includes('123456')), false);
});
