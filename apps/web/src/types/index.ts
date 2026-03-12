/**
 * apps/web/src/types/index.ts
 *
 * ⚠️ このファイルは独自型定義を持たない。
 * すべての型は packages/types（@fxde/types）を正本とする。
 *
 * 参照仕様: SPEC_v51_part3 §2「共通型定義（packages/types）」
 *           監査レポート B-1「Web 側で『API型の二重管理』が発生」
 */

// @fxde/types からすべてを再エクスポート
// → apps/web 内で import { TradeDto } from '../types' と書いても動作する
export * from '@fxde/types';