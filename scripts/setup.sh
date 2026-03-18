#!/usr/bin/env bash
# ============================================================
# FXDE v5.1 — Workspace Setup Script
# Run: bash scripts/setup.sh
# ============================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "================================================"
echo " FXDE v5.1 — Workspace Setup"
echo "================================================"

# ─── Check prerequisites ────────────────────────────────────
echo "[1/6] Checking prerequisites..."

check_command() {
  if ! command -v "$1" &>/dev/null; then
    echo "  ERROR: $1 is not installed."
    exit 1
  fi
  echo "  OK: $1 ($(\"$1\" --version 2>&1 | head -1))"
}

check_command node
check_command pnpm
check_command docker
check_command git

# ─── Copy .env ──────────────────────────────────────────────
echo "[2/6] Setting up .env..."
if [ ! -f .env ]; then
  cp .env.example .env
  echo "  Created .env from .env.example"
  echo "  IMPORTANT: Edit .env and set JWT_SECRET before production use."
  echo "  INFO: MARKET_DATA_ACTIVE_PROVIDER=oanda (default). Dukascopy に切り替える場合は DUKASCOPY_ENABLED=true も設定すること"
else
  echo "  .env already exists — skipping"
fi

# ─── Install dependencies ────────────────────────────────────
echo "[3/6] Installing dependencies..."
pnpm install

# ─── Start Docker services ──────────────────────────────────
echo "[4/6] Starting Docker services (postgres + redis)..."
docker compose -f infra/docker/docker-compose.yml up -d postgres redis
echo "  Waiting for postgres to be healthy..."
until docker compose -f infra/docker/docker-compose.yml exec postgres pg_isready -U fxde -d fxde_db &>/dev/null; do
  sleep 2
done
echo "  postgres is ready."

# ─── Prisma migrate + generate ──────────────────────────────
echo "[5/6] Running Prisma migrate and generate..."
pnpm --filter @fxde/api prisma:generate
DATABASE_URL="postgresql://fxde:fxde_password@localhost:5436/fxde_db" \
  pnpm --filter @fxde/api exec prisma migrate dev --name init --schema=../../prisma/schema.prisma

# ─── Seed ───────────────────────────────────────────────────
echo "[6/6] Seeding database..."
DATABASE_URL="postgresql://fxde:fxde_password@localhost:5436/fxde_db" \
  pnpm --filter @fxde/api prisma:seed

echo ""
echo "================================================"
echo " Setup complete!"
echo ""
echo " Start dev servers:"
echo "   pnpm dev"
echo ""
echo " Or start full stack via Docker:"
echo "   pnpm docker:up"
echo "================================================"
