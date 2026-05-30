import type { Request, Response } from 'express';
import type { AppContext } from '../app-context';

export function createDownloadedContentRoutes(context: AppContext) {
  function listContents(_request: Request, response: Response) {
    response.json({ items: context.downloadedContentStore.listContents() });
  }

  function deleteContent(request: Request, response: Response) {
    const workshopItemId = typeof request.params.id === 'string' ? request.params.id : '';
    if (!workshopItemId) {
      response.status(400).json({ error: 'Workshop item id is required' });
      return;
    }

    const deleted = context.downloadedContentStore.deleteContent(workshopItemId);
    if (!deleted) {
      response.status(404).json({ error: 'Downloaded content record not found' });
      return;
    }

    response.json({ ok: true });
  }

  return { listContents, deleteContent };
}
