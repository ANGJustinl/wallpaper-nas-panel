import type { Request, Response } from 'express';
import type { WorkshopItemSummary } from '../../../../packages/shared/src';
import type { AppContext } from '../app-context';
import { normalizeWorkshopMetadata } from '../modules/workshop-item-metadata';

function readString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function readStringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
}

export function createTaskRoutes(context: AppContext) {
  function listTasks(_request: Request, response: Response) {
    response.json({ tasks: context.taskStore.listTasks(), worker: context.workerStateStore.getSnapshot() });
  }

  function createTask(request: Request, response: Response) {
    const itemId = readString(request.body?.itemId);
    const itemTitle = readString(request.body?.itemTitle, itemId);

    if (!itemId) {
      response.status(400).json({ error: 'Workshop item id is required' });
      return;
    }

    const tags = readStringList(request.body?.tags);
    const workshopItem: WorkshopItemSummary = {
      id: itemId,
      title: itemTitle,
      author: readString(request.body?.author, '未知作者'),
      previewUrl: readString(request.body?.previewUrl),
      rating: typeof request.body?.rating === 'number' ? request.body.rating : 0,
      tags,
      description: readString(request.body?.description, '暂无简介。'),
      source: request.body?.source === 'search' ? 'search' : 'featured',
      metadata: normalizeWorkshopMetadata(
        typeof request.body?.metadata === 'object' && request.body.metadata ? request.body.metadata as WorkshopItemSummary['metadata'] : undefined,
        tags,
      ),
    };

    const task = context.downloadQueue.createTask(workshopItem);
    response.status(201).json({ task });
  }

  function retryTask(request: Request, response: Response) {
    const taskId = typeof request.params.id === 'string' ? request.params.id : '';
    if (!taskId) {
      response.status(400).json({ error: 'Task id is required' });
      return;
    }

    const task = context.downloadQueue.retryTask(taskId);
    if (!task) {
      response.status(404).json({ error: 'Retryable task not found' });
      return;
    }

    response.status(202).json({ task });
  }

  function deleteTask(request: Request, response: Response) {
    const taskId = typeof request.params.id === 'string' ? request.params.id : '';
    if (!taskId) {
      response.status(400).json({ error: 'Task id is required' });
      return;
    }

    const deleted = context.taskStore.deleteTask(taskId);
    if (!deleted) {
      response.status(404).json({ error: 'Deletable history task not found' });
      return;
    }

    response.json({ ok: true });
  }

  function clearHistory(_request: Request, response: Response) {
    const deletedCount = context.taskStore.deleteFinishedTasks();
    response.json({ ok: true, deletedCount });
  }

  return { listTasks, createTask, retryTask, deleteTask, clearHistory };
}
