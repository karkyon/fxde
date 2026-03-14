/**
 * apps/api/src/plugins-runtime/types/resolved-plugin.ts
 *
 * Enabled Plugins Resolver が返す実行対象プラグイン情報
 *
 * 参照仕様:
 *   fxde_plugin_runtime_完全設計書 §4.2「Enabled Plugins Resolver」
 */

/** Resolver が返す実行対象プラグイン情報 */
export interface ResolvedPlugin {
  pluginId:    string;
  pluginKey:   string;  // = PluginManifest.slug
  displayName: string;
  capabilities: string[];
  /** タイムアウト上限 ms（設計書 §8.3 デフォルト 2000ms） */
  timeoutMs:   number;
  /** 実行順序 */
  sortOrder:   number;
}