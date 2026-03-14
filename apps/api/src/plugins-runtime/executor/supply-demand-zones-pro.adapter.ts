/**
 * apps/api/src/plugins-runtime/executor/supply-demand-zones-pro.adapter.ts
 *
 * Supply Demand Zones PRO — Plugin Adapter（MVP 実装）
 *
 * 参照仕様:
 *   fxde_plugin_runtime_完全設計書 §10「Supply Demand Zones PRO の MVP 実装」
 *   fxde_plugin_runtime_完全設計書 §6.6「zone overlay」
 *
 * 設計方針:
 *   - plugin は TradingView Pine の描画コードを返さない
 *   - RuntimeOverlay の zone 形式でデータを返す
 *   - 計算ロジックは最小動作品。後で差し替えやすい構造にする。
 *   - zone 算出失敗時は plugin 単体失敗。全体停止禁止。
 *
 * zone 算出アルゴリズム（MVP 最小実装）:
 *   - 直近 candles の価格帯から需給ゾーンを簡易推定する
 *   - Supply Zone: 直近高値群の上下 ATR/2 の帯
 *   - Demand Zone: 直近安値群の上下 ATR/2 の帯
 *   - 最大 3 ゾーンずつ返す（表示優先度順）
 */

import type { PluginExecutionContext, PluginRawOutput } from '../types/plugin-execution-context';
import type { ZoneOverlayGeometry } from '@fxde/types';

const PLUGIN_KEY = 'supply-demand-zones-pro';

/**
 * Supply Demand Zones PRO の実行エントリポイント
 * PluginExecutor から呼び出される。
 */
export async function executeSupplyDemandZonesPro(
  ctx: PluginExecutionContext,
): Promise<PluginRawOutput> {
  const candles = ctx.candles ?? [];

  if (candles.length < 10) {
    // ローソク足が不足している場合は空結果を返す（失敗ではない）
    return { overlays: [], signals: [], indicators: [] };
  }

  const zones = calcZones(candles, ctx.symbol, ctx.timeframe);

  const overlays = zones.map((zone, i) => ({
    id:       `${PLUGIN_KEY}-zone-${i}`,
    pluginKey: PLUGIN_KEY,
    kind:     'zone' as const,
    label:    zone.zoneType === 'supply' ? 'Supply Zone' : 'Demand Zone',
    visible:  true,
    priority: i,
    style: {
      fillColor: zone.zoneType === 'supply' ? '#E0525220' : '#2EC96A20',
      color:     zone.zoneType === 'supply' ? '#E05252'   : '#2EC96A',
      opacity:   0.35,
    },
    geometry: {
      zoneType: zone.zoneType,
      fromTime: zone.fromTime,
      toTime:   zone.toTime,
      upper:    zone.upper,
      lower:    zone.lower,
    } satisfies ZoneOverlayGeometry,
    meta: {
      strength: zone.strength,
    },
  }));

  return {
    overlays,
    signals:    [],
    indicators: [
      {
        id:        `${PLUGIN_KEY}-zone-count`,
        pluginKey: PLUGIN_KEY,
        label:     'Active Zones',
        value:     zones.length,
        status:    'info' as const,
      },
    ],
  };
}

// ── ゾーン算出ロジック ──────────────────────────────────────────────────────

interface ZoneResult {
  zoneType: 'supply' | 'demand';
  fromTime: string | null;
  toTime:   string | null;
  upper:    number;
  lower:    number;
  strength: number;  // 0〜1 推定強度（将来拡張用）
}

/**
 * ローソク足から需給ゾーンを簡易算出する（MVP）。
 *
 * Supply Zone: 価格が大きく下落した起点（高値レジスタンス帯）
 * Demand Zone: 価格が大きく上昇した起点（安値サポート帯）
 *
 * アルゴリズム:
 *   1. ATR（14）を計算してゾーン幅の基準にする
 *   2. 直近 50 本の中から有意な高値・安値ピークを探す
 *   3. 各ピーク周辺の ATR×0.5 を帯としてゾーンを生成する
 *   4. 重複ゾーンをマージする
 *   5. 直近に近いゾーン優先で最大 3 件を返す
 */
function calcZones(
  candles: PluginExecutionContext['candles'],
  _symbol: string,
  _timeframe: string,
): ZoneResult[] {
  if (!candles || candles.length < 10) return [];

  // 直近 50 本に絞る
  const recent = candles.slice(-50);
  const n      = recent.length;

  // ATR(14) 簡易計算
  const atr = calcATR(recent, Math.min(14, n - 1));
  if (atr <= 0) return [];

  const halfAtr = atr * 0.5;

  const supplyZones: ZoneResult[] = [];
  const demandZones: ZoneResult[] = [];

  // ピーク探索（左右 3 本比較）
  const PEAK_LOOKBACK = 3;

  for (let i = PEAK_LOOKBACK; i < n - PEAK_LOOKBACK; i++) {
    const c = recent[i];

    // 高値ピーク（Supply Zone 候補）
    const isHighPeak = Array.from({ length: PEAK_LOOKBACK }, (_, k) => k + 1).every(
      (k) =>
        recent[i - k].high <= c.high &&
        recent[i + k].high <= c.high,
    );

    if (isHighPeak) {
      supplyZones.push({
        zoneType: 'supply',
        fromTime: recent[Math.max(0, i - 2)].time,
        toTime:   null,  // 現在まで延伸（フロントで「to now」として描画）
        upper:    round6(c.high + halfAtr * 0.3),
        lower:    round6(c.high - halfAtr),
        strength: calcStrength(recent, i, 'supply'),
      });
    }

    // 安値ピーク（Demand Zone 候補）
    const isLowPeak = Array.from({ length: PEAK_LOOKBACK }, (_, k) => k + 1).every(
      (k) =>
        recent[i - k].low >= c.low &&
        recent[i + k].low >= c.low,
    );

    if (isLowPeak) {
      demandZones.push({
        zoneType: 'demand',
        fromTime: recent[Math.max(0, i - 2)].time,
        toTime:   null,
        upper:    round6(c.low + halfAtr),
        lower:    round6(c.low - halfAtr * 0.3),
        strength: calcStrength(recent, i, 'demand'),
      });
    }
  }

  // 直近優先（後ろのインデックスが直近）・上位 3 件ずつ
  const topSupply = supplyZones.slice(-3).reverse();
  const topDemand = demandZones.slice(-3).reverse();

  // Supply → Demand の順で結合して返す
  return [...topSupply, ...topDemand];
}

/** ATR(period) 簡易計算 */
function calcATR(
  candles: NonNullable<PluginExecutionContext['candles']>,
  period: number,
): number {
  if (candles.length < 2) return 0;

  const trValues: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c    = candles[i];
    const prev = candles[i - 1];
    const tr   = Math.max(
      c.high - c.low,
      Math.abs(c.high - prev.close),
      Math.abs(c.low  - prev.close),
    );
    trValues.push(tr);
  }

  const slice = trValues.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

/** ゾーン強度の簡易推定（直後の方向性ムーブ確認） */
function calcStrength(
  candles: NonNullable<PluginExecutionContext['candles']>,
  peakIndex: number,
  zoneType: 'supply' | 'demand',
): number {
  const after = candles.slice(peakIndex + 1, peakIndex + 6);
  if (after.length === 0) return 0.5;

  if (zoneType === 'supply') {
    // 高値ピーク後に価格が下がっていれば strength 高
    const avgClose = after.reduce((s, c) => s + c.close, 0) / after.length;
    const peak     = candles[peakIndex].high;
    return Math.min(1, Math.max(0, (peak - avgClose) / peak * 50));
  } else {
    // 安値ピーク後に価格が上がっていれば strength 高
    const avgClose = after.reduce((s, c) => s + c.close, 0) / after.length;
    const trough   = candles[peakIndex].low;
    return Math.min(1, Math.max(0, (avgClose - trough) / trough * 50));
  }
}

function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}