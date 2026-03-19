export default function FxdePluginReliabilityLabWireframe() {
  const pluginRows = [
    {
      name: 'Supply Demand Zones PRO',
      version: 'v1.2.0',
      samples: 1842,
      winRate: '58.4%',
      expectancy: '+0.19R',
      session: 'London',
      status: 'Stable',
    },
    {
      name: 'RSI Divergence',
      version: 'v0.9.4',
      samples: 963,
      winRate: '52.1%',
      expectancy: '+0.07R',
      session: 'New York',
      status: 'Needs review',
    },
    {
      name: 'Breakout Retest',
      version: 'v0.7.1',
      samples: 521,
      winRate: '61.8%',
      expectancy: '+0.28R',
      session: 'London/NY Overlap',
      status: 'Promising',
    },
  ];

  const eventRows = [
    {
      time: '2026-02-12 14:00',
      symbol: 'USDJPY',
      tf: 'H1',
      plugin: 'Supply Demand Zones PRO',
      direction: 'BUY',
      trigger: '151.240',
      outcome: 'TP first hit',
      mfe: '+0.82%',
      mae: '-0.18%',
    },
    {
      time: '2026-02-18 09:00',
      symbol: 'EURUSD',
      tf: 'M30',
      plugin: 'RSI Divergence',
      direction: 'SELL',
      trigger: '1.0862',
      outcome: 'Expired',
      mfe: '+0.21%',
      mae: '-0.35%',
    },
    {
      time: '2026-03-01 21:00',
      symbol: 'GBPUSD',
      tf: 'H4',
      plugin: 'Breakout Retest',
      direction: 'BUY',
      trigger: '1.2748',
      outcome: 'Success',
      mfe: '+1.46%',
      mae: '-0.22%',
    },
  ];

  const comboRows = [
    {
      combo: 'Zone only',
      samples: 1842,
      winRate: '58.4%',
      expectancy: '+0.19R',
      pf: '1.31',
    },
    {
      combo: 'Zone + London session',
      samples: 612,
      winRate: '63.9%',
      expectancy: '+0.33R',
      pf: '1.58',
    },
    {
      combo: 'Zone + Uptrend + London',
      samples: 244,
      winRate: '68.0%',
      expectancy: '+0.44R',
      pf: '1.79',
    },
    {
      combo: 'Zone + RSI Divergence',
      samples: 126,
      winRate: '71.4%',
      expectancy: '+0.52R',
      pf: '1.94',
    },
  ];

  const steps = [
    {
      no: '01',
      title: '条件を決める',
      body: '通貨ペア、時間足、期間、評価ルール、セッション条件を左上のフィルタで設定。ここで研究対象の母集団を絞る。',
    },
    {
      no: '02',
      title: 'plugin別の全体傾向を見る',
      body: '上段カードと中央テーブルで sample 数、勝率、期待値、Profit Factor を比較し、そもそも研究継続価値がある plugin を見極める。',
    },
    {
      no: '03',
      title: '時間帯や市場別に強い条件を探す',
      body: 'Session Heatmap と Regime Matrix で Tokyo / London / New York、トレンド状態、ボラ状態ごとの差を確認。',
    },
    {
      no: '04',
      title: '単独と複合条件を比較する',
      body: 'Combination Lab で Zone 単独、Zone + 上位足上昇、Zone + 他plugin 併発などを比較し、本当に使うべき組み合わせを探す。',
    },
    {
      no: '05',
      title: '個別イベントに戻って精査する',
      body: 'Event Explorer で成功・失敗事例を確認し、false positive の共通点や改善アイデアを plugin 開発に戻す。',
    },
  ];

  const heatCells = [
    ['USDJPY H1', '64%', '59%', '51%', '＋'],
    ['EURUSD M30', '49%', '57%', '54%', '±'],
    ['GBPUSD H4', '61%', '66%', '62%', '＋'],
    ['AUDUSD H1', '44%', '53%', '48%', '−'],
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl space-y-6 p-6">
        <header className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-2xl">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="mb-2 inline-flex rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs font-medium text-cyan-300">
                FXDE / Plugin Reliability Lab Wireframe
              </div>
              <h1 className="text-3xl font-semibold tracking-tight">Pattern Research Workspace</h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-400">
                plugin が出した signal を大量の過去データで検証し、時間帯・相場状況・通貨ペア・複合条件ごとの
                信頼性を研究するための画面イメージ。
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ['Tracked Plugins', '12'],
                ['Signal Events', '48,291'],
                ['Rules', '4'],
                ['Research Jobs', '19'],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3">
                  <div className="text-xs text-slate-500">{label}</div>
                  <div className="mt-1 text-xl font-semibold">{value}</div>
                </div>
              ))}
            </div>
          </div>
        </header>

        <section className="grid gap-6 xl:grid-cols-[300px_1fr]">
          <aside className="space-y-4 rounded-3xl border border-slate-800 bg-slate-900/80 p-5 shadow-xl">
            <div>
              <h2 className="text-lg font-semibold">Research Filters</h2>
              <p className="mt-1 text-xs text-slate-400">母集団条件を定義して検証対象を絞る。</p>
            </div>

            <div className="space-y-3">
              {[
                ['Plugin', 'Supply Demand Zones PRO'],
                ['Symbols', 'USDJPY, EURUSD, GBPUSD'],
                ['Timeframes', 'M30, H1, H4'],
                ['Date Range', '2024-01-01 → 2026-03-01'],
                ['Rule', 'TP/SL First Hit (1R / 1R)'],
                ['Session', 'All / London / New York'],
                ['Trend Regime', 'All / Up / Down / Range'],
                ['Concurrent Plugin', 'Any / RSI Divergence'],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
                  <div className="text-xs text-slate-500">{label}</div>
                  <div className="mt-1 text-sm font-medium text-slate-200">{value}</div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button className="rounded-2xl bg-cyan-500 px-4 py-3 text-sm font-semibold text-slate-950">
                Run Research
              </button>
              <button className="rounded-2xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm font-semibold text-slate-200">
                Save View
              </button>
            </div>

            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-200">
              Sample warning: 一部の複合条件はサンプル数が 150 未満。過剰最適化に注意。
            </div>
          </aside>

          <main className="space-y-6">
            <section className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
              {[
                ['Primary Plugin', 'Supply Demand Zones PRO'],
                ['Sample Count', '1,842'],
                ['Win Rate', '58.4%'],
                ['Expectancy', '+0.19R'],
                ['Profit Factor', '1.31'],
                ['Avg MFE', '+0.74%'],
                ['Avg MAE', '-0.29%'],
                ['Best Session', 'London'],
              ].map(([label, value]) => (
                <div key={label} className="rounded-3xl border border-slate-800 bg-slate-900/80 p-4 shadow-xl">
                  <div className="text-xs text-slate-500">{label}</div>
                  <div className="mt-2 text-xl font-semibold">{value}</div>
                </div>
              ))}
            </section>

            <section className="grid gap-6 2xl:grid-cols-[1.2fr_0.8fr]">
              <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5 shadow-xl">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">Plugin Comparison Table</h2>
                    <p className="text-xs text-slate-400">どの plugin を研究継続・採用候補にするかを比較。</p>
                  </div>
                  <div className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300">Sort: Expectancy</div>
                </div>
                <div className="overflow-hidden rounded-2xl border border-slate-800">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-950/80 text-left text-slate-400">
                      <tr>
                        {['Plugin', 'Version', 'Samples', 'Win Rate', 'Expectancy', 'Best Session', 'Status'].map((head) => (
                          <th key={head} className="px-4 py-3 font-medium">{head}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pluginRows.map((row) => (
                        <tr key={row.name} className="border-t border-slate-800 bg-slate-900/40">
                          <td className="px-4 py-3 font-medium">{row.name}</td>
                          <td className="px-4 py-3 text-slate-300">{row.version}</td>
                          <td className="px-4 py-3">{row.samples}</td>
                          <td className="px-4 py-3">{row.winRate}</td>
                          <td className="px-4 py-3">{row.expectancy}</td>
                          <td className="px-4 py-3">{row.session}</td>
                          <td className="px-4 py-3">
                            <span className="rounded-full border border-slate-700 px-2 py-1 text-xs">{row.status}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5 shadow-xl">
                <div className="mb-4">
                  <h2 className="text-lg font-semibold">How this lab is used</h2>
                  <p className="text-xs text-slate-400">実運用と研究をつなぐ基本フロー。</p>
                </div>
                <div className="space-y-3">
                  {steps.map((step) => (
                    <div key={step.no} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                      <div className="flex items-start gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cyan-500/20 text-sm font-semibold text-cyan-300">
                          {step.no}
                        </div>
                        <div>
                          <div className="font-medium">{step.title}</div>
                          <p className="mt-1 text-sm text-slate-400">{step.body}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="grid gap-6 xl:grid-cols-2">
              <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5 shadow-xl">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">Session / Symbol Heatmap</h2>
                    <p className="text-xs text-slate-400">時間帯・市場別にどこで強いかを素早く確認。</p>
                  </div>
                  <div className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300">Metric: Win Rate</div>
                </div>
                <div className="overflow-hidden rounded-2xl border border-slate-800">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-950/80 text-left text-slate-400">
                      <tr>
                        {['Symbol / TF', 'Tokyo', 'London', 'New York', 'Signal'].map((head) => (
                          <th key={head} className="px-4 py-3 font-medium">{head}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {heatCells.map((row) => (
                        <tr key={row[0]} className="border-t border-slate-800">
                          {row.map((cell, idx) => (
                            <td key={cell + idx} className="px-4 py-3">
                              {idx === 4 ? (
                                <span className="rounded-full border border-slate-700 px-2 py-1 text-xs">{cell}</span>
                              ) : (
                                cell
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5 shadow-xl">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">Regime Matrix</h2>
                    <p className="text-xs text-slate-400">トレンドとボラティリティ条件で強さを見る。</p>
                  </div>
                  <div className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300">Metric: Expectancy</div>
                </div>
                <div className="grid grid-cols-3 gap-3 text-sm">
                  {[
                    ['Uptrend / Low Vol', '+0.24R'],
                    ['Uptrend / Mid Vol', '+0.41R'],
                    ['Uptrend / High Vol', '+0.09R'],
                    ['Range / Low Vol', '-0.04R'],
                    ['Range / Mid Vol', '+0.06R'],
                    ['Range / High Vol', '-0.11R'],
                    ['Downtrend / Low Vol', '+0.12R'],
                    ['Downtrend / Mid Vol', '+0.28R'],
                    ['Downtrend / High Vol', '-0.08R'],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                      <div className="text-xs text-slate-500">{label}</div>
                      <div className="mt-2 text-lg font-semibold">{value}</div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5 shadow-xl">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">Combination Lab</h2>
                    <p className="text-xs text-slate-400">単独 vs 複合条件を比較して使うべき組み合わせを探す。</p>
                  </div>
                  <button className="rounded-2xl border border-slate-700 px-3 py-2 text-xs text-slate-300">New Scenario</button>
                </div>
                <div className="overflow-hidden rounded-2xl border border-slate-800">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-950/80 text-left text-slate-400">
                      <tr>
                        {['Condition Set', 'Samples', 'Win Rate', 'Expectancy', 'PF'].map((head) => (
                          <th key={head} className="px-4 py-3 font-medium">{head}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {comboRows.map((row) => (
                        <tr key={row.combo} className="border-t border-slate-800">
                          <td className="px-4 py-3 font-medium">{row.combo}</td>
                          <td className="px-4 py-3">{row.samples}</td>
                          <td className="px-4 py-3">{row.winRate}</td>
                          <td className="px-4 py-3">{row.expectancy}</td>
                          <td className="px-4 py-3">{row.pf}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5 shadow-xl">
                <div className="mb-4">
                  <h2 className="text-lg font-semibold">Research Notes / Decisions</h2>
                  <p className="text-xs text-slate-400">研究結果から次の開発方針へ落とし込むメモ領域。</p>
                </div>
                <div className="space-y-3">
                  {[
                    'Supply Demand Zones PRO は London 時間の H1 で優位性が高い。',
                    'Range 相場では false positive が増えるため trend filter が必要。',
                    'RSI Divergence との併発で期待値が大きく改善。',
                    'AUDUSD は sample 増強後に再判定。現時点で優先度は低い。',
                  ].map((note) => (
                    <div key={note} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-300">
                      {note}
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5 shadow-xl">
              <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-lg font-semibold">Event Explorer</h2>
                  <p className="text-xs text-slate-400">個別イベント単位で false positive / success case を掘り下げる。</p>
                </div>
                <div className="flex gap-3">
                  <button className="rounded-2xl border border-slate-700 px-3 py-2 text-xs text-slate-300">Only Failures</button>
                  <button className="rounded-2xl border border-slate-700 px-3 py-2 text-xs text-slate-300">Open Linked Chart</button>
                </div>
              </div>
              <div className="overflow-hidden rounded-2xl border border-slate-800">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-950/80 text-left text-slate-400">
                    <tr>
                      {['Detected', 'Symbol', 'TF', 'Plugin', 'Dir', 'Trigger', 'Outcome', 'MFE', 'MAE'].map((head) => (
                        <th key={head} className="px-4 py-3 font-medium">{head}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {eventRows.map((row) => (
                      <tr key={row.time + row.plugin} className="border-t border-slate-800">
                        <td className="px-4 py-3">{row.time}</td>
                        <td className="px-4 py-3">{row.symbol}</td>
                        <td className="px-4 py-3">{row.tf}</td>
                        <td className="px-4 py-3 font-medium">{row.plugin}</td>
                        <td className="px-4 py-3">{row.direction}</td>
                        <td className="px-4 py-3">{row.trigger}</td>
                        <td className="px-4 py-3">{row.outcome}</td>
                        <td className="px-4 py-3">{row.mfe}</td>
                        <td className="px-4 py-3">{row.mae}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </main>
        </section>
      </div>
    </div>
  );
}
