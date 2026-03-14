/**
 * apps/api/src/modules/plugins/plugins.registry.ts
 *
 * Plugin Runtime Registry（MVP: DB ベース state 管理）
 *
 * v5.1 では動的 import より先に DB ベース registry + state 管理を先行実装。
 * moduleRef は将来の動的ロード用プレースホルダー。
 *
 * 参照仕様: fxde_plugin_system_完全設計書 §9.1 Plugin Registry / §20.3 Registry 仕様
 */

import { Injectable, Logger } from '@nestjs/common';

export interface RegisteredPlugin {
  manifest:  Record<string, unknown>;
  installed: Record<string, unknown>;
  // v5.1: 動的ロード未実装のため常に null
  moduleRef: unknown | null;
}

@Injectable()
export class PluginsRegistry {
  private readonly logger   = new Logger(PluginsRegistry.name);
  private readonly registry = new Map<string, RegisteredPlugin>();

  /** 単一プラグインを登録 */
  set(pluginId: string, value: RegisteredPlugin): void {
    this.registry.set(pluginId, value);
  }

  /** 単一プラグインを取得 */
  get(pluginId: string): RegisteredPlugin | undefined {
    return this.registry.get(pluginId);
  }

  /** 全登録プラグインを取得 */
  getAll(): RegisteredPlugin[] {
    return Array.from(this.registry.values());
  }

  /** registry をクリア */
  clear(): void {
    this.registry.clear();
  }

  /**
   * DB から取得した最新状態で registry を再構築する。
   * enable / disable 後に PluginsService から呼び出す。
   */
  refresh(
    items: Array<{
      pluginId:  string;
      manifest:  Record<string, unknown>;
      installed: Record<string, unknown>;
    }>,
  ): void {
    this.clear();
    for (const item of items) {
      this.set(item.pluginId, {
        manifest:  item.manifest,
        installed: item.installed,
        moduleRef: null,
      });
    }
    this.logger.log(`Plugin registry refreshed: ${items.length} item(s)`);
  }
}