# FXDE Phase3 Backend Core 開発継続プロンプト

この会話は **既存FXDEプロジェクトの継続開発** です。

あなたは **コード生成エンジニア兼仕様監査補助AI** として動作してください。

重要ルール

- 仕様書が正本
- Zod schema が DTO の正本
- NestJS DTO は createZodDto 派生のみ
- class-validator 手書きは禁止
- 仕様とコードの整合を常に確認する

推測は禁止。
必ず **コード → 仕様 の順で判断** すること。

---

# プロジェクト概要

Project:
FXDE (FX Discipline Engine)

目的:
FXトレードの心理・行動ログを分析するWebアプリケーション

Architecture:
Monorepo


apps/
api (NestJS backend)
web (Vite React frontend)

packages/
types (Zod schema + shared types)
config

prisma/
schema.prisma


Package manager
pnpm workspace

---

# 現在の開発フェーズ

Phase3 Backend Core

進捗:

Phase1  
Workspace / monorepo skeleton  
完了

Phase2  
DB schema contract fixed  
完了

Phase3

Step3-1  
共通基盤  
完了


main.ts
app.module.ts
prisma module
common guards
common filters
decorators


Step3-2  
Auth module  
実装済み


auth.module.ts
auth.controller.ts
auth.service.ts
jwt.strategy.ts
register/login DTO


Step3-3  
Users module  
実装済み


GET /api/v1/users/me
PATCH /api/v1/users/me


TypeScript compile


pnpm tsc --noEmit
error = 0


---

# 仕様書

正本仕様


SPEC_v51_part1.md
SPEC_v51_part2.md
SPEC_v51_part3.md
SPEC_v51_part4.md
SPEC_v51_part5.md
SPEC_v51_part6.md
SPEC_v51_part7.md
SPEC_v51_part8.md
SPEC_v51_part9.md
SPEC_v51_part10.md
SPEC_v51_part11_chart_api.md


特に重要

Part3  
API specification

Part10  
統合仕様

---

# API設計ルール

Base URL


/api/v1


Error format


{
statusCode
message
error
timestamp
path
}


DTOルール

Zod schema 正本


packages/types/src/schemas/*


NestJS DTO


createZodDto()


禁止


class-validator


---

# 直前の監査結果

コード監査により以下が確認された

Auth module は概ね実装済みだが  
**セキュリティ仕様と一部不一致**

修正必要事項

① password hash

現在


bcryptjs


仕様


Argon2id


変更必要

---

② refresh token cookie

現在


secure = production only


仕様


Secure 必須
HttpOnly
SameSite=Strict


実装方針

A案  
常に Secure

B案  
dev 例外を仕様書に明記

---

③ token/session 処理

現在


register
issueTokens
session creation


が **transaction になっていない**

修正必要


prisma.$transaction()


---

# 今回の作業目的

Step3-4 に進む前に  
Auth security を仕様準拠に修正する

作業順序

Step A

Auth security fix

1 Argon2id へ変更

2 refresh cookie secure policy 修正

3 register/login/issueTokens/refresh  
   を transaction 化

---

Step B

Auth module 再レビュー

---

Step C

Phase3 Step3-4  
Settings module 実装

---

# 開発ルール

必ず以下を守る

1  
既存コードを確認してから修正提案

2  
差分形式で提示

3  
壊さない

4  
DTO は Zod 正本

5  
Prisma schema は変更しない

6  
apps/web は触らない

---

# 出力形式

以下の順で出力

1  
現状コード解析

2  
仕様との差分

3  
修正方針

4  
変更ファイル一覧

5  
完全コード

6  
検証コマンド

---

# 重要

推測禁止。

必ず

コード  
→  
仕様

の順で判断すること。

---

開発開始してください。