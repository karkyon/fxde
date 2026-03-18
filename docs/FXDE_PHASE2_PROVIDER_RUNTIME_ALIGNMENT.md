# FXDE Phase 2 — Provider Runtime Alignment メモ

作成日: 2026-03-18
対象: Phase 2 完了後の実行環境整合化記録

---

## 何が変わったか

Phase 2 で Dukascopy を研究主系 provider として導入した。
これに伴い以下が変更された。

| ファイル | 変更内容 |
|---|---|
| `apps/api/src/modules/market-data/dukascopy.provider.ts` | 新規作成 |
| `apps/api/src/modules/market-data/provider.registry.ts` | Dukascopy 登録追加 |
| `apps/api/src/modules/market-data/market-data.module.ts` | DukascopyProvider 追加 |
| `apps/api/src/modules/connectors/connectors.service.ts` | provider-aware 化 |
| `apps/api/.env.example` | provider 切替変数 3 件追加 |
| `.env.example`（ルート）| provider 切替変数 3 件追記 |
| `infra/docker/docker-compose.yml` | api.environment に pass-through 追加 |
| `scripts/setup.sh` | .env 作成後メッセージにガイダンス追加 |

---

## どの env を見ればよいか

### ローカル直起動（開発）
- `apps/api/.env` が優先される（NestJS ConfigModule）
- `apps/api/.env.example` からコピーして作成する

### scripts（setup.sh / phase2-run.sh）
- ルート `.env.example` → ルート `.env` を作成する
- ルート `.env` は scripts の内部変数として使われる（DB 接続確認等）
- API 起動そのものは `apps/api/.env` が使われる

### Docker 起動（`pnpm docker:up`）
- `infra/docker/docker-compose.yml` の `api.environment` が API コンテナへ渡す
- `${VARIABLE:-default}` 記法でホスト側 `.env` の値を pass-through する
- ホスト側でルート `.env` に provider 変数を設定することで切替可能

---

## provider 切替手順

### OANDA → Dukascopy
```bash
# ローカル直起動の場合（apps/api/.env を編集）
MARKET_DATA_ACTIVE_PROVIDER=dukascopy
DUKASCOPY_ENABLED=true

# Docker 起動の場合（ルート .env を編集して docker compose 再起動）
MARKET_DATA_ACTIVE_PROVIDER=dukascopy
DUKASCOPY_ENABLED=true
pnpm docker:up
```

### Dukascopy → OANDA（切り戻し）
```bash
MARKET_DATA_ACTIVE_PROVIDER=oanda
# DUKASCOPY_ENABLED はそのままでよい（oanda active 時は参照されない）
```

---

## connectors.service.ts と旧仕様の乖離について

`SPEC_v51_part1 §8.2` および `SPEC_v51_part3 §12` には以下の記述がある。

- `alpha_vantage` が `isRequired: true`（price/hard-required）
- `overallHealth critical = alpha_vantage が error または unconfigured`

Phase 2 の実装では、価格取得の主系責務を `ProviderRegistry` の active provider に移管した。
これにより `connectors.service.ts` の実装は上記 SPEC 記述と乖離している。

**現在の実装**:
- `alpha_vantage` → `isRequired: false`（価格主系責務を移管済み）
- `overallHealth critical` → active price provider（oanda or dukascopy）が error/unconfigured 時

**SPEC 本体（`SPEC_v51_part1.md` / `SPEC_v51_part3.md`）はこのメモ作成時点で未更新。**
SPEC 更新は別タスクとして管理すること。

---

## 変更禁止（このメモ作成時点）
- `apps/api/src/modules/market-data/market-data.service.ts`
- `apps/api/src/modules/chart/*`
- `prisma/schema.prisma`
- `packages/types/src/index.ts`