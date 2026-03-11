// apps/api/src/modules/symbols/symbols.constants.ts

export interface SymbolDefinition {
  symbol: string;
  pipSize: number;
}

/**
 * システム定義の FX 通貨ペア一覧（固定・ユーザー変更不可）
 * SPEC v5.1 Part3 §6 Symbols API 準拠
 * "EURUSD" | "USDJPY" | "GBPUSD" | "USDCHF"
 * | "AUDUSD" | "NZDUSD" | "USDCAD" | "XAUUSD"
 */
export const SYMBOLS: SymbolDefinition[] = [
  { symbol: 'EURUSD', pipSize: 0.0001 },
  { symbol: 'USDJPY', pipSize: 0.01   },
  { symbol: 'GBPUSD', pipSize: 0.0001 },
  { symbol: 'USDCHF', pipSize: 0.0001 },
  { symbol: 'AUDUSD', pipSize: 0.0001 },
  { symbol: 'NZDUSD', pipSize: 0.0001 },
  { symbol: 'USDCAD', pipSize: 0.0001 },
  { symbol: 'XAUUSD', pipSize: 0.01   },
];