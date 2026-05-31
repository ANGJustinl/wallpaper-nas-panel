import type { Request, Response } from 'express';
import type { SettingsSnapshot } from '../../../../packages/shared/src';
import type { AppContext } from '../app-context';

export function createSettingsRoutes(context: AppContext) {
  function getRuntimeSnapshot() {
    return {
      available: context.steamCmdConfig.available,
      steamCmdScriptPath: context.steamCmdConfig.steamCmdScriptPath,
      appId: context.steamCmdConfig.appId,
      workshopContentDir: context.steamCmdConfig.workshopContentDir,
      availabilityError: context.steamCmdConfig.availabilityError,
      worker: context.workerStateStore.getSnapshot(),
    };
  }

  function getSettings(_request: Request, response: Response) {
    response.json({ settings: context.settingsStore.getSnapshot(), runtime: getRuntimeSnapshot() });
  }

  function updateSettings(request: Request, response: Response) {
    const current = context.settingsStore.getSnapshot();
    const patch = request.body as Partial<SettingsSnapshot>;

    const next: SettingsSnapshot = {
      ...current,
      ...patch,
      mediaLibrary: {
        ...current.mediaLibrary,
        ...patch.mediaLibrary,
      },
      contentLibrary: {
        ...current.contentLibrary,
        ...patch.contentLibrary,
      },
      proxy: {
        ...current.proxy,
        ...patch.proxy,
      },
    };

    response.json({ settings: context.settingsStore.updateSnapshot(next), runtime: getRuntimeSnapshot() });
  }

  return { getSettings, updateSettings };
}
