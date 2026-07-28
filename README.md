# Option Insights

A personal options trading insights dashboard that helps you visualize and analyze your trading performance.

Your trades. Your browser. Your insights. No Tracking or Cookies.

Try it here: https://sumiya.page/insights/index.html

Or build locally as described below.

## Quick Start

### Option 1: Try Demo Data 

1. Open `index.html` in your browser
2. Click **"Load Demo Data"** button
3. Explore the dashboard with 100 sample trades

### Option 2: Upload Your Own Data

1. Open `index.html` in your browser
2. Click **"Upload CSV"** button
3. Select your trading data CSV file
4. View your personalized analytics

## Supported Brokers

The application automatically detects and adapts to CSV formats from:
- **Robinhood** - Full support for Robinhood export format
- **Tasty Trade** - Full support for Tasty Trade export format
- **Generic** - Works with any CSV containing basic trade data

See [BROKER_SUPPORT.md](BROKER_SUPPORT.md) for detailed format specifications.

## Visualizations

### Overview Tab
- **Summary Metrics Panel** - Key performance indicators at a glance
- **P/L Trend** - Track your profit/loss over time
- **Win/Loss Distribution** - Donut chart of wins vs losses
- **Top 5 Underlyings by Win $** - Top performing symbols by winning dollars

### Analysis Tab
- **Trade Flow** - Sankey diagram of symbol through strategy to outcome
- **P/L by Symbol** - Bar chart showing profit/loss for each symbol
- **Cost Basis by Symbol** - View total money spent (debits) per symbol with open position tracking
- **Advanced Analytics** - Expandable panel with 8 advanced visualizations:
  - **Calendar Heatmap** - Daily P/L visualization
  - **Days Held vs P/L** - Scatter plot analysis
  - **Days to Expire vs P/L** - Scatter plot analysis
  - **P/L Distribution** - Violin plot showing distribution
  - **Win Rate Analysis** - Bubble chart by strategy
  - **Monthly Performance** - Radial chart of monthly results
  - **P/L Attribution** - Waterfall chart by symbol
  - **Long-term Trends** - Horizon chart for extended periods

### Strategies Tab
- **Win Rate by Strategy** - Compare strategy effectiveness
- **P/L by Strategy** - See which strategies are most profitable
- **P/L by Symbol & Strategy** - Detailed table breakdown of performance

### Research Tab
Structural analysis of closed trades: which choices drove the result, and whether
the pattern survives a small-sample check.

- **Presets** - One click applies a saved cut (underlying, DTE, structures)
- **Filter bar** - Underlying, days-to-expiration cut, and structure selection;
  deselect every structure to include all strategies
- **Trade by trade** - One bar per closed trade, with net, average and count above
- **Calendar** - Net P/L per trading date, cells labelled by structure
- **By days to expiration** - Win rate and expectancy split 0DTE / 1-7DTE / >7DTE
- **Condor vs single-sided** - Iron condors against one-sided credit spreads
- **By spread width** - Performance and average credit collected per width bucket
  ($5-wide, $10-wide, $20-wide, other)
- **Uniform-width counterfactual** - What the same book returns at one width
- **Streak check** - Whether wins and losses cluster more than chance predicts
- **Loss concentration** - Share of total losses carried by the largest few

Every output states which cut it shows and how many trades back it. Statistics that
a sample is too small to support say so rather than showing a number.

Adding a cut is an edit to `RESEARCH_PRESETS` in `js/research-scenarios.js`.

## P/L Definition

P/L is **net of commissions and fees** wherever the broker export provides them.
TastyTrade exports do; Robinhood's `Amount` column is already net; the generic
format has no fee columns, in which case the Research tab says P/L is gross of fees.

The `P/L by Symbol & Strategy` table on the Strategies tab has a **Net / Gross**
toggle. Net is what each closed position returned after costs. Gross counts every
retired leg before costs, which is the measure that matches the P/L column of a
broker statement, so use it to reconcile.

The headline figure is **Realized P/L**, which counts every retired leg. Brokers
settle leg by leg, so half of a strangle can be realized while the position is
still open. This is the figure that ties to a broker statement; individual trades
stay grouped by strategy, and a strategy is only marked closed once every one of
its legs is gone.

Two things cannot be reconciled from a transaction export alone, and the app says
so rather than guessing:

- **Positions opened before the export window.** Only the closing side is known,
  so their P/L is understated. Re-export covering the opening dates to fix.
- **Positions spanning a year boundary.** TastyTrade's year-to-date report carries
  the prior year-end *mark* as cost basis; the app computes P/L from entry to exit.

## Filters

- **Date Range**: Last 7 days, 30 days, 12 months, Year To Date, All time
- **Position Status**: Open, Closed, or All positions

## Local Development

1. Start a local server:
   ```bash
   python3 -m http.server 8000
   ```

2. Open in browser:
   ```
   http://localhost:8000
   ```

3. Load demo data or upload your CSV

## Testing

Run the test suite to verify everything works:

```bash
node tests/run-tests.js
```

Or open the test pages in your browser:
- `tests/automated-test.html` - Full automated test suite
- `tests/test-demo-data.html` - Demo data generator tests
- `tests/test-broker-adapters.html` - Broker format tests

See [TESTING.md](docs/TESTING.md) for complete testing documentation.

## Privacy & Security

- **100% Client-Side** - All processing happens in your browser
- **No Server Required** - Your data never leaves your computer
- **Local Storage Only** - Data is saved in your browser's localStorage
- **No Analytics** - No tracking or data collection using cookies or any other means
- **Open Source** - Review the code yourself

Requires JavaScript enabled and localStorage support.

## License

See [LICENSE](LICENSE) file for details.

## Contributing

This is a personal project, but suggestions and improvements are welcome!

**Made with ❤️ for retail options traders.**
