import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Request, Response } from 'express';
import type { AppContext } from '../app-context';
import { writeWorkshopMetadata } from '../modules/nfo-writer';
import { identifySteamWorkshopFolders } from '../modules/steam-workshop-library';
import { normalizeWorkshopMetadata } from '../modules/workshop-item-metadata';
import type { WorkshopItemSummary } from '../../../../packages/shared/src';

function uniqueValues(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const normalized = value.trim();
    const lookup = normalized.toLowerCase();
    if (!normalized || seen.has(lookup)) {
      return false;
    }

    seen.add(lookup);
    return true;
  });
}

function isFallbackAuthor(value: string) {
  return !value.trim() || value === 'Steam Workshop' || value === '本地 Steam 目录' || value === '未知作者';
}

function mergeIdentifiedWorkshopItem(
  identifiedItem: WorkshopItemSummary,
  existingItem: WorkshopItemSummary | null,
  taskItem: WorkshopItemSummary | null,
): WorkshopItemSummary {
  const preferredItem = taskItem ?? existingItem ?? identifiedItem;
  const tags = uniqueValues([
    ...(taskItem?.tags ?? []),
    ...(existingItem?.tags ?? []),
    ...identifiedItem.tags,
  ]);
  const author = taskItem?.author && !isFallbackAuthor(taskItem.author)
    ? taskItem.author
    : existingItem?.author && !isFallbackAuthor(existingItem.author)
      ? existingItem.author
      : identifiedItem.author;
  const previewUrl = taskItem?.previewUrl || existingItem?.previewUrl || identifiedItem.previewUrl;
  const rating = taskItem?.rating && taskItem.rating > 0
    ? taskItem.rating
    : existingItem?.rating && existingItem.rating > 0
      ? existingItem.rating
      : identifiedItem.rating;

  return {
    ...identifiedItem,
    title: preferredItem.title || identifiedItem.title,
    author,
    previewUrl,
    rating,
    tags,
    description: preferredItem.description || identifiedItem.description,
    source: preferredItem.source ?? identifiedItem.source,
    metadata: normalizeWorkshopMetadata(taskItem?.metadata ?? existingItem?.metadata ?? identifiedItem.metadata, tags),
  };
}

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

  function getContentPreview(request: Request, response: Response) {
    const workshopItemId = typeof request.params.id === 'string' ? request.params.id : '';
    if (!workshopItemId) {
      response.status(400).json({ error: 'Workshop item id is required' });
      return;
    }

    const previewPath = context.downloadedContentStore.getLocalPreviewPath(workshopItemId);
    if (!previewPath) {
      response.status(404).json({ error: 'Downloaded content preview not found' });
      return;
    }

    response.sendFile(resolve(previewPath));
  }

  function rescanContents(_request: Request, response: Response) {
    const settings = context.settingsStore.getSnapshot();
    const errors: Array<{ id: string; title: string; message: string }> = [];
    let updatedCount = 0;

    context.downloadedContentStore.listContents().forEach((content) => {
      try {
        context.steamCmdAdapter.syncCachedItemToOutput(content.id, content.outputPath);

        if (settings.autoGenerateNfo && existsSync(content.outputPath)) {
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

  function identifySteamWorkshopContents(_request: Request, response: Response) {
    const settings = context.settingsStore.getSnapshot();
    const identification = identifySteamWorkshopFolders(context.steamCmdConfig.workshopContentDir);
    const errors = [...identification.errors];
    let importedCount = 0;

    identification.folders.forEach(({ item, outputPath, discoveredAt }) => {
      const task = context.taskStore.getTaskByWorkshopItemId(item.id);
      const taskItem = task ? context.taskStore.getTaskWorkshopItem(task.id) : null;
      const mergedItem = mergeIdentifiedWorkshopItem(item, context.downloadedContentStore.getContent(item.id), taskItem);
      const lastTaskId = task?.id ?? `steam-workshop-${item.id}`;

      try {
        context.downloadedContentStore.recordContent(mergedItem, outputPath, {
          downloadedAt: discoveredAt,
          lastTaskId,
        });

        if (settings.autoGenerateNfo && existsSync(outputPath)) {
          writeWorkshopMetadata({
            workshopItem: mergedItem,
            outputPath,
            downloadedAt: discoveredAt,
            taskId: lastTaskId,
            settings,
          });
        }

        context.downloadedContentStore.refreshDirectoryFacts(item.id, outputPath);
        importedCount += 1;
      } catch (error) {
        errors.push({
          id: mergedItem.id,
          path: outputPath,
          message: error instanceof Error ? error.message : 'Unknown Steam workshop scrape error',
        });
      }
    });

    response.json({
      ok: errors.length === 0,
      workshopContentDir: identification.workshopContentDir,
      scannedCount: identification.scannedCount,
      importedCount,
      items: context.downloadedContentStore.listContents(),
      errors,
    });
  }

  return { listContents, deleteContent, getContentPreview, rescanContents, identifySteamWorkshopContents };
}
