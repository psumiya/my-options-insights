# Requirements Document

## Introduction

This feature adds a Research tab to the dashboard for structural analysis of options
trades: cutting the closed-trade set by days-to-expiration, structure, and spread
width, and applying statistical checks to the resulting subsets. It ports a set of
deterministic analysis functions developed externally in Python (`analysis.py`) into
the existing client-side JavaScript architecture, and exposes them behind live filter
controls plus a fixed list of one-click presets.

Existing dashboard tabs answer "how did I do." This tab answers "which structural
choices drove that, and is the pattern real or small-sample noise."

Two data-correctness prerequisites are in scope, because every number in this tab
depends on them: net P/L must include commissions and fees, and DTE-at-entry must be
computed on calendar dates so that same-day expirations reliably read as 0DTE.

## Glossary

- **Research Tab**: New top-level dashboard tab housing this feature
- **Scenario**: A named combination of filters (underlying, DTE cut, structures) plus an output type
- **Preset**: A one-click chip that applies a predefined Scenario's filters
- **Structure**: A multi-leg option strategy shape (iron condor, put credit spread, call credit spread)
- **DTE at Entry**: Calendar days from trade entry date to nearest leg expiration date
- **DTE Cut**: A filter selecting 0DTE only, non-zero DTE only, or all trades
- **Spread Width**: Absolute strike distance between the short and long leg of a vertical; for an iron condor, the wider of the two wings
- **Net P/L**: Trade proceeds after commissions and fees
- **Width Counterfactual**: Rescaling each trade's actual net P/L linearly by (target width / actual width) to estimate what a uniformly sized book would have returned
- **Runs Test**: Wald-Wolfowitz test on the chronological win/loss sequence, checking whether wins and losses cluster more than chance would predict
- **Loss Concentration**: The share of total dollar losses attributable to the largest N losing trades
- **Bucket Significance**: Hypergeometric probability that all observed losses landed in one side of a two-way split purely by chance

## Requirements

### Requirement 1: Net P/L Includes Commissions and Fees

**User Story:** As a trader, I want every P/L figure to be net of commissions and fees, so that the analysis reflects what actually hit my account

#### Acceptance Criteria

1. WHEN aggregating legs into a strategy-level trade, THE Broker Adapter SHALL sum the per-leg commission and fee columns when the source CSV provides them
2. THE Broker Adapter SHALL expose the summed commissions and fees as separate fields on the trade record, in addition to folding them into net P/L
3. WHEN the source CSV provides no commission or fee columns, THE Broker Adapter SHALL treat both as zero and SHALL record that fees were unavailable
4. WHEN fees were unavailable for a dataset, THE Research Tab SHALL display a notice that P/L figures are gross of fees
5. THE Analytics Engine SHALL compute net P/L as credit minus debit minus commissions minus fees
6. WHEN net P/L changes for existing trades, THE Dashboard SHALL reflect the same net figures across all tabs, with no tab showing a gross figure alongside a net one

### Requirement 2: Reliable DTE at Entry

**User Story:** As a trader analyzing 0DTE performance, I want same-day expirations to always classify as 0DTE, so that the 0DTE cut is trustworthy

#### Acceptance Criteria

1. WHEN computing DTE at entry, THE Analytics Engine SHALL normalize both the entry timestamp and the expiration timestamp to calendar dates before differencing
2. WHEN a trade is entered and expires on the same calendar date, THE Analytics Engine SHALL compute a DTE at entry of exactly 0
3. WHEN a multi-leg strategy has legs with differing expiration dates, THE Analytics Engine SHALL use the nearest expiration date across all legs
4. WHEN a strategy's legs have differing expiration dates, THE Analytics Engine SHALL flag the trade as a calendar or diagonal structure
5. WHEN entry or expiration date is missing or unparseable, THE Analytics Engine SHALL set DTE at entry to null and SHALL exclude the trade from DTE-based cuts

### Requirement 3: Spread Width Derivation

**User Story:** As a trader, I want each spread's width recorded, so that I can compare performance and risk across position sizes

#### Acceptance Criteria

1. WHEN aggregating a two-leg vertical spread, THE Broker Adapter SHALL derive width as the absolute difference between the two strikes
2. WHEN aggregating a four-leg iron condor, THE Broker Adapter SHALL derive width as the greater of the put wing width and the call wing width
3. WHEN a structure has no meaningful width (single leg, straddle, strangle), THE Broker Adapter SHALL set width to null
4. WHEN width cannot be derived because strike data is missing, THE Broker Adapter SHALL set width to null
5. THE Research Tab SHALL exclude trades with null width from width breakdowns and width counterfactuals, and SHALL display the excluded count

### Requirement 4: Structure Vocabulary Mapping

**User Story:** As a trader, I want condor and credit-spread analyses to find my trades regardless of the naming convention used internally, so that no trades are silently dropped from a cut

#### Acceptance Criteria

1. THE Research Analytics module SHALL map the dashboard's existing strategy labels to canonical structure identifiers for iron condor, put credit spread, and call credit spread
2. THE Research Analytics module SHALL treat the existing "Bull Put Spread" label as a put credit spread and "Bear Call Spread" as a call credit spread
3. THE Research Analytics module SHALL preserve the dashboard's existing display labels in all user-facing text, using canonical identifiers only internally
4. WHEN a trade's strategy label maps to no canonical structure, THE Research Analytics module SHALL exclude it from structure-specific cuts without error
5. WHEN a structure filter excludes trades due to unmapped labels, THE Research Tab SHALL display the excluded count

### Requirement 5: Research Tab Shell and Filter Bar

**User Story:** As a trader, I want to set an underlying, a DTE cut, and a set of structures once and see every analysis update, so that I can explore cuts without reconfiguring each chart

#### Acceptance Criteria

1. THE Dashboard SHALL add a Research tab to the existing tab navigation, after the Strategies tab
2. THE Research Tab SHALL display a filter bar containing an underlying selector, a DTE cut selector, and a multi-select structure selector
3. THE Research Tab SHALL populate the underlying selector from the underlyings present in the loaded dataset
4. WHEN the Research Tab first loads, THE Research Tab SHALL default to the underlying with the most closed trades, a DTE cut of all, and all structures selected
5. WHEN a user changes any filter, THE Research Tab SHALL recompute and re-render every visible analysis against the new filtered set
6. THE Research Tab SHALL restrict all analyses to closed trades only, and SHALL state that open positions are excluded
7. WHEN the filtered set contains no closed trades, THE Research Tab SHALL display an empty state naming the active filters rather than rendering blank charts
8. THE Research Tab SHALL persist the active filter selection across page reloads
9. WHEN no trade data is loaded, THE Research Tab SHALL display the same prompt-to-upload state as the other tabs

### Requirement 6: Scenario Presets

**User Story:** As a trader, I want one-click access to the specific cuts I review regularly, so that I get the same comparison every time without setting filters by hand

#### Acceptance Criteria

1. THE Research Tab SHALL display a row of preset chips above the filter bar
2. THE Research Tab SHALL define presets as data in a single configuration structure, so that adding a preset requires no changes to rendering logic
3. WHEN a user clicks a preset chip, THE Research Tab SHALL apply that preset's filters and scroll the matching analysis into view
4. WHEN a user manually changes a filter after applying a preset, THE Research Tab SHALL clear the preset's active styling
5. WHEN a preset references an underlying absent from the loaded dataset, THE Research Tab SHALL disable that chip and SHALL indicate why on hover
6. THE Research Tab SHALL seed the preset list with the following cuts: 0DTE all structures, 0DTE iron condors only, iron condors excluding 0DTE, DTE buckets, condor versus single-sided across all DTE, put credit spread width breakdown, put credit spread width counterfactual, streak check, loss concentration, and width-threshold significance

### Requirement 7: Filter Provenance on Every Output

**User Story:** As a trader looking at two similar charts, I want each one to state which cut it represents, so that I never misattribute a number to the wrong subset

#### Acceptance Criteria

1. THE Research Tab SHALL display, on every chart, table, and stat block, a caption naming the active underlying, DTE cut, and structure selection
2. THE Research Tab SHALL display the trade count backing each output alongside that output
3. WHEN an output excludes trades that the active filter admitted, THE Research Tab SHALL state the exclusion reason and count in that output's caption
4. THE Research Tab SHALL derive all captions from the active filter state, never from hardcoded text

### Requirement 8: Calendar and Bar Views of the Filtered Set

**User Story:** As a trader, I want to see the filtered trades laid out by date and individually, so that I can spot which specific days drove the aggregate

#### Acceptance Criteria

1. THE Research Tab SHALL render a calendar view of the filtered set showing net P/L per trading date
2. THE Research Tab SHALL reuse the existing heatmap calendar component rather than introducing a second calendar implementation
3. THE Research Tab SHALL label each calendar cell with the structure traded that date, or with a mixed indicator when more than one structure was traded
4. THE Research Tab SHALL render a bar view with one bar per closed trade, ordered by entry date, drawn upward from zero for gains and downward for losses
5. THE Research Tab SHALL label each bar with its net P/L value
6. THE Research Tab SHALL display a three-figure summary above the bar view showing net P/L, average net P/L per trade, and trade count
7. THE Research Tab SHALL compute the three-figure summary from the same filtered set that feeds the bar view, never from separately entered values
8. WHEN multiple trades closed on the same date, THE Research Tab SHALL show them as separate bars in the bar view and as a single summed cell in the calendar view

### Requirement 9: DTE Bucket Breakdown

**User Story:** As a trader, I want win rate and expectancy split by DTE bucket, so that I can see whether my edge is concentrated at a particular tenor

#### Acceptance Criteria

1. THE Research Analytics module SHALL bucket closed trades into 0DTE, 1-7DTE, and greater-than-7DTE by DTE at entry
2. FOR each bucket, THE Research Analytics module SHALL compute trade count, win rate, average win, average loss, breakeven win rate, net P/L, worst trade, and expectancy
3. THE Research Analytics module SHALL compute breakeven win rate as the average loss magnitude divided by the sum of average win and average loss magnitude
4. WHEN a bucket contains no trades, THE Research Tab SHALL omit that bucket's row rather than rendering zeros
5. THE Research Tab SHALL render the breakdown as a table with buckets as rows and metrics as columns

### Requirement 10: Condor Versus Single-Sided Comparison

**User Story:** As a trader, I want iron condors compared against one-sided credit spreads on the same terms, so that I can tell whether the second side is earning its risk

#### Acceptance Criteria

1. THE Research Analytics module SHALL split the filtered set into iron condor, put credit spread, and call credit spread groups
2. FOR each group, THE Research Analytics module SHALL compute the same metric set defined in Requirement 9.2
3. THE Research Analytics module SHALL honor the active DTE cut when splitting
4. WHEN a group contains no trades, THE Research Tab SHALL render that group's row with a zero count and blank metrics rather than omitting it, so that absence is visible

### Requirement 11: Width Breakdown and Counterfactual

**User Story:** As a trader, I want to see performance by spread width and what a uniform width would have returned, so that I can decide how to size future spreads

#### Acceptance Criteria

1. THE Research Analytics module SHALL group the filtered set by spread width and compute the Requirement 9.2 metric set per width
2. THE Research Analytics module SHALL additionally compute average credit collected per width group
3. THE Research Analytics module SHALL compute a counterfactual net P/L per target width by rescaling each trade's actual net P/L by the ratio of target width to actual width and summing
4. THE Research Analytics module SHALL hold each trade's win or loss outcome and date fixed when computing the counterfactual
5. THE Research Analytics module SHALL exclude trades with null or zero width from both the breakdown and the counterfactual
6. THE Research Tab SHALL display the actual net P/L alongside the counterfactual figures for direct comparison
7. THE Research Tab SHALL label the counterfactual as a linear approximation, stating that it assumes loss magnitude scales proportionally with width
8. THE Broker Adapter SHALL expose the credit taken in at open as a field distinct from total credit, and THE Research Analytics module SHALL use it for average credit collected, so that sell-to-close proceeds do not inflate the figure

### Requirement 12: Streak and Concentration Checks

**User Story:** As a trader, I want to know whether my losses cluster in streaks or in a few outsized trades, so that I can tell a systemic problem from a tail event

#### Acceptance Criteria

1. THE Research Analytics module SHALL compute a Wald-Wolfowitz runs test over the chronological win/loss sequence of the filtered set
2. THE Research Analytics module SHALL return observed runs, expected runs, win count, loss count, z-score, and two-sided p-value
3. WHEN the filtered set has fewer than 10 trades, or fewer than 2 wins, or fewer than 2 losses, THE Research Analytics module SHALL return no test statistic and SHALL state that the sample is too small
4. THE Research Analytics module SHALL compute the share of total dollar losses attributable to the largest 3 and largest 5 losing trades
5. WHEN the filtered set contains no losing trades, THE Research Analytics module SHALL return no concentration figures and SHALL state that there are no losses to analyze
6. THE Research Tab SHALL render the question each statistic answers, without rendering a verdict or interpretation of the result

### Requirement 13: Threshold Significance Check

**User Story:** As a trader who spotted a pattern in one width bucket, I want to know whether that pattern survives a small-sample check, so that I do not change my strategy based on noise

#### Acceptance Criteria

1. THE Research Analytics module SHALL split the filtered set into two groups by a numeric threshold on a chosen column
2. WHEN every observed loss falls in one group, THE Research Analytics module SHALL compute the hypergeometric probability of that arrangement occurring by chance, whichever of the two groups the losses fell in
3. WHEN every observed loss falls in one group, THE Research Analytics module SHALL report which group the losses concentrated in
4. WHEN losses are split across both groups, THE Research Analytics module SHALL return no probability and SHALL state that a full Fisher exact test is required
5. WHEN the filtered set contains no losses, THE Research Analytics module SHALL return no probability and SHALL state that there is nothing to test
6. THE Research Analytics module SHALL return both group sizes, total loss count, and loss count in the threshold group in all cases
7. THE Research Tab SHALL render the no-probability cases as an explicit stated condition, never as a blank or zero value

### Requirement 14: Determinism and Test Coverage

**User Story:** As a maintainer, I want every research statistic to be a pure function with fixed-input tests, so that a refactor cannot silently change a reported number

#### Acceptance Criteria

1. THE Research Analytics module SHALL implement every statistic as a pure function of its input trade array and explicit parameters
2. THE Research Analytics module SHALL introduce no randomness, no wall-clock dependence, and no network calls
3. THE test suite SHALL cover each statistic with a fixed input fixture and an expected output
4. THE test suite SHALL cover the empty set, single-trade, all-wins, and all-losses cases for each statistic
5. THE test suite SHALL verify that net P/L including fees, DTE-at-entry normalization, and width derivation produce the expected values for a known multi-leg fixture

### Requirement 15: Presentation Consistency

**User Story:** As a trader, I want the Research tab to look and behave like the rest of the dashboard, so that it does not read as a bolted-on tool

#### Acceptance Criteria

1. THE Research Tab SHALL use the existing theme tokens and chart color conventions, with no new palette
2. THE Research Tab SHALL render correctly in both light and dark themes
3. THE Research Tab SHALL wrap each table and stat output in the existing collapsible section component
4. THE Research Tab SHALL render the calendar and bar views expanded by default and the table and stat outputs collapsed by default
5. THE Research Tab SHALL remain usable at mobile widths, with wide tables scrolling horizontally within their own container rather than the page
6. THE Research Tab SHALL render only the outputs currently expanded, deferring computation of collapsed outputs until first expansion
