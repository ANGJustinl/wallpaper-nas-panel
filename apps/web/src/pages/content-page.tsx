import { useCallback, useEffect, useMemo, useState } from 'react';
import type { KeyboardEvent, MouseEvent } from 'react';
import type { ContentLibraryFileEntry, ContentLibraryFilesResponse, DownloadedContentItem } from '../../../../packages/shared/src';
import { StatusBanner, type StatusBannerContent } from '../components/status-banner';
import { deleteContentFiles, fetchContentFiles, formatApiError, moveContentFiles } from '../lib/api';

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
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  query: string;
  onRefresh: () => void;
  onRescan: () => void;
  onIdentifySteamWorkshop: () => void;
  onSearch: (query: string) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
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

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value || '未知' : date.toLocaleString();
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

function fileTypeLabel(entry: ContentLibraryFileEntry) {
  if (entry.type === 'directory') {
    return '目录';
  }

  if (entry.isPlayableVideo) {
    return '视频';
  }

  if (entry.isMetadataSidecar) {
    return '旁挂';
  }

  return entry.extension || '文件';
}

interface FileBrowserContextMenu {
  x: number;
  y: number;
  entry: ContentLibraryFileEntry | null;
}

function ContentFileBrowser({ item }: { item: DownloadedContentItem }) {
  const [path, setPath] = useState('');
  const [page, setPage] = useState(1);
  const [files, setFiles] = useState<ContentLibraryFilesResponse | null>(null);
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [lastSelectedPath, setLastSelectedPath] = useState<string | null>(null);
  const [cutClipboard, setCutClipboard] = useState<ContentLibraryFileEntry[]>([]);
  const [deleteConfirmPaths, setDeleteConfirmPaths] = useState<string[]>([]);
  const [contextMenu, setContextMenu] = useState<FileBrowserContextMenu | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const pathSegments = files?.path ? files.path.split('/').filter(Boolean) : [];
  const entries = files?.entries ?? [];
  const selectedPathSet = useMemo(() => new Set(selectedPaths), [selectedPaths]);
  const selectedEntries = useMemo(
    () => entries.filter((entry) => selectedPathSet.has(entry.relativePath)),
    [entries, selectedPathSet],
  );

  useEffect(() => {
    setPath('');
    setPage(1);
    setSelectedPaths([]);
    setLastSelectedPath(null);
    setCutClipboard([]);
    setDeleteConfirmPaths([]);
    setContextMenu(null);
    setStatusMessage(null);
  }, [item.id]);

  useEffect(() => {
    if (!contextMenu) {
      return undefined;
    }

    function closeContextMenu() {
      setContextMenu(null);
    }

    window.addEventListener('click', closeContextMenu);
    window.addEventListener('resize', closeContextMenu);
    window.addEventListener('scroll', closeContextMenu, true);

    return () => {
      window.removeEventListener('click', closeContextMenu);
      window.removeEventListener('resize', closeContextMenu);
      window.removeEventListener('scroll', closeContextMenu, true);
    };
  }, [contextMenu]);

  const refreshFiles = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetchContentFiles(item.id, { path, page, pageSize: 100 });
      setFiles(response);
      setPage(response.page);
      setSelectedPaths((current) => {
        const availablePaths = new Set(response.entries.map((entry) => entry.relativePath));
        return current.filter((selectedPath) => availablePaths.has(selectedPath));
      });
      return response;
    } catch (fetchError) {
      setError(formatApiError(fetchError, '无法读取目录。'));
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [item.id, page, path]);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError(null);

    fetchContentFiles(item.id, { path, page, pageSize: 100 })
      .then((response) => {
        if (!active) {
          return;
        }
        setFiles(response);
        setPage(response.page);
        setSelectedPaths((current) => {
          const availablePaths = new Set(response.entries.map((entry) => entry.relativePath));
          return current.filter((selectedPath) => availablePaths.has(selectedPath));
        });
      })
      .catch((fetchError) => {
        if (active) {
          setError(formatApiError(fetchError, '无法读取目录。'));
        }
      })
      .finally(() => {
        if (active) {
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [item.id, page, path]);

  function openPath(nextPath: string) {
    setPath(nextPath);
    setPage(1);
    setSelectedPaths([]);
    setLastSelectedPath(null);
    setDeleteConfirmPaths([]);
    setContextMenu(null);
    setStatusMessage(null);
  }

  function selectEntry(entry: ContentLibraryFileEntry, event: MouseEvent<HTMLButtonElement>) {
    setDeleteConfirmPaths([]);

    if (event.shiftKey && lastSelectedPath) {
      const lastIndex = entries.findIndex((candidate) => candidate.relativePath === lastSelectedPath);
      const nextIndex = entries.findIndex((candidate) => candidate.relativePath === entry.relativePath);
      if (lastIndex !== -1 && nextIndex !== -1) {
        const [start, end] = [lastIndex, nextIndex].sort((left, right) => left - right);
        setSelectedPaths(entries.slice(start, end + 1).map((candidate) => candidate.relativePath));
        return;
      }
    }

    if (event.metaKey || event.ctrlKey) {
      setSelectedPaths((current) => current.includes(entry.relativePath)
        ? current.filter((selectedPath) => selectedPath !== entry.relativePath)
        : [...current, entry.relativePath]);
      setLastSelectedPath(entry.relativePath);
      return;
    }

    setSelectedPaths([entry.relativePath]);
    setLastSelectedPath(entry.relativePath);
  }

  function contextEntries(entry: ContentLibraryFileEntry | null) {
    if (!entry) {
      return selectedEntries;
    }

    return selectedPathSet.has(entry.relativePath) ? selectedEntries : [entry];
  }

  async function copyEntries(entriesToCopy: ContentLibraryFileEntry[], mode: 'absolute' | 'relative') {
    if (!entriesToCopy.length) {
      return;
    }

    const text = entriesToCopy.map((entry) => mode === 'absolute' ? entry.absolutePath : entry.relativePath).join('\n');
    try {
      await navigator.clipboard?.writeText(text);
      setStatusMessage(mode === 'absolute' ? '已复制宿主路径。' : '已复制相对路径。');
    } catch {
      setStatusMessage('当前浏览器无法写入剪贴板。');
    }
  }

  function copySelectedPaths(mode: 'absolute' | 'relative') {
    void copyEntries(selectedEntries, mode);
  }

  function cutEntries(entriesToCut: ContentLibraryFileEntry[]) {
    if (!entriesToCut.length) {
      return;
    }

    setCutClipboard(entriesToCut);
    setStatusMessage(`已剪切 ${entriesToCut.length} 项。`);
  }

  function cutSelectedFiles() {
    cutEntries(selectedEntries);
  }

  async function pasteCutFiles(targetPath = path) {
    if (!cutClipboard.length || isMutating) {
      return;
    }

    setIsMutating(true);
    setError(null);
    try {
      await moveContentFiles(item.id, cutClipboard.map((entry) => entry.relativePath), targetPath);
      setStatusMessage(`已移动 ${cutClipboard.length} 项。`);
      setCutClipboard([]);
      setSelectedPaths([]);
      setLastSelectedPath(null);
      await refreshFiles();
    } catch (moveError) {
      setError(formatApiError(moveError, '无法移动文件。'));
    } finally {
      setIsMutating(false);
    }
  }

  async function deleteSelectedFiles(paths: string[]) {
    if (!paths.length || isMutating) {
      return;
    }

    setIsMutating(true);
    setError(null);
    try {
      await deleteContentFiles(item.id, paths);
      setStatusMessage(`已删除 ${paths.length} 项。`);
      setDeleteConfirmPaths([]);
      setContextMenu(null);
      setSelectedPaths([]);
      setLastSelectedPath(null);
      await refreshFiles();
    } catch (deleteError) {
      setError(formatApiError(deleteError, '无法删除文件。'));
    } finally {
      setIsMutating(false);
    }
  }

  function openContextMenu(event: MouseEvent<HTMLElement>, entry: ContentLibraryFileEntry | null) {
    event.preventDefault();
    event.stopPropagation();

    if (entry && !selectedPathSet.has(entry.relativePath)) {
      setSelectedPaths([entry.relativePath]);
      setLastSelectedPath(entry.relativePath);
    }

    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      entry,
    });
  }

  function handleFileManagerKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const key = event.key.toLowerCase();

    if ((event.metaKey || event.ctrlKey) && key === 'a') {
      event.preventDefault();
      setSelectedPaths(entries.map((entry) => entry.relativePath));
      setLastSelectedPath(entries[entries.length - 1]?.relativePath ?? null);
      return;
    }

    if ((event.metaKey || event.ctrlKey) && key === 'c') {
      event.preventDefault();
      void copySelectedPaths(event.shiftKey ? 'relative' : 'absolute');
      return;
    }

    if ((event.metaKey || event.ctrlKey) && key === 'x') {
      event.preventDefault();
      cutSelectedFiles();
      return;
    }

    if ((event.metaKey || event.ctrlKey) && key === 'v') {
      event.preventDefault();
      void pasteCutFiles();
      return;
    }

    if (event.key === 'Delete' && selectedPaths.length) {
      event.preventDefault();
      setDeleteConfirmPaths(selectedPaths);
      return;
    }

    if (event.key === 'Enter' && selectedEntries.length === 1 && selectedEntries[0].type === 'directory') {
      event.preventDefault();
      openPath(selectedEntries[0].relativePath);
      return;
    }

    if (event.key === 'Backspace' && files?.parentPath !== null && files?.parentPath !== undefined) {
      event.preventDefault();
      openPath(files.parentPath ?? '');
    }
  }

  return (
    <section className="inspector-section file-browser">
      <div className="file-browser__head">
        <div>
          <h4>文件管理器</h4>
          <span>{files ? `${files.total} 项 · 已选 ${selectedPaths.length}` : isLoading ? '读取中' : '未读取'}</span>
        </div>
      </div>

      <nav className="file-browser__crumbs" aria-label="当前目录">
        <button type="button" onClick={() => openPath('')}>根目录</button>
        {pathSegments.map((segment, index) => {
          const crumbPath = pathSegments.slice(0, index + 1).join('/');
          return (
            <button key={crumbPath} type="button" onClick={() => openPath(crumbPath)}>
              {segment}
            </button>
          );
        })}
      </nav>

      {error ? <p className="inspector-inline-error">{error}</p> : null}
      {statusMessage ? <p className="file-browser__status">{statusMessage}</p> : null}

      {deleteConfirmPaths.length ? (
        <div className="file-browser__confirm" role="dialog" aria-label="确认删除文件">
          <p>确认删除选中的 {deleteConfirmPaths.length} 项？</p>
          <div>
            <button type="button" className="signal-button signal-button--ghost signal-button--inline" onClick={() => setDeleteConfirmPaths([])}>
              取消
            </button>
            <button type="button" className="signal-button signal-button--inline file-browser__danger-action" disabled={isMutating} onClick={() => void deleteSelectedFiles(deleteConfirmPaths)}>
              删除文件
            </button>
          </div>
        </div>
      ) : null}

      <div
        className="file-browser__table"
        role="grid"
        tabIndex={0}
        onKeyDown={handleFileManagerKeyDown}
        onContextMenu={(event) => openContextMenu(event, null)}
        aria-label="文件列表"
      >
        <div className="file-browser__table-head" role="row">
          <span>名称</span>
          <span>大小</span>
          <span>修改时间</span>
        </div>
        {files?.entries.length ? files.entries.map((entry) => (
          <button
            key={entry.relativePath || entry.name}
            type="button"
            className={`file-browser__row${selectedPathSet.has(entry.relativePath) ? ' is-selected' : ''}${cutClipboard.some((cutEntry) => cutEntry.relativePath === entry.relativePath) ? ' is-cut' : ''}`}
            aria-pressed={selectedPathSet.has(entry.relativePath)}
            onClick={(event) => selectEntry(entry, event)}
            onContextMenu={(event) => openContextMenu(event, entry)}
            onDoubleClick={() => {
              if (entry.type === 'directory') {
                openPath(entry.relativePath);
              }
            }}
          >
            <span className="file-browser__cell file-browser__cell--name">
              <span className={`file-browser__icon file-browser__icon--${entry.type}`} aria-hidden="true" />
              <span className="file-browser__filename">{entry.name}</span>
              <span className="file-browser__type">{fileTypeLabel(entry)}</span>
            </span>
            <span className="file-browser__cell file-browser__cell--size">{entry.type === 'directory' ? '目录' : formatBytes(entry.size)}</span>
            <span className="file-browser__cell file-browser__cell--time">{formatDate(entry.modifiedAt)}</span>
          </button>
        )) : (
          <div className="file-browser__empty">{isLoading ? '正在读取目录…' : '当前目录为空。'}</div>
        )}
      </div>

      {contextMenu ? (
        <div
          className="file-browser__context-menu"
          role="menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          {contextMenu.entry?.type === 'directory' ? (
            <button type="button" role="menuitem" onClick={() => openPath(contextMenu.entry?.relativePath ?? '')}>
              打开
            </button>
          ) : null}
          <button
            type="button"
            role="menuitem"
            disabled={!contextEntries(contextMenu.entry).length}
            onClick={() => {
              void copyEntries(contextEntries(contextMenu.entry), 'absolute');
              setContextMenu(null);
            }}
          >
            复制宿主路径
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!contextEntries(contextMenu.entry).length}
            onClick={() => {
              void copyEntries(contextEntries(contextMenu.entry), 'relative');
              setContextMenu(null);
            }}
          >
            复制相对路径
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!contextEntries(contextMenu.entry).length || isMutating}
            onClick={() => {
              cutEntries(contextEntries(contextMenu.entry));
              setContextMenu(null);
            }}
          >
            剪切
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!cutClipboard.length || isMutating}
            onClick={() => {
              const targetPath = contextMenu.entry?.type === 'directory' ? contextMenu.entry.relativePath : path;
              void pasteCutFiles(targetPath);
              setContextMenu(null);
            }}
          >
            粘贴
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              void refreshFiles();
              setContextMenu(null);
            }}
          >
            刷新
          </button>
          <button
            type="button"
            role="menuitem"
            className="file-browser__context-danger"
            disabled={!contextEntries(contextMenu.entry).length || isMutating}
            onClick={() => {
              setDeleteConfirmPaths(contextEntries(contextMenu.entry).map((entry) => entry.relativePath));
              setContextMenu(null);
            }}
          >
            删除
          </button>
        </div>
      ) : null}

      {files && files.totalPages > 1 ? (
        <div className="content-pagination content-pagination--compact">
          <button type="button" className="signal-button signal-button--ghost signal-button--inline" disabled={files.page <= 1} onClick={() => setPage(files.page - 1)}>
            上一页
          </button>
          <span>{files.page} / {files.totalPages}</span>
          <button type="button" className="signal-button signal-button--ghost signal-button--inline" disabled={files.page >= files.totalPages} onClick={() => setPage(files.page + 1)}>
            下一页
          </button>
        </div>
      ) : null}
    </section>
  );
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
  page,
  pageSize,
  total,
  totalPages,
  query,
  onRefresh,
  onRescan,
  onIdentifySteamWorkshop,
  onSearch,
  onPageChange,
  onPageSizeChange,
  onSelect,
  onQueue,
  onDeleteRecord,
}: ContentPageProps) {
  const selectedItem = items.find((item) => item.id === selectedItemId) ?? items[0] ?? null;
  const queueingLookup = new Set(queueingItemIds);
  const [deleteCandidate, setDeleteCandidate] = useState<DownloadedContentItem | null>(null);
  const [deleteFiles, setDeleteFiles] = useState(deleteFilesDefault);
  const [searchDraft, setSearchDraft] = useState(query);
  const [isFileManagerOpen, setIsFileManagerOpen] = useState(false);
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

  useEffect(() => {
    setSearchDraft(query);
  }, [query]);

  useEffect(() => {
    if (!selectedItem) {
      setIsFileManagerOpen(false);
    }
  }, [selectedItem]);

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
            <strong>{total}</strong>
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

      <div className={`workspace-split content-workspace${isFileManagerOpen && selectedItem ? ' content-workspace--files-open' : ''}`}>
        <section className="workspace-panel workspace-panel--main">
          <div className="panel-copy">
            <h3>内容列表</h3>
            <p>选择项目后在右侧查看路径与元数据。</p>
          </div>

          <form
            className="content-toolbar"
            onSubmit={(event) => {
              event.preventDefault();
              onSearch(searchDraft);
            }}
          >
            <label>
              <span>搜索</span>
              <input value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="标题、作者或 Workshop ID" />
            </label>
            <button type="submit" className="signal-button signal-button--secondary signal-button--inline">搜索</button>
            <button
              type="button"
              className="signal-button signal-button--ghost signal-button--inline"
              onClick={() => {
                setSearchDraft('');
                onSearch('');
              }}
              disabled={!query && !searchDraft}
            >
              清空
            </button>
            <label>
              <span>每页</span>
              <select value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))}>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </label>
          </form>

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

          <div className="content-pagination">
            <button type="button" className="signal-button signal-button--ghost signal-button--inline" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
              上一页
            </button>
            <span>第 {page} / {totalPages} 页，共 {total} 项</span>
            <button type="button" className="signal-button signal-button--ghost signal-button--inline" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
              下一页
            </button>
          </div>
        </section>

        <aside className="workspace-panel workspace-panel--inspector content-inspector">
          {selectedItem ? (
            <>
              <div className="content-inspector__mode" aria-label="内容详情视图">
                <button type="button" className={!isFileManagerOpen ? 'is-active' : ''} aria-pressed={!isFileManagerOpen} onClick={() => setIsFileManagerOpen(false)}>
                  详情
                </button>
                <button type="button" className={isFileManagerOpen ? 'is-active' : ''} aria-pressed={isFileManagerOpen} onClick={() => setIsFileManagerOpen(true)}>
                  文件
                </button>
              </div>

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

        {selectedItem && isFileManagerOpen ? (
          <aside className="workspace-panel workspace-panel--inspector content-files-column">
            <ContentFileBrowser item={selectedItem} />
          </aside>
        ) : null}
      </div>
    </section>
  );
}
