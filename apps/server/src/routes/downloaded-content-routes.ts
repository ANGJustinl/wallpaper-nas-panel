import type { Request, Response } from 'express';
import type { AppContext } from '../app-context';
import { writeWorkshopMetadata } from '../modules/nfo-writer';

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

    const deleteFiles = request.query.deleteFiles === 'true';
    let result: ReturnType<typeof context.downloadedContentStore.deleteContent>;

    try {
      result = context.downloadedContentStore.deleteContent(workshopItemId, { deleteFiles });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete downloaded content files';
      response.status(500).json({ error: message });
      return;
    }

    if (!result.recordDeleted) {
      response.status(404).json({ error: 'Downloaded content record not found' });
      return;
    }

    response.json({ ok: true, deletedFiles: result.deletedFiles, outputPath: result.outputPath });
  }

  function rescanContents(_request: Request, response: Response) {
    const settings = context.settingsStore.getSnapshot();
    const errors: Array<{ id: string; title: string; message: string }> = [];
    let updatedCount = 0;

    context.downloadedContentStore.listContents().forEach((content) => {
      try {
        if (settings.autoGenerateNfo) {
          writeWorkshopMetadata({
            workshopItem: content,
            outputPath: content.outputPath,
            downloadedAt: content.downloadedAt,
            taskId: content.lastTaskId,
            settings,
          });
        }
        context.downloadedContentStore.refreshDirectoryFacts(content.id, content.outputPath);
        updatedCount += 1;
      } catch (error) {
        errors.push({
          id: content.id,
          title: content.title,
          message: error instanceof Error ? error.message : 'Unknown rescan error',
        });
      }
    });

    response.json({
      ok: errors.length === 0,
      updatedCount,
      items: context.downloadedContentStore.listContents(),
      errors,
    });
  }

  return { listContents, deleteContent, rescanContents };
}
