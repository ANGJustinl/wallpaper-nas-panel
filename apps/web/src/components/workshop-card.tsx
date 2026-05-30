import type { WorkshopItemSummary } from '../../../../packages/shared/src';

interface SelectionIntent {
  additive?: boolean;
  range?: boolean;
}

interface WorkshopCardProps {
  item: WorkshopItemSummary;
  selected: boolean;
  queueDisabled?: boolean;
  onToggleSelect: (itemId: string, intent?: SelectionIntent) => void;
  onQueue: (item: WorkshopItemSummary) => void;
}

function formatRating(value: number) {
  if (value <= 0) {
    return '未评分';
  }

  return `${value.toFixed(1)} / 5`;
}

function isSelectionControl(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest('.workshop-card__checkbox'));
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

export function WorkshopCard({ item, selected, queueDisabled = false, onToggleSelect, onQueue }: WorkshopCardProps) {
  return (
    <article
      className={`workshop-card${selected ? ' workshop-card--selected' : ''}`}
      data-workshop-item-id={item.id}
      onClick={(event) => {
        if (isDownloadButton(event.target) || isSelectionControl(event.target)) {
          return;
        }

        onToggleSelect(item.id, readSelectionIntent(event));
      }}
    >
      <div className="workshop-card__media">
        <div className="workshop-card__thumb">
          <img src={item.previewUrl} alt={`${item.title} 预览图`} loading="lazy" draggable={false} />
        </div>

        <label className="workshop-card__checkbox">
          <input
            type="checkbox"
            checked={selected}
            aria-label={`选择 ${item.title}`}
            onClick={(event) => {
              event.stopPropagation();
              onToggleSelect(item.id, readSelectionIntent(event));
            }}
            onChange={() => undefined}
          />
          <span>加入批量选择</span>
        </label>
      </div>

      <div className="workshop-card__body">
        <div className="workshop-card__meta-row">
          <p className="workshop-card__eyebrow">{item.source === 'featured' ? 'FEATURED' : 'SEARCH RESULT'}</p>
          <span className="workshop-card__rating">{formatRating(item.rating)}</span>
        </div>

        <h3>{item.title}</h3>
        <p className="workshop-card__author">作者: {item.author}</p>
        <p className="workshop-card__description">{item.description}</p>

        {item.tags.length ? (
          <ul className="workshop-card__tags" aria-label={`${item.title} 标签`}>
            {item.tags.slice(0, 5).map((tag) => (
              <li key={tag}>{tag}</li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="workshop-card__footer">
        <button
          type="button"
          className="signal-button"
          aria-label={`下载 ${item.title}`}
          title={`下载 ${item.title}`}
          disabled={queueDisabled}
          onClick={() => onQueue(item)}
        >
          {queueDisabled ? '正在加入…' : '加入下载'}
        </button>
      </div>
    </article>
  );
}
