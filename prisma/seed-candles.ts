import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const SYMBOLS    = ['EURUSD', 'USDJPY', 'GBPUSD', 'AUDUSD'];
const TIMEFRAMES = ['M5', 'M15', 'M30', 'H1', 'H4', 'H8', 'D1'];
const BASE_PRICES: Record<string, number> = {
  EURUSD: 1.0842, USDJPY: 149.50, GBPUSD: 1.2650, AUDUSD: 0.6520,
};

async function main() {
  for (const symbol of SYMBOLS) {
    for (const tf of TIMEFRAMES) {
      const tfMs: Record<string, number> = {
        M5: 5*60*1000, M15: 15*60*1000, M30: 30*60*1000,
        H1: 3600*1000, H4: 4*3600*1000, H8: 8*3600*1000,
        D1: 24*3600*1000,
      };
      const base = BASE_PRICES[symbol];
      const now  = new Date('2026-03-13T12:00:00Z');
      let price  = base;

      for (let i = 99; i >= 0; i--) {
        const time  = new Date(now.getTime() - i * tfMs[tf]);
        const move  = (Math.random() - 0.48) * base * 0.001;
        price       = Math.max(base * 0.95, Math.min(base * 1.05, price + move));
        const open  = price;
        const close = price + (Math.random() - 0.5) * base * 0.0005;
        const high  = Math.max(open, close) + Math.random() * base * 0.0003;
        const low   = Math.min(open, close) - Math.random() * base * 0.0003;

        await prisma.marketCandle.upsert({
          where:  { symbol_timeframe_time: { symbol, timeframe: tf as never, time } },
          update: { open, high, low, close, volume: BigInt(1000), source: 'seed' },
          create: { symbol, timeframe: tf as never, time, open, high, low, close,
                    volume: BigInt(1000), source: 'seed' },
        });
      }
      console.log(`✅ ${symbol}/${tf}: 100本`);
    }
  }
  const total = await prisma.marketCandle.count();
  console.log(`\n完了: market_candles 合計 ${total} 本`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
