/**
 * apps/api/src/plugins-runtime/executor/session-overlay-pack.adapter.ts
 */

import type { PluginExecutionContext, PluginRawOutput } from '../types/plugin-execution-context';

const PLUGIN_KEY = 'session-overlay-pack';

const SESSIONS = [
  { id: 'tokyo',   label: 'Tokyo',    utcStart: 0,  utcEnd: 9,  color: '#38bdf8' },
  { id: 'london',  label: 'London',   utcStart: 7,  utcEnd: 16, color: '#a78bfa' },
  { id: 'newyork', label: 'New York', utcStart: 13, utcEnd: 22, color: '#fb923c' },
] as const;

export async function executeSessionOverlayPack(
  ctx: PluginExecutionContext,
): Promise<PluginRawOutput> {
  const candles = ctx.candles ?? [];

  if (candles.length < 2) {
    return { overlays: [], signals: [], indicators: [] };
  }

  let minPrice = Infinity;
  let maxPrice = -Infinity;
  for (const c of candles) {
    if (c.low  < minPrice) minPrice = c.low;
    if (c.high > maxPrice) maxPrice = c.high;
  }
  const pricePad = (maxPrice - minPrice) * 0.02;
  const upper    = maxPrice + pricePad;
  const lower    = minPrice - pricePad;

  const latestTime = new Date(candles[candles.length - 1].time);
  const dayStart   = new Date(latestTime);
  dayStart.setUTCHours(0, 0, 0, 0);

  const overlays: unknown[] = [];
  const nowUtc = new Date();

  for (const [i, session] of SESSIONS.entries()) {
    const sessionStart = new Date(dayStart);
    sessionStart.setUTCHours(session.utcStart, 0, 0, 0);
    const sessionEnd = new Date(dayStart);
    sessionEnd.setUTCHours(session.utcEnd, 0, 0, 0);

    const firstCandleTime = new Date(candles[0].time);
    if (sessionEnd < firstCandleTime) continue;

    const fromTime =
      sessionStart < firstCandleTime ? candles[0].time : sessionStart.toISOString();

    const toTime =
      nowUtc >= sessionStart && nowUtc <= sessionEnd
        ? null
        : sessionEnd.toISOString();

    overlays.push({
      id:        `${PLUGIN_KEY}-${session.id}`,
      pluginKey: PLUGIN_KEY,
      kind:      'zone' as const,
      label:     session.label,
      visible:   true,
      priority:  100 + i,
      style: {
        fillColor: `${session.color}18`,
        color:     session.color,
        opacity:   0.12,
        lineStyle: 'dashed' as const,
        lineWidth: 1,
      },
      geometry: {
        zoneType: 'demand' as const,
        fromTime,
        toTime,
        upper,
        lower,
      },
      meta: { sessionId: session.id, utcStart: session.utcStart, utcEnd: session.utcEnd },
    });
  }

  return {
    overlays,
    signals: [],
    indicators: [
      {
        id:        `${PLUGIN_KEY}-session-count`,
        pluginKey: PLUGIN_KEY,
        label:     'Active Sessions',
        value:     overlays.length,
        status:    'info' as const,
      },
    ],
  };
}