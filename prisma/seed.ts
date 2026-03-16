/**
 * FXDE v5.1 — Prisma Seed
 * Phase2 用シード: argon2 不使用
 * passwordHash は placeholder 固定文字列を使用
 * Phase3 で argon2 本実装時に置き換える
 *
 * 実行: tsx prisma/seed.ts
 */

import { PrismaClient, UserRole, UserStatus, Preset, Timeframe, PluginType, PluginStatus, PluginInstallScope, } from '@prisma/client'

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

  
  // ─── Plugin System シード ───────────────────────────────────
  console.log('\n🔌 Plugin System シード開始...')
 
  const pluginManifests = [
    {
      id:              'plg_supply_demand_pro',
      slug:            'supply-demand-zones-pro',
      displayName:     'Supply Demand Zones PRO',
      version:         '1.0.0',
      descriptionShort: '需給ゾーンを可視化する分析プラグイン',
      descriptionLong:  '高精度な需給ゾーンの自動検出・表示プラグイン。複数タイムフレームの需給バランスを分析し、エントリーポイントの絞り込みを支援します。',
      pluginType:      'indicator' as PluginType,
      authorName:      'msnk',
      sourceLabel:     'Local Signed Plugin',
      coverImageUrl:   null,
      sourcePreview:   `/**
 * Supply Demand Zones PRO — manifest excerpt
 * @version 1.0.0
 * @author msnk
 */
export const manifest = {
  id:         'plg_supply_demand_pro',
  pluginType: 'indicator',
  capabilities: ['overlay', 'zone_detection'],
  fxdeApiVersion: '5.1',
};
 
export async function execute(ctx: FxdeContext): Promise<OverlayResult> {
  const { candles, timeframe } = ctx;
  // demand zone detection logic...
  return { zones: [], overlays: [] };
}`,
      entryFile:       'dist/index.js',
      checksum:        'sha256:placeholder_supply_demand',
      fxdeApiVersion:  '5.1',
      fxdeWebVersion:  '5.1',
      capabilitiesJson: ['chart_overlay', 'overlay', 'zone_detection', 'multi_timeframe'],
      permissionsJson:  ['read_candles', 'read_indicators'],
      dependenciesJson: [],
      optionalDepsJson: [],
      tagsJson:         ['zones', 'supply-demand', 'chart', 'indicator'],
      isCore:           false,
      isSigned:         true,
      installScope:     'system' as PluginInstallScope,
    },
    {
      id:              'plg_trend_bias_analyzer',
      slug:            'trend-bias-analyzer',
      displayName:     'Trend Bias Analyzer',
      version:         '1.2.0',
      descriptionShort: 'マルチタイムフレームのトレンドバイアスを分析',
      descriptionLong:  'H4・D1・W1 のトレンド方向を統合して、現在の相場バイアスを判定するプラグイン。MTF 整合スコアと組み合わせてエントリー判断を強化します。',
      pluginType:      'strategy' as PluginType,
      authorName:      'msnk',
      sourceLabel:     'Local Signed Plugin',
      coverImageUrl:   null,
      sourcePreview:   `/**
 * Trend Bias Analyzer — manifest excerpt
 * @version 1.2.0
 */
export const manifest = {
  id:         'plg_trend_bias_analyzer',
  pluginType: 'strategy',
  capabilities: ['bias_detection', 'mtf_analysis'],
  fxdeApiVersion: '5.1',
};
 
export async function execute(ctx: FxdeContext): Promise<BiasResult> {
  const { snapshots } = ctx;
  // multi-timeframe bias analysis...
  return { bias: 'bullish', strength: 0.78, contributing: [] };
}`,
      entryFile:       'dist/index.js',
      checksum:        'sha256:placeholder_trend_bias',
      fxdeApiVersion:  '5.1',
      fxdeWebVersion:  '5.1',
      capabilitiesJson: ['chart_signal', 'bias_detection', 'mtf_analysis', 'score_boost'],
      permissionsJson:  ['read_snapshots', 'read_indicators'],
      dependenciesJson: [],
      optionalDepsJson: [],
      tagsJson:         ['trend', 'bias', 'mtf', 'strategy'],
      isCore:           false,
      isSigned:         true,
      installScope:     'system' as PluginInstallScope,
    },
    {
      id:              'plg_session_overlay',
      slug:            'session-overlay-pack',
      displayName:     'Session Overlay Pack',
      version:         '0.9.1',
      descriptionShort: '主要セッション時間帯をチャート上にオーバーレイ表示',
      descriptionLong:  '東京・ロンドン・ニューヨーク各セッションの開始・終了時刻をチャート上に視覚的に表示するオーバーレイプラグイン。セッションオーバーラップの高ボラティリティ時間帯も強調表示します。',
      pluginType:      'overlay' as PluginType,
      authorName:      'msnk',
      sourceLabel:     'Local Plugin',
      coverImageUrl:   null,
      sourcePreview:   `/**
 * Session Overlay Pack — manifest excerpt
 * @version 0.9.1
 */
export const manifest = {
  id:         'plg_session_overlay',
  pluginType: 'overlay',
  capabilities: ['session_highlight', 'overlap_detection'],
  fxdeApiVersion: '5.1',
};
 
export async function execute(ctx: FxdeContext): Promise<OverlayResult> {
  const { currentTime, timeframe } = ctx;
  // session boundary calculation...
  return { bands: [], labels: [] };
}`,
      entryFile:       'dist/index.js',
      checksum:        'sha256:placeholder_session_overlay',
      fxdeApiVersion:  '5.1',
      fxdeWebVersion:  '5.1',
      capabilitiesJson: ['chart_overlay', 'session_highlight', 'overlap_detection'],
      permissionsJson:  ['read_candles'],
      dependenciesJson: [],
      optionalDepsJson: [],
      tagsJson:         ['session', 'overlay', 'london', 'newyork', 'tokyo'],
      isCore:           false,
      isSigned:         false,
      installScope:     'system' as PluginInstallScope,
    },
    {
      id:              'plg_auto_chart_pattern',
      slug:            'auto-chart-pattern-engine',
      displayName:     'Auto Chart Pattern Engine',
      version:         '1.0.0',
      descriptionShort: 'チャートパターンを自動検出してオーバーレイ表示',
      descriptionLong:  'Head & Shoulders / Double Top / Double Bottom / Triangle / Channel を自動検出し、ネックライン・トレンドラインをチャートにオーバーレイ表示します。Reliability Engine と連携し、パターンの勝率・優位性を統計的に追跡します。',
      pluginType:      'indicator' as PluginType,
      authorName:      'msnk',
      sourceLabel:     'Local Signed Plugin',
      coverImageUrl:   null,
      sourcePreview:   `/**
 * Auto Chart Pattern Engine — manifest excerpt
 * @version 1.0.0
 */
export const manifest = {
  id:         'plg_auto_chart_pattern',
  pluginType: 'indicator',
  capabilities: ['chart_overlay', 'chart_signal', 'pattern_detection'],
  fxdeApiVersion: '5.1',
};
 
export async function execute(ctx: FxdeContext): Promise<PatternResult> {
  const { candles } = ctx;
  // Head & Shoulders / Double Top / Triangle / Channel detection...
  return { overlays: [], signals: [] };
}`,
      entryFile:       'dist/index.js',
      checksum:        'sha256:placeholder_auto_chart_pattern',
      fxdeApiVersion:  '5.1',
      fxdeWebVersion:  '5.1',
      capabilitiesJson: ['chart_overlay', 'chart_signal', 'pattern_detection'],
      permissionsJson:  ['read_candles'],
      dependenciesJson: [],
      optionalDepsJson: [],
      tagsJson:         ['pattern', 'chart', 'head-shoulders', 'double-top', 'triangle'],
      isCore:           false,
      isSigned:         true,
      installScope:     'system' as PluginInstallScope,
    },
  ]
 
  for (const manifest of pluginManifests) {
    // PluginManifest upsert
    const pm = await prisma.pluginManifest.upsert({
      where:  { id: manifest.id },
      update: manifest,
      create: manifest,
    })
    console.log(`✅ PluginManifest: ${pm.displayName} (${pm.id})`)
 
    // InstalledPlugin upsert（1 manifest に 1 installed state）
    // 開発・デモ環境用: 全プラグインを enabled で初期化
    const isEnabled = true
    const status    = isEnabled ? 'enabled' : 'disabled'
 
    await prisma.installedPlugin.upsert({
      where:  { pluginManifestId: pm.id },
      update: { isEnabled, status: status as PluginStatus },
      create: {
        pluginManifestId: pm.id,
        isEnabled,
        status:           status as PluginStatus,
        configLocked:     true,
      },
    })
    console.log(`  → InstalledPlugin: ${isEnabled ? '✅ enabled' : '⚫ disabled'}`)
  }
 
  console.log(`🔌 Plugin System シード完了: ${pluginManifests.length} 件`)
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