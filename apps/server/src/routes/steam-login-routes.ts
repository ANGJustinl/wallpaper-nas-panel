import type { Request, Response } from 'express';
import type { SteamLoginRequest } from '../../../../packages/shared/src';
import type { AppContext } from '../app-context';
import { createLogsResponse, readPositiveInteger, streamLogs } from './steamcmd-log-stream';

export function createSteamLoginRoutes(context: AppContext) {
  async function triggerLogin(request: Request, response: Response) {
    const payload = request.body as Partial<SteamLoginRequest>;

    if (!payload.steamAccountName || !payload.steamPassword) {
      response.status(400).json({ error: 'steamAccountName and steamPassword are required' });
      return;
    }

    const state = await context.steamLoginService.login({
      steamAccountName: payload.steamAccountName,
      steamPassword: payload.steamPassword,
      steamGuardCode: payload.steamGuardCode,
    });
    response.status(202).json({ state });
  }

  function getLoginState(_request: Request, response: Response) {
    response.json({ state: context.steamLoginService.getState() });
  }

  function listLoginLogs(request: Request, response: Response) {
    const after = readPositiveInteger(request.query.after, 0);
    const limit = readPositiveInteger(request.query.limit, 500, 1000);
    const events = context.steamCmdLogStore.listLoginLogs({ after, limit });
    response.json(createLogsResponse(events));
  }

  function streamLoginLogs(request: Request, response: Response) {
    const after = readPositiveInteger(request.query.after, 0);
    const initialEvents = context.steamCmdLogStore.listLoginLogs({ after, limit: 1000 });
    streamLogs(
      response,
      context.steamCmdLogStore,
      initialEvents,
      (event) => event.scope === 'login',
    );
  }

  return { triggerLogin, getLoginState, listLoginLogs, streamLoginLogs };
}
