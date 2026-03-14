/**
 * packages/types/src/schemas/plugin.schema.ts
 *
 * FXDE Plugin System — 型定義正本
 *
 * 参照仕様: fxde_plugin_system_完全設計書 §5 ドメインモデル / §20.2 packages/types 仕様
 *
 * このファイルが API レスポンス・DB・Frontend の型契約正本となる。
 * API / Service / React コンポーネント は必ずここから import すること。
 */

import { z } from 'zod';

// ──────────────────────────────────────────────────────────────────────────
// Enum Schemas
// ──────────────────────────────────────────────────────────────────────────

export const PluginTypeSchema = z.enum([
  'pattern',
  'indicator',
  'strategy',
  'risk',
  'overlay',
  'signal',
  'ai',
  'connector',
]);

export const PluginStatusSchema = z.enum([
  'enabled',
  'disabled',
  'error',
  'incompatible',
  'missing_dependency',
  'update_available',
]);

export const PluginInstallScopeSchema = z.enum(['system', 'user']);

// ──────────────────────────────────────────────────────────────────────────
// PluginManifest
// ──────────────────────────────────────────────────────────────────────────

export const PluginManifestSchema = z.object({
  id:                  z.string(),
  slug:                z.string(),
  displayName:         z.string(),
  version:             z.string(),
  descriptionShort:    z.string(),
  descriptionLong:     z.string(),
  pluginType:          PluginTypeSchema,
  authorName:          z.string(),
  sourceLabel:         z.string(),
  homepageUrl:         z.string().nullable().optional(),
  docsUrl:             z.string().nullable().optional(),
  coverImageUrl:       z.string().nullable().optional(),
  iconUrl:             z.string().nullable().optional(),
  readmeMarkdown:      z.string().nullable().optional(),
  sourcePreview:       z.string().nullable().optional(),
  entryFile:           z.string(),
  checksum:            z.string(),
  fxdeApiVersion:      z.string(),
  fxdeWebVersion:      z.string(),
  capabilities:        z.array(z.string()),
  permissions:         z.array(z.string()),
  dependencies:        z.array(z.string()),
  optionalDependencies: z.array(z.string()),
  tags:                z.array(z.string()),
  isCore:              z.boolean(),
  isSigned:            z.boolean(),
  installScope:        PluginInstallScopeSchema,
});

// ──────────────────────────────────────────────────────────────────────────
// InstalledPlugin
// ──────────────────────────────────────────────────────────────────────────

export const InstalledPluginSchema = z.object({
  id:                z.string(),
  pluginManifestId:  z.string(),
  installedByUserId: z.string().nullable(),
  isEnabled:         z.boolean(),
  status:            PluginStatusSchema,
  errorMessage:      z.string().nullable(),
  configLocked:      z.boolean(),
  installedAt:       z.string(),
  enableUpdatedAt:   z.string(),
  lastHealthCheckAt: z.string().nullable(),
  lastExecutedAt:    z.string().nullable(),
});

// ──────────────────────────────────────────────────────────────────────────
// PluginCard（一覧表示用 ViewModel）
// ──────────────────────────────────────────────────────────────────────────

export const PluginCardSchema = z.object({
  pluginId:              z.string(),
  displayName:           z.string(),
  pluginType:            PluginTypeSchema,
  summary:               z.string(),
  coverImageUrl:         z.string().nullable(),
  version:               z.string(),
  authorName:            z.string(),
  sourceLabel:           z.string(),
  isEnabled:             z.boolean(),
  status:                PluginStatusSchema,
  compatibilityLabel:    z.string(),
  tags:                  z.array(z.string()),
  isCore:                z.boolean(),
  sourcePreviewAvailable: z.boolean(),
});

// ──────────────────────────────────────────────────────────────────────────
// API Response Schemas
// ──────────────────────────────────────────────────────────────────────────

export const PluginListResponseSchema = z.object({
  items: z.array(PluginCardSchema),
  total: z.number().int().nonnegative(),
});

export const PluginDetailResponseSchema = z.object({
  manifest:  PluginManifestSchema,
  installed: InstalledPluginSchema,
});

export const PluginSourcePreviewResponseSchema = z.object({
  pluginId:    z.string(),
  displayName: z.string(),
  language:    z.string(),
  readOnly:    z.literal(true),
  content:     z.string(),
});

export const TogglePluginResponseSchema = z.object({
  pluginId:       z.string(),
  isEnabled:      z.boolean(),
  status:         PluginStatusSchema,
  enableUpdatedAt: z.string(),
});

export const PluginAuditLogSchema = z.object({
  id:              z.string(),
  pluginManifestId: z.string(),
  actorUserId:     z.string().nullable(),
  action:          z.string(),
  beforeStateJson: z.record(z.string(), z.unknown()),
  afterStateJson:  z.record(z.string(), z.unknown()),
  createdAt:       z.string(),
});

export const PluginAuditLogListResponseSchema = z.object({
  items: z.array(PluginAuditLogSchema),
  total: z.number().int().nonnegative(),
});

// ──────────────────────────────────────────────────────────────────────────
// API Request Schemas（NestJS createZodDto() の正本）
// ──────────────────────────────────────────────────────────────────────────

/**
 * フィルタ値（PluginType + status ショートカット）
 * 修正4: PluginTypeSchema の全値 + 状態フィルタを完全一致させる
 */
export const PLUGIN_FILTER_VALUES = [
  'all',
  'enabled',
  'disabled',
  'pattern',
  'indicator',
  'strategy',
  'risk',
  'overlay',
  'signal',
  'ai',
  'connector',
] as const;

export const PLUGIN_SORT_VALUES = [
  'name',
  'createdAt',
  'pluginType',
  'version',
] as const;

/** GET /api/v1/plugins クエリパラメータ Schema */
export const GetPluginsQuerySchema = z.object({
  filter: z.enum(PLUGIN_FILTER_VALUES).optional().default('all'),
  sort:   z.enum(PLUGIN_SORT_VALUES).optional().default('name'),
});

/** プラグイン ID パスパラメータ Schema */
export const PluginIdParamSchema = z.object({
  pluginId: z.string().min(1),
});

export type GetPluginsQuery  = z.infer<typeof GetPluginsQuerySchema>;
export type PluginIdParam    = z.infer<typeof PluginIdParamSchema>;
export type PluginFilterValue = (typeof PLUGIN_FILTER_VALUES)[number];
export type PluginSortValue   = (typeof PLUGIN_SORT_VALUES)[number];

// ──────────────────────────────────────────────────────────────────────────
// Inferred Types
// ──────────────────────────────────────────────────────────────────────────

export type PluginType             = z.infer<typeof PluginTypeSchema>;
export type PluginStatus           = z.infer<typeof PluginStatusSchema>;
export type PluginInstallScope     = z.infer<typeof PluginInstallScopeSchema>;
export type PluginManifest         = z.infer<typeof PluginManifestSchema>;
export type InstalledPlugin        = z.infer<typeof InstalledPluginSchema>;
export type PluginCard             = z.infer<typeof PluginCardSchema>;
export type PluginListResponse     = z.infer<typeof PluginListResponseSchema>;
export type PluginDetailResponse   = z.infer<typeof PluginDetailResponseSchema>;
export type PluginSourcePreviewResponse = z.infer<typeof PluginSourcePreviewResponseSchema>;
export type TogglePluginResponse   = z.infer<typeof TogglePluginResponseSchema>;
export type PluginAuditLog         = z.infer<typeof PluginAuditLogSchema>;
export type PluginAuditLogListResponse = z.infer<typeof PluginAuditLogListResponseSchema>;