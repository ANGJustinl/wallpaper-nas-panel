import type { DownloadTaskFailureCode, SteamLoginRequest } from '../../../../packages/shared/src';
import { SteamCmdAdapter } from './steamcmd-adapter';
import { SteamLoginStore } from './steam-login-store';
import { SteamCmdLockBusyError, SteamCmdSocketLock, type SteamCmdSocketLockHandle } from './steamcmd-socket-lock';
import { SettingsStore } from './settings-store';
import { SteamCmdLogStore } from './steamcmd-log-store';

export class SteamLoginService {
  private running = false;
  private readonly runnerId = `login-${process.pid}`;

  constructor(
    private readonly steamCmdAdapter: SteamCmdAdapter,
    private readonly steamLoginStore: SteamLoginStore,
    private readonly settingsStore: SettingsStore,
    private readonly steamCmdLock: SteamCmdSocketLock,
    private readonly steamCmdLogStore: SteamCmdLogStore,
  ) {}

  getState() {
    return this.steamLoginStore.getState();
  }

  async login(credentials: SteamLoginRequest) {
    if (this.running) {
      return this.steamLoginStore.getState();
    }

    this.running = true;
    const attemptAt = new Date().toISOString();

    this.steamLoginStore.updateState({
      status: 'logging_in',
      steamAccountName: credentials.steamAccountName,
      lastAttemptAt: attemptAt,
      errorMessage: undefined,
    });
    const secrets = [credentials.steamPassword, credentials.steamGuardCode ?? ''];
    this.steamCmdLogStore.append({
      scope: 'login',
      source: 'system',
      message: `开始登录 Steam 账号：${credentials.steamAccountName}`,
      secrets,
    });

    let lockHandle: SteamCmdSocketLockHandle | null = null;
    try {
      lockHandle = await this.steamCmdLock.acquire({
        holderType: 'login',
        runnerId: this.runnerId,
        wait: false,
      });
      const settings = this.settingsStore.getSnapshot();
      const result = await this.steamCmdAdapter.executeLogin(credentials, settings, (event) => {
        this.steamCmdLogStore.append({
          scope: 'login',
          source: event.source ?? 'system',
          message: event.message,
          secrets,
        });
        this.steamLoginStore.updateState({
          status: event.status === 'failed' ? 'failed' : 'logging_in',
          steamAccountName: credentials.steamAccountName,
          lastAttemptAt: attemptAt,
          errorMessage: event.status === 'failed' ? event.message : undefined,
        });
      });

      if (result.exitCode === 0) {
        const snapshot = this.settingsStore.getSnapshot();
        this.settingsStore.updateSnapshot({ ...snapshot, steamAccountName: credentials.steamAccountName });

        this.steamCmdLogStore.append({
          scope: 'login',
          source: 'system',
          message: `Steam 登录成功：${credentials.steamAccountName}`,
          secrets,
        });
        return this.steamLoginStore.updateState({
          status: 'authenticated',
          steamAccountName: credentials.steamAccountName,
          lastAttemptAt: attemptAt,
          lastSuccessAt: new Date().toISOString(),
          errorMessage: undefined,
        });
      }

      const failureMessage = `${this.classifyFailure(result.message || result.stderr.trim() || result.stdout.trim())}: ${result.message || result.stderr.trim() || `steamcmd login exited with code ${result.exitCode}`}`;
      this.steamCmdLogStore.append({
        scope: 'login',
        source: 'system',
        message: failureMessage,
        secrets,
      });
      return this.steamLoginStore.updateState({
        status: 'failed',
        steamAccountName: credentials.steamAccountName,
        lastAttemptAt: attemptAt,
        errorMessage: failureMessage,
      });
    } catch (error) {
      const message = error instanceof SteamCmdLockBusyError
        ? '下载器正在占用 steamcmd，请稍后重试。'
        : error instanceof Error
          ? error.message
          : 'unknown login error';
      this.steamCmdLogStore.append({
        scope: 'login',
        source: 'system',
        message: `${this.classifyFailure(message)}: ${message}`,
        secrets,
      });
      return this.steamLoginStore.updateState({
        status: 'failed',
        steamAccountName: credentials.steamAccountName,
        lastAttemptAt: attemptAt,
        errorMessage: `${this.classifyFailure(message)}: ${message}`,
      });
    } finally {
      if (lockHandle) {
        await lockHandle.release();
      }
      this.running = false;
    }
  }

  private classifyFailure(message: string): DownloadTaskFailureCode {
    const normalized = message.toLowerCase();

    if (errorMessageIndicatesLockBusy(normalized)) {
      return 'runtime_blocked';
    }

    if (
      normalized.includes('ld-linux.so.2')
      || normalized.includes('wrong elf class')
      || normalized.includes('steamcmd script not found')
      || normalized.includes('runtime is unavailable')
      || normalized.includes('required file not found')
      || normalized.includes('enoent')
    ) {
      return 'runtime_blocked';
    }

    if (
      normalized.includes('cached credentials not found')
      || normalized.includes('no cached credentials')
      || normalized.includes('not logged on')
      || normalized.includes('steam guard required')
      || normalized.includes('steam guard code mismatch')
      || normalized.includes('invalid steam guard')
      || normalized.includes('two-factor')
      || normalized.includes('invalid password')
      || normalized.includes('login failure')
      || normalized.includes('account logon denied')
    ) {
      return 'authentication_failed';
    }

    return 'unknown_error';
  }
}

function errorMessageIndicatesLockBusy(message: string) {
  return message.includes('steamcmd runtime is busy') || message.includes('下载器正在占用 steamcmd');
}
