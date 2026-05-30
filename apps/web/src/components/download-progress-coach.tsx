export interface DownloadCoachSummary {
  totalCount: number;
  activeCount: number;
  progressPercent: number;
  headline: string;
  detail: string;
  submittingCount: number;
  awaitingSyncCount: number;
  pendingCount: number;
  runningCount: number;
  succeededCount: number;
  failedCount: number;
  hasFailures: boolean;
  allComplete: boolean;
}

interface DownloadProgressCoachProps {
  summary: DownloadCoachSummary;
  collapsed: boolean;
  onExpand: () => void;
  onCollapse: () => void;
  onViewTasks: () => void;
}

function createStatusLine(summary: DownloadCoachSummary) {
  const parts = [
    summary.submittingCount ? `提交中 ${summary.submittingCount}` : '',
    summary.awaitingSyncCount ? `等待同步 ${summary.awaitingSyncCount}` : '',
    summary.pendingCount ? `排队 ${summary.pendingCount}` : '',
    summary.runningCount ? `下载中 ${summary.runningCount}` : '',
    summary.succeededCount ? `完成 ${summary.succeededCount}` : '',
    summary.failedCount ? `失败 ${summary.failedCount}` : '',
  ].filter(Boolean);

  return parts.join(' · ') || '等待队列状态同步';
}

export function DownloadProgressCoach({
  summary,
  collapsed,
  onExpand,
  onCollapse,
  onViewTasks,
}: DownloadProgressCoachProps) {
  if (collapsed) {
    return (
      <aside className={`download-coach download-coach--collapsed${summary.hasFailures ? ' download-coach--warning' : ''}`} aria-live="polite">
        <button type="button" className="download-coach__chip" onClick={onExpand}>
          <span>下载进度</span>
          <strong>{summary.activeCount > 0 ? `${summary.activeCount} 项进行中` : `${summary.totalCount} 项已结束`}</strong>
        </button>
        <button type="button" className="signal-button signal-button--secondary signal-button--inline" onClick={onViewTasks}>
          查看任务
        </button>
      </aside>
    );
  }

  return (
    <aside className={`download-coach${summary.hasFailures ? ' download-coach--warning' : ''}`} aria-live="polite">
      <div className="download-coach__header">
        <div className="download-coach__copy">
          <p className="section-kicker">Download Queue</p>
          <h3>{summary.headline}</h3>
          <p>{summary.detail}</p>
        </div>
        <div className="download-coach__percent">
          <span>进度</span>
          <strong>{summary.progressPercent}%</strong>
        </div>
      </div>

      <div className="download-coach__bar" aria-hidden="true">
        <div className="download-coach__bar-fill" style={{ width: `${summary.progressPercent}%` }} />
      </div>

      <div className="download-coach__stats">
        <p>{createStatusLine(summary)}</p>
      </div>

      <div className="download-coach__actions">
        <button type="button" className="signal-button signal-button--inline" onClick={onViewTasks}>
          查看任务
        </button>
        <button type="button" className="signal-button signal-button--secondary signal-button--inline" onClick={onCollapse}>
          收起
        </button>
      </div>
    </aside>
  );
}
