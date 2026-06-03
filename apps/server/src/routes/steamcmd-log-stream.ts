import type { Response } from 'express';
import type { SteamCmdLogEvent } from '../../../../packages/shared/src';
import { SteamCmdLogStore } from '../modules/steamcmd-log-store';

export function readPositiveInteger(value: unknown, fallback: number, max = Number.MAX_SAFE_INTEGER) {
  const parsed = typeof value === 'string' ? Number.parseInt(value, 10) : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }

  return Math.min(max, Math.floor(parsed));
}

export function createLogsResponse(events: SteamCmdLogEvent[]) {
  return {
    events,
    nextSequence: events.length ? events[events.length - 1].sequence : 0,
  };
}

function writeSseEvent(response: Response, event: SteamCmdLogEvent) {
  response.write(`id: ${event.sequence}\n`);
  response.write('event: log\n');
  response.write(`data: ${JSON.stringify(event)}\n\n`);
}

export function streamLogs(
  response: Response,
  logStore: SteamCmdLogStore,
  initialEvents: SteamCmdLogEvent[],
  matches: (event: SteamCmdLogEvent) => boolean,
) {
  response.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  response.write(': connected\n\n');

  let lastSequence = 0;
  initialEvents.forEach((event) => {
    writeSseEvent(response, event);
    lastSequence = Math.max(lastSequence, event.sequence);
  });

  const unsubscribe = logStore.subscribe((event) => {
    if (event.sequence <= lastSequence || !matches(event)) {
      return;
    }

    writeSseEvent(response, event);
    lastSequence = event.sequence;
  });
  const heartbeat = setInterval(() => {
    response.write(': heartbeat\n\n');
  }, 15000);

  response.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
    response.end();
  });
}
