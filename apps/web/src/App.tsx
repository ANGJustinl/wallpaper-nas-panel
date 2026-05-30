import { useEffect, useMemo, useState } from 'react';
import type {
  DownloaderRuntimeSnapshot,
  DownloadTask,
  DownloadedContentItem,
  SettingsSnapshot,
  WorkshopBrowseFilters,
  WorkshopItemSummary,
} from '../../../packages/shared/src';
import { DownloadProgressCoach, type DownloadCoachSummary } from './components/download-progress-coach';
import type { StatusBannerContent } from './components/status-banner';
import { clearTaskHistory, createTask, deleteDownloadedContent, deleteTask, fetchDownloadedContents, fetchSettings, fetchTasks, fetchWorkshopItems, formatApiError, retryTask } from './lib/api';
import { fallbackDownloadedContents, fallbackFeaturedItems, fallbackSettings, fallbackTasks } from './lib/fallback-data';
import { ContentPage } from './pages/content-page';
import { ExplorePage } from './pages/explore-page';
import { SteamLoginPage } from './pages/steam-login-page';
import { TasksPage } from './pages/tasks-page';
import { SettingsPage } from './pages/settings-page';

function createDefaultFilters(): WorkshopBrowseFilters {
  return {
    query: '',
    miscellaneous: [],
    genre: [],
    ageRating: '',
    type: '',
    resolution: '',
    category: '',
    assetType: '',
    assetGenre: '',
    scriptType: '',
    sort: 'trend',
    period: '30d',
  };
}

function cloneFilters(filters: WorkshopBrowseFilters): WorkshopBrowseFilters {
  return {
    ...filters,
    miscellaneous: [...filters.miscellaneous],
    genre: [...filters.genre],
  };
}

function countEnabledFilters(filters: WorkshopBrowseFilters) {
  return [
    filters.query.trim() ? 1 : 0,
    filters.miscellaneous.length,
    filters.genre.length,
    filters.ageRating ? 1 : 0,
    filters.type ? 1 : 0,
    filters.resolution ? 1 : 0,
    filters.category ? 1 : 0,
    filters.assetType ? 1 : 0,
    filters.assetGenre ? 1 : 0,
    filters.scriptType ? 1 : 0,
    filters.sort !== 'trend' ? 1 : 0,
    filters.period !== '30d' ? 1 : 0,
  ].reduce((total, count) => total + count, 0);
}

function createQueuedTask(item: WorkshopItemSummary, index: number): DownloadTask {
  const timestamp = new Date(Date.now() + (index * 1000)).toISOString();

  return {
    id: `task-queued-${item.id}`,
    workshopItemId: item.id,
    workshopTitle: item.title,
    status: 'pending',
    attempts: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
    logExcerpt: '已加入下载队列，等待 steamcmd 执行。',
  };
}

const fallbackRuntime: DownloaderRuntimeSnapshot = {
  available: false,
  steamCmdScriptPath: '',
  appId: '431960',
  workshopContentDir: '',
  worker: {
    online: false,
    status: 'offline',
  },
};

type DownloadCoachEntryState = 'submitting' | 'queued' | 'failed';

interface DownloadCoachEntry {
  workshopItemId: string;
  workshopTitle: string;
  taskId?: string;
  submissionState: DownloadCoachEntryState;
  errorMessage?: string;
  addedAt: number;
}

interface DownloadCoachState {
  visible: boolean;
  collapsed: boolean;
  items: DownloadCoachEntry[];
}

interface SelectionIntent {
  additive?: boolean;
  range?: boolean;
}

function upsertTask(current: DownloadTask[], nextTask: DownloadTask, staleTaskId?: string) {
  const withoutStale = staleTaskId ? current.filter((task) => task.id !== staleTaskId) : current;
  const existingIndex = withoutStale.findIndex((task) => task.id === nextTask.id);

  if (existingIndex === -1) {
    return [nextTask, ...withoutStale];
  }

  const merged = [...withoutStale];
  merged[existingIndex] = nextTask;
  return merged;
}

function findCoachTask(entry: DownloadCoachEntry, tasks: DownloadTask[]) {
  if (entry.taskId) {
    return tasks.find((task) => task.id === entry.taskId) ?? tasks.find((task) => task.workshopItemId === entry.workshopItemId);
  }

  return tasks.find((task) => task.workshopItemId === entry.workshopItemId);
}

function getCoachEntryStage(entry: DownloadCoachEntry, tasks: DownloadTask[]) {
  if (entry.submissionState === 'failed') {
    return 'failed';
  }

  if (entry.submissionState === 'submitting') {
    return 'submitting';
  }

  const task = findCoachTask(entry, tasks);
  if (!task) {
    return 'awaiting_sync';
  }

  return task.status;
}

function isCoachEntryTerminal(entry: DownloadCoachEntry, tasks: DownloadTask[]) {
  const stage = getCoachEntryStage(entry, tasks);
  return stage === 'succeeded' || stage === 'failed';
}

function mergeCoachEntries(current: DownloadCoachState | null, nextEntries: DownloadCoachEntry[], tasks: DownloadTask[]) {
  const carryForward = current?.items.filter((entry) => !isCoachEntryTerminal(entry, tasks)) ?? [];
  const byItemId = new Map<string, DownloadCoachEntry>();

  [...carryForward, ...nextEntries].forEach((entry) => {
    byItemId.set(entry.workshopItemId, entry);
  });

  return [...byItemId.values()].sort((left, right) => right.addedAt - left.addedAt);
}

function deriveDownloadCoachSummary(coach: DownloadCoachState | null, tasks: DownloadTask[]): DownloadCoachSummary | null {
  if (!coach?.items.length) {
    return null;
  }

  const counts = {
    submitting: 0,
    awaitingSync: 0,
    pending: 0,
    running: 0,
    succeeded: 0,
    failed: 0,
  };

  let weightTotal = 0;

  coach.items.forEach((entry) => {
    const stage = getCoachEntryStage(entry, tasks);

    switch (stage) {
      case 'submitting':
        counts.submitting += 1;
        weightTotal += 0.08;
        break;
      case 'awaiting_sync':
        counts.awaitingSync += 1;
        weightTotal += 0.25;
        break;
      case 'pending':
        counts.pending += 1;
        weightTotal += 0.42;
        break;
      case 'running':
        counts.running += 1;
        weightTotal += 0.76;
        break;
      case 'succeeded':
        counts.succeeded += 1;
        weightTotal += 1;
        break;
      case 'failed':
        counts.failed += 1;
        weightTotal += 1;
        break;
      default:
        break;
    }
  });

  const totalCount = coach.items.length;
  const activeCount = counts.submitting + counts.awaitingSync + counts.pending + counts.running;
  const hasFailures = counts.failed > 0;
  const allComplete = activeCount === 0;

  let headline = '下载队列已建立';
  let detail = '可以继续浏览和筛选其它项目，任务页会持续显示 worker 心跳和下载状态。';

  if (allComplete && hasFailures) {
    headline = '本批下载已结束，部分项目需要处理';
    detail = '有项目提交失败或下载失败，建议进入任务页查看错误详情并重试。';
  } else if (allComplete) {
    headline = '本批下载已完成';
    detail = `共 ${totalCount} 项，当前批次已经全部完成。`;
  } else if (counts.submitting > 0) {
    headline = '正在加入下载队列';
    detail = `正在把 ${totalCount} 项发送给后端，队列建立后会自动开始跟踪下载状态。`;
  } else if (counts.running > 0) {
    headline = `正在下载 ${counts.running} 项`;
    detail = '下载已经启动，可以继续筛选，也可以进入任务页查看详细进度。';
  } else if (counts.pending > 0 || counts.awaitingSync > 0) {
    headline = '队列已建立，等待 worker 开始';
    detail = '项目已经进入下载链路，任务页会显示排队、运行、失败和重试入口。';
  }

  return {
    totalCount,
    activeCount,
    progressPercent: Math.max(4, Math.min(100, Math.round((weightTotal / totalCount) * 100))),
    headline,
    detail,
    submittingCount: counts.submitting,
    awaitingSyncCount: counts.awaitingSync,
    pendingCount: counts.pending,
    runningCount: counts.running,
    succeededCount: counts.succeeded,
    failedCount: counts.failed,
    hasFailures,
    allComplete,
  };
}

export function App() {
  const [activeView, setActiveView] = useState<'explore' | 'tasks' | 'library' | 'settings' | 'login'>('explore');
  const [filters, setFilters] = useState<WorkshopBrowseFilters>(() => createDefaultFilters());
  const [draftFilters, setDraftFilters] = useState<WorkshopBrowseFilters>(() => createDefaultFilters());
  const [catalogRequestVersion, setCatalogRequestVersion] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedExploreItemId, setSelectedExploreItemId] = useState<string | null>(null);
  const [selectionAnchorId, setSelectionAnchorId] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<WorkshopItemSummary[]>(fallbackFeaturedItems);
  const [tasks, setTasks] = useState<DownloadTask[]>(fallbackTasks);
  const [downloadedContents, setDownloadedContents] = useState<DownloadedContentItem[]>([]);
  const [selectedContentId, setSelectedContentId] = useState<string | null>(null);
  const [settings, setSettings] = useState<SettingsSnapshot>(fallbackSettings);
  const [runtime, setRuntime] = useState<DownloaderRuntimeSnapshot>(fallbackRuntime);
  const [retryingTaskId, setRetryingTaskId] = useState<string | null>(null);
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);
  const [deletingContentId, setDeletingContentId] = useState<string | null>(null);
  const [isClearingHistory, setIsClearingHistory] = useState(false);
  const [lastTaskSyncAt, setLastTaskSyncAt] = useState<string | null>(null);
  const [lastLibrarySyncAt, setLastLibrarySyncAt] = useState<string | null>(null);
  const [isCatalogLoading, setIsCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [isCatalogFallback, setIsCatalogFallback] = useState(false);
  const [isTaskSyncing, setIsTaskSyncing] = useState(true);
  const [taskSyncError, setTaskSyncError] = useState<string | null>(null);
  const [isLibraryLoading, setIsLibraryLoading] = useState(true);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [isLibraryFallback, setIsLibraryFallback] = useState(false);
  const [libraryActionError, setLibraryActionError] = useState<string | null>(null);
  const [taskActionError, setTaskActionError] = useState<string | null>(null);
  const [isSettingsLoading, setIsSettingsLoading] = useState(true);
  const [hasLoadedSettings, setHasLoadedSettings] = useState(false);
  const [settingsLoadError, setSettingsLoadError] = useState<string | null>(null);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [queueingIds, setQueueingIds] = useState<string[]>([]);
  const [isBulkQueueing, setIsBulkQueueing] = useState(false);
  const [downloadCoach, setDownloadCoach] = useState<DownloadCoachState | null>(null);
  const [taskFocusToken, setTaskFocusToken] = useState(0);

  async function syncTasks() {
    setIsTaskSyncing(true);

    try {
      const response = await fetchTasks();
      setTasks(response.tasks);
      setLastTaskSyncAt(new Date().toISOString());
      setRuntime((current) => ({ ...current, worker: response.worker }));
      setTaskSyncError(null);
    } catch (error) {
      setTaskSyncError(formatApiError(error, '无法同步任务与 worker 状态。'));
    } finally {
      setIsTaskSyncing(false);
    }
  }

  async function syncLibrary() {
    setIsLibraryLoading(true);

    try {
      const response = await fetchDownloadedContents();
      setDownloadedContents(response.items);
      setSelectedContentId((current) => {
        if (current && response.items.some((item) => item.id === current)) {
          return current;
        }

        return response.items[0]?.id ?? null;
      });
      setLastLibrarySyncAt(new Date().toISOString());
      setLibraryError(null);
      setIsLibraryFallback(false);
    } catch (error) {
      setDownloadedContents(fallbackDownloadedContents);
      setSelectedContentId((current) => {
        if (current && fallbackDownloadedContents.some((item) => item.id === current)) {
          return current;
        }

        return fallbackDownloadedContents[0]?.id ?? null;
      });
      setLibraryError(formatApiError(error, '无法同步已下载内容。'));
      setIsLibraryFallback(true);
    } finally {
      setIsLibraryLoading(false);
    }
  }

  async function refreshSettings() {
    setIsSettingsLoading(true);

    try {
      const response = await fetchSettings();
      setSettings(response.settings);
      setRuntime(response.runtime);
      setHasLoadedSettings(true);
      setSettingsLoadError(null);
    } catch (error) {
      setSettingsLoadError(formatApiError(error, '无法读取后端设置。'));
    } finally {
      setIsSettingsLoading(false);
    }
  }

  useEffect(() => {
    let active = true;

    const guardedSyncTasks = async () => {
      setIsTaskSyncing(true);

      try {
        const response = await fetchTasks();
        if (!active) {
          return;
        }
        setTasks(response.tasks);
        setLastTaskSyncAt(new Date().toISOString());
        setRuntime((current) => ({ ...current, worker: response.worker }));
        setTaskSyncError(null);
      } catch (error) {
        if (active) {
          setTaskSyncError(formatApiError(error, '无法同步任务与 worker 状态。'));
        }
      } finally {
        if (active) {
          setIsTaskSyncing(false);
        }
      }
    };

    const guardedRefreshSettings = async () => {
      setIsSettingsLoading(true);

      try {
        const response = await fetchSettings();
        if (!active) {
          return;
        }
        setSettings(response.settings);
        setRuntime(response.runtime);
        setHasLoadedSettings(true);
        setSettingsLoadError(null);
      } catch (error) {
        if (active) {
          setSettingsLoadError(formatApiError(error, '无法读取后端设置。'));
        }
      } finally {
        if (active) {
          setIsSettingsLoading(false);
        }
      }
    };

    const guardedSyncLibrary = async () => {
      setIsLibraryLoading(true);

      try {
        const response = await fetchDownloadedContents();
        if (!active) {
          return;
        }
        setDownloadedContents(response.items);
        setSelectedContentId((current) => {
          if (current && response.items.some((item) => item.id === current)) {
            return current;
          }

          return response.items[0]?.id ?? null;
        });
        setLastLibrarySyncAt(new Date().toISOString());
        setLibraryError(null);
        setIsLibraryFallback(false);
      } catch (error) {
        if (active) {
          setDownloadedContents(fallbackDownloadedContents);
          setSelectedContentId((current) => {
            if (current && fallbackDownloadedContents.some((item) => item.id === current)) {
              return current;
            }

            return fallbackDownloadedContents[0]?.id ?? null;
          });
          setLibraryError(formatApiError(error, '无法同步已下载内容。'));
          setIsLibraryFallback(true);
        }
      } finally {
        if (active) {
          setIsLibraryLoading(false);
        }
      }
    };

    void guardedSyncTasks();
    const taskTimer = window.setInterval(() => {
      void guardedSyncTasks();
    }, 2500);

    void guardedRefreshSettings();
    void guardedSyncLibrary();
    const libraryTimer = window.setInterval(() => {
      void guardedSyncLibrary();
    }, 5000);

    return () => {
      active = false;
      window.clearInterval(taskTimer);
      window.clearInterval(libraryTimer);
    };
  }, []);

  useEffect(() => {
    let active = true;

    setIsCatalogLoading(true);

    fetchWorkshopItems(filters)
      .then((response) => {
        if (!active) {
          return;
        }
        setCatalog(response.items);
        setCatalogError(null);
        setIsCatalogFallback(false);
      })
      .catch((error) => {
        if (!active) {
          return;
        }
        const normalized = filters.query.trim().toLowerCase();
        const fallback = !normalized
          ? fallbackFeaturedItems
          : fallbackFeaturedItems.filter((item) => {
              const haystack = [item.title, item.author, item.description, ...item.tags].join(' ').toLowerCase();
              return haystack.includes(normalized);
            });
        setCatalog(fallback);
        setCatalogError(formatApiError(error, '无法刷新工坊结果。'));
        setIsCatalogFallback(true);
      })
      .finally(() => {
        if (active) {
          setIsCatalogLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [catalogRequestVersion, filters]);

  const visibleItems = useMemo(() => catalog, [catalog]);
  const enabledFilterCount = useMemo(() => countEnabledFilters(filters), [filters]);
  const activeTaskCount = useMemo(() => tasks.filter((task) => task.status === 'pending' || task.status === 'running').length, [tasks]);
  const downloadCoachSummary = useMemo(() => deriveDownloadCoachSummary(downloadCoach, tasks), [downloadCoach, tasks]);

  useEffect(() => {
    setSelectedContentId((current) => {
      if (current && downloadedContents.some((item) => item.id === current)) {
        return current;
      }

      return downloadedContents[0]?.id ?? null;
    });
  }, [downloadedContents]);

  useEffect(() => {
    setSelectedExploreItemId((current) => {
      if (current && visibleItems.some((item) => item.id === current)) {
        return current;
      }

      if (selectionAnchorId && visibleItems.some((item) => item.id === selectionAnchorId)) {
        return selectionAnchorId;
      }

      return null;
    });
  }, [selectionAnchorId, visibleItems]);

  useEffect(() => {
    if (!downloadCoachSummary?.allComplete || downloadCoachSummary.hasFailures) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setDownloadCoach((current) => (current ? null : current));
    }, 2600);

    return () => {
      window.clearTimeout(timer);
    };
  }, [downloadCoachSummary]);

  function applyFilters() {
    setFilters(cloneFilters(draftFilters));
    setSelectedIds([]);
    setSelectionAnchorId(null);
    setQueueError(null);
  }

  function clearFilters() {
    const nextDefaults = createDefaultFilters();
    setDraftFilters(nextDefaults);
    setFilters(createDefaultFilters());
    setSelectedIds([]);
    setSelectionAnchorId(null);
    setQueueError(null);
  }

  function applySelectionSnapshot(nextIds: string[], anchorId?: string | null, inspectedId?: string | null) {
    setSelectedIds(nextIds);
    setSelectionAnchorId(anchorId ?? nextIds.at(-1) ?? null);
    setSelectedExploreItemId(inspectedId ?? anchorId ?? nextIds.at(-1) ?? null);
  }

  function handleSelectionChange(nextIds: string[]) {
    applySelectionSnapshot(nextIds);
  }

  function toggleSelect(itemId: string, intent: SelectionIntent = {}) {
    const orderedIds = visibleItems.map((item) => item.id);

    if (intent.range && selectionAnchorId && orderedIds.includes(selectionAnchorId) && orderedIds.includes(itemId)) {
      const startIndex = orderedIds.indexOf(selectionAnchorId);
      const endIndex = orderedIds.indexOf(itemId);
      const rangeIds = orderedIds.slice(Math.min(startIndex, endIndex), Math.max(startIndex, endIndex) + 1);

      setSelectedIds((current) => intent.additive ? Array.from(new Set([...current, ...rangeIds])) : rangeIds);
      setSelectionAnchorId(itemId);
      setSelectedExploreItemId(itemId);
      return;
    }

    setSelectedIds((current) => current.includes(itemId) ? current.filter((id) => id !== itemId) : [...current, itemId]);
    setSelectionAnchorId(itemId);
    setSelectedExploreItemId(itemId);
  }

  function selectAllVisible() {
    const nextIds = visibleItems.map((item) => item.id);
    applySelectionSnapshot(nextIds, nextIds.at(-1) ?? null);
  }

  function clearSelection() {
    applySelectionSnapshot([], null);
  }

  async function submitQueueItem(item: WorkshopItemSummary, index: number) {
    const optimisticTask = createQueuedTask(item, index);
    setQueueingIds((current) => current.includes(item.id) ? current : [...current, item.id]);
    setTasks((current) => [optimisticTask, ...current]);

    try {
      const response = await createTask(item);
      setTasks((current) => upsertTask(current, response.task, optimisticTask.id));
      setTaskSyncError(null);
      return { item, ok: true as const, task: response.task };
    } catch (error) {
      const message = formatApiError(error, `无法将《${item.title}》加入下载队列。`);
      setTasks((current) => current.filter((task) => task.id !== optimisticTask.id));
      return { item, ok: false as const, error: message };
    } finally {
      setQueueingIds((current) => current.filter((id) => id !== item.id));
    }
  }

  async function queueItems(items: WorkshopItemSummary[], source: 'single' | 'bulk') {
    if (!items.length) {
      return;
    }

    setQueueError(null);
    setTaskActionError(null);
    const startedAt = Date.now();
    const seedEntries = items.map((item, index) => ({
      workshopItemId: item.id,
      workshopTitle: item.title,
      submissionState: 'submitting' as const,
      addedAt: startedAt + index,
    }));

    setDownloadCoach((current) => ({
      visible: true,
      collapsed: false,
      items: mergeCoachEntries(current, seedEntries, tasks),
    }));

    if (source === 'bulk') {
      setIsBulkQueueing(true);
    }

    const results = await Promise.allSettled(items.map((item, index) => submitQueueItem(item, tasks.length + index + 1)));
    const resolvedResults = results.map((result, index) => (
      result.status === 'fulfilled'
        ? result.value
        : { item: items[index], ok: false as const, error: formatApiError(result.reason, `无法将《${items[index].title}》加入下载队列。`) }
    ));
    const resultsByItemId = new Map(resolvedResults.map((result) => [result.item.id, result]));
    const failedResults = resolvedResults.filter((result) => !result.ok);

    setDownloadCoach((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        visible: true,
        collapsed: false,
        items: current.items.map((entry) => {
          const result = resultsByItemId.get(entry.workshopItemId);
          if (!result) {
            return entry;
          }

          if (result.ok) {
            return {
              ...entry,
              submissionState: 'queued',
              taskId: result.task.id,
              errorMessage: undefined,
            };
          }

          return {
            ...entry,
            submissionState: 'failed',
            errorMessage: result.error,
          };
        }),
      };
    });

    if (failedResults.length) {
      setQueueError(
        failedResults.length === 1
          ? failedResults[0].error
          : `${failedResults.length} 项未能加入下载队列。${failedResults[0]?.error ? ` 首个错误：${failedResults[0].error}` : ''}`,
      );
    }

    if (source === 'bulk') {
      const failedSelection = failedResults.map((result) => result.item.id);
      applySelectionSnapshot(failedSelection, failedSelection.at(-1) ?? null);
      setIsBulkQueueing(false);
    }
  }

  function bulkQueueSelected() {
    void queueItems(visibleItems.filter((item) => selectedIds.includes(item.id)), 'bulk');
  }

  function handleQueue(item: WorkshopItemSummary) {
    void queueItems([item], 'single');
  }

  function openTasksViewFromCoach() {
    setActiveView('tasks');
    setTaskFocusToken((current) => current + 1);
  }

  function handleRetry(taskId: string) {
    setRetryingTaskId(taskId);
    setTaskActionError(null);
    retryTask(taskId)
      .then((response) => {
        setTasks((current) => upsertTask(current, response.task));
      })
      .catch((error) => {
        setTaskActionError(formatApiError(error, '任务重试失败。'));
      })
      .finally(() => {
        setRetryingTaskId(null);
      });
  }

  function handleDeleteTask(taskId: string) {
    setDeletingTaskId(taskId);
    setTaskActionError(null);
    deleteTask(taskId)
      .then(() => {
        setTasks((current) => current.filter((task) => task.id !== taskId));
      })
      .catch((error) => {
        setTaskActionError(formatApiError(error, '删除历史记录失败。'));
      })
      .finally(() => {
        setDeletingTaskId(null);
      });
  }

  function handleClearHistory() {
    setIsClearingHistory(true);
    setTaskActionError(null);
    clearTaskHistory()
      .then(() => {
        setTasks((current) => current.filter((task) => task.status === 'pending' || task.status === 'running'));
      })
      .catch((error) => {
        setTaskActionError(formatApiError(error, '清理历史记录失败。'));
      })
      .finally(() => {
        setIsClearingHistory(false);
      });
  }

  function handleDeleteContent(workshopItemId: string) {
    setDeletingContentId(workshopItemId);
    setLibraryActionError(null);
    deleteDownloadedContent(workshopItemId)
      .then(() => {
        setDownloadedContents((current) => current.filter((item) => item.id !== workshopItemId));
      })
      .catch((error) => {
        setLibraryActionError(formatApiError(error, '移除内容记录失败。'));
      })
      .finally(() => {
        setDeletingContentId(null);
      });
  }

  function refreshCatalog() {
    setCatalogRequestVersion((current) => current + 1);
  }

  const exploreNotices = useMemo<StatusBannerContent[]>(() => {
    const notices: StatusBannerContent[] = [];

    if (queueError) {
      notices.push({
        tone: 'error',
        title: '下载请求未送达',
        detail: queueError,
      });
    }

    if (catalogError) {
      notices.push({
        tone: isCatalogFallback ? 'warning' : 'error',
        title: isCatalogFallback ? '工坊结果已降级' : '工坊结果暂不可用',
        detail: isCatalogFallback
          ? `${catalogError} 当前显示本地示例结果。`
          : catalogError,
        actionLabel: '重新加载',
        onAction: refreshCatalog,
      });
    }

    return notices;
  }, [catalogError, isCatalogFallback, queueError]);

  const taskNotices = useMemo<StatusBannerContent[]>(() => {
    const notices: StatusBannerContent[] = [];

    if (queueError) {
      notices.push({
        tone: 'error',
        title: '下载请求未送达',
        detail: queueError,
      });
    }

    if (taskActionError) {
      notices.push({
        tone: 'error',
        title: '任务操作失败',
        detail: taskActionError,
      });
    }

    if (taskSyncError) {
      notices.push({
        tone: 'warning',
        title: '任务状态同步失败',
        detail: `${taskSyncError}${lastTaskSyncAt ? ' 当前显示最近一次可用结果。' : ' 当前显示的是面板内置占位数据。'}`,
        actionLabel: '立即刷新',
        onAction: () => {
          void syncTasks();
        },
      });
    }

    return notices;
  }, [lastTaskSyncAt, queueError, taskActionError, taskSyncError]);

  const settingsNotices = useMemo<StatusBannerContent[]>(() => {
    if (!settingsLoadError) {
      return [];
    }

    return [{
      tone: 'warning',
      title: '后端设置尚未读取成功',
      detail: `${settingsLoadError}${hasLoadedSettings ? ' 当前保留的是上次成功读取的设置。' : ' 当前显示的是面板回退值。'}`,
      actionLabel: '重新读取',
      onAction: () => {
        void refreshSettings();
      },
    }];
  }, [hasLoadedSettings, settingsLoadError]);

  const libraryNotices = useMemo<StatusBannerContent[]>(() => {
    const notices: StatusBannerContent[] = [];

    if (libraryActionError) {
      notices.push({
        tone: 'error',
        title: '内容记录操作失败',
        detail: libraryActionError,
      });
    }

    if (queueError) {
      notices.push({
        tone: 'error',
        title: '下载请求未送达',
        detail: queueError,
      });
    }

    if (libraryError) {
      notices.push({
        tone: isLibraryFallback ? 'warning' : 'error',
        title: isLibraryFallback ? '内容库已降级到面板示例数据' : '内容库暂不可用',
        detail: isLibraryFallback
          ? `${libraryError} 当前显示的是本地示例内容记录。`
          : libraryError,
        actionLabel: '重新读取',
        onAction: () => {
          void syncLibrary();
        },
      });
    }

    return notices;
  }, [isLibraryFallback, libraryActionError, libraryError, queueError]);

  const showTaskAlert = activeView !== 'tasks' && Boolean(downloadCoachSummary?.activeCount || downloadCoachSummary?.hasFailures);

  return (
    <main className="app-shell">
      <div className="topbar">
        <div className="topbar__brand">
          <span className="topbar__title">Wallpaper Engine：壁纸引擎</span>
          <span className="topbar__subtitle">创意工坊 · NAS 管理面板</span>
        </div>
        <nav className="topbar__nav" aria-label="主导航">
          <a href="#" className={`topbar__nav-link${activeView === 'explore' ? ' is-active' : ''}`} onClick={(event) => { event.preventDefault(); setActiveView('explore'); }}>探索</a>
          <a
            href="#"
            className={`topbar__nav-link${activeView === 'tasks' ? ' is-active' : ''}${showTaskAlert ? ' topbar__nav-link--alert' : ''}`}
            onClick={(event) => {
              event.preventDefault();
              setActiveView('tasks');
            }}
          >
            <span>任务</span>
            {activeTaskCount ? <span className="topbar__nav-badge">{activeTaskCount}</span> : null}
          </a>
          <a
            href="#"
            className={`topbar__nav-link${activeView === 'library' ? ' is-active' : ''}`}
            onClick={(event) => {
              event.preventDefault();
              setActiveView('library');
            }}
          >
            <span>内容库</span>
            {downloadedContents.length ? <span className="topbar__nav-badge">{downloadedContents.length}</span> : null}
          </a>
          <a href="#" className={`topbar__nav-link${activeView === 'settings' ? ' is-active' : ''}`} onClick={(event) => { event.preventDefault(); setActiveView('settings'); }}>设置</a>
          <a href="#" className={`topbar__nav-link${activeView === 'login' ? ' is-active' : ''}`} onClick={(event) => { event.preventDefault(); setActiveView('login'); }}>Steam 登录</a>
        </nav>
      </div>

      {activeView === 'login' ? (
        <SteamLoginPage runtime={runtime} onBack={() => setActiveView('explore')} />
      ) : activeView === 'tasks' ? (
        <section className="page-shell">
          <TasksPage
            tasks={tasks}
            worker={runtime.worker}
            onRetry={handleRetry}
            onDeleteTask={handleDeleteTask}
            onClearHistory={handleClearHistory}
            retryingTaskId={retryingTaskId}
            deletingTaskId={deletingTaskId}
            isClearingHistory={isClearingHistory}
            lastSyncedAt={lastTaskSyncAt}
            isSyncing={isTaskSyncing}
            onRefresh={() => {
              void syncTasks();
            }}
            notices={taskNotices}
            focusRunningToken={taskFocusToken}
          />
        </section>
      ) : activeView === 'library' ? (
        <section className="page-shell">
          <ContentPage
            items={downloadedContents}
            selectedItemId={selectedContentId}
            deletingItemId={deletingContentId}
            isLoading={isLibraryLoading}
            lastSyncedAt={lastLibrarySyncAt}
            notices={libraryNotices}
            queueingItemIds={queueingIds}
            onRefresh={() => {
              void syncLibrary();
            }}
            onSelect={setSelectedContentId}
            onQueue={handleQueue}
            onDeleteRecord={handleDeleteContent}
          />
        </section>
      ) : activeView === 'settings' ? (
        <section className="page-shell">
          <SettingsPage
            settings={settings}
            runtime={runtime}
            onSettingsChange={setSettings}
            isRefreshing={isSettingsLoading}
            onRefresh={() => {
              void refreshSettings();
            }}
            notices={settingsNotices}
          />
        </section>
      ) : (
        <section className="page-shell page-shell--explore">
          <ExplorePage
            items={visibleItems}
            filters={filters}
            draftFilters={draftFilters}
            selectedIds={selectedIds}
            selectedItemId={selectedExploreItemId}
            onSelectionChange={handleSelectionChange}
            onInspectItem={setSelectedExploreItemId}
            onDraftChange={setDraftFilters}
            onApplyFilters={applyFilters}
            onClearFilters={clearFilters}
            onToggleSelect={toggleSelect}
            onSelectAll={selectAllVisible}
            onClearSelection={clearSelection}
            onBulkQueue={bulkQueueSelected}
            onQueue={handleQueue}
            onViewTasks={openTasksViewFromCoach}
            enabledFilterCount={enabledFilterCount}
            isLoading={isCatalogLoading}
            onRefresh={refreshCatalog}
            notices={exploreNotices}
            queueingItemIds={queueingIds}
            isBulkQueueing={isBulkQueueing}
          />
        </section>
      )}

      {downloadCoach?.visible && downloadCoachSummary && activeView !== 'tasks' ? (
        <DownloadProgressCoach
          summary={downloadCoachSummary}
          collapsed={downloadCoach.collapsed}
          onExpand={() => {
            setDownloadCoach((current) => current ? { ...current, collapsed: false } : current);
          }}
          onCollapse={() => {
            setDownloadCoach((current) => current ? { ...current, collapsed: true } : current);
          }}
          onViewTasks={openTasksViewFromCoach}
        />
      ) : null}
    </main>
  );
}
