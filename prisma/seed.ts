/**
 * FXDE v5.1 — Prisma Seed
 * Phase2 用シード: argon2 不使用
 * passwordHash は placeholder 固定文字列を使用
 * Phase3 で argon2 本実装時に置き換える
 *
 * 実行: tsx prisma/seed.ts
 */

import { PrismaClient, UserRole, UserStatus, Preset, Timeframe } from '@prisma/client'

const prisma = new PrismaClient()

// Phase2 固定 placeholder hash
// Phase3 で argon2 本実装時に置き換える
const PLACEHOLDER_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$placeholder$placeholder_hash_replace_in_phase3'

async function main() {
  console.log('🌱 FXDE v5.1 Phase2 Seed 開始...')

  // ─── 1. Admin ユーザー ───────────────────────────────────────
  const admin = await prisma.user.upsert({
    where: { email: 'admin@fxde.local' },
    update: {},
    create: {
      email: 'admin@fxde.local',
      passwordHash: PLACEHOLDER_HASH,
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
    },
  })
  console.log(`✅ Admin user: ${admin.id} (${admin.email})`)

  // ─── 2. Demo ユーザー（PRO）──────────────────────────────────
  const demoPro = await prisma.user.upsert({
    where: { email: 'demo-pro@fxde.local' },
    update: {},
    create: {
      email: 'demo-pro@fxde.local',
      passwordHash: PLACEHOLDER_HASH,
      role: UserRole.PRO,
      status: UserStatus.ACTIVE,
    },
  })
  console.log(`✅ Demo PRO user: ${demoPro.id} (${demoPro.email})`)

  // ─── 3. Demo ユーザー（FREE）─────────────────────────────────
  const demoFree = await prisma.user.upsert({
    where: { email: 'demo-free@fxde.local' },
    update: {},
    create: {
      email: 'demo-free@fxde.local',
      passwordHash: PLACEHOLDER_HASH,
      role: UserRole.FREE,
      status: UserStatus.ACTIVE,
    },
  })
  console.log(`✅ Demo FREE user: ${demoFree.id} (${demoFree.email})`)

  // ─── 4. UserSettings ─────────────────────────────────────────
  const adminSettings = await prisma.userSetting.upsert({
    where: { userId: admin.id },
    update: {},
    create: {
      userId: admin.id,
      preset: Preset.standard,
      scoreThreshold: 75,
      riskProfile: {
        maxRiskPct: 1.0,
        maxDailyLossPct: 3.0,
        maxStreak: 3,
        cooldownMin: 60,
        maxTrades: 5,
        atrMultiplier: 1.5,
      },
      uiPrefs: {
        theme: 'dark',
        mode: 'pro',
        defaultSymbol: 'EURUSD',
        defaultTimeframe: 'H4',
      },
      featureSwitches: {
        aiSignal: true,
        patternBonus: true,
        newsLock: true,
        cooldownTimer: true,
        mtfPrediction: true,
      },
      forceLock: false,
    },
  })
  console.log(`✅ Admin UserSetting: ${adminSettings.id}`)

  const proSettings = await prisma.userSetting.upsert({
    where: { userId: demoPro.id },
    update: {},
    create: {
      userId: demoPro.id,
      preset: Preset.standard,
      scoreThreshold: 75,
      riskProfile: {
        maxRiskPct: 1.0,
        maxDailyLossPct: 3.0,
        maxStreak: 3,
        cooldownMin: 60,
        maxTrades: 5,
        atrMultiplier: 1.5,
      },
      uiPrefs: {
        theme: 'dark',
        mode: 'pro',
        defaultSymbol: 'EURUSD',
        defaultTimeframe: 'H4',
      },
      featureSwitches: {
        aiSignal: true,
        patternBonus: true,
        newsLock: true,
        cooldownTimer: true,
        mtfPrediction: true,
      },
      forceLock: false,
    },
  })
  console.log(`✅ PRO UserSetting: ${proSettings.id}`)

  const freeSettings = await prisma.userSetting.upsert({
    where: { userId: demoFree.id },
    update: {},
    create: {
      userId: demoFree.id,
      preset: Preset.conservative,
      scoreThreshold: 85,
      riskProfile: {
        maxRiskPct: 0.5,
        maxDailyLossPct: 1.5,
        maxStreak: 2,
        cooldownMin: 120,
        maxTrades: 3,
        atrMultiplier: 1.0,
      },
      uiPrefs: {
        theme: 'light',
        mode: 'beginner',
        defaultSymbol: 'EURUSD',
        defaultTimeframe: 'H4',
      },
      featureSwitches: {
        aiSignal: false,
        patternBonus: false,
        newsLock: true,
        cooldownTimer: true,
        mtfPrediction: false,
      },
      forceLock: false,
    },
  })
  console.log(`✅ FREE UserSetting: ${freeSettings.id}`)

  // ─── 5. SymbolSettings (4 ペア) ──────────────────────────────
  const symbols = ['EURUSD', 'USDJPY', 'GBPUSD', 'BTCUSD']
  const defaultTimeframes: Record<string, Timeframe> = {
    EURUSD: Timeframe.H4,
    USDJPY: Timeframe.H4,
    GBPUSD: Timeframe.H4,
    BTCUSD: Timeframe.D1,
  }

  for (const symbol of symbols) {
    const ss = await prisma.symbolSetting.upsert({
      where: { userId_symbol: { userId: demoPro.id, symbol } },
      update: {},
      create: {
        userId: demoPro.id,
        symbol,
        enabled: true,
        defaultTimeframe: defaultTimeframes[symbol],
      },
    })
    console.log(`✅ SymbolSetting: ${ss.symbol} for PRO user`)
  }

  // FREE ユーザーは 1 ペアのみ（FREE プラン制限 — 制御は API 層で実施）
  const freeSymbol = await prisma.symbolSetting.upsert({
    where: { userId_symbol: { userId: demoFree.id, symbol: 'EURUSD' } },
    update: {},
    create: {
      userId: demoFree.id,
      symbol: 'EURUSD',
      enabled: true,
      defaultTimeframe: Timeframe.H4,
    },
  })
  console.log(`✅ SymbolSetting: ${freeSymbol.symbol} for FREE user`)

  // ─── 6. サンプル Trade（PRO ユーザー）──────────────────────
  const trade1 = await prisma.trade.create({
    data: {
      userId: demoPro.id,
      symbol: 'EURUSD',
      side: 'BUY',
      entryTime: new Date('2026-03-01T09:00:00Z'),
      entryPrice: 1.08450,
      exitTime: new Date('2026-03-01T15:30:00Z'),
      exitPrice: 1.08780,
      size: 0.1,
      sl: 1.08200,
      tp: 1.09000,
      pnl: 33.0,
      pips: 33.0,
      status: 'CLOSED',
      tags: ['trend-follow', 'H4'],
      note: 'Phase2 seed trade - EUR breakout',
    },
  })
  console.log(`✅ Sample Trade (CLOSED): ${trade1.id}`)

  const trade2 = await prisma.trade.create({
    data: {
      userId: demoPro.id,
      symbol: 'USDJPY',
      side: 'SELL',
      entryTime: new Date('2026-03-05T10:00:00Z'),
      entryPrice: 149.500,
      size: 0.2,
      sl: 150.000,
      tp: 148.500,
      status: 'OPEN',
      tags: ['reversal'],
      note: 'Phase2 seed trade - OPEN position',
    },
  })
  console.log(`✅ Sample Trade (OPEN): ${trade2.id}`)

  // ─── 7. TradeReview ────────────────────────────────────────
  await prisma.tradeReview.create({
    data: {
      tradeId: trade1.id,
      scoreAtEntry: 82,
      ruleChecks: {
        scoreOk: true,
        riskOk: true,
        eventLock: false,
        cooldown: false,
        patterns: ['golden_cross', 'breakout'],
        entryState: 'ENTRY_OK',
      },
      psychology: {
        emotion: '冷静',
        selfNote: 'H4トレンドに乗れた。SLとTPの設定が適切だった。',
        biasDetected: [],
      },
      disciplined: true,
    },
  })
  console.log(`✅ TradeReview for trade1`)

  // ─── 8. InterestRate マスタ ────────────────────────────────
  const interestRates = [
    { country: 'US', bank: 'FRB', currency: 'USD', rate: 5.250, effectiveAt: new Date('2024-07-26') },
    { country: 'EU', bank: 'ECB', currency: 'EUR', rate: 4.500, effectiveAt: new Date('2024-06-12') },
    { country: 'JP', bank: 'BOJ', currency: 'JPY', rate: 0.100, effectiveAt: new Date('2024-07-31') },
    { country: 'GB', bank: 'BOE', currency: 'GBP', rate: 5.250, effectiveAt: new Date('2024-08-01') },
  ]

  for (const ir of interestRates) {
    await prisma.interestRate.create({ data: ir })
  }
  console.log(`✅ InterestRate マスタ: ${interestRates.length} 件`)

  // ─── 9. EconomicEvent サンプル ─────────────────────────────
  const events = [
    {
      title: 'US Non-Farm Payrolls',
      country: 'US',
      currency: 'USD',
      scheduledAt: new Date('2026-03-07T13:30:00Z'),
      importance: 'HIGH' as const,
      forecast: 185.0,
      previous: 256.0,
      source: 'BLS',
    },
    {
      title: 'ECB Rate Decision',
      country: 'EU',
      currency: 'EUR',
      scheduledAt: new Date('2026-03-06T12:15:00Z'),
      importance: 'CRITICAL' as const,
      source: 'ECB',
    },
    {
      title: 'BOJ Policy Meeting',
      country: 'JP',
      currency: 'JPY',
      scheduledAt: new Date('2026-03-19T03:00:00Z'),
      importance: 'CRITICAL' as const,
      source: 'BOJ',
    },
  ]

  for (const ev of events) {
    await prisma.economicEvent.create({ data: ev })
  }
  console.log(`✅ EconomicEvent サンプル: ${events.length} 件`)

  console.log('')
  console.log('🎉 Phase2 Seed 完了!')
  console.log('   Users    : 3 (admin, demo-pro, demo-free)')
  console.log('   Settings : 3')
  console.log('   Symbols  : 5 (4 for PRO, 1 for FREE)')
  console.log('   Trades   : 2 (1 CLOSED, 1 OPEN)')
  console.log('   Reviews  : 1')
  console.log('   IntRate  : 4')
  console.log('   EcoEvent : 3')
}

main()
  .catch((e) => {
    console.error('❌ Seed 失敗:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
