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
