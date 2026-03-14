/**
 * apps/api/src/plugins-runtime/capability-alias.util.ts
 *
 * capability 命名差の互換吸収ユーティリティ（タスクE）
 *
 * 背景:
 *   設計書では "chart.overlay" / "chart.signal" / "chart.indicator" 系の
 *   ドット区切り命名が言及されることがある。
 *   実装では "chart_overlay" / "chart_signal" / "chart_indicator" 系の
 *   アンダースコア区切りを canonical として使用している。
 *
 * 方針:
 *   - DB migration 前提の破壊的変更にしない
 *   - 既存データ（chart_overlay 等）はそのまま維持する
 *   - 入力時にドット/アンダースコアどちらも canonical（アンダースコア）に正規化する
 *   - runtime 判定時にこの関数を通すことで両形式を透過的に扱う
 *
 * canonical: アンダースコア区切り（chart_overlay, chart_signal, chart_indicator）
 */

/**
 * ドット区切り → アンダースコア区切りのエイリアスマップ
 * 将来 capability が増えた場合はここに追加するだけでよい
 */
const CAPABILITY_DOT_TO_UNDERSCORE: Record<string, string> = {
  'chart.overlay':   'chart_overlay',
  'chart.signal':    'chart_signal',
  'chart.indicator': 'chart_indicator',
  'snapshot.enrichment': 'snapshot_enrichment',
  'trade.assist':    'trade_assist',
  'session.highlight':   'session_highlight',
  'overlap.detection':   'overlap_detection',
  'bias.detection':      'bias_detection',
  'mtf.analysis':        'mtf_analysis',
  'score.boost':         'score_boost',
};

/**
 * capability 文字列を canonical 形式（アンダースコア区切り）に正規化する。
 *
 * 例:
 *   normalizeCapability('chart.overlay')  → 'chart_overlay'
 *   normalizeCapability('chart_overlay')  → 'chart_overlay'  // そのまま
 *   normalizeCapability('zone_detection') → 'zone_detection' // そのまま
 *
 * @param value DB または manifest から取得した raw capability 文字列
 * @returns canonical capability 文字列
 */
export function normalizeCapability(value: string): string {
  // ドット区切りの既知エイリアスがあればそちらに変換
  if (Object.prototype.hasOwnProperty.call(CAPABILITY_DOT_TO_UNDERSCORE, value)) {
    return CAPABILITY_DOT_TO_UNDERSCORE[value];
  }
  // 未知のドット区切りは汎用的にアンダースコアに変換
  if (value.includes('.')) {
    return value.replace(/\./g, '_');
  }
  // 既にアンダースコア形式 or その他 → そのまま返す
  return value;
}

/**
 * capabilities 配列を正規化する（normalizeCapability の配列版）
 */
export function normalizeCapabilities(capabilities: string[]): string[] {
  return capabilities.map(normalizeCapability);
}