import { useEffect, useState } from 'react';
import type { DownloaderRuntimeSnapshot, SettingsSnapshot } from '../../../../packages/shared/src';
import { StatusBanner, type StatusBannerContent } from '../components/status-banner';
import { formatApiError, updateSettings } from '../lib/api';

interface SettingsPageProps {
  settings: SettingsSnapshot;
  runtime: DownloaderRuntimeSnapshot;
  isRefreshing: boolean;
  notices: StatusBannerContent[];
  onSettingsChange: (next: SettingsSnapshot) => void;
  onRefresh: () => void;
}

const workerStatusLabel: Record<DownloaderRuntimeSnapshot['worker']['status'], string> = {
  offline: '离线',
  idle: '待命',
  processing: '处理中',
};

export function SettingsPage({ settings, runtime, isRefreshing, notices, onSettingsChange, onRefresh }: SettingsPageProps) {
  const [form, setForm] = useState<SettingsSnapshot>(settings);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const [saveMessage, setSaveMessage] = useState<string>('修改后请保存，downloader 将使用最新设置。');

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  async function saveSettings() {
    setSaveState('saving');

    try {
      const response = await updateSettings(form);
      onSettingsChange(response.settings);
      setForm(response.settings);
      setSaveState('saved');
      setSaveMessage('设置已同步到后端。');
    } catch (error) {
      setSaveState('failed');
      setSaveMessage(formatApiError(error, '保存失败，请检查后端状态。'));
    }
  }

  return (
    <section className="settings-layout">
      {notices.length ? (
        <div className="page-notices">
          {notices.map((notice) => (
            <StatusBanner key={`${notice.title}-${notice.tone}`} {...notice} />
          ))}
        </div>
      ) : null}

      <header className="workspace-header workspace-header--page">
        <div>
          <h2>运行参数</h2>
          <p className="workspace-header__meta">账号、目录、代理和 worker 状态。</p>
        </div>
        <div className="workspace-header__actions">
          <button type="button" className="signal-button signal-button--secondary signal-button--inline" onClick={onRefresh}>
            {isRefreshing ? '读取中…' : '重新读取'}
          </button>
        </div>
      </header>

      <div className="workspace-split">
        <section className="workspace-panel workspace-panel--main">
          <div className="settings-group">
            <div className="panel-copy">
              <h3>账户与目录</h3>
              <p>worker 会按这里的账号和路径执行下载。</p>
            </div>
            <div className="settings-form-grid">
              <label className="settings-grid__field">
                <span>Steam 账号</span>
                <input value={form.steamAccountName} onChange={(event) => setForm((current) => ({ ...current, steamAccountName: event.target.value }))} />
              </label>
              <label className="settings-grid__field">
                <span>下载目录</span>
                <input value={form.downloadRoot} onChange={(event) => setForm((current) => ({ ...current, downloadRoot: event.target.value }))} />
              </label>
            </div>
          </div>

          <div className="settings-group">
            <div className="panel-copy">
              <h3>抓取与生成</h3>
              <p>控制元数据语言、请求间隔和 NFO 生成。</p>
            </div>
            <div className="settings-form-grid">
              <label className="settings-grid__field">
                <span>元数据语言</span>
                <input value={form.metadataLanguage} onChange={(event) => setForm((current) => ({ ...current, metadataLanguage: event.target.value }))} />
              </label>
              <label className="settings-grid__field">
                <span>请求间隔 (ms)</span>
                <input
                  type="number"
                  min={0}
                  value={form.requestIntervalMs}
                  onChange={(event) => setForm((current) => ({ ...current, requestIntervalMs: Number(event.target.value || 0) }))}
                />
              </label>
              <label className="settings-grid__checkbox">
                <input
                  type="checkbox"
                  checked={form.autoGenerateNfo}
                  onChange={(event) => setForm((current) => ({ ...current, autoGenerateNfo: event.target.checked }))}
                />
                <span>下载成功后自动生成 NFO</span>
              </label>
            </div>
          </div>

          <div className="settings-group">
            <div className="panel-copy">
              <h3>代理与连通性</h3>
              <p>抓取与 steamcmd 共用这里的代理设置。</p>
            </div>
            <div className="settings-form-grid">
              <label className="settings-grid__checkbox">
                <input
                  type="checkbox"
                  checked={form.proxy.enabled}
                  onChange={(event) => setForm((current) => ({
                    ...current,
                    proxy: { ...current.proxy, enabled: event.target.checked },
                  }))}
                />
                <span>启用代理抓取与 steamcmd 下载</span>
              </label>
              <label className="settings-grid__field">
                <span>代理地址</span>
                <input
                  value={form.proxy.url}
                  onChange={(event) => setForm((current) => ({
                    ...current,
                    proxy: { ...current.proxy, url: event.target.value },
                  }))}
                  placeholder="http://10.100.1.4:7890"
                />
              </label>
            </div>
          </div>

          <div className="settings-actions">
            <button className="signal-button" onClick={saveSettings} disabled={saveState === 'saving'}>
              {saveState === 'saving' ? '正在保存全部设置…' : '保存全部设置'}
            </button>
            <p className={`settings-save-note settings-save-note--${saveState}`}>
              {saveMessage}
            </p>
          </div>
        </section>

        <aside className="workspace-panel workspace-panel--inspector">
          <div className="inspector-header">
            <p className="inspector-label">运行时摘要</p>
            <h3>下载器运行态</h3>
            <p>确认 steamcmd、worker 和目录后，再决定是否改配置。</p>
          </div>

          <dl className="inspector-facts">
            <div>
              <dt>运行时</dt>
              <dd>{runtime.available ? 'steamcmd 已就绪' : 'steamcmd 当前不可执行'}</dd>
            </div>
            <div>
              <dt>Worker 状态</dt>
              <dd>{runtime.worker.online ? workerStatusLabel[runtime.worker.status] : '离线'}</dd>
            </div>
            <div>
              <dt>脚本路径</dt>
              <dd>{runtime.steamCmdScriptPath || '未配置'}</dd>
            </div>
            <div>
              <dt>默认内容目录</dt>
              <dd>{runtime.workshopContentDir || '未配置'}</dd>
            </div>
            <div>
              <dt>Worker Runner</dt>
              <dd>{runtime.worker.runnerId || '未启动'}</dd>
            </div>
            <div>
              <dt>最后心跳</dt>
              <dd>{runtime.worker.heartbeatAt || '暂无'}</dd>
            </div>
          </dl>

          {runtime.availabilityError ? <p className="inspector-inline-error">运行时提示：{runtime.availabilityError}</p> : null}
          {runtime.worker.lastError ? <p className="inspector-inline-error">最近错误：{runtime.worker.lastError}</p> : null}
        </aside>
      </div>
    </section>
  );
}
