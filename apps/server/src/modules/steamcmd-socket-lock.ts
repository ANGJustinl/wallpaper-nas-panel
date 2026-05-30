import { chmodSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { dirname, resolve } from 'node:path';
import { createConnection, createServer, type Server } from 'node:net';

export interface SteamCmdLockMetadata {
  holderType: 'download' | 'login';
  runnerId?: string;
  hostname: string;
  pid: number;
  acquiredAt: string;
  taskIds?: string[];
}

export interface SteamCmdSocketLockAcquireOptions {
  holderType: SteamCmdLockMetadata['holderType'];
  runnerId?: string;
  taskIds?: string[];
  wait?: boolean;
  pollMs?: number;
}

export interface SteamCmdSocketLockHandle {
  readonly metadata: SteamCmdLockMetadata;
  updateMetadata(patch: Partial<Pick<SteamCmdLockMetadata, 'runnerId' | 'taskIds'>>): Promise<void>;
  release(): Promise<void>;
}

export class SteamCmdLockBusyError extends Error {
  constructor(message = 'steamcmd runtime is busy') {
    super(message);
    this.name = 'SteamCmdLockBusyError';
  }
}

class SteamCmdSocketLockHandleImpl implements SteamCmdSocketLockHandle {
  private released = false;

  constructor(
    private readonly server: Server,
    private readonly socketPath: string,
    private readonly metaPath: string,
    public readonly metadata: SteamCmdLockMetadata,
  ) {}

  async updateMetadata(patch: Partial<Pick<SteamCmdLockMetadata, 'runnerId' | 'taskIds'>>) {
    if (this.released) {
      return;
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'runnerId')) {
      this.metadata.runnerId = patch.runnerId;
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'taskIds')) {
      this.metadata.taskIds = patch.taskIds;
    }

    writeLockMetadata(this.metaPath, this.metadata);
  }

  async release() {
    if (this.released) {
      return;
    }

    this.released = true;
    await new Promise<void>((resolvePromise) => {
      this.server.close(() => resolvePromise());
    });
    cleanupLockArtifacts(this.socketPath, this.metaPath);
  }
}

function delay(ms: number) {
  return new Promise<void>((resolvePromise) => {
    setTimeout(resolvePromise, ms);
  });
}

function cleanupLockArtifacts(socketPath: string, metaPath: string) {
  rmSync(metaPath, { force: true });
  rmSync(socketPath, { force: true });
}

function writeLockMetadata(metaPath: string, metadata: SteamCmdLockMetadata) {
  rmSync(metaPath, { force: true });
  writeFileSync(metaPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
  chmodSync(metaPath, 0o444);
}

export class SteamCmdSocketLock {
  private readonly socketPath: string;
  private readonly metaPath: string;

  constructor(socketPath = '/data/locks/steamcmd.sock') {
    this.socketPath = resolve(socketPath);
    this.metaPath = `${this.socketPath}.meta.json`;
  }

  getSocketPath() {
    return this.socketPath;
  }

  async acquire(options: SteamCmdSocketLockAcquireOptions): Promise<SteamCmdSocketLockHandle> {
    const wait = options.wait ?? false;
    const pollMs = Math.max(100, options.pollMs ?? 500);
    mkdirSync(dirname(this.socketPath), { recursive: true });

    while (true) {
      const metadata: SteamCmdLockMetadata = {
        holderType: options.holderType,
        runnerId: options.runnerId,
        hostname: hostname(),
        pid: process.pid,
        acquiredAt: new Date().toISOString(),
        taskIds: options.taskIds,
      };

      const handle = await this.tryAcquire(metadata, true);
      if (handle) {
        return handle;
      }

      if (!wait) {
        throw new SteamCmdLockBusyError('steamcmd runtime is busy');
      }

      await delay(pollMs);
    }
  }

  private async tryAcquire(metadata: SteamCmdLockMetadata, allowStaleCleanup: boolean): Promise<SteamCmdSocketLockHandle | null> {
    const server = createServer((socket) => {
      socket.end();
    });

    try {
      await new Promise<void>((resolvePromise, rejectPromise) => {
        server.once('listening', resolvePromise);
        server.once('error', (error: NodeJS.ErrnoException) => rejectPromise(error));
        server.listen(this.socketPath);
      });
    } catch (error) {
      server.removeAllListeners();
      server.close();

      if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE') {
        throw error;
      }

      if (!allowStaleCleanup) {
        return null;
      }

      const active = await this.isSocketActive();
      if (active) {
        return null;
      }

      cleanupLockArtifacts(this.socketPath, this.metaPath);
      return this.tryAcquire(metadata, false);
    }

    writeLockMetadata(this.metaPath, metadata);
    return new SteamCmdSocketLockHandleImpl(server, this.socketPath, this.metaPath, metadata);
  }

  private async isSocketActive() {
    return new Promise<boolean>((resolvePromise) => {
      let settled = false;
      const client = createConnection(this.socketPath);

      const settle = (value: boolean) => {
        if (settled) {
          return;
        }

        settled = true;
        client.destroy();
        resolvePromise(value);
      };

      client.once('connect', () => settle(true));
      client.once('error', () => settle(false));
      client.setTimeout(300, () => settle(false));
    });
  }
}
