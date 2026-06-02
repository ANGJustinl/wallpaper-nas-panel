import { useEffect, useState } from 'react';
import type { DownloadedContentItem } from '../../../../packages/shared/src';
import { StatusBanner, type StatusBannerContent } from '../components/status-banner';

interface ContentPageProps {
  items: DownloadedContentItem[];
  selectedItemId: string | null;
  deletingItemId: string | null;
  isLoading: boolean;
  isRescanning: boolean;
  isIdentifyingSteamWorkshop: boolean;
  lastSyncedAt: string | null;
  notices: StatusBannerContent[];
  queueingItemIds: string[];
  deleteFilesDefault: boolean;
  onRefresh: () => void;
  onRescan: () => void;
  onIdentifySteamWorkshop: () => void;
  onSelect: (itemId: string) => void;
  onQueue: (item: DownloadedContentItem) => void;
  onDeleteRecord: (itemId: string, deleteFiles: boolean) => void;
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

function jellyfinStatusLabel(item: DownloadedContentItem) {
  switch (item.libraryHealth.jellyfinSidecarsStatus) {
    case 'ready':
      return 'Jellyfin 就绪';
    case 'missing':
      return 'Jellyfin 缺失';
    case 'not_applicable':
      return item.libraryHealth.playableFileCount > 0 ? 'Jellyfin 未启用' : '非视频';
  }
}

function healthStateLabel(value: boolean, readyLabel: string, missingLabel: string) {
  return value ? readyLabel : missingLabel;
}

function healthClass(value: boolean) {
  return value ? 'content-health__pill--ready' : 'content-health__pill--missing';
}

function jellyfinHealthClass(item: DownloadedContentItem) {
  if (item.libraryHealth.jellyfinSidecarsStatus === 'ready') {
    return 'content-health__pill--ready';
  }

  if (item.libraryHealth.jellyfinSidecarsStatus === 'missing') {
    return 'content-health__pill--missing';
  }

  return 'content-health__pill--neutral';
}

export function ContentPage({
  items,
  selectedItemId,
  deletingItemId,
  isLoading,
  isRescanning,
  isIdentifyingSteamWorkshop,
  lastSyncedAt,
  notices,
  queueingItemIds,
  deleteFilesDefault,
  onRefresh,
  onRescan,
  onIdentifySteamWorkshop,
  onSelect,
  onQueue,
  onDeleteRecord,
}: ContentPageProps) {
  const selectedItem = items.find((item) => item.id === selectedItemId) ?? items[0] ?? null;
  const queueingLookup = new Set(queueingItemIds);
  const [deleteCandidate, setDeleteCandidate] = useState<DownloadedContentItem | null>(null);
  const [deleteFiles, setDeleteFiles] = useState(deleteFilesDefault);
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

  useEffect(() => {
    setDeleteFiles(deleteFilesDefault);
  }, [deleteFilesDefault, deleteCandidate?.id]);

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
            <p className="workspace-header__meta">已下载项目、目录与元数据状态。</p>
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
          <button type="button" className="signal-button signal-button--inline" onClick={onRescan} disabled={isRescanning}>
            {isRescanning ? '重扫中…' : '重扫/校验'}
          </button>
          <button
            type="button"
            className="signal-button signal-button--secondary signal-button--inline"
            onClick={onIdentifySteamWorkshop}
            disabled={isIdentifyingSteamWorkshop}
          >
            {isIdentifyingSteamWorkshop ? '识别中…' : '识别 Steam 目录'}
          </button>
        </div>
      </header>

      <div className="workspace-split">
        <section className="workspace-panel workspace-panel--main">
          <div className="panel-copy">
            <h3>内容列表</h3>
            <p>选择项目后在右侧查看路径与元数据。</p>
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
                      <div className="content-health" aria-label={`${item.title} 内容状态`}>
                        <span className={`content-health__pill ${healthClass(item.libraryHealth.pathExists)}`}>
                          {healthStateLabel(item.libraryHealth.pathExists, '文件存在', '路径缺失')}
                        </span>
                        <span className={`content-health__pill ${healthClass(item.libraryHealth.workshopNfoExists)}`}>
                          {healthStateLabel(item.libraryHealth.workshopNfoExists, 'NFO 已生成', 'NFO 缺失')}
                        </span>
                        <span className={`content-health__pill ${jellyfinHealthClass(item)}`}>
                          {jellyfinStatusLabel(item)}
                        </span>
                      </div>
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
                  onClick={() => setDeleteCandidate(selectedItem)}
                  disabled={deletingItemId === selectedItem.id}
                >
                  {deletingItemId === selectedItem.id ? '移除中…' : '移除记录'}
                </button>
              </div>

              {deleteCandidate ? (
                <div className="content-delete-confirm" role="dialog" aria-label="确认移除内容">
                  <div>
                    <h4>移除《{deleteCandidate.title}》？</h4>
                    <p>默认只移除面板记录。本地下载目录会保留，除非勾选同时删除文件。</p>
                  </div>
                  <label className="settings-grid__checkbox">
                    <input
                      type="checkbox"
                      checked={deleteFiles}
                      onChange={(event) => setDeleteFiles(event.target.checked)}
                    />
                    <span>同时删除本地文件</span>
                  </label>
                  <div className="content-delete-confirm__actions">
                    <button
                      type="button"
                      className="signal-button signal-button--ghost signal-button--inline"
                      onClick={() => setDeleteCandidate(null)}
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      className="signal-button signal-button--inline"
                      onClick={() => {
                        onDeleteRecord(deleteCandidate.id, deleteFiles);
                        setDeleteCandidate(null);
                      }}
                    >
                      确认移除
                    </button>
                  </div>
                </div>
              ) : null}

              <dl className="inspector-facts">
                <div>
                  <dt>输出目录</dt>
                  <dd className="inspector-path"><code>{selectedItem.outputPath}</code></dd>
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
                  <dt>路径状态</dt>
                  <dd>{selectedItem.libraryHealth.pathExists ? '存在' : '缺失'}</dd>
                </div>
                <div>
                  <dt>可播放文件</dt>
                  <dd>{selectedItem.libraryHealth.playableFileCount}</dd>
                </div>
                <div>
                  <dt>归档 NFO</dt>
                  <dd>{selectedItem.libraryHealth.workshopNfoExists ? '已生成' : '缺失'}</dd>
                </div>
                <div>
                  <dt>Jellyfin 旁挂</dt>
                  <dd>{jellyfinStatusLabel(selectedItem)}</dd>
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
