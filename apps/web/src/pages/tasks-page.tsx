import { useEffect, useRef, useState } from 'react';
import type { DownloadTask, DownloaderWorkerSnapshot } from '../../../../packages/shared/src';
import { StatusBanner, type StatusBannerContent } from '../components/status-banner';
import { TaskList } from '../components/task-list';

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
  const runningTasks = tasks.filter((task) => task.status === 'running' || task.status === 'pending');
  const finishedTasks = tasks.filter((task) => task.status === 'succeeded' || task.status === 'failed');
  const totalTasks = tasks.length;
  const failedTasks = tasks.filter((task) => task.status === 'failed').length;
  const succeededTasks = tasks.filter((task) => task.status === 'succeeded').length;
  const workerTone = worker.online ? worker.status : 'offline';
  const runningSectionRef = useRef<HTMLElement | null>(null);
  const [isRunningFocused, setIsRunningFocused] = useState(false);

  useEffect(() => {
    if (focusRunningToken <= 0) {
      return undefined;
    }

    runningSectionRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    setIsRunningFocused(true);

    const timer = window.setTimeout(() => {
      setIsRunningFocused(false);
    }, 2200);

    return () => {
      window.clearTimeout(timer);
    };
  }, [focusRunningToken]);

  return (
    <section className="tasks-layout">
      <div className="tasks-summary">
        <div>
          <span>总任务数</span>
          <strong>{totalTasks}</strong>
        </div>
        <div>
          <span>进行中</span>
          <strong>{runningTasks.length}</strong>
        </div>
        <div>
          <span>失败</span>
          <strong>{failedTasks}</strong>
        </div>
        <div>
          <span>已完成</span>
          <strong>{succeededTasks}</strong>
        </div>
      </div>

      <section className="tasks-overview-panel">
        <div className="tasks-overview-panel__copy">
          <p className="section-kicker">Download Overview</p>
          <h2>下载队列总览</h2>
          <p className="section-copy">用阶段进度条看队列推进情况，历史区提供删除和失败重试，不再靠原始日志硬读状态。</p>
        </div>
        <div className="tasks-overview-panel__progress">
          <div className="tasks-overview-panel__progress-head">
            <strong>{runningTasks.length ? `当前有 ${runningTasks.length} 项正在推进` : '当前没有活动下载'}</strong>
            <span>{totalTasks ? Math.round(((succeededTasks + failedTasks) / totalTasks) * 100) : 0}%</span>
          </div>
          <div className="tasks-overview-panel__progress-bar" aria-hidden="true">
            <div
              className="tasks-overview-panel__progress-fill"
              style={{ width: `${totalTasks ? Math.round(((succeededTasks + failedTasks) / totalTasks) * 100) : 0}%` }}
            />
          </div>
          <p className="tasks-overview-panel__meta">
            {runningTasks.length ? '进行中任务会持续刷新进度与阶段文案。' : '可以继续从探索页加入项目，任务页会自动接管后续状态更新。'}
          </p>
        </div>
      </section>

      {notices.length ? (
        <div className="page-notices">
          {notices.map((notice) => (
            <StatusBanner key={`${notice.title}-${notice.tone}`} {...notice} />
          ))}
        </div>
      ) : null}

      <div className="tasks-sync-bar">
        <div className="tasks-sync-bar__copy">
          <p className="section-kicker">任务同步</p>
          <p className="tasks-sync-note">
            {isSyncing ? '任务状态自动刷新中 · 正在同步最新状态' : `任务状态自动刷新中${lastSyncedAt ? ` · 最近同步 ${lastSyncedAt}` : ''}`}
          </p>
        </div>
        <button type="button" className="signal-button signal-button--secondary signal-button--inline" onClick={onRefresh}>
          {isSyncing ? '刷新中…' : '立即刷新'}
        </button>
      </div>

      <section className={`ops-status-panel tasks-worker-card tasks-worker-card--${workerTone}`}>
        <div className="ops-status-panel__header">
          <div>
            <p className="section-kicker">Worker Runtime</p>
            <h2>下载器运行面板</h2>
          </div>
          <p className="ops-status-panel__summary">队列、runner 和心跳在这里集中可见，方便快速判断下载链路是否在线。</p>
        </div>

        <div className="ops-metric-grid ops-metric-grid--4">
          <div className="ops-metric-card">
            <span>下载器状态</span>
            <strong>{worker.online ? workerStatusLabel[worker.status] : '离线'}</strong>
          </div>
          <div className="ops-metric-card">
            <span>Runner</span>
            <strong>{worker.runnerId || '未启动'}</strong>
          </div>
          <div className="ops-metric-card">
            <span>当前任务</span>
            <strong>{worker.activeTaskTitle || worker.activeTaskId || '空闲中'}</strong>
          </div>
          <div className="ops-metric-card">
            <span>心跳</span>
            <strong>{worker.heartbeatAt || '暂无'}</strong>
          </div>
        </div>

        {worker.lastError ? <p className="ops-status-panel__error">最近错误：{worker.lastError}</p> : null}
      </section>

      <section
        ref={runningSectionRef}
        className={`panel-section panel-section--tasks panel-section--tasks-primary${isRunningFocused ? ' panel-section--focus' : ''}`}
      >
        <div className="section-heading">
          <p className="section-kicker">下载活动</p>
          <h2>进行中的任务</h2>
          <p className="section-copy">查看下载状态、执行时间，以及当前进行中的 steamcmd 队列。</p>
        </div>
        <TaskList
          tasks={runningTasks}
          emptyTitle="当前没有进行中的任务"
          emptyCopy="从探索页选择作品后，下载任务会出现在这里，并自动刷新状态。"
          onRetry={onRetry}
          retryingTaskId={retryingTaskId}
        />
      </section>

      <section className="panel-section panel-section--tasks panel-section--tasks-secondary">
        <div className="section-heading section-heading--split">
          <div className="section-heading__copy">
            <p className="section-kicker">任务历史</p>
            <h2>已完成与失败</h2>
            <p className="section-copy">集中查看已完成项、失败项和后续重试入口。</p>
          </div>
          <div className="section-heading__actions">
            <button
              type="button"
              className="signal-button signal-button--secondary signal-button--inline"
              onClick={onClearHistory}
              disabled={isClearingHistory || finishedTasks.length === 0}
            >
              {isClearingHistory ? '清理中…' : '清理历史记录'}
            </button>
          </div>
        </div>
        <TaskList
          tasks={finishedTasks}
          emptyTitle="还没有任务历史"
          emptyCopy="一旦有成功或失败的下载记录，就会在这里保留并提供诊断信息。"
          onRetry={onRetry}
          onDeleteTask={onDeleteTask}
          retryingTaskId={retryingTaskId}
          deletingTaskId={deletingTaskId}
          variant="history"
        />
      </section>
    </section>
  );
}
