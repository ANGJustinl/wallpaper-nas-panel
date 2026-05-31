import type { WorkshopItemSummary } from '../../../../packages/shared/src';

interface SelectionIntent {
  additive?: boolean;
  range?: boolean;
}

interface WorkshopCardProps {
  item: WorkshopItemSummary;
  selected: boolean;
  inspected?: boolean;
  queueState?: WorkshopQueueState;
  queueDisabled?: boolean;
  onInspect?: (itemId: string) => void;
  onToggleSelect: (itemId: string, intent?: SelectionIntent) => void;
  onQueue: (item: WorkshopItemSummary) => void;
}

export type WorkshopQueueState = 'idle' | 'queueing' | 'queued' | 'downloaded';

function formatRating(value: number) {
  if (value <= 0) {
    return '未评分';
  }

  return value.toFixed(1);
}

function isSelectionControl(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest('.workshop-row__checkbox'));
}

function isDownloadButton(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest('button'));
}

function readSelectionIntent(event: Pick<MouseEvent, 'ctrlKey' | 'metaKey' | 'shiftKey'>) {
  return {
    additive: event.ctrlKey || event.metaKey,
    range: event.shiftKey,
  };
}

function formatMetadataSummary(item: WorkshopItemSummary) {
  const segments = [
    item.metadata.type,
    item.metadata.category,
    item.metadata.genre.slice(0, 2).join(' / '),
    item.metadata.resolution,
  ].filter(Boolean);

  return segments.length ? segments.join(' · ') : '工坊项目';
}

function queueStateLabel(state: WorkshopQueueState) {
  switch (state) {
    case 'queueing':
      return '加入中';
    case 'queued':
      return '队列中';
    case 'downloaded':
      return '已入库';
    default:
      return null;
  }
}

function queueActionLabel(state: WorkshopQueueState) {
  switch (state) {
    case 'queueing':
      return '加入中';
    case 'queued':
      return '队列中';
    case 'downloaded':
      return '重新下载';
    default:
      return '加入下载';
  }
}

export function WorkshopCard({
  item,
  selected,
  inspected = false,
  queueState = 'idle',
  queueDisabled = false,
  onInspect,
  onToggleSelect,
  onQueue,
}: WorkshopCardProps) {
  const stateLabel = queueStateLabel(queueState);
  const actionLabel = queueActionLabel(queueState);
  const isQueueLocked = queueState === 'queueing' || queueState === 'queued' || queueDisabled;

  return (
    <article
      className={`workshop-row workshop-row--${queueState}${selected ? ' workshop-row--selected' : ''}${inspected ? ' workshop-row--inspected' : ''}`}
      data-workshop-item-id={item.id}
      aria-busy={queueState === 'queueing'}
      onClick={(event) => {
        if (isDownloadButton(event.target) || isSelectionControl(event.target)) {
          return;
        }

        onInspect?.(item.id);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onInspect?.(item.id);
        }
      }}
      role="button"
      tabIndex={0}
      aria-pressed={inspected}
    >
      <div className="workshop-row__thumb">
        {item.previewUrl ? (
          <img src={item.previewUrl} alt={`${item.title} 预览图`} loading="lazy" draggable={false} />
        ) : (
          <div className="workshop-row__thumb-placeholder" aria-label={`${item.title} 预览图`}>
            <span>{item.title.slice(0, 18)}</span>
          </div>
        )}
        <div className="workshop-row__badges" aria-hidden="true">
          {selected ? <span className="workshop-row__badge workshop-row__badge--selected">已选</span> : null}
          {inspected ? <span className="workshop-row__badge workshop-row__badge--inspected">查看中</span> : null}
          {stateLabel ? <span className={`workshop-row__badge workshop-row__badge--${queueState}`}>{stateLabel}</span> : null}
        </div>
      </div>

      <div className="workshop-row__main">
        <div className="workshop-row__titleline">
          <h3>{item.title}</h3>
          <span className="workshop-row__rating" title={item.rating > 0 ? `${item.rating.toFixed(1)} / 5` : '未评分'}>
            {formatRating(item.rating)}
          </span>
        </div>
        <p className="workshop-row__meta">作者 {item.author} · {formatMetadataSummary(item)}</p>
        {item.tags.length ? (
          <ul className="workshop-row__tags" aria-label={`${item.title} 标签`}>
            {item.tags.slice(0, 3).map((tag) => (
              <li key={tag}>{tag}</li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="workshop-row__actions">
        <label className="workshop-row__checkbox">
          <input
            type="checkbox"
            checked={selected}
            aria-label={`选择 ${item.title}`}
            onClick={(event) => {
              event.stopPropagation();
              onToggleSelect(item.id, readSelectionIntent(event));
              onInspect?.(item.id);
            }}
            onChange={() => undefined}
          />
          <span>选择</span>
        </label>

        <button
          type="button"
          className="signal-button signal-button--inline"
          aria-label={`${actionLabel} ${item.title}`}
          title={`${actionLabel} ${item.title}`}
          disabled={isQueueLocked}
          onClick={(event) => {
            event.stopPropagation();
            onQueue(item);
          }}
        >
          {actionLabel}
        </button>
      </div>
    </article>
  );
}
