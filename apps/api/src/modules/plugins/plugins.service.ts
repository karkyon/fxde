/**
 * apps/api/src/modules/plugins/plugins.service.ts
 *
 * Plugin System ビジネスロジック
 *
 * 参照仕様:
 *   fxde_plugin_system_完全設計書 §7 API 設計 / §20.3 Service 振る舞い
 *   SPEC_v51_part4 §4.3（guard / auth 規約）
 *
 * 実装メソッド:
 *   getPlugins()         - 一覧取得（filter / sort 対応）
 *   getPluginDetail()    - 詳細取得
 *   getSourcePreview()   - read-only source preview 取得
 *   enablePlugin()       - 有効化（audit log 必須）
 *   disablePlugin()      - 無効化（core plugin 拒否 / audit log 必須）
 *   getAuditLogs()       - 監査ログ取得
 *
 * ⚠️ source 編集系メソッドは存在しない（仕様上禁止）
 */

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService }   from '../../prisma/prisma.service';
import { PluginsRegistry } from './plugins.registry';
// 修正1: createZodDto() 版 DTO を使用
import { GetPluginsQueryDto } from './dto/get-plugins.dto';
import type { PluginSortValue } from '@fxde/types';

@Injectable()
export class PluginsService {
  constructor(
    private readonly prisma:    PrismaService,
    private readonly registry:  PluginsRegistry,
  ) {}

  // ────────────────────────────────────────────────────────────
  // GET /api/v1/plugins
  // ────────────────────────────────────────────────────────────

  async getPlugins(query: GetPluginsQueryDto) {
    // 修正2: sort パラメータに応じた orderBy を構築
    const orderBy = this._buildOrderBy(query.sort ?? 'name');

    const rows = await this.prisma.pluginManifest.findMany({
      include: { installedPlugins: true },
      orderBy,
    });

    const items = rows.map((row) => {
      const installed = row.installedPlugins[0];
      return {
        pluginId:               row.id,
        displayName:            row.displayName,
        pluginType:             row.pluginType,
        summary:                row.descriptionShort,
        coverImageUrl:          row.coverImageUrl,
        version:                row.version,
        authorName:             row.authorName,
        sourceLabel:            row.sourceLabel,
        isEnabled:              installed?.isEnabled ?? false,
        status:                 (installed?.status ?? 'disabled') as string,
        compatibilityLabel:     `FXDE v5.1 Compatible`,
        tags:                   Array.isArray(row.tagsJson) ? (row.tagsJson as string[]) : [],
        isCore:                 row.isCore,
        sourcePreviewAvailable: Boolean(row.sourcePreview),
      };
    });

    // フィルタリング
    const filtered = items.filter((item) => {
      switch (query.filter) {
        case 'enabled':
          return item.isEnabled;
        case 'disabled':
          return !item.isEnabled;
        case 'pattern':
        case 'indicator':
        case 'strategy':
        case 'ai':
        case 'overlay':
        case 'risk':
          return item.pluginType === query.filter;
        default:
          return true;
      }
    });

    return {
      items: filtered,
      total: filtered.length,
    };
  }

  // ────────────────────────────────────────────────────────────
  // GET /api/v1/plugins/:pluginId
  // ────────────────────────────────────────────────────────────

  async getPluginDetail(pluginId: string) {
    const row = await this.prisma.pluginManifest.findUnique({
      where:   { id: pluginId },
      include: { installedPlugins: true },
    });

    if (!row) throw new NotFoundException('Plugin not found');

    const installed = row.installedPlugins[0];

    return {
      manifest: {
        id:                   row.id,
        slug:                 row.slug,
        displayName:          row.displayName,
        version:              row.version,
        descriptionShort:     row.descriptionShort,
        descriptionLong:      row.descriptionLong,
        pluginType:           row.pluginType,
        authorName:           row.authorName,
        sourceLabel:          row.sourceLabel,
        homepageUrl:          row.homepageUrl,
        docsUrl:              row.docsUrl,
        coverImageUrl:        row.coverImageUrl,
        iconUrl:              row.iconUrl,
        readmeMarkdown:       row.readmeMarkdown,
        sourcePreview:        row.sourcePreview,
        entryFile:            row.entryFile,
        checksum:             row.checksum,
        fxdeApiVersion:       row.fxdeApiVersion,
        fxdeWebVersion:       row.fxdeWebVersion,
        capabilities:         Array.isArray(row.capabilitiesJson) ? row.capabilitiesJson : [],
        permissions:          Array.isArray(row.permissionsJson) ? row.permissionsJson : [],
        dependencies:         Array.isArray(row.dependenciesJson) ? row.dependenciesJson : [],
        optionalDependencies: Array.isArray(row.optionalDepsJson) ? row.optionalDepsJson : [],
        tags:                 Array.isArray(row.tagsJson) ? row.tagsJson : [],
        isCore:               row.isCore,
        isSigned:             row.isSigned,
        installScope:         row.installScope,
      },
      installed: {
        id:                installed?.id ?? '',
        pluginManifestId:  row.id,
        installedByUserId: installed?.installedByUserId ?? null,
        isEnabled:         installed?.isEnabled ?? false,
        status:            (installed?.status ?? 'disabled') as string,
        errorMessage:      installed?.errorMessage ?? null,
        configLocked:      installed?.configLocked ?? true,
        installedAt:       (installed?.installedAt ?? new Date()).toISOString(),
        enableUpdatedAt:   (installed?.enableUpdatedAt ?? new Date()).toISOString(),
        lastHealthCheckAt: installed?.lastHealthCheckAt?.toISOString() ?? null,
        lastExecutedAt:    installed?.lastExecutedAt?.toISOString() ?? null,
      },
    };
  }

  // ────────────────────────────────────────────────────────────
  // GET /api/v1/plugins/:pluginId/source-preview
  // ────────────────────────────────────────────────────────────

  async getSourcePreview(pluginId: string) {
    const row = await this.prisma.pluginManifest.findUnique({
      where:  { id: pluginId },
      select: { id: true, displayName: true, sourcePreview: true },
    });

    if (!row) throw new NotFoundException('Plugin not found');

    return {
      pluginId:    row.id,
      displayName: row.displayName,
      language:    'typescript',
      // readOnly は仕様上 true 固定。クライアントは編集不可とすること。
      readOnly:    true as const,
      content:     row.sourcePreview ?? '// No source preview available',
    };
  }

  // ────────────────────────────────────────────────────────────
  // POST /api/v1/plugins/:pluginId/enable
  // ────────────────────────────────────────────────────────────

  async enablePlugin(pluginId: string, actorUserId?: string | null) {
    const manifest = await this.prisma.pluginManifest.findUnique({
      where:   { id: pluginId },
      include: { installedPlugins: true },
    });

    if (!manifest) throw new NotFoundException('Plugin not found');

    const installed = manifest.installedPlugins[0];
    if (!installed) throw new BadRequestException('Installed plugin state is missing');

    // incompatible / missing_dependency 状態では有効化不可
    if (
      installed.status === 'incompatible' ||
      installed.status === 'missing_dependency'
    ) {
      throw new BadRequestException(
        `Cannot enable plugin with status: ${String(installed.status)}`,
      );
    }

    const beforeState = {
      isEnabled: installed.isEnabled,
      status:    installed.status,
    };

    const updated = await this.prisma.installedPlugin.update({
      where: { pluginManifestId: pluginId },
      data:  {
        isEnabled:      true,
        status:         'enabled',
        enableUpdatedAt: new Date(),
      },
    });

    // 監査ログ記録（enable / disable は必須）
    await this.prisma.pluginAuditLog.create({
      data: {
        pluginManifestId: pluginId,
        actorUserId:      actorUserId ?? null,
        action:           'enable',
        beforeStateJson:  beforeState,
        afterStateJson:   {
          isEnabled: updated.isEnabled,
          status:    updated.status,
        },
      },
    });

    // registry 更新
    await this._refreshRegistry();

    return {
      pluginId,
      isEnabled:      updated.isEnabled,
      status:         updated.status,
      enableUpdatedAt: updated.enableUpdatedAt.toISOString(),
    };
  }

  // ────────────────────────────────────────────────────────────
  // POST /api/v1/plugins/:pluginId/disable
  // ────────────────────────────────────────────────────────────

  async disablePlugin(pluginId: string, actorUserId?: string | null) {
    const manifest = await this.prisma.pluginManifest.findUnique({
      where:   { id: pluginId },
      include: { installedPlugins: true },
    });

    if (!manifest) throw new NotFoundException('Plugin not found');

    // core plugin は disable 不可
    if (manifest.isCore) {
      throw new BadRequestException('Core plugin cannot be disabled');
    }

    const installed = manifest.installedPlugins[0];
    if (!installed) throw new BadRequestException('Installed plugin state is missing');

    const beforeState = {
      isEnabled: installed.isEnabled,
      status:    installed.status,
    };

    const updated = await this.prisma.installedPlugin.update({
      where: { pluginManifestId: pluginId },
      data:  {
        isEnabled:      false,
        status:         'disabled',
        enableUpdatedAt: new Date(),
      },
    });

    // 監査ログ記録
    await this.prisma.pluginAuditLog.create({
      data: {
        pluginManifestId: pluginId,
        actorUserId:      actorUserId ?? null,
        action:           'disable',
        beforeStateJson:  beforeState,
        afterStateJson:   {
          isEnabled: updated.isEnabled,
          status:    updated.status,
        },
      },
    });

    // registry 更新
    await this._refreshRegistry();

    return {
      pluginId,
      isEnabled:      updated.isEnabled,
      status:         updated.status,
      enableUpdatedAt: updated.enableUpdatedAt.toISOString(),
    };
  }

  // ────────────────────────────────────────────────────────────
  // GET /api/v1/plugins/:pluginId/audit-logs
  // ────────────────────────────────────────────────────────────

  async getAuditLogs(pluginId: string) {
    // 対象 manifest の存在確認
    const exists = await this.prisma.pluginManifest.findUnique({
      where:  { id: pluginId },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('Plugin not found');

    const items = await this.prisma.pluginAuditLog.findMany({
      where:   { pluginManifestId: pluginId },
      orderBy: { createdAt: 'desc' },
    });

    return {
      items: items.map((item) => ({
        id:               item.id,
        pluginManifestId: item.pluginManifestId,
        actorUserId:      item.actorUserId,
        action:           item.action,
        beforeStateJson:  item.beforeStateJson as Record<string, unknown>,
        afterStateJson:   item.afterStateJson  as Record<string, unknown>,
        createdAt:        item.createdAt.toISOString(),
      })),
      total: items.length,
    };
  }

  
  // ────────────────────────────────────────────────────────────
  // GET /api/v1/plugins/:pluginId/health
  // 参照仕様: fxde_plugin_system_完全設計書 §7
  // MVP: InstalledPlugin の既存フィールドから status を判定する
  // 大掛かりな監視システムは作らない（タスクC 注意事項準拠）
  // ────────────────────────────────────────────────────────────
  
  async getPluginHealth(pluginId: string): Promise<{
    pluginId:          string;
    status:            'healthy' | 'degraded' | 'unhealthy' | 'unknown';
    lastHealthCheckAt: string | null;
    lastExecutedAt:    string | null;
    errorMessage:      string | null;
  }> {
    const row = await this.prisma.pluginManifest.findUnique({
      where:   { id: pluginId },
      include: { installedPlugins: true },
    });
  
    if (!row) throw new NotFoundException('Plugin not found');
  
    const installed = row.installedPlugins[0];
  
    if (!installed) {
      return {
        pluginId,
        status:            'unknown',
        lastHealthCheckAt: null,
        lastExecutedAt:    null,
        errorMessage:      null,
      };
    }
  
    // status 判定ロジック（MVP: DB の既存フィールドのみ使用）
    //   healthy:  isEnabled=true かつ status='enabled' かつ errorMessage なし
    //   degraded: isEnabled=true だが errorMessage あり
    //   unhealthy: status='error' または status='incompatible' または 'missing_dependency'
    //   unknown: 上記以外
    let health: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
    if (installed.status === 'error' || installed.status === 'incompatible' || installed.status === 'missing_dependency') {
      health = 'unhealthy';
    } else if (installed.isEnabled && !installed.errorMessage) {
      health = 'healthy';
    } else if (installed.isEnabled && installed.errorMessage) {
      health = 'degraded';
    } else {
      health = 'unknown';
    }
  
    return {
      pluginId,
      status:            health,
      lastHealthCheckAt: installed.lastHealthCheckAt?.toISOString() ?? null,
      lastExecutedAt:    installed.lastExecutedAt?.toISOString() ?? null,
      errorMessage:      installed.errorMessage ?? null,
    };
  }

  // ────────────────────────────────────────────────────────────
  // Internal: sort orderBy 生成
  // 修正2: displayName 固定 → クエリパラメータ対応
  // ────────────────────────────────────────────────────────────

  private _buildOrderBy(sort: PluginSortValue): object {
    switch (sort) {
      case 'createdAt':  return { createdAt: 'asc'  as const };
      case 'pluginType': return { pluginType: 'asc' as const };
      case 'version':    return { version: 'asc'    as const };
      case 'name':
      default:           return { displayName: 'asc' as const };
    }
  }

  // ────────────────────────────────────────────────────────────
  // Internal: registry 再構築
  // ────────────────────────────────────────────────────────────

  private async _refreshRegistry(): Promise<void> {
    const rows = await this.prisma.pluginManifest.findMany({
      include: { installedPlugins: true },
    });

    this.registry.refresh(
      rows.map((row) => ({
        pluginId:  row.id,
        manifest:  { id: row.id, slug: row.slug, displayName: row.displayName } as Record<string, unknown>,
        installed: {
          isEnabled: row.installedPlugins[0]?.isEnabled ?? false,
          status:    row.installedPlugins[0]?.status ?? 'disabled',
        } as Record<string, unknown>,
      })),
    );
  }
}