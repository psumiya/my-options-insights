# Design Document

## Overview

The Research tab adds structural and statistical analysis of closed option trades to
the existing dashboard: DTE bucketing, condor versus single-sided comparison, spread
width breakdown and counterfactual, and three small-sample checks (runs test, loss
concentration, threshold significance).

The analysis logic originates from an externally developed Python module
(`analysis.py`, kept in the scratch materials for this spec, not in the repo). This
design ports those functions to JavaScript and drops the rest of the external
toolchain. Specifically **not** adopted:

- `options_reconstruct.py` — duplicates `js/tasty-strategy-mapper.js`, which already
  groups tastytrade opening transactions by `Order #`, classifies leg patterns, and
  aggregates to strategy-level trades. Two reconstruction engines would drift.
- `generate_report.py` / `scenario_data.json` / parquet — this app is static
  client-side JS with no build step and no backend. Trades are already in memory in
  `DataStore` by the time any analysis runs, so there is nothing to precompute.
- `scenarios.yaml` as a frozen list — a CLI froze the cuts because it has no UI. Here
  the cuts become live filter controls, with the frozen list preserved as presets.
- `templates/report.html` — a second page styled to match this one would diverge from
  it. The output lands in the existing tab shell instead.

The design prioritizes:

- **Single source of numbers**: one reconstruction path, one P/L definition, shared
  across every tab
- **Purity**: every statistic is a pure function over a trade array, unit-testable
  against fixed fixtures
- **Reuse**: existing `CollapsibleSection`, `HeatmapCalendarChart`, `TabManager`,
  theme tokens, no new palette
- **Provenance**: no chart is ambiguous about which cut it shows

## Prerequisite Data Corrections

These are the substance of the work. Every statistic depends on them, and two of them
change numbers that other tabs already display.

### 1. Net P/L must include commissions and fees

`js/tasty-strategy-mapper.js:404` sums only `leg.Value || leg.Total`. Commission and
fee columns present in the tastytrade export are never read. `analysis.py` computes
`cash = Value + Commissions + Fees`, so a direct port would disagree with the app's
own figures on every trade.

Change `aggregateStrategyLegs()` to sum `Commissions` and `Fees` per leg, expose them
as `Commissions` and `Fees` on the aggregated record, and set a
`_metadata.feesAvailable` flag. `AnalyticsEngine.enrichTrade()` then computes
`ProfitLoss = Credit - Debit - Commissions - Fees`.

This shifts existing P/L figures on the Overview, Analysis, and Strategies tabs. That
is the correct direction (they were overstating profit), but it is a visible change
and should land as its own commit ahead of the tab work, with the regression tests
updated in the same commit.

For adapters whose source CSV has no fee columns, both fields are zero and
`feesAvailable` is false, which drives the gross-of-fees notice in Requirement 1.4.

### 2. DTE at entry must normalize to calendar dates

`AnalyticsEngine.enrichTrade()` already computes `DaysToExpireAtEntry`
(`js/analytics-engine.js:21`) as entry-to-expiry, which is the right quantity. The
problem is `_daysBetween()` (line 89) differences raw timestamps and rounds. `Entry`
carries a time-of-day component while `Expiry` is midnight, so a trade opened at
10:30 on its expiration date differences to −0.44 days and rounds to 0 — but one
opened at 14:00 differences to −0.58 and rounds to −1. The 0DTE cut would silently
drop afternoon same-day entries.

Add a `_daysBetweenDates()` that normalizes both operands to local midnight before
differencing, and use it for `DaysToExpireAtEntry`. Leave `_daysBetween()` in place
for `DaysHeld` and `RemainingDTE` to avoid unrelated churn.

Separately, `aggregateStrategyLegs()` takes `Expiry` from `legs[0]` only
(`js/tasty-strategy-mapper.js:429`). `analysis.py:139` uses the minimum expiration
across legs. Change to the earliest leg expiration, and set
`_metadata.multipleExpirations` when legs disagree so calendar and diagonal
structures can be flagged per Requirement 2.4.

### 3. Spread width must be derived

`aggregateStrategyLegs()` collects a sorted `strikes` array into `_metadata` (line
451) but never derives width. Add a `deriveWidth(openingLegs, strategy)` helper
mirroring the logic in `analysis.py:81-106`:

- Two same-type legs: absolute strike difference
- Four-leg iron condor: `max(putWingWidth, callWingWidth)`
- Everything else: null

Expose as `Width` on the aggregated trade record.

### 4. Structure vocabulary mapping

The app's classifier emits `Iron Condor`, `Bull Put Spread`, `Bear Call Spread`
(`js/tasty-strategy-mapper.js:66-91`). The ported analysis expects `iron_condor`,
`put_credit_spread`, `call_credit_spread`. These describe the same structures under
different conventions: a bull put spread *is* a put credit spread.

A mapping table in the new module translates in one direction only — display labels
stay as they are, canonical identifiers are internal. Unmapped labels are excluded
from structure-specific cuts, with the excluded count surfaced per Requirement 4.5.

## Architecture

### Component Structure

```
┌─────────────────────────────────────────────────────────────┐
│                    DashboardController                       │
│  - owns ResearchPanel alongside existing visualizations      │
│  - passes enrichedTrades through on data/filter change       │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┴──────────────────────┐
        │                                            │
   Existing tabs                            ResearchPanel (new)
   (unchanged)                                       │
                            ┌──────────────────────┬─┴────────────────────┐
                            │                      │                      │
                    ResearchFilterBar      ScenarioPresets        Output sections
                    (underlying / DTE /    (chips, config-driven)         │
                     structures)                                          │
                                        ┌─────────────────┬───────────────┼──────────────┐
                                        │                 │               │              │
                                HeatmapCalendarChart  ResearchBarChart  StatTable   StatBlock
                                (reused)              (new)             (new)       (new)
                                        │
                              all fed by ResearchAnalytics (new, pure)
```

### Data Flow

```
CSV upload / filter change
        ↓
DataStore → AnalyticsEngine.enrichTrade()   [net P/L, DTE-at-entry, Width available here]
        ↓
DashboardController.handleFilterChange()
        ↓
ResearchPanel.update(enrichedTrades)
        ↓
ResearchFilterBar state (underlying, dteCut, structures)
        ↓
ResearchAnalytics.applyFilter(trades, filterState) → filtered closed-trade array
        ↓
ResearchAnalytics.<statistic>(filtered, params)     [pure, no side effects]
        ↓
Output component render (only if section expanded)
```

Filter state lives in `ResearchFilterBar` and is persisted to localStorage under a
single key, matching how `CollapsibleSection` (line 244) and
`AdvancedVisualizationPanel` already persist their state.

## Components and Interfaces

### 1. ResearchAnalytics (`js/research-analytics.js`)

Pure functions, no DOM, no state. Direct ports of `analysis.py`. Every function takes
an already-filtered array plus explicit parameters and returns a plain object.

```javascript
const ResearchAnalytics = {
  // canonical structure identifiers and label mapping
  STRUCTURES: { IRON_CONDOR: 'iron_condor', PUT_CREDIT_SPREAD: 'put_credit_spread',
                CALL_CREDIT_SPREAD: 'call_credit_spread' },
  canonicalStructure(displayLabel),        // → identifier | null

  applyFilter(trades, { underlying, dteCut, structures }),  // → closed trades only

  winLossStats(trades),                    // ← _win_loss_stats
  dteBucketStats(trades),                  // ← dte_bucket_stats
  condorVsSingleSide(trades),              // ← condor_vs_single_side
  widthBreakdown(trades),                  // ← width_breakdown
  widthCounterfactual(trades, targetWidths),  // ← width_counterfactual
  runsTest(trades),                        // ← runs_test
  lossConcentration(trades, topN),         // ← loss_concentration
  bucketSignificance(trades, { column, threshold, comparison }),  // ← bucket_significance
  calendarSeries(trades),                  // ← calendar_scenario
  barSeries(trades)                        // ← bar_scenario
};
```

Port notes:

- `winLossStats` counts P/L of exactly zero as a loss, matching `analysis.py:22`
  (`cash <= 0`). Deliberate: a scratch is not a win. Document it, because the app's
  existing `Result` field uses `> 0 ? 'Win' : 'Loss'` and agrees.
- `runsTest` needs an `erf` implementation for the p-value; JavaScript has none
  built in. Use the Abramowitz-Stegun 7.1.26 approximation, accurate to ~1e-7, well
  inside the 3-decimal rounding the output uses.
- `bucketSignificance` needs `comb(n, k)`. Compute multiplicatively in a loop rather
  than via factorials to avoid overflow past n≈170, and return the ratio
  `comb(a, losses) / comb(total, losses)` as a single reduced product to preserve
  precision.
- `calendarSeries` collapses by date and emits `mixed` when a date has more than one
  structure; `barSeries` does not collapse, one row per trade. Same filter, different
  shape — keep both, they answer different questions (Requirement 8.8).
- Every function returns explicit null plus a `note` string for its degenerate cases
  rather than throwing or returning zero. The UI renders the note.

### 2. ResearchPanel (`js/research-panel.js`)

Owns the tab's DOM, the filter bar, the presets, and the output sections. Lazily
constructs each output on first expansion (Requirement 15.6).

```javascript
class ResearchPanel {
  constructor(containerId, analyticsEngine, options = {})
  initialize()
  update(enrichedTrades)      // called by DashboardController
  applyPreset(presetId)
  getFilterState()
  destroy()
}
```

### 3. Scenario preset configuration (`js/research-scenarios.js`)

The eleven seeded cuts as data, so adding one is a config edit (Requirement 6.2). Each
entry carries an id, a display title, the filter state to apply, and which output
section to scroll to.

```javascript
const RESEARCH_PRESETS = [
  { id: 'spx_0dte_all_structures', title: 'SPX 0DTE — condors vs single-sided',
    filter: { underlying: 'SPX', dteCut: 'zero', structures: ['iron_condor',
              'put_credit_spread', 'call_credit_spread'] }, focus: 'calendar' },
  // ...
];
```

Presets naming an underlying absent from the dataset render disabled with a hover
explanation (Requirement 6.5), which matters because the seeded list is SPX-specific
and a fresh user's CSV may have none.

### 4. ResearchBarChart (`js/visualizations/research-bar-chart.js`)

One bar per closed trade, ordered by entry date, drawn from zero. Green above, red
below, value labelled on each bar. D3, following the existing chart component pattern
(SVG container, margins, `ResizeObserver`, `update(data)`), reading colors from
`js/theme-colors.js`.

The three-figure summary (net, average per trade, count) renders above the chart from
`barSeries()`'s own aggregate fields, so it cannot drift from the bars
(Requirement 8.7).

Bar count is the scaling risk: a year of 0DTE trading is several hundred bars. Below
~150 trades, label every bar; above that, label only the extremes and rely on
tooltips, and enforce a minimum bar width with horizontal scroll inside the chart
container.

### 5. StatTable and StatBlock (`js/research-outputs.js`)

Two small renderers, both driven entirely by the objects `ResearchAnalytics` returns:

- `StatTable` — rows-by-metrics table for `dteBucketStats`, `condorVsSingleSide`,
  `widthBreakdown`, `widthCounterfactual`. Wide tables scroll inside their own
  `overflow-x: auto` container (Requirement 15.5).
- `StatBlock` — labelled key-value list for `runsTest`, `lossConcentration`,
  `bucketSignificance`, rendering the `note` string when a statistic is unavailable.

Both render the question, not a verdict (Requirement 12.6). A p-value with an
automated interpretation next to it invites exactly the misreading these checks exist
to prevent, so the caption states what was tested and the numbers stand alone.

### 6. Caption helper

One function turns filter state into the provenance line every output carries
(Requirement 7). Single implementation, so no output can hardcode its own description
and go stale when the filter changes.

```javascript
buildCaption(filterState, { n, excluded, excludedReason })
// → "SPX · iron condors only · DTE > 0 · 47 closed trades · 3 excluded (no width)"
```

### 7. Integration points

- `index.html` — add the `Research` tab button after `tab-strategies` (line 137) and
  a `tab-panel-research` panel after `tab-panel-strategies` (line 248). Add the two
  new script tags near the other visualization scripts (line 335 area).
- `js/dashboard-controller.js` — construct `ResearchPanel` in `initialize()` next to
  `advancedVizPanel` (line 50), and call its `update()` from the existing filter-change
  and data-load paths so it picks up the 300ms debounce already in place.
- `js/tab-manager.js` — no change needed; it discovers tabs from `.tab-btn` (line 15).

## Error Handling

| Condition | Handling |
|---|---|
| No data loaded | Existing empty state, same as other tabs (Req 5.9) |
| Filter matches zero closed trades | Empty state naming the active filters, no blank charts (Req 5.7) |
| Trade missing DTE at entry | Excluded from DTE cuts, counted in caption (Req 2.5) |
| Trade missing or zero width | Excluded from width outputs, counted in caption (Req 3.5, 11.5) |
| Strategy label maps to no structure | Excluded from structure cuts, counted in caption (Req 4.5) |
| Sample too small for runs test | Statistic omitted, `note` rendered (Req 12.3) |
| No losses in filtered set | Concentration and significance omitted, `note` rendered (Req 12.5, 13.4) |
| Losses split across both threshold groups | No p-value, Fisher-exact note rendered (Req 13.3) |
| Source CSV lacks fee columns | Fees treated as zero, gross-of-fees notice shown (Req 1.3, 1.4) |
| Legs have differing expirations | Nearest expiry used, trade flagged calendar/diagonal (Req 2.3, 2.4) |

## Testing Strategy

Unit tests in the existing `tests/` structure, one fixture file of hand-constructed
trades with known expected outputs.

- **Statistic correctness**: each `ResearchAnalytics` function against the fixture,
  with expected values computed by hand rather than by running the implementation, so
  the test can actually fail. Cross-check a subset against the Python module's output
  on the same inputs where a real dataset is available.
- **Degenerate cases**: empty array, one trade, all wins, all losses, all-null width,
  for every statistic (Requirement 14.4).
- **Prerequisite corrections**: a multi-leg iron condor fixture verifying net P/L nets
  fees, DTE-at-entry reads 0 for an afternoon same-day entry, width takes the wider
  wing, and nearest-expiry selection picks the earliest leg (Requirement 14.5).
- **Regression**: the existing suite must pass with updated expected P/L values
  reflecting fee inclusion. Any test whose expectation changes gets an explicit
  comment saying why, so the shift is not mistaken for a bug later.
- **Purity**: calling each statistic twice on the same input returns deep-equal
  results, and no statistic references `Date.now()` or `Math.random()`.

## Open Questions

1. **Fee inclusion scope.** This design nets fees everywhere, which is correct but
   changes numbers already on screen. The alternative — netting fees only in the
   Research tab — is worse (two P/L definitions in one app) and is rejected. Flagging
   because it is a visible change to existing output.
2. **Counterfactual honesty.** Linear rescaling by width assumes loss magnitude scales
   proportionally. Roughly true for max-loss outcomes, wrong for partial ones, so the
   output is labelled an approximation (Requirement 11.7). Whether to go further and
   restrict it to trades that closed at or near max loss is deferred.
3. **Preset portability.** The eleven seeded presets are SPX-specific, inherited from
   the source material. Generating presets per-underlying from the loaded dataset would
   generalize the tab, but changes it from "the cuts I always review" to "cuts the app
   invented." Kept literal for now.
