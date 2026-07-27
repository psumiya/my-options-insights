# Implementation Plan

## Phase 1: Data corrections (land before any UI work)

- [x] 1. Include commissions and fees in strategy-level P/L
  - Sum per-leg `Commissions` and `Fees` in `aggregateStrategyLegs()` in `js/tasty-strategy-mapper.js`
  - Expose `Commissions` and `Fees` on the aggregated trade record
  - Set `_metadata.feesAvailable` false when the source CSV has no fee columns
  - Change `ProfitLoss` in `AnalyticsEngine.enrichTrade()` to subtract commissions and fees
  - Update existing test expectations for the new net figures, with a comment on each explaining the shift
  - _Requirements: 1.1, 1.2, 1.3, 1.5, 1.6_

- [x] 2. Fix DTE-at-entry date normalization
  - Add `_daysBetweenDates()` to `js/analytics-engine.js` normalizing both operands to local midnight
  - Use it for `DaysToExpireAtEntry`, leaving `_daysBetween()` for `DaysHeld` and `RemainingDTE`
  - Add a test asserting an afternoon same-day entry yields exactly 0
  - _Requirements: 2.1, 2.2, 2.5_

- [x] 3. Use nearest leg expiration for multi-leg strategies
  - Change `aggregateStrategyLegs()` to take the earliest expiration across opening legs instead of `legs[0]`
  - Set `_metadata.multipleExpirations` when legs disagree
  - _Requirements: 2.3, 2.4_

- [x] 4. Derive spread width
  - Add `deriveWidth(openingLegs, strategy)` to `js/tasty-strategy-mapper.js`
  - Two same-type legs: absolute strike difference; four-leg iron condor: wider wing; otherwise null
  - Expose as `Width` on the aggregated trade record
  - Test against a known iron condor fixture with asymmetric wings
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

## Phase 2: Analysis module

- [x] 5. Create ResearchAnalytics with structure mapping and filtering
  - New `js/research-analytics.js` with canonical structure identifiers
  - `canonicalStructure()` mapping "Iron Condor", "Bull Put Spread", "Bear Call Spread" to identifiers, null otherwise
  - `applyFilter()` restricting to closed trades and applying underlying, DTE cut, and structure selection
  - Return excluded counts by reason alongside the filtered array
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 5.6, 14.1, 14.2_

- [x] 6. Port win/loss statistics and DTE bucketing
  - `winLossStats()`: count, win rate, average win, average loss, breakeven win rate, net, worst, expectancy
  - Treat P/L of exactly zero as a loss, documented inline
  - `dteBucketStats()`: 0DTE / 1-7DTE / >7DTE buckets, omitting empty buckets
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 14.1_

- [x] 7. Port condor versus single-sided comparison
  - `condorVsSingleSide()` splitting into the three canonical structures
  - Render empty groups with a zero count rather than omitting them
  - _Requirements: 10.1, 10.2, 10.3, 10.4_

- [x] 8. Port width breakdown and counterfactual
  - `widthBreakdown()` grouping by width, adding average credit collected per group
  - `widthCounterfactual()` rescaling net P/L by target-over-actual width
  - Exclude null and zero width from both
  - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.8_

- [x] 9. Port statistical checks
  - `runsTest()` with Wald-Wolfowitz z-score and two-sided p-value
  - Implement `erf` via Abramowitz-Stegun 7.1.26
  - Return no statistic plus a note below 10 trades or fewer than 2 wins or 2 losses
  - `lossConcentration()` for top-3 and top-5 loss share
  - `bucketSignificance()` with multiplicative `comb()`, returning the reduced ratio
  - Return no p-value plus a Fisher-exact note when losses split across groups
  - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 13.1, 13.2, 13.3, 13.4, 13.5, 13.6_

- [x] 10. Port calendar and bar series shaping
  - `calendarSeries()` collapsing by date with a mixed category for multi-structure dates
  - `barSeries()` one row per trade, plus net, average per trade, and count aggregates
  - _Requirements: 8.1, 8.3, 8.6, 8.7, 8.8_

- [x] 11. Test ResearchAnalytics
  - Fixture file of hand-constructed trades with hand-computed expected outputs
  - One test per statistic against the fixture
  - Empty, single-trade, all-wins, all-losses, all-null-width cases for each statistic
  - Purity check: two calls on the same input return deep-equal results
  - _Requirements: 14.3, 14.4, 14.5_

## Phase 3: Tab shell and controls

- [x] 12. Add the Research tab to the dashboard shell
  - Tab button after `tab-strategies` and panel after `tab-panel-strategies` in `index.html`
  - Script tags for the new modules
  - Construct `ResearchPanel` in `DashboardController.initialize()` and wire `update()` into the existing data-load and filter-change paths
  - Verify `TabManager` picks the tab up with no changes
  - _Requirements: 5.1, 5.9_

- [x] 13. Build the filter bar
  - Underlying selector populated from the loaded dataset
  - DTE cut selector (all / 0DTE / non-zero) and multi-select structure selector
  - Default to the underlying with the most closed trades, all DTE, all structures
  - Persist filter state to localStorage and restore on load
  - Recompute every visible output on change
  - _Requirements: 5.2, 5.3, 5.4, 5.5, 5.8_

- [x] 14. Build scenario presets
  - `js/research-scenarios.js` with the eleven seeded cuts as data
  - Chip row above the filter bar, applying filters and scrolling the target output into view
  - Clear active styling on manual filter change
  - Disable chips whose underlying is absent, with a hover explanation
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

- [x] 15. Build the caption helper
  - Single `buildCaption()` deriving provenance text from filter state plus count and exclusions
  - Applied to every output; no output carries hardcoded description text
  - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [x] 16. Empty and degenerate states
  - Empty state naming the active filters when the filtered set is empty
  - Gross-of-fees notice when the dataset had no fee columns
  - Note rendering for every unavailable statistic
  - _Requirements: 1.4, 5.7, 12.6, 13.7_

## Phase 4: Outputs

- [x] 17. Wire the calendar view
  - Reuse `HeatmapCalendarChart` against `calendarSeries()` output, no second calendar implementation
  - Label cells by structure, with a mixed indicator for multi-structure dates
  - _Requirements: 8.1, 8.2, 8.3_

- [x] 18. Build ResearchBarChart
  - New `js/visualizations/research-bar-chart.js` following the existing chart component pattern
  - One bar per trade from zero, ordered by entry date, green above and red below, value labelled
  - Three-figure summary above the chart from `barSeries()` aggregates
  - Label every bar below ~150 trades; above that label extremes only, enforce a minimum bar width, and scroll horizontally inside the container
  - Colors from `js/theme-colors.js`
  - _Requirements: 8.4, 8.5, 8.6, 8.7, 15.1, 15.2_

- [x] 19. Build StatTable and StatBlock
  - `js/research-outputs.js` with both renderers driven entirely by the analytics return objects
  - StatTable for DTE buckets, condor comparison, width breakdown, counterfactual
  - StatBlock for runs test, loss concentration, significance, rendering notes when unavailable
  - Wide tables scroll inside their own container
  - Counterfactual labelled a linear approximation
  - _Requirements: 9.5, 11.6, 11.7, 12.6, 13.7, 15.5_

- [x] 20. Section layout and lazy rendering
  - Wrap each table and stat output in `CollapsibleSection`
  - Calendar and bar views expanded by default, tables and stats collapsed
  - Defer computation of collapsed outputs until first expansion
  - _Requirements: 15.3, 15.4, 15.6_

- [x] 21. Theme and responsive verification
  - Verify every output in light and dark themes
  - Verify usability at mobile widths with no horizontal page scroll
  - _Requirements: 15.1, 15.2, 15.5_

- [x] 22. Documentation
  - Note the P/L definition change in `README.md` and the fee handling in `docs/BROKER_SUPPORT.md`
  - Document how to add a preset
  - _Requirements: 6.2_
