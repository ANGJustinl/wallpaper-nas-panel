import type { DownloadedContentItem } from '../../../../packages/shared/src';
import { StatusBanner, type StatusBannerContent } from '../components/status-banner';

interface ContentPageProps {
  items: DownloadedContentItem[];
  selectedItemId: string | null;
  deletingItemId: string | null;
  isLoading: boolean;
  lastSyncedAt: string | null;
  notices: StatusBannerContent[];
  queueingItemIds: string[];
  onRefresh: () => void;
  onSelect: (itemId: string) => void;
  onQueue: (item: DownloadedContentItem) => void;
  onDeleteRecord: (itemId: string) => void;
}

function ContentPreview({ item, className }: { item: DownloadedContentItem; className: string }) {
  if (item.previewUrl) {
    return (
      <div className={className}>
        <img src={item.previewUrl} alt={`${item.title} 预览图`} loading="lazy" />
      </div>
    );
  }

  return (
    <div className={`${className} ${className}--placeholder`} aria-label={`${item.title} 预览图`}>
      <span>{item.title.slice(0, 20)}</span>
    </div>
  );
}

function formatRating(value: number) {
  return value > 0 ? `${value.toFixed(1)} / 5` : '未评分';
}

function formatBytes(value: number) {
  if (value <= 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let current = value;
  let unitIndex = 0;

  while (current >= 1024 && unitIndex < units.length - 1) {
    current /= 1024;
    unitIndex += 1;
  }

  return `${current.toFixed(current >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatMetadataValue(values: string[] | string) {
  if (Array.isArray(values)) {
    return values.length ? values.join(' / ') : '未记录';
  }

  return values || '未记录';
}

export function ContentPage({
  items,
  selectedItemId,
  deletingItemId,
  isLoading,
  lastSyncedAt,
  notices,
  queueingItemIds,
  onRefresh,
  onSelect,
  onQueue,
  onDeleteRecord,
}: ContentPageProps) {
  const selectedItem = items.find((item) => item.id === selectedItemId) ?? items[0] ?? null;
  const queueingLookup = new Set(queueingItemIds);
  const metadataRows = selectedItem
    ? [
        ['Miscellaneous', formatMetadataValue(selectedItem.metadata.miscellaneous)],
        ['Type', formatMetadataValue(selectedItem.metadata.type)],
        ['Age Rating', formatMetadataValue(selectedItem.metadata.ageRating)],
        ['Genre', formatMetadataValue(selectedItem.metadata.genre)],
        ['Resolution', formatMetadataValue(selectedItem.metadata.resolution)],
        ['Category', formatMetadataValue(selectedItem.metadata.category)],
      ]
    : [];

  return (
    <section className="content-layout">
      {notices.length ? (
        <div className="page-notices">
          {notices.map((notice) => (
            <StatusBanner key={`${notice.title}-${notice.tone}`} {...notice} />
          ))}
        </div>
      ) : null}

      <header className="workspace-header workspace-header--page">
        <div>
          <h2>已下载内容管理</h2>
          <p className="workspace-header__meta">像资源管理器一样浏览已下载项目，并在右侧固定查看 metadata 和本地信息。</p>
        </div>
        <div className="workspace-header__actions">
          <div className="compact-stat">
            <span>内容数</span>
            <strong>{items.length}</strong>
          </div>
          <div className="compact-stat">
            <span>最近同步</span>
            <strong>{lastSyncedAt || (isLoading ? '同步中' : '暂无')}</strong>
          </div>
          <button type="button" className="signal-button signal-button--secondary signal-button--inline" onClick={onRefresh}>
            {isLoading ? '刷新中…' : '重新读取'}
          </button>
        </div>
      </header>

      <div className="workspace-split">
        <section className="workspace-panel workspace-panel--main">
          <div className="panel-copy">
            <h3>内容列表</h3>
            <p>左侧专注浏览与选择，详情与本地路径固定停在右侧检查器。</p>
          </div>

          {items.length ? (
            <div className="content-list">
              {items.map((item) => {
                const selected = item.id === selectedItem?.id;

                return (
                  <article
                    key={item.id}
                    className={`content-row${selected ? ' content-row--selected' : ''}`}
                    onClick={() => onSelect(item.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onSelect(item.id);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    aria-pressed={selected}
                  >
                    <ContentPreview item={item} className="content-row__thumb" />
                    <div className="content-row__main">
                      <div className="content-row__titleline">
                        <h3>{item.title}</h3>
                        <span>{formatRating(item.rating)}</span>
                      </div>
                      <p className="content-row__meta">作者 {item.author} · {item.downloadedAt}</p>
                      <p className="content-row__stats">{formatBytes(item.totalBytes)} · {item.fileCount} 个文件 · {item.entryCount} 个目录项</p>
                      <ul className="workshop-row__tags" aria-label={`${item.title} 标签`}>
                        {item.tags.slice(0, 4).map((tag) => (
                          <li key={tag}>{tag}</li>
                        ))}
                      </ul>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="workspace-empty">
              <h3>还没有已下载内容</h3>
              <p>当任务成功完成后，内容目录、工坊描述和结构化标签会自动收录到这里。</p>
            </div>
          )}
        </section>

        <aside className="workspace-panel workspace-panel--inspector">
          {selectedItem ? (
            <>
              <div className="inspector-media">
                <ContentPreview item={selectedItem} className="content-detail__media" />
              </div>

              <div className="inspector-header">
                <p className="inspector-label">已选内容</p>
                <h3>{selectedItem.title}</h3>
                <p>{selectedItem.author}</p>
              </div>

              <div className="inspector-actions">
                <button
                  type="button"
                  className="signal-button signal-button--inline"
                  onClick={() => onQueue(selectedItem)}
                  disabled={queueingLookup.has(selectedItem.id)}
                >
                  {queueingLookup.has(selectedItem.id) ? '正在加入…' : '重新加入下载'}
                </button>
                <button
                  type="button"
                  className="signal-button signal-button--secondary signal-button--inline"
                  onClick={() => navigator.clipboard?.writeText(selectedItem.outputPath)}
                >
                  复制目录
                </button>
                <button
                  type="button"
                  className="signal-button signal-button--ghost signal-button--inline"
                  onClick={() => onDeleteRecord(selectedItem.id)}
                  disabled={deletingItemId === selectedItem.id}
                >
                  {deletingItemId === selectedItem.id ? '移除中…' : '移除记录'}
                </button>
              </div>

              <dl className="inspector-facts">
                <div>
                  <dt>输出目录</dt>
                  <dd>{selectedItem.outputPath}</dd>
                </div>
                <div>
                  <dt>下载时间</dt>
                  <dd>{selectedItem.downloadedAt}</dd>
                </div>
                <div>
                  <dt>目录项数</dt>
                  <dd>{selectedItem.entryCount}</dd>
                </div>
                <div>
                  <dt>文件数</dt>
                  <dd>{selectedItem.fileCount}</dd>
                </div>
                <div>
                  <dt>总大小</dt>
                  <dd>{formatBytes(selectedItem.totalBytes)}</dd>
                </div>
                <div>
                  <dt>工坊页面</dt>
                  <dd>
                    <a href={`https://steamcommunity.com/sharedfiles/filedetails/?id=${selectedItem.id}`} target="_blank" rel="noreferrer">
                      查看创意工坊页面
                    </a>
                  </dd>
                </div>
              </dl>

              <section className="inspector-section">
                <h4>创意工坊描述</h4>
                <p>{selectedItem.description}</p>
              </section>

              <section className="inspector-section">
                <h4>元数据</h4>
                <dl className="inspector-facts inspector-facts--stacked">
                  {metadataRows.map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            </>
          ) : (
            <div className="workspace-empty workspace-empty--inspector">
              <h3>选择一个内容项</h3>
              <p>右侧会显示目录、描述、标签和下载信息。</p>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
