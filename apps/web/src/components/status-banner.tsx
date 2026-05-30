export type StatusBannerTone = 'info' | 'warning' | 'error' | 'success';

export interface StatusBannerContent {
  tone: StatusBannerTone;
  title: string;
  detail: string;
  actionLabel?: string;
  onAction?: () => void;
}

interface StatusBannerProps extends StatusBannerContent {
  compact?: boolean;
}

export function StatusBanner({ tone, title, detail, actionLabel, onAction, compact = false }: StatusBannerProps) {
  return (
    <div className={`status-banner status-banner--${tone}${compact ? ' status-banner--compact' : ''}`} role="status">
      <div className="status-banner__body">
        <strong>{title}</strong>
        <p>{detail}</p>
      </div>
      {actionLabel && onAction ? (
        <button type="button" className="status-banner__action" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
