import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const SYMBOLS = [
  { name: 'EURUSD', base: 'EUR', quote: 'USD' },
  { name: 'USDJPY', base: 'USD', quote: 'JPY' },
  { name: 'GBPUSD', base: 'GBP', quote: 'USD' },
  { name: 'BTCUSD', base: 'BTC', quote: 'USD' },
];

async function main() {
  console.log('Seeding FXDE v5.1 database...');

  for (const sym of SYMBOLS) {
    await prisma.symbol.upsert({
      where: { name: sym.name },
      update: {},
      create: sym,
    });
    console.log(`  Symbol upserted: ${sym.name}`);
  }

  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
