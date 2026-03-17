/**
 * apps/web/src/components/chart/chart-bridge.ts
 *
 * Chart Bridge — LWC 座標系を Overlay Layer に露出する抽象層。
 * Chart engine を交換しても bridge interface を維持すれば overlay は無変更。
 */

import type { IChartApi, ISeriesApi } from 'lightweight-charts';

export interface ChartBridge {
  /** ISO時刻文字列 → container pixel X（範囲外は null）*/
  timeToX(isoTime: string): number | null;
  /** 価格 → container pixel Y（null = 範囲外）*/
  priceToY(price: number): number | null;
  /** bridge 更新時コールバック登録。戻り値は unsubscribe 関数 */
  subscribe(cb: () => void): () => void;
  /** container の現在サイズ */
  dimensions(): { width: number; height: number };
}

export function createChartBridge(
  chart: IChartApi,
  series: ISeriesApi<'Candlestick'>,
  container: HTMLElement,
): ChartBridge {
  const listeners = new Set<() => void>();
  const notify    = () => listeners.forEach((cb) => cb());

  chart.timeScale().subscribeVisibleLogicalRangeChange(notify);
  chart.subscribeCrosshairMove(notify);

  return {
    timeToX(isoTime: string): number | null {
      const utcSec = Math.floor(new Date(isoTime).getTime() / 1000) as unknown as import('lightweight-charts').UTCTimestamp;
      return chart.timeScale().timeToCoordinate(utcSec);
    },

    priceToY(price: number): number | null {
      return series.priceToCoordinate(price);
    },

    subscribe(cb: () => void): () => void {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },

    dimensions(): { width: number; height: number } {
      return { width: container.clientWidth, height: container.clientHeight };
    },
  };
}