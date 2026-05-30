import type { Request, Response } from 'express';
import type { SteamLoginRequest } from '../../../../packages/shared/src';
import type { AppContext } from '../app-context';

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

  return { triggerLogin, getLoginState };
}
