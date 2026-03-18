/**
 * apps/api/src/modules/market-data/indicator-engine.service.ts
 *
 * Indicator 計算エンジン（純粋計算サービス）
 *
 * 参照仕様:
 *   SPEC_v51_part4 §1「スコアエンジン計算式」
 *   packages/types/src/index.ts SnapshotIndicators
 *   packages/shared/src/score-engine.ts ScoreIndicators
 *
 * 設計原則:
 *   - DB アクセス禁止（Prisma inject 禁止）
 *   - Provider 呼び出し禁止
 *   - 純粋計算のみ（@Injectable だが副作用なし）
 *   - class-validator 使用禁止
 *
 * 責務:
 *   入力: IndicatorCandle[]（OHLC のみ）
 *   出力: IndicatorCacheShape（indicator_cache.indicators JSONB の正規形）
 *
 * IndicatorCacheShape は以下の両方を満たす:
 *   - ScoreIndicators（packages/shared）← calculateScore() の入力
 *   - SnapshotIndicators（packages/types）← snapshot DB 保存用
 *   - chart getIndicators 用フィールド（value/status/position/bias 等）
 *
 * 必要本数（下記に満たない場合は 0 / false / neutral を返す）:
 *   MA200: 200本以上推奨
 *   MACD(12,26,9): 35本以上で有効
 *   BB(20): 20本以上で有効
 *   RSI(14): 15本以上で有効
 *   ATR(14): 15本以上で有効
 */

import { Injectable } from '@nestjs/common';

// ── 入力型 ──────────────────────────────────────────────────────────────────

export interface IndicatorCandle {
  open:  number;
  high:  number;
  low:   number;
  close: number;
}

// ── 出力型（indicator_cache.indicators の正規形）────────────────────────────
//
// Snapshot 用フィールド（SnapshotIndicators 準拠）:
//   ma: { ma50, ma200, slope, crossStatus }
//   rsi: { value, divergence }
//   macd: { macdLine, signal, histogram, crossStatus }
//   bb: { upper, mid, lower, bandwidth }
//   atr: { value, ratio }
//
// Chart 用追加フィールド（STUB_INDICATORS 形状準拠）:
//   ma.value, ma.status
//   rsi.status
//   macd.macd（= macdLine の alias）, macd.status
//   bb.middle（= mid の alias）, bb.position, bb.status
//   atr.status
//   bias: { direction, strength, label, status }

export interface IndicatorCacheShape {
  ma: {
    ma50:        number;
    ma200:       number;
    slope:       number;
    crossStatus: 'GC' | 'DC' | 'NONE';
    value:       number;    // chart 表示用（= ma50）
    status:      'bullish' | 'bearish' | 'neutral';
  };
  rsi: {
    value:      number;
    divergence: boolean;
    status:     'bullish' | 'bearish' | 'neutral';
  };
  macd: {
    macdLine:    number;
    signal:      number;
    histogram:   number;
    crossStatus: 'GC' | 'DC' | 'NONE';
    macd:        number;    // chart 用 alias（= macdLine）
    status:      'bullish' | 'bearish' | 'neutral';
  };
  bb: {
    upper:     number;
    mid:       number;     // SnapshotIndicators 準拠
    lower:     number;
    bandwidth: number;
    middle:    number;     // chart 用 alias（= mid）
    position:  string;
    status:    'bullish' | 'bearish' | 'neutral';
  };
  atr: {
    value:  number;
    ratio:  number;
    status: 'normal' | 'high' | 'low';
  };
  bias: {
    direction: 'buy' | 'sell' | 'neutral';
    strength:  'strong' | 'moderate' | 'weak';
    label:     string;
    status:    'bullish' | 'bearish' | 'neutral';
  };
}

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class IndicatorEngineService {
  /**
   * candle[] から全 indicator を計算して IndicatorCacheShape を返す。
   *
   * candles は時系列昇順（最古 → 最新）で渡すこと。
   * candles が空または極端に少ない場合は全フィールドが 0 / false / neutral になる。
   * これは STUB_INDICATORS と同等だが意図的（データ不足の明示）。
   */
  calculate(candles: IndicatorCandle[]): IndicatorCacheShape {
    const closes = candles.map((c) => c.close);
    const highs  = candles.map((c) => c.high);
    const lows   = candles.map((c) => c.low);
    const n      = closes.length;

    // ── MA(50, 200) ───────────────────────────────────────────────────────
    const ma50  = this._sma(closes, 50);
    const ma200 = this._sma(closes, 200);

    // slope: 直近 4 本分の MA50 差分（3 期間平均変化）
    const ma50Prev3 = n >= 54 ? this._smaAt(closes, 50, n - 4) : ma50;
    const slope     = n >= 54 ? (ma50 - ma50Prev3) / 3 : 0;

    // crossStatus: 直前バーと現在バーで GC / DC 判定
    let maCrossStatus: 'GC' | 'DC' | 'NONE' = 'NONE';
    if (n >= 202) {
      const prevMa50  = this._smaAt(closes, 50,  n - 2);
      const prevMa200 = this._smaAt(closes, 200, n - 2);
      if (prevMa50 < prevMa200 && ma50 >= ma200) maCrossStatus = 'GC';
      else if (prevMa50 > prevMa200 && ma50 <= ma200) maCrossStatus = 'DC';
    }

    const maStatus: 'bullish' | 'bearish' | 'neutral' =
      ma50 > ma200 && slope > 0 ? 'bullish' :
      ma50 < ma200 && slope < 0 ? 'bearish' : 'neutral';

    // ── RSI(14) ──────────────────────────────────────────────────────────
    const rsiValue = this._rsi(closes, 14);
    const rsiStatus: 'bullish' | 'bearish' | 'neutral' =
      rsiValue <= 35 ? 'bullish' :
      rsiValue >= 65 ? 'bearish' : 'neutral';

    // ── MACD(12, 26, 9) ──────────────────────────────────────────────────
    const macdResult = this._macd(closes, 12, 26, 9);
    const macdStatus: 'bullish' | 'bearish' | 'neutral' =
      macdResult.macdLine > 0 && macdResult.histogram > 0 ? 'bullish' :
      macdResult.macdLine < 0 && macdResult.histogram < 0 ? 'bearish' : 'neutral';

    // ── Bollinger Bands(20, 2σ) ──────────────────────────────────────────
    const { upper: bbUpper, middle: bbMiddle, lower: bbLower } =
      this._bb(closes, 20, 2);
    const lastClose = closes[n - 1] ?? 0;
    const bandwidth = bbMiddle > 0 ? (bbUpper - bbLower) / bbMiddle : 0;
    const bbPosition = this._bbPosition(lastClose, bbUpper, bbMiddle, bbLower);
    const bbStatus: 'bullish' | 'bearish' | 'neutral' =
      lastClose < bbLower ? 'bullish' :
      lastClose > bbUpper ? 'bearish' : 'neutral';

    // ── ATR(14) / Wilder平滑化 ──────────────────────────────────────────
    const atrSeries = this._atrSeries(highs, lows, closes, 14);
    const atrValue  = atrSeries[atrSeries.length - 1] ?? 0;
    // ratio: 直近 ATR / 過去 50 本平均 ATR
    const atrAvg50  = atrSeries.length >= 50
      ? atrSeries.slice(-50).reduce((s, v) => s + v, 0) / 50
      : atrValue;
    const atrRatio  = atrAvg50 > 0 ? atrValue / atrAvg50 : 1;
    const atrStatus: 'normal' | 'high' | 'low' =
      atrRatio > 1.5 ? 'high' :
      atrRatio < 0.5 ? 'low'  : 'normal';

    // ── Bias（MA + MACD + RSI 3指標の多数決）────────────────────────────
    const bullPoints =
      (ma50 > ma200 ? 1 : 0) +
      (macdResult.macdLine > macdResult.signal ? 1 : 0) +
      (rsiValue > 50 ? 1 : 0);
    const biasDir: 'buy' | 'sell' | 'neutral' =
      bullPoints >= 2 ? 'buy' :
      bullPoints === 0 ? 'sell' : 'neutral';
    const biasStrength: 'strong' | 'moderate' | 'weak' =
      bullPoints === 3 || bullPoints === 0 ? 'strong' : 'moderate';
    const biasStatus: 'bullish' | 'bearish' | 'neutral' =
      biasDir === 'buy'  ? 'bullish' :
      biasDir === 'sell' ? 'bearish' : 'neutral';

    return {
      ma: {
        ma50,
        ma200,
        slope,
        crossStatus: maCrossStatus,
        value:       ma50,
        status:      maStatus,
      },
      rsi: {
        value:      rsiValue,
        divergence: false,  // v5.1: divergence 判定未実装（v6 対象）
        status:     rsiStatus,
      },
      macd: {
        macdLine:    macdResult.macdLine,
        signal:      macdResult.signal,
        histogram:   macdResult.histogram,
        crossStatus: macdResult.crossStatus,
        macd:        macdResult.macdLine, // chart 用 alias
        status:      macdStatus,
      },
      bb: {
        upper:     bbUpper,
        mid:       bbMiddle,  // SnapshotIndicators 準拠キー
        lower:     bbLower,
        bandwidth,
        middle:    bbMiddle,  // chart 用 alias
        position:  bbPosition,
        status:    bbStatus,
      },
      atr: {
        value:  atrValue,
        ratio:  atrRatio,
        status: atrStatus,
      },
      bias: {
        direction: biasDir,
        strength:  biasStrength,
        label:     `Bias: ${biasDir} ${biasStrength}`,
        status:    biasStatus,
      },
    };
  }

  // ── 内部計算ヘルパー（private）──────────────────────────────────────────

  /**
   * SMA: 末尾 period 本の単純移動平均
   * 本数不足時は 0 を返す（スタブと同等）
   */
  private _sma(values: number[], period: number): number {
    const n = values.length;
    if (n < period) return 0;
    return values.slice(n - period).reduce((s, v) => s + v, 0) / period;
  }

  /**
   * 特定インデックスを末尾とした SMA
   * endIdx: 配列インデックス（0 始まり）
   */
  private _smaAt(values: number[], period: number, endIdx: number): number {
    const start = endIdx - period + 1;
    if (start < 0 || endIdx >= values.length) return 0;
    const slice = values.slice(start, endIdx + 1);
    return slice.reduce((s, v) => s + v, 0) / slice.length;
  }

  /**
   * EMA（指数移動平均）
   * period 本に満たないインデックスは 0 を入れる
   * 最初の有効値は SMA シード
   */
  private _ema(values: number[], period: number): number[] {
    const k      = 2 / (period + 1);
    const result : number[] = [];
    let   seed   = values.slice(0, period).reduce((s, v) => s + v, 0) / (period || 1);

    for (let i = 0; i < values.length; i++) {
      if (i < period - 1) { result.push(0); continue; }
      if (i === period - 1) { result.push(seed); continue; }
      seed = values[i] * k + seed * (1 - k);
      result.push(seed);
    }
    return result;
  }

  /**
   * RSI(14): 末尾 period+1 本を使った単純 Wilder RSI
   */
  private _rsi(closes: number[], period: number): number {
    if (closes.length < period + 1) return 50;
    const slice = closes.slice(closes.length - period - 1);
    let gain = 0, loss = 0;
    for (let i = 1; i < slice.length; i++) {
      const diff = slice[i] - slice[i - 1];
      if (diff > 0) gain += diff;
      else loss += Math.abs(diff);
    }
    const avgGain = gain / period;
    const avgLoss = loss / period;
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - 100 / (1 + rs);
  }

  /**
   * MACD(fast, slow, signal)
   * GC: MACD が signal を上抜け / DC: 下抜け
   */
  private _macd(
    closes: number[],
    fast:   number,
    slow:   number,
    sigPeriod: number,
  ): {
    macdLine:    number;
    signal:      number;
    histogram:   number;
    crossStatus: 'GC' | 'DC' | 'NONE';
  } {
    const fallback = { macdLine: 0, signal: 0, histogram: 0, crossStatus: 'NONE' as const };
    if (closes.length < slow + sigPeriod) return fallback;

    const emaFast    = this._ema(closes, fast);
    const emaSlow    = this._ema(closes, slow);
    const macdSeries = emaFast.map((f, i) => (f === 0 || emaSlow[i] === 0) ? 0 : f - emaSlow[i]);

    // signal line: MACD が有効になった箇所（index >= slow-1）以降を対象
    const validStart  = slow - 1;
    const validMacd   = macdSeries.slice(validStart);
    const signalSeries = this._ema(validMacd, sigPeriod);

    const lastMacd = macdSeries[macdSeries.length - 1] ?? 0;
    const lastSig  = signalSeries[signalSeries.length - 1] ?? 0;
    const prevMacd = macdSeries.length >= 2 ? macdSeries[macdSeries.length - 2] : lastMacd;
    const prevSig  = signalSeries.length >= 2 ? signalSeries[signalSeries.length - 2] : lastSig;

    let crossStatus: 'GC' | 'DC' | 'NONE' = 'NONE';
    if (prevMacd <= prevSig && lastMacd > lastSig) crossStatus = 'GC';
    else if (prevMacd >= prevSig && lastMacd < lastSig) crossStatus = 'DC';

    return {
      macdLine:  lastMacd,
      signal:    lastSig,
      histogram: lastMacd - lastSig,
      crossStatus,
    };
  }

  /**
   * Bollinger Bands(period, stdMult)
   * 本数不足時は { upper: 0, middle: 0, lower: 0 }
   */
  private _bb(
    closes:  number[],
    period:  number,
    stdMult: number,
  ): { upper: number; middle: number; lower: number } {
    if (closes.length < period) return { upper: 0, middle: 0, lower: 0 };
    const slice    = closes.slice(closes.length - period);
    const mean     = slice.reduce((s, v) => s + v, 0) / period;
    const variance = slice.reduce((s, v) => s + (v - mean) ** 2, 0) / period;
    const std      = Math.sqrt(variance);
    return {
      upper:  mean + stdMult * std,
      middle: mean,
      lower:  mean - stdMult * std,
    };
  }

  /**
   * ATR シリーズ（Wilder 平滑化）
   * 戻り値: ATR の系列（TR の Wilder 平均）
   */
  private _atrSeries(
    highs:  number[],
    lows:   number[],
    closes: number[],
    period: number,
  ): number[] {
    if (highs.length < 2) return [];

    // True Range 系列
    const trs: number[] = [];
    for (let i = 1; i < highs.length; i++) {
      trs.push(Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - closes[i - 1]),
        Math.abs(lows[i]  - closes[i - 1]),
      ));
    }

    if (trs.length < period) return trs;

    // 最初の ATR は SMA
    const atrArr: number[] = [];
    let   atr = trs.slice(0, period).reduce((s, v) => s + v, 0) / period;
    atrArr.push(atr);

    // Wilder 平滑化: ATR(n) = (ATR(n-1) * (period-1) + TR(n)) / period
    for (let i = period; i < trs.length; i++) {
      atr = (atr * (period - 1) + trs[i]) / period;
      atrArr.push(atr);
    }
    return atrArr;
  }

  /**
   * BB バンド内の価格位置ラベル
   */
  private _bbPosition(
    price:  number,
    upper:  number,
    middle: number,
    lower:  number,
  ): string {
    if (upper === 0) return 'unknown';
    if (price > upper)                     return 'above-upper';
    if (price > middle && price <= upper)  return 'upper-middle';
    if (price >= lower && price <= middle) return 'lower-middle';
    if (price < lower)                     return 'below-lower';
    return 'middle';
  }
}