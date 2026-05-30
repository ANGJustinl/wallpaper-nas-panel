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

      <section className="panel-section panel-section--settings panel-section--settings-primary">
        <div className="section-heading">
          <p className="section-kicker">连接与网络</p>
          <h2>代理与下载通道</h2>
          <p className="section-copy">先确认运行态和代理，再决定是否调整面板参数，减少来回切换页面的成本。</p>
        </div>

        <div className="settings-overview">
          <section className="settings-overview-card">
            <div className="settings-overview-card__header">
              <p className="section-kicker">Proxy Control</p>
              <h3>代理与读取</h3>
              <p className="section-copy">代理开关和读取动作放在同一区域，方便先确认连通性再统一保存。</p>
            </div>

            <div className="ops-metric-grid ops-metric-grid--2">
              <div className="ops-metric-card">
                <span>代理状态</span>
                <strong>{form.proxy.enabled ? '已接入代理' : '未启用代理'}</strong>
              </div>
              <div className="ops-metric-card">
                <span>当前代理</span>
                <strong>{form.proxy.url || '未填写'}</strong>
              </div>
            </div>

            <div className="settings-overview-card__controls">
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

            <div className="settings-inline-actions">
              <button type="button" className="signal-button signal-button--secondary signal-button--inline" onClick={onRefresh}>
                {isRefreshing ? '读取中…' : '重新读取'}
              </button>
            </div>
          </section>

          <section className={`ops-status-panel settings-runtime-card settings-runtime-card--${runtime.available ? 'ready' : 'blocked'}`}>
            <div className="ops-status-panel__header">
              <div>
                <p className="section-kicker">Runtime Check</p>
                <h3>下载器运行时</h3>
              </div>
              <p className="ops-status-panel__summary">统一查看 steamcmd、内容目录和 worker 心跳，不需要再去别页对照。</p>
            </div>

            <div className="ops-metric-grid ops-metric-grid--2">
              <div className="ops-metric-card">
                <span>运行时</span>
                <strong>{runtime.available ? 'steamcmd 已就绪' : 'steamcmd 当前不可执行'}</strong>
              </div>
              <div className="ops-metric-card">
                <span>Worker 状态</span>
                <strong>{runtime.worker.online ? workerStatusLabel[runtime.worker.status] : '离线'}</strong>
              </div>
              <div className="ops-metric-card">
                <span>脚本路径</span>
                <strong>{runtime.steamCmdScriptPath || '未配置'}</strong>
              </div>
              <div className="ops-metric-card">
                <span>默认内容目录</span>
                <strong>{runtime.workshopContentDir || '未配置'}</strong>
              </div>
              <div className="ops-metric-card">
                <span>Worker Runner</span>
                <strong>{runtime.worker.runnerId || '未启动'}</strong>
              </div>
              <div className="ops-metric-card">
                <span>最后心跳</span>
                <strong>{runtime.worker.heartbeatAt || '暂无'}</strong>
              </div>
            </div>

            {runtime.availabilityError ? <p className="ops-status-panel__error">运行时提示：{runtime.availabilityError}</p> : null}
            {runtime.worker.lastError ? <p className="ops-status-panel__error">最近错误：{runtime.worker.lastError}</p> : null}
          </section>
        </div>
      </section>

      <section className="panel-section panel-section--settings panel-section--settings-secondary">
        <div className="section-heading">
          <p className="section-kicker">面板设置</p>
          <h2>运行参数</h2>
          <p className="section-copy">把账号、目录、抓取频率和自动生成规则收成两组，减少保存前的来回扫视。</p>
        </div>

        <div className="settings-groups">
          <section className="settings-group-card">
            <h3>账户与目录</h3>
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
          </section>

          <section className="settings-group-card">
            <h3>抓取与生成</h3>
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
          </section>
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
    </section>
  );
}
