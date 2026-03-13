/**
 * apps/web/src/lib/chart/viewport.ts
 *
 * チャート表示範囲（visible range）操作ユーティリティ
 * index ベースで candles の可視範囲を管理する
 */

export interface VisibleRange {
  start: number;
  end:   number;
}

/** デフォルト表示本数 */
export const DEFAULT_VISIBLE_COUNT = 80;
/** 最小表示本数 */
export const MIN_VISIBLE_COUNT = 10;

/**
 * 初期 visible range を計算する
 * データ末尾から DEFAULT_VISIBLE_COUNT 本を表示
 */
export function initVisibleRange(totalCandles: number): VisibleRange {
  if (totalCandles === 0) return { start: 0, end: 0 };
  const count = Math.min(DEFAULT_VISIBLE_COUNT, totalCandles);
  return {
    start: Math.max(0, totalCandles - count),
    end:   totalCandles - 1,
  };
}

/**
 * visible range を total 範囲内にクランプする
 */
export function clampVisibleRange(
  range: VisibleRange,
  totalCandles: number,
): VisibleRange {
  if (totalCandles === 0) return { start: 0, end: 0 };
  const maxEnd   = totalCandles - 1;
  const end      = Math.min(range.end, maxEnd);
  const start    = Math.max(0, Math.min(range.start, end - MIN_VISIBLE_COUNT + 1));
  return { start, end };
}

/**
 * ズームイン: visible range を中心から狭める
 * @param factor 0〜1 未満の縮小率（例: 0.8 → 20%縮小）
 */
export function zoomInVisibleRange(
  range: VisibleRange,
  totalCandles: number,
  factor = 0.7,
): VisibleRange {
  const visible = range.end - range.start + 1;
  const newVisible = Math.max(MIN_VISIBLE_COUNT, Math.floor(visible * factor));
  const center = Math.floor((range.start + range.end) / 2);
  const half   = Math.floor(newVisible / 2);
  return clampVisibleRange(
    { start: center - half, end: center - half + newVisible - 1 },
    totalCandles,
  );
}

/**
 * ズームアウト: visible range を中心から広げる
 * @param factor 1 より大きい拡大率（例: 1.4 → 40%拡大）
 */
export function zoomOutVisibleRange(
  range: VisibleRange,
  totalCandles: number,
  factor = 1.4,
): VisibleRange {
  const visible    = range.end - range.start + 1;
  const newVisible = Math.min(totalCandles, Math.ceil(visible * factor));
  const center     = Math.floor((range.start + range.end) / 2);
  const half       = Math.floor(newVisible / 2);
  return clampVisibleRange(
    { start: center - half, end: center - half + newVisible - 1 },
    totalCandles,
  );
}

/**
 * パン: visible range を delta 本分左右に移動する
 * @param delta 正 = 右へ（新しいデータ方向）、負 = 左へ（古いデータ方向）
 */
export function panVisibleRange(
  range: VisibleRange,
  totalCandles: number,
  delta: number,
): VisibleRange {
  const visible = range.end - range.start + 1;
  let start = range.start + delta;
  let end   = range.end + delta;

  // 範囲外クランプ
  if (end > totalCandles - 1) {
    end   = totalCandles - 1;
    start = end - visible + 1;
  }
  if (start < 0) {
    start = 0;
    end   = start + visible - 1;
  }
  return clampVisibleRange({ start, end }, totalCandles);
}

/**
 * Navigator のドラッグ操作から visible range を計算する
 * @param navWidth  navigator SVG の幅（px）
 * @param dragX     ドラッグ位置（px）
 * @param visible   現在の visible range の幅
 * @param totalCandles  全 candle 本数
 */
export function navXToRange(
  navWidth: number,
  dragStartX: number,
  dragEndX: number,
  totalCandles: number,
): VisibleRange {
  const toIndex = (x: number) =>
    Math.round((x / navWidth) * (totalCandles - 1));
  const start = Math.max(0, toIndex(Math.min(dragStartX, dragEndX)));
  const end   = Math.min(totalCandles - 1, toIndex(Math.max(dragStartX, dragEndX)));
  if (end - start < MIN_VISIBLE_COUNT - 1) {
    return clampVisibleRange({ start, end: start + MIN_VISIBLE_COUNT - 1 }, totalCandles);
  }
  return { start, end };
}