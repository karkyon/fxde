# FXDE Phase2 Final State

## Project

FX Discipline Engine (FXDE) v5.1

## Phase

Phase2 --- DB Contract Fix

------------------------------------------------------------------------

# Phase2 実行結果

以下の工程が実行ログで成功していることを確認。

-   pnpm install
-   docker compose up
-   Postgres : 5436
-   Redis : 6386
-   packages build
-   prisma validate
-   prisma migrate dev --name init
-   prisma generate
-   prisma db seed
-   pnpm typecheck

------------------------------------------------------------------------

# Seed結果

  Entity          Count
  --------------- -------
  Users           3
  Settings        3
  Symbols         5
  Trades          2
  Reviews         1
  InterestRate    4
  EconomicEvent   3

------------------------------------------------------------------------

# Prisma Schema 構成

## Core

User\
Session\
UserSetting\
SymbolSetting

Trade\
TradeReview\
Snapshot

Signal\
PredictionJob\
PredictionResult

InterestRate\
EconomicEvent\
AuditLog

## Chart系

MarketCandle\
IndicatorCache\
PatternDetection\
ChartSnapshot

**Total: 17 Models**

------------------------------------------------------------------------

# DB設計ルール

## DB naming

snake_case

## Prisma model

PascalCase

## field

camelCase

## Mapping

@map\
@@map

------------------------------------------------------------------------

# Chart API DB構造

## Chart tables

MarketCandle\
IndicatorCache\
PatternDetection\
ChartSnapshot

## Timeframe enum

M1\
M5\
M15\
M30\
H1\
H4\
H8\
D1\
W1\
MN

------------------------------------------------------------------------

# Phase2で発生した修正

## packages/types/tsconfig.json

include に seed.ts が含まれていたため rootDir エラー発生

修正

include: \["src"\]

------------------------------------------------------------------------

## prisma/schema.prisma

先頭コメントが Prisma 構文違反

修正

/ ============================================================\
↓\
// ============================================================

------------------------------------------------------------------------

# Schemaレビュー結果

以下すべて成功

-   prisma validate
-   prisma migrate
-   prisma generate
-   prisma seed
-   pnpm typecheck

重大な設計問題は確認されていない。

------------------------------------------------------------------------

# 留意事項

## PatternDetection

patternCategory\
direction

DBでは string

API仕様では

patternCategory - CANDLESTICK - FORMATION

direction - bullish - bearish - neutral

Service層 validation にて制御予定

------------------------------------------------------------------------

## ChartSnapshot

tradeId

nullable

v5.1では未使用\
v6でTrade連携予定

------------------------------------------------------------------------

## UserSetting / SymbolSetting

threshold 等の制約は

DB CHECK ではなく

Service validation で制御

------------------------------------------------------------------------

# Phase2 完了判定

Phase2 状態

**Phase2 DB CONTRACT FIXED**

------------------------------------------------------------------------

# Phase2 禁止事項確認

以下は未実装

-   Controller
-   Service
-   Module
-   Auth
-   API
-   Frontend

Phase2範囲外作業は未実施。

------------------------------------------------------------------------

# 最終判定

FXDE Phase2

**COMPLETE**

------------------------------------------------------------------------

# Next Phase

Phase3 Backend Core
