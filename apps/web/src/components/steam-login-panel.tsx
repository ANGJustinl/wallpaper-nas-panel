import { useEffect, useState } from 'react';
import type { SteamLoginState } from '../../../../packages/shared/src';
import { fetchSteamLoginState, triggerSteamLogin } from '../lib/api';

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

export function SteamLoginPanel() {
  const [state, setState] = useState<SteamLoginState>(fallbackLoginState);

  useEffect(() => {
    let active = true;

    const refresh = () => {
      fetchSteamLoginState()
        .then((response) => {
          if (active) {
            setState(response.state);
          }
        })
        .catch(() => undefined);
    };

    refresh();
    const timer = window.setInterval(refresh, 1500);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  function handleLogin() {
    setState((current) => ({ ...current, status: 'logging_in' }));
    triggerSteamLogin({ steamAccountName: state.steamAccountName || 'anonymous', steamPassword: '' })
      .then((response) => {
        setState(response.state);
      })
      .catch(() => {
        setState((current) => ({ ...current, status: 'failed', errorMessage: '触发 Steam 登录失败。' }));
      });
  }

  return (
    <section className="panel-section panel-section--login">
      <div className="section-heading">
        <p className="section-kicker">Steam 登录</p>
        <h2>账户连接</h2>
        <p className="section-copy">通过异步调用 steamcmd 检查和建立当前面板的 Steam 登录状态。</p>
      </div>

      <div className="steam-login-panel">
        <div className="steam-login-panel__row">
          <span>当前账号</span>
          <strong>{state.steamAccountName}</strong>
        </div>
        <div className="steam-login-panel__row">
          <span>状态</span>
          <strong>{statusLabel[state.status]}</strong>
        </div>
        {state.lastAttemptAt ? (
          <div className="steam-login-panel__row">
            <span>最近尝试</span>
            <strong>{state.lastAttemptAt}</strong>
          </div>
        ) : null}
        {state.lastSuccessAt ? (
          <div className="steam-login-panel__row">
            <span>最近成功</span>
            <strong>{state.lastSuccessAt}</strong>
          </div>
        ) : null}
        {state.errorMessage ? <p className="steam-login-panel__error">{state.errorMessage}</p> : null}
        <button className="signal-button" onClick={handleLogin} disabled={state.status === 'logging_in'}>
          {state.status === 'logging_in' ? '正在调用 steamcmd 登录…' : '连接 Steam'}
        </button>
      </div>
    </section>
  );
}
