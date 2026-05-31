import { useEffect, useMemo, useRef, useState } from 'react';
import type { DownloadTask, DownloaderWorkerSnapshot } from '../../../../packages/shared/src';
import { StatusBanner, type StatusBannerContent } from '../components/status-banner';
import { TaskList, deriveTaskProgress, failureLabel, formatTaskError, formatTaskLog, statusLabel } from '../components/task-list';

interface TasksPageProps {
  tasks: DownloadTask[];
  worker: DownloaderWorkerSnapshot;
  retryingTaskId: string | null;
  deletingTaskId: string | null;
  isClearingHistory: boolean;
  lastSyncedAt: string | null;
  isSyncing: boolean;
  notices: StatusBannerContent[];
  focusRunningToken: number;
  onRefresh: () => void;
  onRetry: (taskId: string) => void;
  onDeleteTask: (taskId: string) => void;
  onClearHistory: () => void;
}

const workerStatusLabel: Record<DownloaderWorkerSnapshot['status'], string> = {
  offline: '离线',
  idle: '待命',
  processing: '处理中',
};

const activeTaskRank: Record<DownloadTask['status'], number> = {
  running: 0,
  pending: 1,
  failed: 2,
  succeeded: 3,
};

const historyTaskRank: Record<DownloadTask['status'], number> = {
  failed: 0,
  succeeded: 1,
  running: 2,
  pending: 3,
};

function compareTaskFreshness(left: DownloadTask, right: DownloadTask) {
  return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
}

export function TasksPage({
  tasks,
  worker,
  retryingTaskId,
  deletingTaskId,
  isClearingHistory,
  lastSyncedAt,
  isSyncing,
  notices,
  focusRunningToken,
  onRefresh,
  onRetry,
  onDeleteTask,
  onClearHistory,
}: TasksPageProps) {
  const runningTasks = useMemo(
    () => tasks
      .filter((task) => task.status === 'running' || task.status === 'pending')
      .sort((left, right) => activeTaskRank[left.status] - activeTaskRank[right.status] || compareTaskFreshness(left, right)),
    [tasks],
  );
  const historyTasks = useMemo(
    () => tasks
      .filter((task) => task.status === 'succeeded' || task.status === 'failed')
      .sort((left, right) => historyTaskRank[left.status] - historyTaskRank[right.status] || compareTaskFreshness(left, right)),
    [tasks],
  );
  const failedTasks = historyTasks.filter((task) => task.status === 'failed').length;
  const succeededTasks = historyTasks.filter((task) => task.status === 'succeeded').length;
  const workerHeadlineStatus = worker.online
    ? worker.status === 'processing'
      ? '工作中'
      : workerStatusLabel[worker.status]
    : '离线';
  const [viewMode, setViewMode] = useState<'active' | 'history'>(runningTasks.length ? 'active' : 'history');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(runningTasks[0]?.id ?? historyTasks[0]?.id ?? null);
  const listSectionRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (focusRunningToken <= 0) {
      return undefined;
    }

    setViewMode('active');
    setSelectedTaskId((current) => current && runningTasks.some((task) => task.id === current) ? current : runningTasks[0]?.id ?? null);
    listSectionRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    return undefined;
  }, [focusRunningToken, runningTasks]);

  useEffect(() => {
    if (viewMode === 'active' && !runningTasks.length && historyTasks.length) {
      setViewMode('history');
      return;
    }

    if (viewMode === 'history' && !historyTasks.length && runningTasks.length) {
      setViewMode('active');
    }
  }, [historyTasks.length, runningTasks.length, viewMode]);

  const visibleTasks = viewMode === 'active' ? runningTasks : historyTasks;
  const quickHistoryTasks = historyTasks.slice(0, 3);

  useEffect(() => {
    setSelectedTaskId((current) => current && visibleTasks.some((task) => task.id === current) ? current : visibleTasks[0]?.id ?? null);
  }, [visibleTasks]);

  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? null;
  const selectedProgress = selectedTask ? deriveTaskProgress(selectedTask) : null;

  return (
    <section className="tasks-layout">
      {notices.length ? (
        <div className="page-notices">
          {notices.map((notice) => (
            <StatusBanner key={`${notice.title}-${notice.tone}`} {...notice} />
          ))}
        </div>
      ) : null}

      <header className="workspace-header workspace-header--page">
        <div>
          <h2>下载任务</h2>
          <p className="workspace-header__meta">队列、进度和失败重试。</p>
        </div>
        <div className="workspace-header__actions">
          <button type="button" className="signal-button signal-button--secondary signal-button--inline" onClick={onRefresh}>
            {isSyncing ? '刷新中…' : '立即刷新'}
          </button>
          <button
            type="button"
            className="signal-button signal-button--ghost signal-button--inline"
            onClick={onClearHistory}
            disabled={isClearingHistory || historyTasks.length === 0}
          >
            {isClearingHistory ? '清理中…' : '清理历史记录'}
          </button>
        </div>
      </header>

      <div className="stat-strip">
        <div className="compact-stat">
          <span>活跃任务</span>
          <strong>{runningTasks.length}</strong>
        </div>
        <div className="compact-stat">
          <span>失败</span>
          <strong>{failedTasks}</strong>
        </div>
        <div className="compact-stat">
          <span>已完成</span>
          <strong>{succeededTasks}</strong>
        </div>
        <div className="compact-stat">
          <span>Worker</span>
          <strong>{workerHeadlineStatus}</strong>
        </div>
        <div className="compact-stat">
          <span>最近同步</span>
          <strong>{lastSyncedAt || '暂无'}</strong>
        </div>
      </div>

      <div className="workspace-split">
        <section ref={listSectionRef} className="workspace-panel workspace-panel--main">
          <div className="workspace-segmented">
            <button
              type="button"
              className={`workspace-segmented__button${viewMode === 'active' ? ' is-active' : ''}`}
              onClick={() => setViewMode('active')}
            >
              <span>进行中</span>
              <strong>{runningTasks.length}</strong>
            </button>
            <button
              type="button"
              className={`workspace-segmented__button${viewMode === 'history' ? ' is-active' : ''}`}
              onClick={() => setViewMode('history')}
            >
              <span>历史</span>
              <strong>{historyTasks.length}</strong>
            </button>
          </div>

          <div className="panel-copy">
            <h3>{viewMode === 'active' ? '进行中的任务' : '历史任务'}</h3>
            <p>{viewMode === 'active' ? '正在执行和等待 worker 接管的任务。' : '失败可重试，成功和失败记录可删除。'}</p>
          </div>

          <TaskList
            tasks={visibleTasks}
            selectedTaskId={selectedTaskId}
            emptyTitle={viewMode === 'active' ? '当前没有进行中的任务' : '还没有任务历史'}
            emptyCopy={viewMode === 'active' ? '从探索页选择作品后，任务会自动出现在这里。' : '一旦出现成功或失败记录，就会在这里保留。'}
            onSelectTask={setSelectedTaskId}
            onRetry={onRetry}
            onDeleteTask={viewMode === 'history' ? onDeleteTask : undefined}
            retryingTaskId={retryingTaskId}
            deletingTaskId={deletingTaskId}
          />
        </section>

        <aside className="workspace-panel workspace-panel--inspector">
          {selectedTask ? (
            <>
              <div className="inspector-header">
                <p className="inspector-label">任务详情</p>
                <h3>{selectedTask.workshopTitle}</h3>
                <p>{selectedTask.workshopItemId}</p>
              </div>

              <div className="task-inspector__progress">
                <div className="task-row__progress-head">
                  <strong>{selectedProgress?.label}</strong>
                  <span>{selectedProgress?.value ?? 0}%</span>
                </div>
                <div className={`task-row__progress-bar${selectedProgress?.indeterminate ? ' task-row__progress-bar--indeterminate' : ''}`} aria-hidden="true">
                  <div className="task-row__progress-fill" style={{ width: `${selectedProgress?.value ?? 0}%` }} />
                </div>
                <p className="task-row__log">{selectedProgress?.detail}</p>
              </div>

              <dl className="inspector-facts">
                <div>
                  <dt>状态</dt>
                  <dd>{statusLabel[selectedTask.status]}</dd>
                </div>
                <div>
                  <dt>Runner</dt>
                  <dd>{selectedTask.runnerId || '未分配'}</dd>
                </div>
                <div>
                  <dt>尝试次数</dt>
                  <dd>{selectedTask.attempts}</dd>
                </div>
                <div>
                  <dt>开始时间</dt>
                  <dd>{selectedTask.startedAt || '未开始'}</dd>
                </div>
                <div>
                  <dt>结束时间</dt>
                  <dd>{selectedTask.finishedAt || '进行中'}</dd>
                </div>
                <div>
                  <dt>输出目录</dt>
                  <dd>{selectedTask.outputPath || '尚未生成'}</dd>
                </div>
                {selectedTask.failureCode ? (
                  <div>
                    <dt>失败类型</dt>
                    <dd>{failureLabel[selectedTask.failureCode]}</dd>
                  </div>
                ) : null}
              </dl>

              {selectedTask.errorMessage ? (
                <section className="inspector-section">
                  <h4>错误详情</h4>
                  <p>{formatTaskError(selectedTask)}</p>
                </section>
              ) : null}

              <section className="inspector-section">
                <h4>最近输出</h4>
                <p>{formatTaskLog(selectedTask)}</p>
              </section>
            </>
          ) : (
            <div className="workspace-empty workspace-empty--inspector">
              <h3>选择一个任务</h3>
              <p>右侧会显示状态、错误、进度和输出目录。</p>
            </div>
          )}

          <div className="inspector-divider" />

          <section className="inspector-section">
            <h4>Worker 运行态</h4>
            <dl className="inspector-facts">
              <div>
                <dt>下载器状态</dt>
                <dd>{worker.online ? workerStatusLabel[worker.status] : '离线'}</dd>
              </div>
              <div>
                <dt>当前任务</dt>
                <dd>{worker.activeTaskTitle || worker.activeTaskId || '空闲中'}</dd>
              </div>
              <div>
                <dt>心跳</dt>
                <dd>{worker.heartbeatAt || '暂无'}</dd>
              </div>
              {worker.runnerId ? (
                <div>
                  <dt>Runner</dt>
                  <dd>{worker.runnerId}</dd>
                </div>
              ) : null}
            </dl>
            {worker.lastError ? <p className="inspector-inline-error">最近错误：{worker.lastError}</p> : null}
          </section>

          {quickHistoryTasks.length ? (
            <section className="inspector-section">
              <h4>最近历史</h4>
              <div className="history-strip">
                {quickHistoryTasks.map((task) => (
                  <article key={task.id} className="history-strip__item">
                    <div className="history-strip__titleline">
                      <strong>{task.workshopTitle}</strong>
                      <span>{task.status === 'failed' ? failureLabel[task.failureCode ?? 'unknown_error'] : '已完成'}</span>
                    </div>
                    <p>{formatTaskLog(task)}</p>
                    {task.status === 'failed' && formatTaskError(task) ? <span className="history-strip__error">{formatTaskError(task)}</span> : null}
                    <div className="history-strip__actions">
                      {task.status === 'failed' ? (
                        <button
                          type="button"
                          className="signal-button signal-button--secondary signal-button--inline"
                          onClick={() => onRetry(task.id)}
                          disabled={retryingTaskId === task.id}
                        >
                          {retryingTaskId === task.id ? '重新排队中…' : '重新加入下载'}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="signal-button signal-button--ghost signal-button--inline"
                        aria-label={`删除记录 ${task.workshopTitle}`}
                        onClick={() => onDeleteTask(task.id)}
                        disabled={deletingTaskId === task.id}
                      >
                        {deletingTaskId === task.id ? '删除中…' : '删除记录'}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : null}
        </aside>
      </div>
    </section>
  );
}
