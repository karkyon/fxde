/**
 * apps/api/src/plugins-runtime/context/condition-context-engine.service.ts
 *
 * Condition Context Engine
 * pattern 検出時の周辺コンテキストを算出し PatternEventContext を返す。
 *
 * 参照: FXDE_Condition_Context_Engine_完全設計 §8〜§9
 *
 * 設計原則:
 *   - detector ロジックは変更しない
 *   - context 計算はこの service に集約
 *   - v1: EMA20/50 + slope でトレンド判定
 */

import { Injectable } from '@nestjs/common';
import type { PatternEventContext, TrendDirection, TrendAlignment, SessionType, AtrRegime, SwingBias, BreakoutContext, PatternDirection } from '@fxde/types';
import type { Candle } from '../types/plugin-execution-context';

// ── Higher Timeframe mapping ─────────────────────────────────────────────
const HTF_MAP: Record<string, string> = {
  M1:  'M5',
  M5:  'M15',
  M15: 'H1',
  M30: 'H1',
  H1:  'H4',
  H4:  'D1',
  H8:  'D1',
  D1:  'W1',
  W1:  'MN',
  MN:  'MN',
};

export interface BuildConditionContextInput {
  symbol:       string
  timeframe:    string
  candles:      Candle[]
  detectedIndex: number
  patternType:  string
  direction?:   string
}

@Injectable()
export class ConditionContextEngineService {

  build(input: BuildConditionContextInput): PatternEventContext {
    const { symbol, timeframe, candles, detectedIndex, patternType, direction } = input;
    const slice = candles.slice(0, detectedIndex + 1);
    const detectedAt = candles[detectedIndex]?.time ?? new Date().toISOString();

    return {
      time:       this._buildTime(detectedAt),
      market:     this._buildMarket(symbol),
      timeframe:  { current: timeframe, higher: HTF_MAP[timeframe] ?? null },
      trend:      this._buildTrend(slice),
      volatility: this._buildVolatility(slice),
      structure:  this._buildStructure(slice),
      pattern: {
        patternType,
        direction:    this._normalizeDirection(direction),
        qualityScore: null,
      },
    };
  }

  // ── Time ────────────────────────────────────────────────────────────────

  private _buildTime(detectedAt: string): PatternEventContext['time'] {
    const d = new Date(detectedAt);
    const hourUTC = d.getUTCHours();
    return {
      detectedAt,
      hourOfDay: hourUTC,
      dayOfWeek: d.getUTCDay(),
      session:   this._getSession(hourUTC),
    };
  }

  private _getSession(hourUTC: number): SessionType {
    if (hourUTC >= 0  && hourUTC < 8)  return 'asia';
    if (hourUTC >= 8  && hourUTC < 13) return 'london';
    if (hourUTC >= 13 && hourUTC < 17) return 'overlap';
    if (hourUTC >= 17 && hourUTC < 21) return 'newyork';
    return 'offhours';
  }

  // ── Market ──────────────────────────────────────────────────────────────

  private _buildMarket(symbol: string): PatternEventContext['market'] {
    const s = symbol.toUpperCase();
    let marketType: PatternEventContext['market']['marketType'] = 'fx';
    if (s.includes('BTC') || s.includes('ETH')) marketType = 'crypto';
    else if (s.includes('XAU') || s.includes('OIL')) marketType = 'commodity';
    else if (s.includes('SPX') || s.includes('NAS') || s.includes('JP225')) marketType = 'index';
    return { symbol, marketType };
  }

  // ── Trend（EMA20/50 + slope）────────────────────────────────────────────

  private _buildTrend(candles: Candle[]): PatternEventContext['trend'] {
    const currentTrend = this._calcTrend(candles, 20, 50);
    // v1: 上位足データなしのため current と同じを fallback
    const higherTrend: TrendDirection = 'unknown';
    const trendAlignment = this._calcAlignment(currentTrend, higherTrend);
    return { currentTrend, higherTrend, trendAlignment };
  }

  private _calcTrend(candles: Candle[], fast: number, slow: number): TrendDirection {
    if (candles.length < slow) return 'unknown';
    const closes = candles.map((c) => c.close);
    const ema20 = this._ema(closes, fast);
    const ema50 = this._ema(closes, slow);
    const last  = closes.length - 1;
    if (ema20[last] === undefined || ema50[last] === undefined) return 'unknown';
    const slope = ema20[last] - ema20[Math.max(0, last - 3)];
    if (ema20[last] > ema50[last] && slope > 0) return 'up';
    if (ema20[last] < ema50[last] && slope < 0) return 'down';
    return 'range';
  }

  private _ema(values: number[], period: number): number[] {
    const k = 2 / (period + 1);
    const result: number[] = [];
    for (let i = 0; i < values.length; i++) {
      if (i === 0) { result.push(values[0]); continue; }
      result.push(values[i] * k + result[i - 1] * (1 - k));
    }
    return result;
  }

  private _calcAlignment(current: TrendDirection, higher: TrendDirection): TrendAlignment {
    if (current === 'up'   && higher === 'up')   return 'aligned_bull';
    if (current === 'down' && higher === 'down')  return 'aligned_bear';
    if (current === 'range' || higher === 'range') return 'range';
    if (higher === 'unknown') return 'unknown';
    return 'mixed';
  }

  // ── Volatility（ATR14）─────────────────────────────────────────────────

  private _buildVolatility(candles: Candle[]): PatternEventContext['volatility'] {
    const period = 14;
    if (candles.length < period + 1) {
      return { atr: null, atrPercent: null, atrRegime: 'unknown' };
    }
    const trs: number[] = [];
    for (let i = 1; i < candles.length; i++) {
      const h = candles[i].high;
      const l = candles[i].low;
      const pc = candles[i - 1].close;
      trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
    }
    const recent = trs.slice(-period);
    const atr = recent.reduce((s, v) => s + v, 0) / period;
    const lastClose = candles[candles.length - 1].close;
    const atrPercent = lastClose > 0 ? (atr / lastClose) * 100 : null;

    // regime: 過去N本の平均ATR比で判定
    const histTrs = trs.slice(-(period * 3));
    const avgHistAtr = histTrs.length > 0
      ? histTrs.reduce((s, v) => s + v, 0) / histTrs.length
      : atr;
    const ratio = avgHistAtr > 0 ? atr / avgHistAtr : 1;
    let atrRegime: AtrRegime = 'normal';
    if (ratio < 0.7)  atrRegime = 'low';
    else if (ratio < 1.3) atrRegime = 'normal';
    else if (ratio < 1.8) atrRegime = 'high';
    else atrRegime = 'extreme';

    return {
      atr:        Math.round(atr * 100000) / 100000,
      atrPercent: atrPercent !== null ? Math.round(atrPercent * 1000) / 1000 : null,
      atrRegime,
    };
  }

  // ── Structure ───────────────────────────────────────────────────────────

  private _buildStructure(candles: Candle[]): PatternEventContext['structure'] {
    if (candles.length < 10) {
      return { recentSwingBias: 'unknown', breakoutContext: 'unknown' };
    }
    const recent = candles.slice(-10);
    const highs  = recent.map((c) => c.high);
    const lows   = recent.map((c) => c.low);
    const maxH   = Math.max(...highs);
    const minL   = Math.min(...lows);
    const last   = candles[candles.length - 1];

    let recentSwingBias: SwingBias = 'neutral';
    if (last.close > (maxH + minL) / 2 * 1.002) recentSwingBias = 'bullish';
    else if (last.close < (maxH + minL) / 2 * 0.998) recentSwingBias = 'bearish';

    let breakoutContext: BreakoutContext = 'inside_range';
    const prev10 = candles.slice(-20, -10);
    if (prev10.length === 10) {
      const prevHigh = Math.max(...prev10.map((c) => c.high));
      const prevLow  = Math.min(...prev10.map((c) => c.low));
      if (last.close > prevHigh) breakoutContext = 'post_breakout';
      else if (last.close < prevLow) breakoutContext = 'post_breakout';
    }

    return { recentSwingBias, breakoutContext };
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private _normalizeDirection(dir?: string): PatternDirection {
    if (!dir) return 'unknown';
    const d = dir.toLowerCase();
    if (d === 'buy' || d === 'bullish') return 'bullish';
    if (d === 'sell' || d === 'bearish') return 'bearish';
    if (d === 'neutral') return 'neutral';
    return 'unknown';
  }
}