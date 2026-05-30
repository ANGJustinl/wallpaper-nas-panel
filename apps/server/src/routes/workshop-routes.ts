import type { Request, Response } from 'express';
import type { WorkshopTagFilters } from '../../../../packages/shared/src';
import type { AppContext } from '../app-context';
import { fetchWorkshopItems } from '../modules/workshop-fetcher';

function readQueryList(value: unknown) {
  const rawValues = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];

  return rawValues
    .flatMap((entry) => entry.split(','))
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export function createWorkshopRoutes(context: AppContext) {
  async function listWorkshopItems(request: Request, response: Response) {
    try {
      const query = typeof request.query.q === 'string' ? request.query.q.trim() : '';
      const sort = typeof request.query.sort === 'string' ? request.query.sort.trim() : 'trend';
      const period = typeof request.query.period === 'string' ? request.query.period.trim() : '30d';
      const filters: WorkshopTagFilters = {
        miscellaneous: readQueryList(request.query.miscellaneous),
        genre: readQueryList(request.query.genre),
        ageRating: typeof request.query.ageRating === 'string' ? request.query.ageRating.trim() : '',
        type: typeof request.query.type === 'string' ? request.query.type.trim() : '',
        resolution: typeof request.query.resolution === 'string' ? request.query.resolution.trim() : '',
        category: typeof request.query.category === 'string' ? request.query.category.trim() : '',
        assetType: typeof request.query.assetType === 'string' ? request.query.assetType.trim() : '',
        assetGenre: typeof request.query.assetGenre === 'string' ? request.query.assetGenre.trim() : '',
        scriptType: typeof request.query.scriptType === 'string' ? request.query.scriptType.trim() : '',
      };
      const items = await fetchWorkshopItems({ query, sort, period, ...filters }, context.settingsStore.getSnapshot());
      response.json({ items, total: items.length, query, sort, period, filters });
    } catch (error) {
      response.status(502).json({
        error: error instanceof Error ? error.message : 'failed to fetch workshop items',
      });
    }
  }

  return { listWorkshopItems };
}
