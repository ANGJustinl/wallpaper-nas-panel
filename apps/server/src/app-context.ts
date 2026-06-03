import type { WorkshopItemSummary } from '../../../packages/shared/src';
import { DownloadQueue } from './modules/download-queue';
import { DownloadedContentStore } from './modules/downloaded-content-store';
import { SettingsStore } from './modules/settings-store';
import { SteamCmdAdapter } from './modules/steamcmd-adapter';
import type { SteamCmdConfig } from './modules/steamcmd-config';
import { SteamLoginService } from './modules/steam-login-service';
import { SteamLoginStore } from './modules/steam-login-store';
import { SteamCmdSocketLock } from './modules/steamcmd-socket-lock';
import { SteamCmdLogStore } from './modules/steamcmd-log-store';
import { TaskStore } from './modules/task-store';
import { WorkerStateStore } from './modules/worker-state-store';

export interface AppContext {
  featuredWorkshopItems: WorkshopItemSummary[];
  downloadedContentStore: DownloadedContentStore;
  taskStore: TaskStore;
  settingsStore: SettingsStore;
  steamCmdConfig: SteamCmdConfig;
  steamCmdAdapter: SteamCmdAdapter;
  steamCmdLock: SteamCmdSocketLock;
  steamCmdLogStore: SteamCmdLogStore;
  steamLoginStore: SteamLoginStore;
  steamLoginService: SteamLoginService;
  workerStateStore: WorkerStateStore;
  downloadQueue: DownloadQueue;
}
