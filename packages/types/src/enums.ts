// packages/types/src/enums.ts
//
// ⚠️ このファイルは廃止済みです。何もエクスポートしません。
//
// 廃止理由:
//   - TradeDirection { LONG, SHORT }
//       → TradeSide = 'BUY' | 'SELL'  (FXDE_Canonical_Domain_Model.md)
//   - TradeStatus: CANCELED 欠落
//       → type TradeStatus = 'OPEN' | 'CLOSED' | 'CANCELED'  (index.ts)
//   - PredictionStatus → JobStatus、PENDING → QUEUED
//       → type JobStatus = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED'  (index.ts)
//   - enum → string union type に統一（Prisma native enum との整合性確保）
//
// 全定義は packages/types/src/index.ts を参照すること。
// 参照: SPEC_v51_part1 §0「確定宣言」