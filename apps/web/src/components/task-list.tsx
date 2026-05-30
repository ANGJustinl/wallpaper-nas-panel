import type { DownloadTask } from '../../../../packages/shared/src';

interface TaskListProps {
  tasks: DownloadTask[];
  selectedTaskId?: string | null;
  emptyTitle: string;
  emptyCopy: string;
  retryingTaskId?: string | null;
  deletingTaskId?: string | null;
  onSelectTask?: (taskId: string) => void;
  onRetry?: (taskId: string) => void;
  onDeleteTask?: (taskId: string) => void;
}

export const statusLabel: Record<DownloadTask['status'], string> = {
  pending: '等待同步',
  running: '下载中',
  succeeded: '已完成',
  failed: '需要重试',
};

export const failureLabel: Record<NonNullable<DownloadTask['failureCode']>, string> = {
  runtime_blocked: '运行时环境阻塞',
  authentication_failed: '认证失败',
  download_failed: '下载失败',
  interrupted: '任务中断',
  unknown_error: '未知错误',
};

export function stripAnsi(value: string | undefined) {
  return (value ?? '').replace(/\u001b\[[0-9;]*m/g, '').trim();
}

export function formatTaskLog(task: DownloadTask) {
  const cleaned = stripAnsi(task.logExcerpt);

  const downloadingMatch = cleaned.match(/^Downloading item\s+(\d+)\s+\.\.\./i);
  if (downloadingMatch) {
    return `正在下载项目 ${downloadingMatch[1]}…`;
  }

  const downloadedMatch = cleaned.match(/^Success\.\s+Downloaded item\s+(\d+)\s+to\s+(.+)$/i);
  if (downloadedMatch) {
    return `项目 ${downloadedMatch[1]} 已下载完成，正在整理输出目录。`;
  }

  if (/download in progress/i.test(cleaned)) {
    return 'steamcmd 已开始拉取工坊文件。';
  }

  if (/waiting for project\.json/i.test(cleaned)) {
    return '工坊文件已返回，正在等待项目元数据。';
  }

  if (/logging in using cached credentials/i.test(cleaned)) {
    return '正在验证缓存登录态。';
  }

  return cleaned;
}

export function formatTaskError(task: DownloadTask) {
  return stripAnsi(task.errorMessage);
}

export function deriveTaskProgress(task: DownloadTask) {
  const log = formatTaskLog(task);

  if (task.status === 'pending') {
    return {
      value: 18,
      label: '等待 worker 接管',
      detail: task.logExcerpt ? log : '任务已进入队列，等待 downloader worker 开始执行。',
      indeterminate: false,
    };
  }

  if (task.status === 'running') {
    if (/整理输出目录|下载完成/.test(log)) {
      return {
        value: 92,
        label: '整理下载结果',
        detail: log || '下载主体已经完成，正在同步最终输出目录。',
        indeterminate: false,
      };
    }

    if (/正在下载项目/.test(log)) {
      return {
        value: 72,
        label: '正在拉取工坊文件',
        detail: log,
        indeterminate: true,
      };
    }

    return {
      value: 58,
      label: '下载进行中',
      detail: log || 'steamcmd 已启动，正在持续拉取工坊内容。',
      indeterminate: true,
    };
  }

  if (task.status === 'succeeded') {
    const successDetail = /下载完成|输出目录|已同步/.test(log)
      ? log
      : '项目已完成下载并整理到输出目录。';

    return {
      value: 100,
      label: '下载完成',
      detail: successDetail,
      indeterminate: false,
    };
  }

  return {
    value: 100,
    label: '下载失败',
    detail: formatTaskError(task) || log || '下载未完成，请查看错误详情后重试。',
    indeterminate: false,
  };
}

export function TaskList({
  tasks,
  selectedTaskId = null,
  emptyTitle,
  emptyCopy,
  retryingTaskId = null,
  deletingTaskId = null,
  onSelectTask,
  onRetry,
  onDeleteTask,
}: TaskListProps) {
  if (!tasks.length) {
    return (
      <div className="workspace-empty">
        <h3>{emptyTitle}</h3>
        <p>{emptyCopy}</p>
      </div>
    );
  }

  return (
    <div className="task-list">
      {tasks.map((task) => {
        const progress = deriveTaskProgress(task);
        const isSelected = task.id === selectedTaskId;

        return (
          <article
            key={task.id}
            className={`task-row task-row--${task.status}${isSelected ? ' task-row--selected' : ''}`}
            onClick={() => onSelectTask?.(task.id)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onSelectTask?.(task.id);
              }
            }}
            role="button"
            tabIndex={0}
            aria-pressed={isSelected}
          >
            <div className="task-row__main">
              <div className="task-row__titleline">
                <div>
                  <p className="task-row__status">{statusLabel[task.status]}</p>
                  <h3>{task.workshopTitle}</h3>
                </div>
                <div className="task-row__meta">
                  <span>{task.runnerId || '未分配 runner'}</span>
                  <span>{task.updatedAt}</span>
                </div>
              </div>

              <div className="task-row__progress">
                <div className="task-row__progress-head">
                  <strong>{progress.label}</strong>
                  <span>{progress.value}%</span>
                </div>
                <div className={`task-row__progress-bar${progress.indeterminate ? ' task-row__progress-bar--indeterminate' : ''}`} aria-hidden="true">
                  <div className="task-row__progress-fill" style={{ width: `${progress.value}%` }} />
                </div>
                <p className="task-row__log">{progress.detail}</p>
              </div>
            </div>

            <div className="task-row__aside">
              <div className="task-row__facts">
                <p><span>项目 ID</span><strong>{task.workshopItemId}</strong></p>
                <p><span>尝试次数</span><strong>{task.attempts}</strong></p>
              </div>

              {(task.status === 'failed' && onRetry) || onDeleteTask ? (
                <div className="task-row__actions">
                  {task.status === 'failed' && onRetry ? (
                    <button
                      className="signal-button signal-button--secondary signal-button--inline"
                      onClick={(event) => {
                        event.stopPropagation();
                        onRetry(task.id);
                      }}
                      disabled={retryingTaskId === task.id}
                    >
                      {retryingTaskId === task.id ? '重新排队中…' : '重新加入下载'}
                    </button>
                  ) : null}
                  {onDeleteTask ? (
                    <button
                      className="signal-button signal-button--ghost signal-button--inline"
                      aria-label={`删除记录 ${task.workshopTitle}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        onDeleteTask(task.id);
                      }}
                      disabled={deletingTaskId === task.id}
                    >
                      {deletingTaskId === task.id ? '删除中…' : '删除记录'}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}
