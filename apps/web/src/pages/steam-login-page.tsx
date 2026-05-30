import { useEffect, useState } from 'react';
import type { DownloaderRuntimeSnapshot, SteamLoginRequest, SteamLoginState } from '../../../../packages/shared/src';
import { StatusBanner } from '../components/status-banner';
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
      <section className="panel-section panel-section--login-status">
        <div className="section-heading">
          <p className="section-kicker">Steam 登录</p>
          <h2>登录到创意工坊</h2>
          <p className="section-copy">先看当前登录态和运行时，再决定是否提交账号、密码和 2FA 令牌。</p>
        </div>

        <div className="steam-login-overview">
          {refreshError ? (
            <StatusBanner
              compact
              tone="warning"
              title="登录状态未刷新"
              detail={`${refreshError} 当前显示的是上次可用结果。`}
              actionLabel="重新读取"
              onAction={() => refreshLoginState()}
            />
          ) : null}

          <div className="ops-metric-grid ops-metric-grid--5">
            <div className="ops-metric-card">
              <span>当前状态</span>
              <strong>{statusLabel[state.status]}</strong>
            </div>
            <div className="ops-metric-card">
              <span>当前账号</span>
              <strong>{state.steamAccountName || '未设置'}</strong>
            </div>
            <div className="ops-metric-card">
              <span>最近尝试</span>
              <strong>{state.lastAttemptAt || '暂无'}</strong>
            </div>
            <div className="ops-metric-card">
              <span>最近成功</span>
              <strong>{state.lastSuccessAt || '暂无'}</strong>
            </div>
            <div className="ops-metric-card">
              <span>运行时</span>
              <strong>{formatRuntimeState(runtime)}</strong>
            </div>
          </div>

          {!runtime.available ? <p className="steam-login-runtime-alert">当前无法调用 steamcmd：{runtime.availabilityError || '下载器运行时未就绪。'}</p> : null}
          {state.errorMessage ? <p className="steam-login-form__error steam-login-form__error--block">最近登录错误：{state.errorMessage}</p> : null}
        </div>
      </section>

      <section className="panel-section panel-section--login-form">
        <div className="section-heading">
          <p className="section-kicker">Credentials</p>
          <h2>账号与验证</h2>
          <p className="section-copy">表单和动作集中在同一区域，登录失败时不用上下滚动寻找下一步。</p>
        </div>

        <form className="steam-login-form steam-login-form--ops" onSubmit={handleSubmit}>
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

          <div className="steam-login-form__actions steam-login-form__actions--row">
            <button type="submit" className="signal-button" disabled={!runtime.available || state.status === 'logging_in' || !form.steamAccountName || !form.steamPassword}>
              {state.status === 'logging_in' ? '正在调用 steamcmd 登录…' : '登录 Steam'}
            </button>
            <button type="button" className="signal-button signal-button--secondary" onClick={() => refreshLoginState()}>
              {isRefreshing ? '正在读取状态…' : '重新读取状态'}
            </button>
            <button type="button" className="signal-button signal-button--secondary" onClick={onBack}>返回工坊主页</button>
          </div>
        </form>
      </section>
    </section>
  );
}
