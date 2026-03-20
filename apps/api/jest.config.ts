import type { Config } from 'jest';

const config: Config = {
  // ── 基本設定 ──────────────────────────────────────────────────────────────
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  roots: ['<rootDir>/src'],
  testRegex: '.*\\.spec\\.ts$',
  testEnvironment: 'node',

  // ── ts-jest 変換 ───────────────────────────────────────────────────────────
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.json',
      },
    ],
  },

  // ── @fxde/* workspace package のパス解決 ─────────────────────────────────
  // tsconfig.json の paths 定義と完全一致させる。
  // rootDir = apps/api/ なので、../../packages/* で monorepo ルートからの相対パスが解決できる。
  moduleNameMapper: {
    '^@fxde/types$':       '<rootDir>/../../packages/types/dist',
    '^@fxde/types/(.*)$':  '<rootDir>/../../packages/types/dist/$1',
    '^@fxde/config$':      '<rootDir>/../../packages/config/dist',
    '^@fxde/shared$':      '<rootDir>/../../packages/shared/dist',
    '^@fxde/shared/(.*)$': '<rootDir>/../../packages/shared/dist/$1',
  },

  // ── カバレッジ ────────────────────────────────────────────────────────────
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/main.ts',           // エントリポイントはカバレッジ対象外
    '!src/**/*.module.ts',    // Module 定義はカバレッジ対象外
    '!src/**/*.dto.ts',       // DTO はカバレッジ対象外
    '!src/**/*.entity.ts',
  ],
  coverageDirectory: 'coverage',

  // ── テスト実行設定 ─────────────────────────────────────────────────────────
  // Argon2 などの native addon を含むため、1 ワーカーで直列実行する。
  // 並列実行時に native module のロードエラーが発生するケースへの予防的措置。
  maxWorkers: 1,
};

export default config;