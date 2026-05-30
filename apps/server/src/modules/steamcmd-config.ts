import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

const steamCmdConfigSchema = z.object({
  steamCmdScriptPath: z.string().min(1),
  appId: z.string().min(1),
  workshopContentDir: z.string().min(1),
  lockSocketPath: z.string().min(1),
  batchMaxItems: z.number().int().min(1),
  available: z.boolean(),
  availabilityError: z.string().optional(),
});

export type SteamCmdConfig = z.infer<typeof steamCmdConfigSchema>;

export function resolveSteamCmdConfig(): SteamCmdConfig {
  const batchMaxItems = Number.parseInt(process.env.STEAMCMD_BATCH_MAX_ITEMS ?? '20', 10);
  const scriptPath = resolve(process.env.STEAMCMD_SCRIPT_PATH ?? resolve(process.cwd(), '..', '..', 'steamcmd.sh'));
  const workshopContentDir = resolve(
    process.env.WORKSHOP_CONTENT_DIR ?? resolve(process.cwd(), '..', '..', '..', 'Steam', 'steamapps', 'workshop', 'content', '431960'),
  );
  const lockSocketPath = resolve(process.env.STEAMCMD_LOCK_SOCKET_PATH ?? '/data/locks/steamcmd.sock');

  const parsed = steamCmdConfigSchema.parse({
    steamCmdScriptPath: scriptPath,
    appId: process.env.STEAM_APP_ID ?? '431960',
    workshopContentDir,
    lockSocketPath,
    batchMaxItems: Number.isFinite(batchMaxItems) && batchMaxItems > 0 ? batchMaxItems : 20,
    available: existsSync(scriptPath),
    availabilityError: existsSync(scriptPath) ? undefined : `steamcmd script not found at ${scriptPath}`,
  });

  return parsed;
}
