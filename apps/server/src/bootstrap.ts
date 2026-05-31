import { type AppContext } from './app-context';
import { DownloadQueue } from './modules/download-queue';
import { DownloadedContentStore } from './modules/downloaded-content-store';
import { writeWorkshopMetadata } from './modules/nfo-writer';
import { createDatabase, migrateDatabase } from './modules/database';
import { SettingsStore, settingsDefaults } from './modules/settings-store';
import { SteamCmdAdapter } from './modules/steamcmd-adapter';
import { resolveSteamCmdConfig } from './modules/steamcmd-config';
import { SteamLoginService } from './modules/steam-login-service';
import { SteamLoginStore } from './modules/steam-login-store';
import { SteamCmdSocketLock } from './modules/steamcmd-socket-lock';
import { featuredWorkshopItems } from './modules/workshop-catalog';
import { seedTaskStore } from './modules/task-seed';
import { TaskStore } from './modules/task-store';
import { WorkerStateStore } from './modules/worker-state-store';

export function createAppContext(): AppContext {
  const database = createDatabase();
  migrateDatabase(database);

  const taskStore = new TaskStore(database);
  const downloadedContentStore = new DownloadedContentStore(database);
  const settingsStore = new SettingsStore(database);
  const steamCmdConfig = resolveSteamCmdConfig();
  const steamCmdAdapter = new SteamCmdAdapter(steamCmdConfig);
  const steamCmdLock = new SteamCmdSocketLock(steamCmdConfig.lockSocketPath);
  const steamLoginStore = new SteamLoginStore(database);
  const steamLoginService = new SteamLoginService(steamCmdAdapter, steamLoginStore, settingsStore, steamCmdLock);
  const workerStateStore = new WorkerStateStore(database);
  const downloadQueue = new DownloadQueue(
    taskStore,
    downloadedContentStore,
    steamCmdAdapter,
    settingsStore,
    workerStateStore,
    steamCmdLock,
    steamCmdConfig.batchMaxItems,
  );

  return {
    featuredWorkshopItems,
    downloadedContentStore,
    taskStore,
    settingsStore,
    steamCmdConfig,
    steamCmdAdapter,
    steamCmdLock,
    steamLoginStore,
    steamLoginService,
    workerStateStore,
    downloadQueue,
  };
}

export function seedApplicationData(context: AppContext) {
  context.settingsStore.seedDefaults();
  context.steamLoginStore.seedDefaults(settingsDefaults.steamAccountName);
  context.workerStateStore.seedDefaults();
  seedTaskStore(context.taskStore);
  context.downloadedContentStore.backfillFromSucceededTasks(context.taskStore.listSucceededLibraryCandidates());
  backfillWorkshopNfo(context);
}

function backfillWorkshopNfo(context: AppContext) {
  const settings = context.settingsStore.getSnapshot();
  if (!settings.autoGenerateNfo) {
    return;
  }

  context.downloadedContentStore.listContents().forEach((content) => {
    try {
      writeWorkshopMetadata({
        workshopItem: content,
        outputPath: content.outputPath,
        downloadedAt: content.downloadedAt,
        taskId: content.lastTaskId,
        settings,
      });
      context.downloadedContentStore.refreshDirectoryFacts(content.id, content.outputPath);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown NFO error';
      console.warn(`failed to backfill NFO for workshop item ${content.id}: ${message}`);
    }
  });
}

export function activateDownloadWorker(context: AppContext) {
  context.downloadQueue.startWorkerLoop();
}
