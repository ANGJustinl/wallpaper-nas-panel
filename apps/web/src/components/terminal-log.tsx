import { useEffect, useRef, useState } from 'react';
import type { SteamCmdLogEvent } from '../../../../packages/shared/src';
import { createSteamLoginLogStreamUrl, createTaskLogStreamUrl, fetchSteamLoginLogs, fetchTaskLogs } from '../lib/api';

interface TerminalLogProps {
  mode: 'task' | 'login';
  taskId?: string;
  title: string;
}

function sourceLabel(source: SteamCmdLogEvent['source']) {
  switch (source) {
    case 'stderr':
      return 'err';
    case 'system':
      return 'sys';
    case 'stdout':
      return 'out';
  }
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '--:--:--';
  }

  return date.toLocaleTimeString([], { hour12: false });
}

export function TerminalLog({ mode, taskId, title }: TerminalLogProps) {
  const [events, setEvents] = useState<SteamCmdLogEvent[]>([]);
  const [isFollowing, setIsFollowing] = useState(true);
  const [connectionState, setConnectionState] = useState<'connecting' | 'live' | 'polling'>('connecting');
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const lastSequenceRef = useRef(0);
  const followingRef = useRef(true);

  useEffect(() => {
    followingRef.current = isFollowing;
  }, [isFollowing]);

  useEffect(() => {
    let cancelled = false;
    let eventSource: EventSource | null = null;
    let pollTimer: number | null = null;

    function appendEvents(nextEvents: SteamCmdLogEvent[]) {
      if (!nextEvents.length) {
        return;
      }

      setEvents((current) => {
        const seen = new Set(current.map((event) => event.sequence));
        const merged = [...current];
        nextEvents.forEach((event) => {
          if (seen.has(event.sequence)) {
            return;
          }

          seen.add(event.sequence);
          merged.push(event);
          lastSequenceRef.current = Math.max(lastSequenceRef.current, event.sequence);
        });

        return merged.slice(-1000);
      });
    }

    async function fetchAfter(after: number) {
      if (mode === 'task' && taskId) {
        const response = await fetchTaskLogs(taskId, after);
        appendEvents(response.events);
        lastSequenceRef.current = Math.max(lastSequenceRef.current, response.nextSequence);
        return;
      }

      if (mode === 'login') {
        const response = await fetchSteamLoginLogs(after);
        appendEvents(response.events);
        lastSequenceRef.current = Math.max(lastSequenceRef.current, response.nextSequence);
      }
    }

    function startPolling() {
      if (pollTimer !== null) {
        return;
      }

      setConnectionState('polling');
      pollTimer = window.setInterval(() => {
        void fetchAfter(lastSequenceRef.current).catch(() => undefined);
      }, 1500);
    }

    setEvents([]);
    lastSequenceRef.current = 0;
    setConnectionState('connecting');
    void fetchAfter(0)
      .then(() => {
        if (cancelled || (mode === 'task' && !taskId)) {
          return;
        }

        const streamUrl = mode === 'task' && taskId
          ? createTaskLogStreamUrl(taskId, lastSequenceRef.current)
          : createSteamLoginLogStreamUrl(lastSequenceRef.current);
        eventSource = new EventSource(streamUrl);
        eventSource.addEventListener('open', () => {
          setConnectionState('live');
        });
        eventSource.addEventListener('log', (message) => {
          try {
            appendEvents([JSON.parse((message as MessageEvent).data) as SteamCmdLogEvent]);
          } catch {
            // Ignore malformed SSE frames.
          }
        });
        eventSource.addEventListener('error', () => {
          eventSource?.close();
          startPolling();
        });
      })
      .catch(() => {
        if (!cancelled) {
          startPolling();
        }
      });

    return () => {
      cancelled = true;
      eventSource?.close();
      if (pollTimer !== null) {
        window.clearInterval(pollTimer);
      }
    };
  }, [mode, taskId]);

  useEffect(() => {
    if (!followingRef.current || !scrollerRef.current) {
      return;
    }

    scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
  }, [events]);

  function handleScroll() {
    const scroller = scrollerRef.current;
    if (!scroller) {
      return;
    }

    const distanceToBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
    setIsFollowing(distanceToBottom < 24);
  }

  function resumeFollowing() {
    setIsFollowing(true);
    window.requestAnimationFrame(() => {
      if (scrollerRef.current) {
        scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
      }
    });
  }

  return (
    <section className="terminal-log" aria-label={title}>
      <div className="terminal-log__header">
        <div>
          <h4>{title}</h4>
          <span>{connectionState === 'live' ? '实时' : connectionState === 'polling' ? '轮询' : '连接中'}</span>
        </div>
        {!isFollowing ? (
          <button type="button" className="signal-button signal-button--ghost signal-button--inline" onClick={resumeFollowing}>
            跟随输出
          </button>
        ) : null}
      </div>
      <div className="terminal-log__body" ref={scrollerRef} onScroll={handleScroll}>
        {events.length ? events.map((event) => (
          <div key={event.sequence} className={`terminal-log__line terminal-log__line--${event.source}`}>
            <span className="terminal-log__time">{formatTime(event.createdAt)}</span>
            <span className="terminal-log__source">{sourceLabel(event.source)}</span>
            <code>{event.message}</code>
          </div>
        )) : (
          <div className="terminal-log__empty">暂无 steamcmd 输出。</div>
        )}
      </div>
    </section>
  );
}
