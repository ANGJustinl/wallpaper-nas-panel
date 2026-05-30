import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import { SteamCmdLockBusyError, SteamCmdSocketLock } from './steamcmd-socket-lock';

function createSocketPath() {
  const directory = mkdtempSync(resolve(tmpdir(), 'steamcmd-lock-'));
  return resolve(directory, 'steamcmd.sock');
}

async function listen(server: ReturnType<typeof createServer>, socketPath: string) {
  await new Promise<void>((resolvePromise, rejectPromise) => {
    server.once('error', rejectPromise);
    server.listen(socketPath, resolvePromise);
  });
}

async function close(server: ReturnType<typeof createServer>) {
  await new Promise<void>((resolvePromise) => {
    server.close(() => resolvePromise());
  });
}

test('SteamCmdSocketLock acquires, writes metadata, and releases cleanly', async () => {
  const socketPath = createSocketPath();
  const metaPath = `${socketPath}.meta.json`;
  const lock = new SteamCmdSocketLock(socketPath);
  const handle = await lock.acquire({
    holderType: 'download',
    runnerId: 'worker-a',
    wait: false,
  });

  await handle.updateMetadata({ taskIds: ['task-1', 'task-2'] });
  assert.equal(existsSync(socketPath), true);
  assert.equal(existsSync(metaPath), true);

  const metadata = JSON.parse(readFileSync(metaPath, 'utf8')) as { runnerId?: string; taskIds?: string[] };
  assert.equal(metadata.runnerId, 'worker-a');
  assert.deepEqual(metadata.taskIds, ['task-1', 'task-2']);

  await handle.release();
  assert.equal(existsSync(socketPath), false);
  assert.equal(existsSync(metaPath), false);
});

test('SteamCmdSocketLock rejects a second holder while the lock is active', async () => {
  const socketPath = createSocketPath();
  const lock = new SteamCmdSocketLock(socketPath);
  const handle = await lock.acquire({
    holderType: 'download',
    runnerId: 'worker-a',
    wait: false,
  });

  await assert.rejects(
    () => lock.acquire({ holderType: 'login', runnerId: 'login-a', wait: false }),
    (error: unknown) => error instanceof SteamCmdLockBusyError,
  );

  await handle.release();
});

test('SteamCmdSocketLock cleans up a stale socket before acquiring', async () => {
  const socketPath = createSocketPath();
  const staleServer = createServer();
  await listen(staleServer, socketPath);
  await close(staleServer);
  if (!existsSync(socketPath)) {
    writeFileSync(socketPath, 'stale');
  }
  assert.equal(existsSync(socketPath), true);

  const lock = new SteamCmdSocketLock(socketPath);
  const handle = await lock.acquire({
    holderType: 'download',
    runnerId: 'worker-b',
    wait: false,
  });

  assert.equal(existsSync(socketPath), true);
  await handle.release();
});
