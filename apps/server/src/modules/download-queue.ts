import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import type {
  DownloadTask,
  DownloadTaskFailureCode,
  SettingsSnapshot,
  WorkshopItemSummary,
} from '../../../../packages/shared/src';
import { DownloadedContentStore } from './downloaded-content-store';
import { writeWorkshopNfo } from './nfo-writer';
import { SettingsStore } from './settings-store';
import { SteamCmdAdapter, type SteamCmdBatchItemExecutionResult, type SteamCmdProgressEvent } from './steamcmd-adapter';
import { type SteamCmdSocketLockHandle, SteamCmdSocketLock } from './steamcmd-socket-lock';
import { TaskStore } from './task-store';
import { WorkerStateStore } from './worker-state-store';

export class DownloadQueue {
  private activeTaskId: string | null = null;
  private readonly runnerId = `${hostname()}-${process.pid}`;
  private workerLoopActive = false;
  private pollTimer: NodeJS.Timeout | null = null;
  private processingBatch = false;

  constructor(
    private readonly taskStore: TaskStore,
    private readonly downloadedContentStore: DownloadedContentStore,
    private readonly steamCmdAdapter: SteamCmdAdapter,
    private readonly settingsStore: SettingsStore,
    private readonly workerStateStore: WorkerStateStore,
    private readonly steamCmdLock: SteamCmdSocketLock,
    private readonly batchMaxItems: number,
  ) {}

  createTask(item: WorkshopItemSummary) {
    const existingActiveTask = this.taskStore.getActiveTaskByWorkshopItemId(item.id);
    if (existingActiveTask) {
      return existingActiveTask;
    }

    const timestamp = new Date().toISOString();
    const task: DownloadTask = {
      id: randomUUID(),
      workshopItemId: item.id,
      workshopTitle: item.title,
      status: 'pending',
      attempts: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
      logExcerpt: '已加入下载队列，等待 steamcmd worker 执行。',
    };

    this.taskStore.upsertTask(task, item);
    this.scheduleProcessing();
    return task;
  }

  retryTask(taskId: string) {
    const task = this.taskStore.retryTask(taskId);
    if (task) {
      this.scheduleProcessing();
    }

    return task;
  }

  getRunnerId() {
    return this.runnerId;
  }

  startWorkerLoop() {
    if (this.workerLoopActive) {
      return;
    }

    this.workerLoopActive = true;
    this.taskStore.requeueInterruptedTasks();
    const startedAt = new Date().toISOString();
    this.workerStateStore.updateSnapshot({
      online: true,
      status: 'idle',
      runnerId: this.runnerId,
      startedAt,
      heartbeatAt: startedAt,
      activeTaskId: undefined,
      activeTaskTitle: undefined,
      lastError: undefined,
    });

    this.scheduleProcessing();
    this.pollTimer = setInterval(() => {
      this.workerStateStore.updateSnapshot({
        online: true,
        status: this.processingBatch ? 'processing' : 'idle',
        runnerId: this.runnerId,
        heartbeatAt: new Date().toISOString(),
      });
      this.scheduleProcessing();
    }, 2500);
  }

  stopWorkerLoop(reason?: string) {
    this.workerLoopActive = false;

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    this.workerStateStore.updateSnapshot({
      online: false,
      status: 'offline',
      heartbeatAt: new Date().toISOString(),
      activeTaskId: undefined,
      activeTaskTitle: undefined,
      lastError: reason,
    });
  }

  async processPendingTasks() {
    if (!this.workerLoopActive || this.processingBatch) {
      return;
    }

    if (!this.taskStore.hasPendingTasks()) {
      this.markWorkerIdle();
      return;
    }

    this.processingBatch = true;
    let lockHandle: SteamCmdSocketLockHandle | null = null;
    let claimedTasks: DownloadTask[] = [];
    let batchLastError: string | undefined;

    try {
      lockHandle = await this.steamCmdLock.acquire({
        holderType: 'download',
        runnerId: this.runnerId,
        wait: true,
      });

      claimedTasks = this.taskStore.claimPendingTasks(this.batchMaxItems, this.runnerId);
      if (!claimedTasks.length) {
        return;
      }

      await lockHandle.updateMetadata({ taskIds: claimedTasks.map((task) => task.id) });
      this.setActiveTask(claimedTasks[0]);

      const taskByWorkshopItemId = new Map(claimedTasks.map((task) => [task.workshopItemId, task]));
      const settings = this.settingsStore.getSnapshot();
      const result = await this.steamCmdAdapter.executeBatch(
        claimedTasks.map((task) => task.workshopItemId),
        settings,
        (event) => this.handleProgressEvent(event, taskByWorkshopItemId),
      );

      for (const itemResult of result.items) {
        const task = taskByWorkshopItemId.get(itemResult.workshopItemId);
        if (!task) {
          continue;
        }

        const failureMessage = await this.finalizeTaskResult(task, itemResult, settings);
        batchLastError ??= failureMessage;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown steamcmd error';
      batchLastError = message;
      this.failUnfinishedTasks(claimedTasks, message);
    } finally {
      if (lockHandle) {
        await lockHandle.release();
      }

      this.activeTaskId = null;
      this.processingBatch = false;
      this.markWorkerIdle(batchLastError);
      this.scheduleProcessing();
    }
  }

  private handleProgressEvent(
    event: SteamCmdProgressEvent,
    taskByWorkshopItemId: Map<string, DownloadTask>,
  ) {
    if (!event.workshopItemId) {
      return;
    }

    const task = taskByWorkshopItemId.get(event.workshopItemId);
    if (!task) {
      return;
    }

    const now = new Date().toISOString();
    const patch: Partial<DownloadTask> = {
      updatedAt: now,
      runnerId: this.runnerId,
      logExcerpt: event.message,
    };

    if (event.status === 'running') {
      patch.status = 'running';
    }

    if (event.status === 'failed') {
      patch.status = 'failed';
      patch.finishedAt = now;
      patch.errorMessage = event.message;
      patch.failureCode = this.classifyFailure(event.message, 'download');
    }

    this.taskStore.updateTask(task.id, patch);
    this.setActiveTask(task);
  }

  private async finalizeTaskResult(
    task: DownloadTask,
    itemResult: SteamCmdBatchItemExecutionResult,
    settings: SettingsSnapshot,
  ) {
    const finishedAt = new Date().toISOString();

    if (itemResult.exitCode === 0) {
      const finishedTask = this.taskStore.updateTask(task.id, {
        status: 'succeeded',
        updatedAt: finishedAt,
        finishedAt,
        outputPath: itemResult.outputPath,
        logExcerpt: itemResult.message || 'steamcmd 下载完成。',
        failureCode: undefined,
        errorMessage: undefined,
      });

      const taskWorkshopItem = this.taskStore.getTaskWorkshopItem(task.id);
      if (finishedTask && taskWorkshopItem) {
        let postProcessFailure: string | undefined;

        if (settings.autoGenerateNfo) {
          try {
            writeWorkshopNfo({
              workshopItem: taskWorkshopItem,
              outputPath: itemResult.outputPath,
              downloadedAt: finishedTask.finishedAt,
              taskId: finishedTask.id,
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : 'NFO 生成失败';
            postProcessFailure = `NFO 生成失败: ${message}`;
          }
        }

        try {
          this.downloadedContentStore.recordDownload(finishedTask, taskWorkshopItem, itemResult.outputPath);
        } catch (error) {
          const message = error instanceof Error ? error.message : '内容库记录失败';
          return [postProcessFailure, `内容库记录失败: ${message}`].filter(Boolean).join('；');
        }

        return postProcessFailure;
      }

      return undefined;
    }

    const failureMessage = itemResult.message || 'steamcmd 执行失败。';
    this.taskStore.updateTask(task.id, {
      status: 'failed',
      updatedAt: finishedAt,
      finishedAt,
      outputPath: itemResult.outputPath,
      errorMessage: failureMessage,
      logExcerpt: failureMessage,
      failureCode: this.classifyFailure(failureMessage, 'download'),
    });

    return failureMessage;
  }

  private failUnfinishedTasks(tasks: DownloadTask[], message: string) {
    const failedAt = new Date().toISOString();
    tasks.forEach((task) => {
      const current = this.taskStore.getTask(task.id);
      if (!current || current.status === 'succeeded') {
        return;
      }

      this.taskStore.updateTask(task.id, {
        status: 'failed',
        updatedAt: failedAt,
        finishedAt: failedAt,
        errorMessage: current.errorMessage ?? message,
        logExcerpt: current.logExcerpt || message,
        failureCode: current.failureCode ?? this.classifyFailure(message, 'download'),
      });
    });
  }

  private setActiveTask(task: DownloadTask) {
    this.activeTaskId = task.id;
    this.workerStateStore.updateSnapshot({
      online: true,
      status: 'processing',
      runnerId: this.runnerId,
      heartbeatAt: new Date().toISOString(),
      activeTaskId: task.id,
      activeTaskTitle: task.workshopTitle,
      lastError: undefined,
    });
  }

  private markWorkerIdle(lastError?: string) {
    this.workerStateStore.updateSnapshot({
      online: true,
      status: 'idle',
      runnerId: this.runnerId,
      heartbeatAt: new Date().toISOString(),
      activeTaskId: undefined,
      activeTaskTitle: undefined,
      lastError,
    });
  }

  private classifyFailure(message: string, stage: 'download' | 'login'): DownloadTaskFailureCode {
    const normalized = message.toLowerCase();

    if (
      normalized.includes('ld-linux.so.2')
      || normalized.includes('wrong elf class')
      || normalized.includes('steamcmd script not found')
      || normalized.includes('runtime is unavailable')
      || normalized.includes('required file not found')
      || normalized.includes('enoent')
      || normalized.includes('steamcmd runtime is busy')
    ) {
      return 'runtime_blocked';
    }

    if (
      normalized.includes('not logged on')
      || normalized.includes('cached credentials not found')
      || normalized.includes('no cached credentials')
      || normalized.includes('invalid password')
      || normalized.includes('login failure')
      || normalized.includes('steam guard')
      || normalized.includes('two-factor')
      || normalized.includes('missing decryption key')
      || normalized.includes('account logon denied')
    ) {
      return 'authentication_failed';
    }

    if (normalized.includes('interrupted') || normalized.includes('未完成')) {
      return 'interrupted';
    }

    if (stage === 'download') {
      return normalized.includes('download') ? 'download_failed' : 'unknown_error';
    }

    return 'unknown_error';
  }

  private scheduleProcessing() {
    if (this.workerLoopActive && !this.processingBatch) {
      void this.processPendingTasks();
    }
  }
}
