import { useEffect, useState } from 'react';
import type { DownloaderRuntimeSnapshot, SteamLoginRequest, SteamLoginState } from '../../../../packages/shared/src';
import { StatusBanner } from '../components/status-banner';
import { TerminalLog } from '../components/terminal-log';
import { fetchSteamLoginState, formatApiError, triggerSteamLogin } from '../lib/api';

interface SteamLoginPageProps {
  runtime: DownloaderRuntimeSnapshot;
  onBack: () => void;
}

const fallbackLoginState: SteamLoginState = {
  status: 'idle',
  steamAccountName: 'anonymous',
};

const statusLabel: Record<SteamLoginState['status'], string> = {
  idle: '未登录',
  logging_in: '登录中',
  authenticated: '已登录',
  failed: '登录失败',
};

function formatRuntimeState(runtime: DownloaderRuntimeSnapshot) {
  return runtime.available ? 'steamcmd 已就绪' : 'steamcmd 不可用';
}

export function SteamLoginPage({ runtime, onBack }: SteamLoginPageProps) {
  const [state, setState] = useState<SteamLoginState>(fallbackLoginState);
  const [form, setForm] = useState<SteamLoginRequest>({ steamAccountName: '', steamPassword: '', steamGuardCode: '' });
  const [isRefreshing, setIsRefreshing] = useState(true);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  function applyLoginState(nextState: SteamLoginState) {
    setState(nextState);
    setForm((current) => ({ ...current, steamAccountName: current.steamAccountName || nextState.steamAccountName || '' }));
    setRefreshError(null);
  }

  function refreshLoginState(isActive: () => boolean = () => true) {
    setIsRefreshing(true);
    fetchSteamLoginState()
      .then((response) => {
        if (!isActive()) {
          return;
        }
        applyLoginState(response.state);
      })
      .catch((error) => {
        if (isActive()) {
          setRefreshError(formatApiError(error, '无法读取当前 Steam 登录状态。'));
        }
      })
      .finally(() => {
        if (isActive()) {
          setIsRefreshing(false);
        }
      });
  }

  useEffect(() => {
    let active = true;

    refreshLoginState(() => active);
    const timer = window.setInterval(() => refreshLoginState(() => active), 1500);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState((current) => ({
      ...current,
      status: 'logging_in',
      steamAccountName: form.steamAccountName,
      errorMessage: undefined,
    }));

    triggerSteamLogin(form)
      .then((response) => {
        setState(response.state);
        setRefreshError(null);
      })
      .catch((error) => {
        setState((current) => ({ ...current, status: 'failed', errorMessage: formatApiError(error, '触发 Steam 登录失败。') }));
      });
  }

  return (
    <section className="steam-login-layout">
      <header className="workspace-header workspace-header--page">
        <div>
          <h2>登录到创意工坊</h2>
          <p className="workspace-header__meta">登录态、运行时和最近错误。</p>
        </div>
        <div className="workspace-header__actions">
          <button type="button" className="signal-button signal-button--secondary signal-button--inline" onClick={() => refreshLoginState()}>
            {isRefreshing ? '正在读取状态…' : '重新读取状态'}
          </button>
          <button type="button" className="signal-button signal-button--ghost signal-button--inline" onClick={onBack}>返回工坊主页</button>
        </div>
      </header>

      {refreshError ? (
        <div className="page-notices">
          <StatusBanner
            compact
            tone="warning"
            title="登录状态未刷新"
            detail={`${refreshError} 当前显示的是上次可用结果。`}
            actionLabel="重新读取"
            onAction={() => refreshLoginState()}
          />
        </div>
      ) : null}

      <div className="workspace-split">
        <section className="workspace-panel workspace-panel--main">
          {!runtime.available ? (
            <StatusBanner
              tone="error"
              title="当前无法调用 steamcmd"
              detail={runtime.availabilityError || '下载器运行时未就绪。'}
            />
          ) : null}

          <form className="steam-login-form steam-login-form--tool" onSubmit={handleSubmit}>
            <div className="panel-copy">
              <h3>账号与验证</h3>
              <p>提交后会自动刷新登录状态。</p>
            </div>

            <div className="steam-login-form__fields">
              <label className="steam-login-form__field">
                <span>Steam 账号</span>
                <input
                  value={form.steamAccountName}
                  onChange={(event) => setForm((current) => ({ ...current, steamAccountName: event.target.value }))}
                  placeholder="输入 Steam 登录账号"
                  autoComplete="username"
                />
              </label>

              <label className="steam-login-form__field">
                <span>Steam 密码</span>
                <input
                  type="password"
                  value={form.steamPassword}
                  onChange={(event) => setForm((current) => ({ ...current, steamPassword: event.target.value }))}
                  placeholder="输入 Steam 密码"
                  autoComplete="current-password"
                />
              </label>

              <label className="steam-login-form__field">
                <span>Steam 令牌 / 2FA</span>
                <input
                  value={form.steamGuardCode ?? ''}
                  onChange={(event) => setForm((current) => ({ ...current, steamGuardCode: event.target.value }))}
                  placeholder="如需要，输入 Steam Guard 令牌"
                />
              </label>
            </div>

            <div className="steam-login-form__actions">
              <button type="submit" className="signal-button" disabled={!runtime.available || state.status === 'logging_in' || !form.steamAccountName || !form.steamPassword}>
                {state.status === 'logging_in' ? '正在调用 steamcmd 登录…' : '登录 Steam'}
              </button>
            </div>
          </form>
        </section>

        <aside className="workspace-panel workspace-panel--inspector">
          <div className="inspector-header">
            <p className="inspector-label">登录状态</p>
            <h3>{statusLabel[state.status]}</h3>
            <p>{state.steamAccountName || '未设置账号'}</p>
          </div>

          <dl className="inspector-facts">
            <div>
              <dt>当前状态</dt>
              <dd>{statusLabel[state.status]}</dd>
            </div>
            <div>
              <dt>当前账号</dt>
              <dd>{state.steamAccountName || '未设置'}</dd>
            </div>
            <div>
              <dt>最近尝试</dt>
              <dd>{state.lastAttemptAt || '暂无'}</dd>
            </div>
            <div>
              <dt>最近成功</dt>
              <dd>{state.lastSuccessAt || '暂无'}</dd>
            </div>
            <div>
              <dt>运行时</dt>
              <dd>{formatRuntimeState(runtime)}</dd>
            </div>
          </dl>

          {state.errorMessage ? <p className="inspector-inline-error">最近登录错误：{state.errorMessage}</p> : null}
          {!runtime.available ? <p className="inspector-inline-error">运行时状态：不可用，{runtime.availabilityError || '下载器运行时未就绪。'}</p> : null}

          <TerminalLog mode="login" title="SteamCMD 登录输出" />
        </aside>
      </div>
    </section>
  );
}
