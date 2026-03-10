# FXDE v5.1 — Architecture Overview

## Monorepo Structure

```
fxde/
├── apps/
│   ├── api/          NestJS REST API (port 3000)
│   └── web/          React + Vite SPA (port 5173)
├── packages/
│   ├── types/        Shared TypeScript types
│   ├── config/       Shared constants/config
│   └── ui/           Shared React components
├── prisma/
│   ├── schema.prisma Canonical DB schema
│   └── seed.ts       Seed data
├── infra/
│   └── docker/       Docker Compose
├── docs/
└── scripts/
```

## Tech Stack

| Layer     | Technology               |
|-----------|--------------------------|
| Backend   | NestJS, Prisma, BullMQ   |
| Database  | PostgreSQL 16            |
| Cache     | Redis 7                  |
| Frontend  | React 18, Vite, Zustand  |
| API Query | TanStack Query v5        |
| Infra     | Docker, Docker Compose   |
| Package   | pnpm workspace           |

## API Contract

- Prefix: `/api/v1`
- Success: `{ success: true, data: {} }`
- Error:   `{ success: false, error: { code, message } }`

## RBAC

Roles: `FREE` → `BASIC` → `PRO` → `PRO_PLUS` → `ADMIN`

## Implementation Phases

| Phase | Scope                    |
|-------|--------------------------|
| 0     | Environment check        |
| 1     | Workspace (this phase)   |
| 2     | DB / Type contract       |
| 3     | Backend Core (NestJS)    |
| 4     | Frontend Core (React)    |
| 5     | API Integration          |
| 6     | Testing                  |
| 7     | Deploy                   |
