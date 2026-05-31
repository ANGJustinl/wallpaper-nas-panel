import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { WorkshopBrowseFilters, WorkshopItemSummary } from '../../../../packages/shared/src';
import { StatusBanner, type StatusBannerContent } from '../components/status-banner';
import { WorkshopCard, type WorkshopQueueState } from '../components/workshop-card';

interface ExplorePageProps {
  items: WorkshopItemSummary[];
  filters: WorkshopBrowseFilters;
  draftFilters: WorkshopBrowseFilters;
  selectedIds: string[];
  selectedItemId: string | null;
  onSelectionChange: (nextIds: string[]) => void;
  onInspectItem: (itemId: string | null) => void;
  enabledFilterCount: number;
  isLoading: boolean;
  notices: StatusBannerContent[];
  onDraftChange: (next: WorkshopBrowseFilters) => void;
  onApplyFilters: () => void;
  onClearFilters: () => void;
  onRefresh: () => void;
  onViewTasks: () => void;
  onToggleSelect: (itemId: string, intent?: { additive?: boolean; range?: boolean }) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onBulkQueue: () => void;
  onQueue: (item: WorkshopItemSummary) => void;
  queueingItemIds: string[];
  queuedItemIds: string[];
  downloadedItemIds: string[];
  isBulkQueueing: boolean;
}

interface SelectionRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface DragSelectionState {
  pointerId: number;
  startX: number;
  startY: number;
  additive: boolean;
  baseSelection: string[];
}

const filterGroups = {
  genre: [
    { label: 'Abstract', value: 'Abstract', count: '70,338' },
    { label: 'Animal', value: 'Animal', count: '36,866' },
    { label: 'Anime', value: 'Anime', count: '703,457' },
    { label: 'Cartoon', value: 'Cartoon', count: '58,059' },
    { label: 'CGI', value: 'CGI', count: '19,097' },
    { label: 'Cyberpunk', value: 'Cyberpunk', count: '27,809' },
    { label: 'Fantasy', value: 'Fantasy', count: '43,037' },
    { label: 'Game', value: 'Game', count: '456,297' },
    { label: 'Girls', value: 'Girls', count: '115,157' },
    { label: 'Guys', value: 'Guys', count: '16,475' },
    { label: 'Landscape', value: 'Landscape', count: '48,730' },
    { label: 'Medieval', value: 'Medieval', count: '9,053' },
    { label: 'Memes', value: 'Memes', count: '39,614' },
    { label: 'MMD', value: 'MMD', count: '31,746' },
    { label: 'Music', value: 'Music', count: '129,243' },
    { label: 'Nature', value: 'Nature', count: '27,559' },
    { label: 'Pixel art', value: 'Pixel art', count: '14,818' },
    { label: 'Relaxing', value: 'Relaxing', count: '22,610' },
    { label: 'Retro', value: 'Retro', count: '14,291' },
    { label: 'Sci-Fi', value: 'Sci-Fi', count: '48,135' },
    { label: 'Sports', value: 'Sports', count: '4,065' },
    { label: 'Technology', value: 'Technology', count: '20,241' },
    { label: 'Television', value: 'Television', count: '11,348' },
    { label: 'Vehicle', value: 'Vehicle', count: '17,206' },
    { label: 'Unspecified', value: 'Unspecified', count: '5,411' },
  ],
  miscellaneous: [
    { label: 'Approved', value: 'Approved', count: '16,774' },
    { label: 'Audio responsive', value: 'Audio responsive', count: '269,405' },
    { label: '3D', value: '3D', count: '826' },
    { label: 'Customizable', value: 'Customizable', count: '106,061' },
    { label: 'Puppet Warp', value: 'Puppet Warp', count: '10,361' },
    { label: 'HDR', value: 'HDR', count: '24,199' },
    { label: 'Media Integration', value: 'Media Integration', count: '22,393' },
    { label: 'User Shortcut', value: 'User Shortcut', count: '240' },
    { label: 'Video Texture', value: 'Video Texture', count: '46,276' },
    { label: 'Asset Pack', value: 'Asset Pack', count: '222' },
  ],
};

const selectOptions = {
  type: ['<未选择>', 'Scene', 'Video', 'Application', 'Web'],
  ageRating: ['<未选择>', 'Everyone', 'Questionable', 'Mature'],
  resolution: ['<未选择>', 'Dynamic resolution', '1920 x 1080', '2560 x 1440', '3840 x 2160', 'Ultrawide 3440 x 1440', 'Portrait 1080 x 1920'],
  category: ['<未选择>', 'Wallpaper', 'Preset', 'Asset'],
  assetType: ['<未选择>', 'Particle', 'Image', 'Sound', 'Model', 'Text', 'Sprite', 'Fullscreen', 'Composite', 'Script', 'Effect', 'Scripted Layer'],
  assetGenre: ['<未选择>', 'Audio Visualizer', 'Background', 'Character', 'Clock', 'Fire', 'Interactive', 'Magic', 'Post Processing', 'Smoke', 'Space'],
  scriptType: ['<未选择>', 'Boolean', 'Number', 'Vec2', 'Vec3', 'Vec4', 'String', 'No Animation', 'Oversized'],
};

const selectLabels: Record<Exclude<keyof typeof selectOptions, number | symbol>, string> = {
  type: 'TYPE',
  ageRating: 'AGE RATING',
  resolution: 'RESOLUTION',
  category: 'CATEGORY',
  assetType: 'ASSET TYPE',
  assetGenre: 'ASSET GENRE',
  scriptType: 'SCRIPT TYPE',
};

function toggleFilterValue(values: string[], value: string, checked: boolean) {
  if (checked) {
    return values.includes(value) ? values : [...values, value];
  }

  return values.filter((entry) => entry !== value);
}

function createTagline(filters: WorkshopBrowseFilters, count: number) {
  const queryLabel = filters.query.trim() || '全部项目';
  return `${queryLabel} · ${count} 项结果`;
}

function isInteractiveTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest('button, input, label, a, select, textarea'));
}

function rectanglesIntersect(a: DOMRect, b: { left: number; top: number; right: number; bottom: number }) {
  return a.right >= b.left && a.left <= b.right && a.bottom >= b.top && a.top <= b.bottom;
}

function formatMetadataValue(values: string[] | string) {
  if (Array.isArray(values)) {
    return values.length ? values.join(' / ') : '未记录';
  }

  return values || '未记录';
}

function deriveQueueState(
  itemId: string,
  queueingLookup: Set<string>,
  queuedLookup: Set<string>,
  downloadedLookup: Set<string>,
): WorkshopQueueState {
  if (queueingLookup.has(itemId)) {
    return 'queueing';
  }

  if (queuedLookup.has(itemId)) {
    return 'queued';
  }

  if (downloadedLookup.has(itemId)) {
    return 'downloaded';
  }

  return 'idle';
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

function queueStateLabel(state: WorkshopQueueState) {
  switch (state) {
    case 'queueing':
      return '加入下载队列';
    case 'queued':
      return '已在任务队列';
    case 'downloaded':
      return '已在内容库';
    default:
      return null;
  }
}

export function ExplorePage({
  items,
  filters,
  draftFilters,
  selectedIds,
  selectedItemId,
  onSelectionChange,
  onInspectItem,
  enabledFilterCount,
  isLoading,
  notices,
  onDraftChange,
  onApplyFilters,
  onClearFilters,
  onRefresh,
  onViewTasks,
  onToggleSelect,
  onSelectAll,
  onClearSelection,
  onBulkQueue,
  onQueue,
  queueingItemIds,
  queuedItemIds,
  downloadedItemIds,
  isBulkQueueing,
}: ExplorePageProps) {
  const selectedCount = selectedIds.length;
  const selectedLookup = useMemo(() => new Set(selectedIds), [selectedIds]);
  const queueingLookup = useMemo(() => new Set(queueingItemIds), [queueingItemIds]);
  const queuedLookup = useMemo(() => new Set(queuedItemIds), [queuedItemIds]);
  const downloadedLookup = useMemo(() => new Set(downloadedItemIds), [downloadedItemIds]);
  const queueableSelectedCount = selectedIds.filter((itemId) => !queueingLookup.has(itemId) && !queuedLookup.has(itemId)).length;
  const resultsTagline = createTagline(filters, items.length);
  const selectedItem = items.find((item) => item.id === selectedItemId) ?? null;
  const selectedItemQueueState = selectedItem
    ? deriveQueueState(selectedItem.id, queueingLookup, queuedLookup, downloadedLookup)
    : 'idle';
  const selectedItemQueueLocked = selectedItemQueueState === 'queueing' || selectedItemQueueState === 'queued';
  const sidebarRef = useRef<HTMLElement | null>(null);
  const sidebarScrollRef = useRef<HTMLDivElement | null>(null);
  const resultsGridRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<DragSelectionState | null>(null);
  const [dragRect, setDragRect] = useState<SelectionRect | null>(null);
  const [isDragSelecting, setIsDragSelecting] = useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);

  useEffect(() => () => {
    document.body.style.userSelect = '';
  }, []);

  useEffect(() => {
    if (!isSelectionMode) {
      return undefined;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        finishDragSelection();
        setIsSelectionMode(false);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isSelectionMode]);

  useEffect(() => {
    const sidebar = sidebarRef.current;
    if (!sidebar) {
      return undefined;
    }

    function handleSidebarWheel(event: WheelEvent) {
      if (window.innerWidth <= 1160) {
        return;
      }

      const scrollContainer = sidebarScrollRef.current;
      if (!scrollContainer || scrollContainer.scrollHeight <= scrollContainer.clientHeight) {
        return;
      }

      scrollContainer.scrollTop += event.deltaY;
      event.preventDefault();
    }

    sidebar.addEventListener('wheel', handleSidebarWheel, { passive: false });
    return () => {
      sidebar.removeEventListener('wheel', handleSidebarWheel);
    };
  }, []);

  function readIntersectedItemIds(selectionBounds: { left: number; top: number; right: number; bottom: number }) {
    const container = resultsGridRef.current;
    if (!container) {
      return [];
    }

    return [...container.querySelectorAll<HTMLElement>('[data-workshop-item-id]')]
      .filter((card) => rectanglesIntersect(card.getBoundingClientRect(), selectionBounds))
      .map((card) => card.dataset.workshopItemId ?? '')
      .filter(Boolean);
  }

  function finishDragSelection() {
    dragStateRef.current = null;
    setDragRect(null);
    setIsDragSelecting(false);
    document.body.style.userSelect = '';
  }

  function handleResultsPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!isSelectionMode || event.button !== 0 || event.pointerType === 'touch' || isInteractiveTarget(event.target) || !items.length) {
      return;
    }

    const container = resultsGridRef.current;
    if (!container) {
      return;
    }

    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      additive: event.metaKey || event.ctrlKey || event.shiftKey,
      baseSelection: selectedIds,
    };
    container.setPointerCapture(event.pointerId);
  }

  function handleResultsPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const dragState = dragStateRef.current;
    const container = resultsGridRef.current;

    if (!dragState || !container || dragState.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - dragState.startX;
    const deltaY = event.clientY - dragState.startY;

    if (!isDragSelecting && Math.hypot(deltaX, deltaY) < 6) {
      return;
    }

    if (!isDragSelecting) {
      setIsDragSelecting(true);
      document.body.style.userSelect = 'none';
    }

    const containerBounds = container.getBoundingClientRect();
    const left = Math.max(0, Math.min(dragState.startX, event.clientX) - containerBounds.left);
    const top = Math.max(0, Math.min(dragState.startY, event.clientY) - containerBounds.top);
    const right = Math.min(containerBounds.width, Math.max(dragState.startX, event.clientX) - containerBounds.left);
    const bottom = Math.min(containerBounds.height, Math.max(dragState.startY, event.clientY) - containerBounds.top);

    setDragRect({
      left,
      top,
      width: Math.max(0, right - left),
      height: Math.max(0, bottom - top),
    });

    const intersectedIds = readIntersectedItemIds({
      left: containerBounds.left + left,
      top: containerBounds.top + top,
      right: containerBounds.left + right,
      bottom: containerBounds.top + bottom,
    });

    const nextIds = dragState.additive
      ? Array.from(new Set([...dragState.baseSelection, ...intersectedIds]))
      : intersectedIds;

    onSelectionChange(nextIds);
    onInspectItem(intersectedIds.at(-1) ?? nextIds.at(-1) ?? selectedItemId);
  }

  function handleResultsPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    finishDragSelection();
  }

  return (
    <section className={`explore-layout${selectedItem ? ' explore-layout--inspecting' : ''}`}>
      {notices.length ? (
        <div className="page-notices">
          {notices.map((notice) => (
            <StatusBanner key={`${notice.title}-${notice.tone}`} {...notice} />
          ))}
        </div>
      ) : null}

      <aside ref={sidebarRef} className="tool-rail explore-rail">
        <div className="tool-rail__header">
          <div>
            <p className="tool-rail__eyebrow">Workshop</p>
            <h2>筛选</h2>
            <p className="tool-rail__subtitle">按标签、类型和分辨率收窄结果。</p>
          </div>
          <div className="tool-rail__stats">
            <div>
              <span>筛选</span>
              <strong>{enabledFilterCount}</strong>
            </div>
            <div>
              <span>结果</span>
              <strong>{items.length}</strong>
            </div>
          </div>
        </div>

        <label className="search-field search-field--rail">
          <span>搜索工坊</span>
          <input
            value={draftFilters.query}
            onChange={(event) => onDraftChange({ ...draftFilters, query: event.target.value })}
            placeholder="搜索 Wallpaper Engine：壁纸引擎"
          />
        </label>

        <div ref={sidebarScrollRef} className="filter-panel filter-panel--rail">
          <section className="filter-panel__group">
            <h3>MISCELLANEOUS</h3>
            <ul>
              {filterGroups.miscellaneous.map((item) => (
                <li key={item.value}>
                  <label className="filter-panel__checkbox">
                    <input
                      type="checkbox"
                      checked={draftFilters.miscellaneous.includes(item.value)}
                      onChange={(event) => onDraftChange({
                        ...draftFilters,
                        miscellaneous: toggleFilterValue(draftFilters.miscellaneous, item.value, event.target.checked),
                      })}
                    />
                    <span className="filter-panel__label">{item.label}</span>
                    <span className="filter-panel__count">({item.count})</span>
                  </label>
                </li>
              ))}
            </ul>
          </section>

          {Object.entries(selectOptions).slice(0, 2).map(([key, options]) => (
            <label key={key} className="filter-panel__select-group">
              <span>{selectLabels[key as keyof typeof selectLabels]}</span>
              <select
                aria-label={key === 'category' ? 'category' : key}
                value={draftFilters[key as keyof typeof selectOptions]}
                onChange={(event) => onDraftChange({ ...draftFilters, [key]: event.target.value } as WorkshopBrowseFilters)}
              >
                {options.map((option) => (
                  <option key={option} value={option === '<未选择>' ? '' : option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          ))}

          <section className="filter-panel__group">
            <h3>GENRE</h3>
            <ul className="filter-panel__list">
              {filterGroups.genre.map((item) => (
                <li key={item.value}>
                  <label className="filter-panel__checkbox">
                    <input
                      type="checkbox"
                      checked={draftFilters.genre.includes(item.value)}
                      onChange={(event) => onDraftChange({
                        ...draftFilters,
                        genre: toggleFilterValue(draftFilters.genre, item.value, event.target.checked),
                      })}
                    />
                    <span className="filter-panel__label">{item.label}</span>
                    <span className="filter-panel__count">({item.count})</span>
                  </label>
                </li>
              ))}
            </ul>
          </section>

          {Object.entries(selectOptions).slice(2).map(([key, options]) => (
            <label key={key} className="filter-panel__select-group">
              <span>{selectLabels[key as keyof typeof selectLabels]}</span>
              <select
                value={draftFilters[key as keyof typeof selectOptions]}
                onChange={(event) => onDraftChange({ ...draftFilters, [key]: event.target.value } as WorkshopBrowseFilters)}
              >
                {options.map((option) => (
                  <option key={option} value={option === '<未选择>' ? '' : option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>

        <div className="tool-rail__footer">
          <button className="signal-button signal-button--inline" onClick={onApplyFilters}>应用筛选</button>
          <button className="signal-button signal-button--secondary signal-button--inline" onClick={onClearFilters}>清空筛选</button>
        </div>
      </aside>

      <div className="workspace-panel workspace-panel--main">
        <header className="workspace-header">
          <div>
            <h2>探索创意工坊</h2>
            <p className="workspace-header__meta">{isLoading ? '正在刷新结果…' : resultsTagline}</p>
          </div>
          <div className="workspace-header__actions">
            <label className="toolbar-field">
              <span>排序方式</span>
              <select
                value={draftFilters.sort}
                onChange={(event) => onDraftChange({ ...draftFilters, sort: event.target.value })}
              >
                <option value="trend">最热门</option>
                <option value="vote">最受好评</option>
                <option value="updated">最新更新</option>
                <option value="new">最新发布</option>
                <option value="relevance">搜索相关度</option>
              </select>
            </label>

            <label className="toolbar-field">
              <span>时间范围</span>
              <select
                value={draftFilters.period}
                onChange={(event) => onDraftChange({ ...draftFilters, period: event.target.value })}
              >
                <option value="7d">7天</option>
                <option value="30d">1个月</option>
                <option value="90d">3个月</option>
                <option value="180d">6个月</option>
                <option value="365d">1年</option>
                <option value="all">发布至今</option>
              </select>
            </label>

            <button type="button" className="signal-button signal-button--secondary signal-button--inline" onClick={onRefresh}>
              {isLoading ? '正在刷新…' : '刷新结果'}
            </button>
          </div>
        </header>

        <div className="selection-toolbar">
          <div className="selection-toolbar__stats">
            <div className="compact-stat">
              <span>已选择</span>
              <strong>{selectedCount}</strong>
            </div>
            <div className="compact-stat">
              <span>筛选已启用</span>
              <strong>{enabledFilterCount}</strong>
            </div>
          </div>

          <div className="selection-toolbar__actions">
            <button
              className="signal-button signal-button--secondary signal-button--inline"
              onClick={() => {
                finishDragSelection();
                setIsSelectionMode((current) => !current);
              }}
              disabled={isBulkQueueing}
            >
              {isSelectionMode ? '结束选取' : '开始选取'}
            </button>
            <button className="signal-button signal-button--secondary signal-button--inline" onClick={onSelectAll} disabled={isBulkQueueing}>全选</button>
            <button className="signal-button signal-button--secondary signal-button--inline" onClick={onClearSelection} disabled={isBulkQueueing}>清空</button>
            <button className="signal-button signal-button--inline" aria-label="批量加入下载" onClick={onBulkQueue} disabled={queueableSelectedCount === 0 || isBulkQueueing}>
              {isBulkQueueing ? '加入中…' : '加入下载'}
            </button>
            <button className="signal-button signal-button--ghost signal-button--inline" onClick={onViewTasks}>任务</button>
          </div>
        </div>

        {isSelectionMode ? (
          <StatusBanner
            compact
            tone="info"
            title="框选模式已开启"
            detail="拖拽选择项目，Esc 退出。"
          />
        ) : null}

        {items.length ? (
          <div
            ref={resultsGridRef}
            className={`workshop-list${selectedItem ? ' workshop-list--inspecting' : ''}${isSelectionMode ? ' workshop-list--selection-mode' : ''}${isDragSelecting ? ' workshop-list--dragging' : ''}`}
            onPointerDown={handleResultsPointerDown}
            onPointerMove={handleResultsPointerMove}
            onPointerUp={handleResultsPointerUp}
            onPointerCancel={finishDragSelection}
            onLostPointerCapture={finishDragSelection}
          >
            {items.map((item) => (
              <WorkshopCard
                key={item.id}
                item={item}
                inspected={item.id === selectedItemId}
                onInspect={onInspectItem}
                onQueue={onQueue}
                queueDisabled={queuedLookup.has(item.id) || queueingLookup.has(item.id)}
                queueState={deriveQueueState(item.id, queueingLookup, queuedLookup, downloadedLookup)}
                selected={selectedLookup.has(item.id)}
                onToggleSelect={onToggleSelect}
              />
            ))}
            {dragRect ? (
              <div
                className="selection-marquee"
                style={{
                  left: `${dragRect.left}px`,
                  top: `${dragRect.top}px`,
                  width: `${dragRect.width}px`,
                  height: `${dragRect.height}px`,
                }}
              />
            ) : null}
          </div>
        ) : (
          <div className="workspace-empty">
            <h3>没有匹配结果</h3>
            <p>可以先放宽 Genre 或 Miscellaneous，再重新应用筛选。</p>
          </div>
        )}
      </div>

      {selectedItem ? (
        <aside className="workspace-panel workspace-panel--inspector explore-inspector">
          <div className="inspector-media">
            {selectedItem.previewUrl ? (
              <img src={selectedItem.previewUrl} alt={`${selectedItem.title} 预览图`} loading="lazy" />
            ) : (
              <div className="inspector-media__placeholder">{selectedItem.title.slice(0, 22)}</div>
            )}
          </div>

          <div className="inspector-header">
            <p className="inspector-label">详情</p>
            <h3>{selectedItem.title}</h3>
            <p>{selectedItem.author}</p>
            {queueStateLabel(selectedItemQueueState) ? (
              <span className={`state-pill state-pill--${selectedItemQueueState}`}>{queueStateLabel(selectedItemQueueState)}</span>
            ) : null}
          </div>

          <div className="inspector-actions">
            <button
              type="button"
              className="signal-button signal-button--inline"
              onClick={() => onQueue(selectedItem)}
              disabled={selectedItemQueueLocked}
            >
              {queueActionLabel(selectedItemQueueState)}
            </button>
            <a
              className="signal-button signal-button--ghost signal-button--inline"
              href={`https://steamcommunity.com/sharedfiles/filedetails/?id=${selectedItem.id}`}
              target="_blank"
              rel="noreferrer"
            >
              查看工坊页面
            </a>
            <button
              type="button"
              className="signal-button signal-button--ghost signal-button--inline"
              onClick={() => onInspectItem(null)}
            >
              收起详情
            </button>
          </div>

          <dl className="inspector-facts">
            <div>
              <dt>项目 ID</dt>
              <dd>{selectedItem.id}</dd>
            </div>
            <div>
              <dt>评分</dt>
              <dd>{selectedItem.rating > 0 ? `${selectedItem.rating.toFixed(1)} / 5` : '未评分'}</dd>
            </div>
            <div>
              <dt>Miscellaneous</dt>
              <dd>{formatMetadataValue(selectedItem.metadata.miscellaneous)}</dd>
            </div>
            <div>
              <dt>Type</dt>
              <dd>{formatMetadataValue(selectedItem.metadata.type)}</dd>
            </div>
            <div>
              <dt>Age Rating</dt>
              <dd>{formatMetadataValue(selectedItem.metadata.ageRating)}</dd>
            </div>
            <div>
              <dt>Genre</dt>
              <dd>{formatMetadataValue(selectedItem.metadata.genre)}</dd>
            </div>
            <div>
              <dt>Resolution</dt>
              <dd>{formatMetadataValue(selectedItem.metadata.resolution)}</dd>
            </div>
            <div>
              <dt>Category</dt>
              <dd>{formatMetadataValue(selectedItem.metadata.category)}</dd>
            </div>
          </dl>

          <section className="inspector-section">
            <h4>描述</h4>
            <p>{selectedItem.description}</p>
          </section>

          {selectedItem.tags.length ? (
            <section className="inspector-section">
              <h4>标签</h4>
              <ul className="inspector-tags" aria-label={`${selectedItem.title} 标签`}>
                {selectedItem.tags.map((tag) => (
                  <li key={tag}>{tag}</li>
                ))}
              </ul>
            </section>
          ) : null}
        </aside>
      ) : null}
    </section>
  );
}
