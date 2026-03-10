#!/usr/bin/env bash
# ============================================================
# FXDE v5.1 — Phase2 実行スクリプト
# scripts/phase2-run.sh
#
# 前提: Phase1 完了状態 (git status clean)
# 実行: bash scripts/phase2-run.sh
#
# 前回失敗対策:
#   1. Postgres port: 5436 (host) → 5432 (container)
#   2. Redis port:    6386 (host) → 6379 (container)
#   3. seed は tsx prisma/seed.ts (argon2 不使用 / placeholder hash)
#   4. argon2 native build は Phase2 では行わない
# ============================================================

set -euo pipefail

# ─── カラー定義 ────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info()  { echo -e "${BLUE}[INFO]${NC} $1"; }
log_ok()    { echo -e "${GREEN}[OK]${NC}   $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# ─── 作業ディレクトリ確認 ──────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

log_info "PROJECT_ROOT: ${PROJECT_ROOT}"
cd "${PROJECT_ROOT}"

# ─── STEP 0: .env 確認 ─────────────────────────────────────
echo ""
echo "════════════════════════════════════════"
echo " STEP 0: .env 確認"
echo "════════════════════════════════════════"

if [ ! -f ".env" ]; then
  log_warn ".env が存在しません。.env.example からコピーします..."
  if [ -f ".env.example" ]; then
    cp .env.example .env
    log_ok ".env を作成しました"
  else
    log_error ".env.example も存在しません。手動で .env を作成してください"
    exit 1
  fi
fi

# DATABASE_URL の port 確認
if grep -q "5432" .env && ! grep -q "5436" .env; then
  log_warn "DATABASE_URL が port 5432 のままです。5436 に変更してください"
  log_warn "現在の DATABASE_URL:"
  grep DATABASE_URL .env || true
fi

log_ok ".env 確認完了"
grep DATABASE_URL .env | head -1

# ─── STEP 1: pnpm install ──────────────────────────────────
echo ""
echo "════════════════════════════════════════"
echo " STEP 1: pnpm install"
echo "════════════════════════════════════════"

log_info "pnpm install 実行中..."
pnpm install --frozen-lockfile=false
log_ok "pnpm install 完了"

# ─── STEP 2: Docker Compose 起動 ──────────────────────────
echo ""
echo "════════════════════════════════════════"
echo " STEP 2: Docker Compose 起動 (postgres + redis)"
echo "════════════════════════════════════════"

COMPOSE_FILE="infra/docker/docker-compose.yml"

log_info "既存コンテナを停止..."
docker compose -f "${COMPOSE_FILE}" down --remove-orphans 2>/dev/null || true

log_info "postgres / redis 起動..."
docker compose -f "${COMPOSE_FILE}" up -d postgres redis

log_info "ヘルスチェック待機中 (最大 60 秒)..."
MAX_WAIT=60
ELAPSED=0
while true; do
  PG_HEALTH=$(docker inspect fxde_postgres --format='{{.State.Health.Status}}' 2>/dev/null || echo "unknown")
  REDIS_HEALTH=$(docker inspect fxde_redis --format='{{.State.Health.Status}}' 2>/dev/null || echo "unknown")

  if [ "${PG_HEALTH}" = "healthy" ] && [ "${REDIS_HEALTH}" = "healthy" ]; then
    log_ok "postgres: healthy / redis: healthy"
    break
  fi

  if [ "${ELAPSED}" -ge "${MAX_WAIT}" ]; then
    log_error "タイムアウト: postgres=${PG_HEALTH}, redis=${REDIS_HEALTH}"
    docker compose -f "${COMPOSE_FILE}" logs postgres redis
    exit 1
  fi

  echo -n "."
  sleep 3
  ELAPSED=$((ELAPSED + 3))
done

# DB 接続確認
log_info "DB 接続確認..."
docker exec fxde_postgres psql -U fxde -d fxde_db -c "SELECT version();" > /dev/null
log_ok "DB 接続確認: OK"

# Redis 接続確認
log_info "Redis 接続確認..."
docker exec fxde_redis redis-cli ping > /dev/null
log_ok "Redis 接続確認: OK"

# ─── STEP 3: packages build ───────────────────────────────
echo ""
echo "════════════════════════════════════════"
echo " STEP 3: packages build (types / config / ui)"
echo "════════════════════════════════════════"

log_info "packages/config build..."
pnpm --filter @fxde/config build
log_ok "packages/config build 完了"

log_info "packages/types build..."
pnpm --filter @fxde/types build
log_ok "packages/types build 完了"

log_info "packages/ui build..."
pnpm --filter @fxde/ui build
log_ok "packages/ui build 完了"

# ─── STEP 4: Prisma validate ──────────────────────────────
echo ""
echo "════════════════════════════════════════"
echo " STEP 4: Prisma schema validate"
echo "════════════════════════════════════════"

log_info "prisma validate 実行..."
pnpm exec prisma validate --schema=prisma/schema.prisma
log_ok "prisma validate: OK"

# ─── STEP 5: Prisma migrate dev ───────────────────────────
echo ""
echo "════════════════════════════════════════"
echo " STEP 5: Prisma migrate dev"
echo "════════════════════════════════════════"

log_info "prisma migrate dev --name init 実行..."
pnpm exec prisma migrate dev --name init --schema=prisma/schema.prisma
log_ok "prisma migrate dev: OK"

# ─── STEP 6: Prisma generate ──────────────────────────────
echo ""
echo "════════════════════════════════════════"
echo " STEP 6: Prisma generate"
echo "════════════════════════════════════════"

log_info "prisma generate 実行..."
pnpm exec prisma generate --schema=prisma/schema.prisma
log_ok "prisma generate: OK"

# ─── STEP 7: Prisma db seed ───────────────────────────────
echo ""
echo "════════════════════════════════════════"
echo " STEP 7: Prisma db seed"
echo "════════════════════════════════════════"

log_info "prisma db seed 実行 (package.json の prisma.seed 設定経由)..."
# package.json の "prisma": { "seed": "tsx prisma/seed.ts" } 経由で実行する
# argon2 native build は使用しない (placeholder hash 固定)
pnpm exec prisma db seed
log_ok "prisma db seed: OK"

# ─── STEP 8: typecheck ────────────────────────────────────
echo ""
echo "════════════════════════════════════════"
echo " STEP 8: TypeScript typecheck"
echo "════════════════════════════════════════"

log_info "pnpm typecheck 実行..."
pnpm -r typecheck
log_ok "typecheck: 全通過"

# ─── 最終結果 ─────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════"
echo ""
echo -e "${GREEN}  Phase2 DB CONTRACT FIXED${NC}"
echo ""
echo "  完了項目:"
echo "  ✅ pnpm install"
echo "  ✅ docker compose up (postgres:5436, redis:6386)"
echo "  ✅ packages build (types / config / ui)"
echo "  ✅ prisma validate"
echo "  ✅ prisma migrate dev --name init"
echo "  ✅ prisma generate"
echo "  ✅ prisma db seed (placeholder hash)"
echo "  ✅ pnpm typecheck"
echo ""
echo "  次フェーズ: Phase3 Backend Core (新しい会話で開始)"
echo ""
echo "════════════════════════════════════════════════════════"
