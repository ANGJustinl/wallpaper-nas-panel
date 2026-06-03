import { spawn, type SpawnOptionsWithoutStdio } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import type { DownloadTask, SettingsSnapshot, SteamLoginRequest } from '../../../../packages/shared/src';
import type { SteamCmdConfig } from './steamcmd-config';

export interface SteamCmdExecutionResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  message: string;
  outputPath?: string;
}

export interface SteamCmdBatchItemExecutionResult {
  workshopItemId: string;
  exitCode: number;
  message: string;
  outputPath: string;
}

export interface SteamCmdBatchExecutionResult extends SteamCmdExecutionResult {
  items: SteamCmdBatchItemExecutionResult[];
}

export interface SteamCmdProgressEvent {
  status: DownloadTask['status'];
  message: string;
  workshopItemId?: string;
  source?: 'stdout' | 'stderr' | 'system';
}

interface SteamCmdChildProcess {
  stdout: NodeJS.ReadableStream;
  stderr: NodeJS.ReadableStream;
  on(event: 'error', listener: (error: Error) => void): this;
  on(event: 'close', listener: (exitCode: number | null) => void): this;
}

type SteamCmdSpawnProcess = (
  command: string,
  args: string[],
  options: SpawnOptionsWithoutStdio,
) => SteamCmdChildProcess;

interface SteamCmdBatchItemState {
  status: 'pending' | 'running' | 'candidate_success' | 'failed';
  message: string;
}

export class SteamCmdAdapter {
  constructor(
    private readonly config: SteamCmdConfig,
    private readonly spawnProcess: SteamCmdSpawnProcess = spawn,
  ) {}

  private stripAnsi(text: string) {
    return text.replace(/\u001b\[[0-9;]*m/g, '');
  }

  private isBenignSteamGuardLine(line: string) {
    return /^steam guard code provided\.?$/i.test(line);
  }

  private isBenignControlLine(line: string) {
    return /^"@(?:ShutdownOnFailedCommand|NoPromptForPassword)"\s*=\s*"[^"]*"$/.test(line);
  }

  private normalizeLine(line: string) {
    const normalized = this.stripAnsi(line).trim();
    if (!normalized) {
      return null;
    }

    if (this.isBenignControlLine(normalized) || this.isBenignSteamGuardLine(normalized)) {
      return null;
    }

    return normalized;
  }

  private normalizeTextLines(text: string) {
    return text
      .split(/\r?\n/)
      .map((line) => this.normalizeLine(line))
      .filter((line): line is string => Boolean(line));
  }

  private normalizeOutputLines(stdout: string, stderr: string) {
    return this.normalizeTextLines(`${stdout}\n${stderr}`);
  }

  private formatProgressLine(line: string) {
    const downloadingMatch = line.match(/^Downloading item\s+(\d+)\s+\.\.\./i);
    if (downloadingMatch) {
      return `正在下载项目 ${downloadingMatch[1]}…`;
    }

    const downloadedMatch = line.match(/^Success\.\s+Downloaded item\s+(\d+)\s+to\s+(.+)$/i);
    if (downloadedMatch) {
      return `项目 ${downloadedMatch[1]} 下载完成，正在整理到 ${downloadedMatch[2]}。`;
    }

    if (/download in progress/i.test(line)) {
      return 'steamcmd 已开始拉取工坊文件。';
    }

    if (/waiting for project\.json/i.test(line)) {
      return '工坊文件已返回，正在等待项目元数据。';
    }

    return line;
  }

  private getSteamHomeDirectory() {
    return resolve(this.config.steamCmdScriptPath, '..', '..');
  }

  private buildSharedArguments(settings: SettingsSnapshot, shutdownOnFailedCommand: '0' | '1') {
    const steamAccountName = settings.steamAccountName.trim() || 'anonymous';

    return ['+@ShutdownOnFailedCommand', shutdownOnFailedCommand, '+@NoPromptForPassword', '1', '+login', steamAccountName];
  }

  buildDownloadArguments(workshopItemId: string, settings: SettingsSnapshot) {
    return [
      ...this.buildSharedArguments(settings, '1'),
      '+workshop_download_item',
      this.config.appId,
      workshopItemId,
      '+quit',
    ];
  }

  buildBatchDownloadArguments(workshopItemIds: string[], settings: SettingsSnapshot) {
    return [
      ...this.buildSharedArguments(settings, '0'),
      ...workshopItemIds.flatMap((workshopItemId) => ['+workshop_download_item', this.config.appId, workshopItemId]),
      '+quit',
    ];
  }

  private createSteamCmdEnvironment(settings: SettingsSnapshot) {
    const env = { ...process.env };
    env.HOME = this.getSteamHomeDirectory();

    if (settings.proxy.enabled && settings.proxy.url) {
      env.HTTP_PROXY = settings.proxy.url;
      env.HTTPS_PROXY = settings.proxy.url;
      env.ALL_PROXY = settings.proxy.url;
    } else {
      delete env.HTTP_PROXY;
      delete env.HTTPS_PROXY;
      delete env.ALL_PROXY;
    }

    return env;
  }

  private resolveDownloadedItemPath(workshopItemId: string) {
    return resolve(this.config.workshopContentDir, workshopItemId);
  }

  private resolveOutputPath(workshopItemId: string, settings: SettingsSnapshot) {
    return resolve(settings.downloadRoot || this.config.workshopContentDir, workshopItemId);
  }

  syncCachedItemToOutput(workshopItemId: string, outputPath: string) {
    const sourcePath = this.resolveDownloadedItemPath(workshopItemId);
    const targetPath = resolve(outputPath);

    if (!existsSync(sourcePath)) {
      return { synced: false, sourcePath, targetPath };
    }

    if (sourcePath === targetPath) {
      return { synced: false, sourcePath, targetPath };
    }

    mkdirSync(resolve(targetPath, '..'), { recursive: true });
    cpSync(sourcePath, targetPath, { recursive: true, force: true });
    return { synced: true, sourcePath, targetPath };
  }

  private summarizeOutput(stdout: string, stderr: string) {
    const normalizedLines = this.normalizeOutputLines(stdout, stderr);

    const priorityLines = normalizedLines.filter((line) => (
      /error!|cached credentials|not logged on|missing decryption key|login failure|steam guard required|steam guard code mismatch|invalid steam guard|two-factor|required file not found|wrong elf|runtime is unavailable|account logon denied|download item .* failed|failed \([^)]*\)/i.test(line)
    ));

    if (priorityLines.length) {
      return priorityLines.join('\n');
    }

    return normalizedLines.join('\n');
  }

  private createLineForwarder(
    onLine: (line: string, source: 'stdout' | 'stderr') => void,
  ) {
    let buffer = '';

    return {
      push: (text: string, source: 'stdout' | 'stderr') => {
        buffer += text;

        while (true) {
          const lineBreakIndex = buffer.search(/\r?\n/);
          if (lineBreakIndex < 0) {
            return;
          }

          const rawLine = buffer.slice(0, lineBreakIndex);
          const separatorLength = buffer[lineBreakIndex] === '\r' && buffer[lineBreakIndex + 1] === '\n' ? 2 : 1;
          buffer = buffer.slice(lineBreakIndex + separatorLength);

          const normalizedLine = this.normalizeLine(rawLine);
          if (normalizedLine) {
            onLine(normalizedLine, source);
          }
        }
      },
      flush: (source: 'stdout' | 'stderr') => {
        const normalizedLine = this.normalizeLine(buffer);
        buffer = '';
        if (normalizedLine) {
          onLine(normalizedLine, source);
        }
      },
    };
  }

  private spawnSteamCmd(
    args: string[],
    settings: SettingsSnapshot,
    onLine?: (line: string, source: 'stdout' | 'stderr') => void,
  ) {
    return new Promise<SteamCmdExecutionResult>((resolvePromise, rejectPromise) => {
      if (!this.config.available) {
        rejectPromise(new Error(this.config.availabilityError ?? 'steamcmd runtime is unavailable'));
        return;
      }

      const child = this.spawnProcess(this.config.steamCmdScriptPath, args, {
        cwd: resolve(this.config.steamCmdScriptPath, '..'),
        env: this.createSteamCmdEnvironment(settings),
      });

      let stdout = '';
      let stderr = '';
      const stdoutForwarder = onLine ? this.createLineForwarder(onLine) : null;
      const stderrForwarder = onLine ? this.createLineForwarder(onLine) : null;

      child.stdout.on('data', (chunk: Buffer | string) => {
        const text = chunk.toString();
        stdout += text;
        stdoutForwarder?.push(text, 'stdout');
      });

      child.stderr.on('data', (chunk: Buffer | string) => {
        const text = chunk.toString();
        stderr += text;
        stderrForwarder?.push(text, 'stderr');
      });

      child.on('error', (error) => rejectPromise(error));
      child.on('close', (exitCode) => {
        stdoutForwarder?.flush('stdout');
        stderrForwarder?.flush('stderr');
        resolvePromise({
          exitCode: exitCode ?? 1,
          stdout,
          stderr,
          message: this.summarizeOutput(stdout, stderr),
        });
      });
    });
  }

  private syncDownloadedItemToOutput(workshopItemId: string, settings: SettingsSnapshot) {
    const sourcePath = this.resolveDownloadedItemPath(workshopItemId);
    const targetPath = this.resolveOutputPath(workshopItemId, settings);

    if (!existsSync(sourcePath)) {
      return targetPath;
    }

    if (sourcePath === targetPath) {
      return sourcePath;
    }

    mkdirSync(resolve(targetPath, '..'), { recursive: true });

    if (existsSync(targetPath)) {
      rmSync(targetPath, { recursive: true, force: true });
    }

    cpSync(sourcePath, targetPath, { recursive: true, force: true });
    return targetPath;
  }

  private extractDownloadFailure(stdout: string, stderr: string) {
    const combined = `${stderr}\n${stdout}`.trim();
    const normalized = combined.toLowerCase();

    if (normalized.includes('error! not logged on')) {
      return 'ERROR! Not logged on.';
    }

    const failedDownloadMatch = combined.match(/ERROR!\s+Download item\s+\d+\s+failed\s+\(([^)]+)\)\./i);
    if (failedDownloadMatch) {
      return failedDownloadMatch[0];
    }

    if (normalized.includes('no cached credentials') || normalized.includes('cached credentials not found')) {
      return 'Cached credentials not found.';
    }

    return null;
  }

  private extractLoginFailure(stdout: string, stderr: string) {
    const normalizedLines = this.normalizeOutputLines(stdout, stderr);

    const priorityLine = normalizedLines.find((line) => (
      /error!|login failure|cached credentials|not logged on|invalid password|steam guard required|steam guard code mismatch|invalid steam guard|two-factor|account logon denied|failed \([^)]*\)/i.test(line)
    ));

    return priorityLine ?? null;
  }

  private detectGlobalDownloadFailure(line: string) {
    if (/cached credentials not found|no cached credentials/i.test(line)) {
      return 'Cached credentials not found.';
    }

    if (/error!\s+not logged on\.?/i.test(line)) {
      return 'ERROR! Not logged on.';
    }

    if (/login failure|invalid password|steam guard required|steam guard code mismatch|invalid steam guard|two-factor|account logon denied|missing decryption key/i.test(line)) {
      return line;
    }

    if (/ld-linux\.so\.2|wrong elf class|steamcmd script not found|runtime is unavailable|required file not found|enoent/i.test(line)) {
      return line;
    }

    return null;
  }

  private extractGlobalDownloadFailure(stdout: string, stderr: string) {
    const normalizedLines = this.normalizeOutputLines(stdout, stderr);
    return normalizedLines
      .map((line) => this.detectGlobalDownloadFailure(line))
      .find((line): line is string => Boolean(line)) ?? null;
  }

  async execute(workshopItemId: string, settings: SettingsSnapshot, onProgress: (event: SteamCmdProgressEvent) => void) {
    const args = this.buildDownloadArguments(workshopItemId, settings);
    const result = await this.spawnSteamCmd(args, settings, (line, source) => {
      onProgress({
        status: 'running',
        workshopItemId,
        message: this.formatProgressLine(line),
        source,
      });
    });
    const sourcePath = this.resolveDownloadedItemPath(workshopItemId);
    const outputPath = this.resolveOutputPath(workshopItemId, settings);
    const detectedFailure = this.extractDownloadFailure(result.stdout, result.stderr);

    if (result.exitCode !== 0) {
      return { ...result, outputPath };
    }

    if (detectedFailure) {
      return {
        ...result,
        exitCode: 1,
        stderr: detectedFailure,
        stdout: result.stdout.trim() ? result.stdout : detectedFailure,
        message: detectedFailure,
        outputPath,
      };
    }

    if (!existsSync(sourcePath)) {
      const message = `steamcmd exited successfully but no workshop files were found at ${sourcePath}`;
      return {
        ...result,
        exitCode: 1,
        stderr: message,
        stdout: result.stdout.trim() ? result.stdout : message,
        message,
        outputPath,
      };
    }

    return {
      ...result,
      outputPath: this.syncDownloadedItemToOutput(workshopItemId, settings),
    };
  }

  async executeBatch(
    workshopItemIds: string[],
    settings: SettingsSnapshot,
    onProgress: (event: SteamCmdProgressEvent) => void,
  ): Promise<SteamCmdBatchExecutionResult> {
    const uniqueWorkshopItemIds = Array.from(new Set(workshopItemIds));
    const itemStateMap = new Map<string, SteamCmdBatchItemState>(
      uniqueWorkshopItemIds.map((workshopItemId) => [workshopItemId, {
        status: 'pending',
        message: '已并入当前 steamcmd 批次，等待执行。',
      }]),
    );
    let activeWorkshopItemId: string | null = null;
    let globalFailure: string | null = null;

    const result = await this.spawnSteamCmd(this.buildBatchDownloadArguments(uniqueWorkshopItemIds, settings), settings, (line, source) => {
      const downloadingMatch = line.match(/^Downloading item\s+(\d+)\s+\.\.\./i);
      if (downloadingMatch && itemStateMap.has(downloadingMatch[1])) {
        activeWorkshopItemId = downloadingMatch[1];
        itemStateMap.set(activeWorkshopItemId, {
          status: 'running',
          message: this.formatProgressLine(line),
        });
        onProgress({
          status: 'running',
          workshopItemId: activeWorkshopItemId,
          message: this.formatProgressLine(line),
          source,
        });
        return;
      }

      const successMatch = line.match(/^Success\.\s+Downloaded item\s+(\d+)\s+to\s+(.+)$/i);
      if (successMatch && itemStateMap.has(successMatch[1])) {
        activeWorkshopItemId = successMatch[1];
        itemStateMap.set(activeWorkshopItemId, {
          status: 'candidate_success',
          message: this.formatProgressLine(line),
        });
        onProgress({
          status: 'running',
          workshopItemId: activeWorkshopItemId,
          message: this.formatProgressLine(line),
          source,
        });
        return;
      }

      const explicitFailureMatch = line.match(/^ERROR!\s+Download item\s+(\d+)\s+failed\s+\(([^)]+)\)\./i);
      if (explicitFailureMatch && itemStateMap.has(explicitFailureMatch[1])) {
        activeWorkshopItemId = explicitFailureMatch[1];
        itemStateMap.set(activeWorkshopItemId, {
          status: 'failed',
          message: explicitFailureMatch[0],
        });
        onProgress({
          status: 'failed',
          workshopItemId: activeWorkshopItemId,
          message: explicitFailureMatch[0],
          source,
        });
        return;
      }

      const detectedGlobalFailure = this.detectGlobalDownloadFailure(line);
      if (detectedGlobalFailure) {
        globalFailure ??= detectedGlobalFailure;
        if (activeWorkshopItemId && itemStateMap.has(activeWorkshopItemId)) {
          onProgress({
            status: 'failed',
            workshopItemId: activeWorkshopItemId,
            message: detectedGlobalFailure,
            source,
          });
        }
        return;
      }

      if (activeWorkshopItemId && itemStateMap.has(activeWorkshopItemId)) {
        onProgress({
          status: 'running',
          workshopItemId: activeWorkshopItemId,
          message: this.formatProgressLine(line),
          source,
        });
      }
    });

    globalFailure ??= this.extractGlobalDownloadFailure(result.stdout, result.stderr);
    const batchFallbackMessage = result.message || `steamcmd exited with code ${result.exitCode}`;

    const items = uniqueWorkshopItemIds.map((workshopItemId) => {
      const itemState = itemStateMap.get(workshopItemId);
      const outputPath = this.resolveOutputPath(workshopItemId, settings);

      if (!itemState) {
        return {
          workshopItemId,
          exitCode: 1,
          message: batchFallbackMessage,
          outputPath,
        };
      }

      if (itemState.status === 'failed') {
        return {
          workshopItemId,
          exitCode: 1,
          message: itemState.message,
          outputPath,
        };
      }

      if (globalFailure) {
        return {
          workshopItemId,
          exitCode: 1,
          message: globalFailure,
          outputPath,
        };
      }

      if (itemState.status === 'candidate_success') {
        const sourcePath = this.resolveDownloadedItemPath(workshopItemId);
        if (!existsSync(sourcePath)) {
          return {
            workshopItemId,
            exitCode: 1,
            message: `steamcmd exited successfully but no workshop files were found at ${sourcePath}`,
            outputPath,
          };
        }

        return {
          workshopItemId,
          exitCode: 0,
          message: itemState.message || 'steamcmd 下载完成。',
          outputPath: this.syncDownloadedItemToOutput(workshopItemId, settings),
        };
      }

      return {
        workshopItemId,
        exitCode: 1,
        message: `steamcmd 批次已中断，项目 ${workshopItemId} 未完成。${result.exitCode !== 0 ? ` (${batchFallbackMessage})` : ''}`,
        outputPath,
      };
    });

    return {
      ...result,
      items,
    };
  }

  async executeLogin(credentials: SteamLoginRequest, settings: SettingsSnapshot, onProgress: (event: SteamCmdProgressEvent) => void) {
    const args = ['+@ShutdownOnFailedCommand', '1', '+@NoPromptForPassword', '1', '+login', credentials.steamAccountName];
    if (credentials.steamPassword) {
      args.push(credentials.steamPassword);
    }
    if (credentials.steamGuardCode) {
      args.push(credentials.steamGuardCode);
    }
    args.push('+quit');

    const result = await this.spawnSteamCmd(args, settings, (line, source) => {
      onProgress({
        status: 'running',
        message: this.formatProgressLine(line),
        source,
      });
    });
    const detectedFailure = this.extractLoginFailure(result.stdout, result.stderr);

    if (result.exitCode !== 0) {
      return {
        ...result,
        message: detectedFailure ?? (result.message || `steamcmd login exited with code ${result.exitCode}`),
      };
    }

    return result;
  }
}
