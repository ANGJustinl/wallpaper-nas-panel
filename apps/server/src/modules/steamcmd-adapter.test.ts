import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import type { SettingsSnapshot } from '../../../../packages/shared/src';
import { SteamCmdAdapter } from './steamcmd-adapter';
import type { SteamCmdConfig } from './steamcmd-config';

function createSettings(downloadRoot: string): SettingsSnapshot {
  return {
    steamAccountName: 'tester',
    downloadRoot,
    metadataLanguage: 'en-US',
    requestIntervalMs: 1000,
    autoGenerateNfo: true,
    proxy: {
      enabled: false,
      url: '',
    },
  };
}

function createConfig(baseDir: string): SteamCmdConfig {
  const steamcmdDir = resolve(baseDir, 'steamcmd');
  const workshopContentDir = resolve(baseDir, 'workshop');
  mkdirSync(steamcmdDir, { recursive: true });
  mkdirSync(workshopContentDir, { recursive: true });
  const steamCmdScriptPath = resolve(steamcmdDir, 'steamcmd.sh');
  writeFileSync(steamCmdScriptPath, '#!/bin/sh\n', 'utf8');

  return {
    steamCmdScriptPath,
    appId: '431960',
    workshopContentDir,
    lockSocketPath: resolve(baseDir, 'steamcmd.sock'),
    batchMaxItems: 20,
    available: true,
  };
}

function createMockSpawn(stdoutChunks: string[], stderrChunks: string[], exitCode: number) {
  const calls: Array<{ command: string; args: string[] }> = [];

  const spawn = (command: string, args: string[]) => {
    calls.push({ command, args });
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const child = new EventEmitter() as EventEmitter & { stdout: PassThrough; stderr: PassThrough };
    child.stdout = stdout;
    child.stderr = stderr;

    process.nextTick(() => {
      stdoutChunks.forEach((chunk) => stdout.write(chunk));
      stderrChunks.forEach((chunk) => stderr.write(chunk));
      stdout.end();
      stderr.end();
      child.emit('close', exitCode);
    });

    return child;
  };

  return { spawn, calls };
}

test('SteamCmdAdapter builds one batched command and settles per-item results', async () => {
  const baseDir = mkdtempSync(resolve(tmpdir(), 'steamcmd-adapter-batch-'));
  const config = createConfig(baseDir);
  const downloadRoot = resolve(baseDir, 'downloads');
  const settings = createSettings(downloadRoot);
  const item111SourcePath = resolve(config.workshopContentDir, '111');
  const item333SourcePath = resolve(config.workshopContentDir, '333');
  mkdirSync(item111SourcePath, { recursive: true });
  mkdirSync(item333SourcePath, { recursive: true });
  writeFileSync(resolve(item111SourcePath, 'a.txt'), 'ok', 'utf8');
  writeFileSync(resolve(item333SourcePath, 'b.txt'), 'ok', 'utf8');

  const { spawn, calls } = createMockSpawn(
    [
      'Downloading item 111 ...\n',
      `Success. Downloaded item 111 to ${item111SourcePath}\n`,
      'Downloading item 222 ...\n',
      'ERROR! Download item 222 failed (Access Denied).\n',
      'Downloading item 333 ...\n',
      `Success. Downloaded item 333 to ${item333SourcePath}\n`,
    ],
    [],
    0,
  );

  const adapter = new SteamCmdAdapter(config, spawn as never);
  const args = adapter.buildBatchDownloadArguments(['111', '222', '333'], settings);
  assert.deepEqual(args, [
    '+@ShutdownOnFailedCommand',
    '0',
    '+@NoPromptForPassword',
    '1',
    '+login',
    'tester',
    '+workshop_download_item',
    '431960',
    '111',
    '+workshop_download_item',
    '431960',
    '222',
    '+workshop_download_item',
    '431960',
    '333',
    '+quit',
  ]);

  const result = await adapter.executeBatch(['111', '222', '333'], settings, () => undefined);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.command, config.steamCmdScriptPath);
  assert.deepEqual(calls[0]?.args, args);

  const item111 = result.items.find((item) => item.workshopItemId === '111');
  const item222 = result.items.find((item) => item.workshopItemId === '222');
  const item333 = result.items.find((item) => item.workshopItemId === '333');

  assert.equal(item111?.exitCode, 0);
  assert.equal(item222?.exitCode, 1);
  assert.match(item222?.message ?? '', /Access Denied/);
  assert.equal(item333?.exitCode, 0);
});

test('SteamCmdAdapter keeps candidate successes pending until the whole batch settles', async () => {
  const baseDir = mkdtempSync(resolve(tmpdir(), 'steamcmd-adapter-global-'));
  const config = createConfig(baseDir);
  const downloadRoot = resolve(baseDir, 'downloads');
  const settings = createSettings(downloadRoot);
  const item111SourcePath = resolve(config.workshopContentDir, '111');
  mkdirSync(item111SourcePath, { recursive: true });
  writeFileSync(resolve(item111SourcePath, 'a.txt'), 'ok', 'utf8');

  const { spawn } = createMockSpawn(
    [
      'Downloading item 111 ...\n',
      `Success. Downloaded item 111 to ${item111SourcePath}\n`,
      'Cached credentials not found.\n',
    ],
    [],
    1,
  );

  const adapter = new SteamCmdAdapter(config, spawn as never);
  const result = await adapter.executeBatch(['111', '222'], settings, () => undefined);

  const item111 = result.items.find((item) => item.workshopItemId === '111');
  const item222 = result.items.find((item) => item.workshopItemId === '222');
  assert.equal(item111?.exitCode, 1);
  assert.equal(item222?.exitCode, 1);
  assert.equal(item111?.message, 'Cached credentials not found.');
  assert.equal(item222?.message, 'Cached credentials not found.');
});
