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

function createStores() {
  const database = new Database(':memory:');
  migrateDatabase(database);
  const settingsStore = new SettingsStore(database);
  settingsStore.seedDefaults();
  const steamLoginStore = new SteamLoginStore(database);
  steamLoginStore.seedDefaults(settingsDefaults.steamAccountName);
  return { settingsStore, steamLoginStore };
}

test('SteamLoginService fails fast when download worker is holding the steamcmd lock', async () => {
  const { settingsStore, steamLoginStore } = createStores();
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

  const service = new SteamLoginService(fakeAdapter, steamLoginStore, settingsStore, steamCmdLock);
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
