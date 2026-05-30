import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { WorkshopBrowseFilters, WorkshopItemSummary } from '../../../../packages/shared/src';
import { StatusBanner, type StatusBannerContent } from '../components/status-banner';
import { WorkshopCard } from '../components/workshop-card';

interface ExplorePageProps {
  items: WorkshopItemSummary[];
  filters: WorkshopBrowseFilters;
  draftFilters: WorkshopBrowseFilters;
  selectedIds: string[];
  onSelectionChange: (nextIds: string[]) => void;
  enabledFilterCount: number;
  isLoading: boolean;
  notices: StatusBannerContent[];
  onDraftChange: (next: WorkshopBrowseFilters) => void;
  onApplyFilters: () => void;
  onClearFilters: () => void;
  onRefresh: () => void;
  onToggleSelect: (itemId: string, intent?: { additive?: boolean; range?: boolean }) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onBulkQueue: () => void;
  onQueue: (item: WorkshopItemSummary) => void;
  queueingItemIds: string[];
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

export function ExplorePage({
  items,
  filters,
  draftFilters,
  selectedIds,
  onSelectionChange,
  enabledFilterCount,
  isLoading,
  notices,
  onDraftChange,
  onApplyFilters,
  onClearFilters,
  onRefresh,
  onToggleSelect,
  onSelectAll,
  onClearSelection,
  onBulkQueue,
  onQueue,
  queueingItemIds,
  isBulkQueueing,
}: ExplorePageProps) {
  const selectedCount = selectedIds.length;
  const selectedLookup = useMemo(() => new Set(selectedIds), [selectedIds]);
  const queueingLookup = useMemo(() => new Set(queueingItemIds), [queueingItemIds]);
  const resultsTagline = createTagline(filters, items.length);
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

    const containerRect = container.getBoundingClientRect();
    const selectionBounds = {
      left: Math.min(dragState.startX, event.clientX),
      top: Math.min(dragState.startY, event.clientY),
      right: Math.max(dragState.startX, event.clientX),
      bottom: Math.max(dragState.startY, event.clientY),
    };
    const intersectedIds = readIntersectedItemIds(selectionBounds);
    const nextSelection = dragState.additive
      ? Array.from(new Set([...dragState.baseSelection, ...intersectedIds]))
      : intersectedIds;

    if (!isDragSelecting) {
      setIsDragSelecting(true);
      document.body.style.userSelect = 'none';
    }

    setDragRect({
      left: Math.max(0, selectionBounds.left - containerRect.left),
      top: Math.max(0, selectionBounds.top - containerRect.top),
      width: selectionBounds.right - selectionBounds.left,
      height: selectionBounds.bottom - selectionBounds.top,
    });
    onSelectionChange(nextSelection);
  }

  function handleResultsPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragStateRef.current?.pointerId !== event.pointerId) {
      return;
    }

    finishDragSelection();
  }

  return (
    <section className="explore-layout">
      <aside ref={sidebarRef} className="explore-sidebar">
        <div className="explore-sidebar__header">
          <p className="section-kicker">Workshop Browser</p>
          <h2>探索创意工坊</h2>
          <p className="section-copy">保留现有筛选和批量入队流程，只把界面密度、层次和缩略图排布调整到更接近 Steam 浏览页。</p>
        </div>

        <label className="search-field search-field--sidebar">
          <span>搜索工坊</span>
          <input
            value={draftFilters.query}
            onChange={(event) => onDraftChange({ ...draftFilters, query: event.target.value })}
            placeholder="搜索 Wallpaper Engine：壁纸引擎"
          />
        </label>

        <div ref={sidebarScrollRef} className="filter-panel filter-panel--sidebar">
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

        <div className="explore-sidebar__actions">
          <button className="signal-button" onClick={onApplyFilters}>应用筛选</button>
          <button className="signal-button signal-button--secondary" onClick={onClearFilters}>清空筛选</button>
        </div>
      </aside>

      <div className="explore-results">
        {notices.length ? (
          <div className="page-notices">
            {notices.map((notice) => (
              <StatusBanner key={`${notice.title}-${notice.tone}`} {...notice} />
            ))}
          </div>
        ) : null}

        <section className="explore-results__intro">
          <div className="explore-results__summary">
            <p className="section-kicker">Filter Settings & Workshop Results</p>
            <h3>按当前筛选直接浏览结果</h3>
            <p className="section-copy">左侧负责范围，右侧负责排序、刷新和批量入队。界面风格向 Steam 靠拢，但工作流仍然保持现在这套。</p>
          </div>

          <div className="explore-results__stats">
            <div>
              <span>当前结果</span>
              <strong>{resultsTagline}</strong>
            </div>
            <div>
              <span>已启用筛选</span>
              <strong>{enabledFilterCount}</strong>
            </div>
            <div>
              <span>已选择</span>
              <strong>{selectedCount}</strong>
            </div>
          </div>
        </section>

        <section className="explore-results__toolbar">
          <div className="explore-results__summary">
            <p className="section-kicker">Workshop Results</p>
            <h3>{isLoading ? '正在刷新结果…' : '当前筛选结果'}</h3>
            <p className="section-copy">调整排序和时间范围后，点击刷新即可重新拉取同一套筛选条件下的真实结果。</p>
          </div>

          <div className="explore-results__controls">
            <label>
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

            <label>
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
        </section>

        <section className="explore-results__bulkbar">
          <div className="explore-results__bulkmeta">
            <strong>批量操作</strong>
            <span>
              {isSelectionMode
                ? '框选模式已开启，可直接在结果区拖拽批量选取；按 Esc 或点击“结束选取”退出。'
                : selectedCount === 0
                  ? '先点击“开始选取”进入框选模式，或继续使用勾选框把结果加入批量选择。支持 Ctrl/Cmd 追加，Shift 范围连选。'
                  : `已选择 ${selectedCount} 项，可直接批量入队。支持 Ctrl/Cmd 追加，Shift 范围连选。`}
            </span>
          </div>

          <div className="explore-results__actions">
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
            <button className="signal-button signal-button--secondary signal-button--inline" onClick={onSelectAll} disabled={isBulkQueueing}>全选当前页</button>
            <button className="signal-button signal-button--secondary signal-button--inline" onClick={onClearSelection} disabled={isBulkQueueing}>清空选择</button>
            <button className="signal-button signal-button--inline" onClick={onBulkQueue} disabled={selectedCount === 0 || isBulkQueueing}>
              {isBulkQueueing ? '正在加入下载…' : '批量加入下载'}
            </button>
          </div>
        </section>

        {isSelectionMode ? (
          <div className="explore-results__selection-hint">
            <strong>开始框选</strong>
            <span>在下方结果区拖拽即可批量选择多个项目，也可以继续用 Ctrl/Cmd 点选追加、Shift 连续选取，下载后可直接通过右上角任务入口查看进度。</span>
          </div>
        ) : null}

        {items.length ? (
          <div
            ref={resultsGridRef}
            className={`workshop-grid workshop-grid--results${isSelectionMode ? ' workshop-grid--selection-mode' : ''}${isDragSelecting ? ' workshop-grid--dragging' : ''}`}
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
                onQueue={onQueue}
                queueDisabled={queueingLookup.has(item.id)}
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
          <div className="explore-results__empty">
            <h3>没有匹配结果</h3>
            <p>可以先放宽 Genre 或 Miscellaneous，再重新应用筛选。</p>
          </div>
        )}
      </div>
    </section>
  );
}
