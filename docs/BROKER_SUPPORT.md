# Broker CSV Support

The Options Trading Journal now supports multiple broker CSV formats with automatic detection and conversion.

## Supported Brokers

### 1. **Robinhood**
- **Auto-detected** by headers: "Activity Date", "Trans Code", "Instrument"
- **Format**: Transaction-level data (individual legs)
- **Features**:
  - Automatically groups opening and closing transactions into complete trades
  - Handles STO, BTO, STC, BTC transaction codes
  - Parses option details from description field
  - Matches positions using FIFO (First In, First Out)
  - Includes open positions (not yet closed)

### 2. **Tasty (tastytrade)**
- **Auto-detected** by headers: 
  - Primary format: "Sub Type", "Underlying Symbol", "Call or Put"
  - Alternative format: "Action", "Instrument Type", "Expiration Date"
- **Format**: Order-level data (can include multi-leg orders)
- **Features**:
  - Handles single and multi-leg orders
  - Detects common strategies (spreads, strangles, iron condors)
  - Parses credit/debit notation
  - Converts contract prices to dollar amounts

### 3. **Generic Format**
- **Auto-detected** by headers: "Symbol", "Entry", "Credit" or "Debit"
- **Format**: Our standard trade-level format
- **Features**:
  - Direct import with minimal processing
  - Lenient validation (only Symbol and Entry required)
  - Automatic defaults for missing fields

## How It Works

### Automatic Detection
When you upload a CSV file, the system:
1. Reads the header row
2. Analyzes column names to identify the broker
3. Selects the appropriate adapter
4. Converts the data to our internal format
5. Displays your trades in the dashboard

### Lenient Parsing
The parser is designed to handle real-world data:
- **Missing fields**: Uses sensible defaults
- **Invalid dates**: Skips problematic rows with warnings
- **Inconsistent data**: Continues processing valid rows
- **Extra columns**: Ignores unknown columns

## Usage

Simply drag and drop your CSV file from any supported broker. The system will:
- ✅ Automatically detect the format
- ✅ Convert to internal structure
- ✅ Show you the results
- ✅ Log any warnings in the console

## Field Mapping

### Robinhood → Internal Format
| Robinhood Field | Internal Field | Notes |
|----------------|----------------|-------|
| Instrument | Symbol | Extracted from description |
| Description | Type, Strike, Expiry | Parsed from format "SYMBOL DATE Type $Strike" |
| Activity Date | Entry/Exit | Entry for opens, Exit for closes |
| Amount | Credit/Debit | Positive = credit, Negative = debit |
| Trans Code | Strategy | STO/BTO determines long/short |
| Quantity | Volume | Absolute value |

### Tasty → Internal Format
| Tasty Field | Internal Field | Notes |
|------------|----------------|-------|
| Symbol | Symbol | Direct mapping |
| Description | Type, Strike, Expiry, Strategy | Parsed from leg format |
| Time | Entry | Fill date |
| MarketOrFill | Credit/Debit | "cr" = credit, "db" = debit |
| - | Volume | Extracted from description |

### Derived Fields

Computed during aggregation, not read from the CSV:

| Internal Field | Derivation |
|----------------|------------|
| Commissions, Fees | Summed across all legs, stored as positive cost magnitudes and subtracted from P/L. Zero when the export has no such columns. |
| OpenCredit | Credit taken in on the opening legs only, so sell-to-close proceeds do not inflate it |
| Width | Strike difference for a vertical; the wider wing for a four-leg condor; null where no width is meaningful |
| Expiry | Nearest expiration across the opening legs, flagging calendars and diagonals |
| DaysToExpireAtEntry | Calendar days from entry to nearest expiration, so a same-day entry reads as 0 regardless of the hour it was opened |

### Generic → Internal Format
| Generic Field | Internal Field | Required |
|--------------|----------------|----------|
| Symbol | Symbol | ✅ Yes |
| Entry | Entry | ✅ Yes |
| Type | Type | No (default: "Unknown") |
| Strategy | Strategy | No (default: "Unknown") |
| Strike | Strike | No (default: 0) |
| Expiry | Expiry | No (default: Entry date) |
| Volume | Volume | No (default: 1) |
| Delta | Delta | No (default: 0) |
| Exit | Exit | No (default: null = open) |
| Debit | Debit | No (default: 0) |
| Credit | Credit | No (default: 0) |
| Account | Account | No (default: "Default") |

## Testing

Test the broker adapters:
1. Open `tests/test-broker-adapters.html` in your browser
2. Click the test buttons for each broker
3. View the parsed results

## Adding New Brokers

To add support for a new broker:

1. **Create an adapter class** in `js/broker-adapters.js`:
```javascript
class NewBrokerAdapter {
  convert(rows) {
    // Convert broker format to internal format
    return trades;
  }
}
```

2. **Add detection logic** in `BrokerAdapter.detectBroker()`:
```javascript
if (headerStr.includes('broker-specific-column')) {
  return 'newbroker';
}
```

3. **Register the adapter** in `BrokerAdapter.getAdapter()`:
```javascript
case 'newbroker':
  return new NewBrokerAdapter();
```

## Known Limitations

### Robinhood
- Delta values not provided (set to 0)
- Multi-leg strategies shown as individual trades
- Requires both opening and closing transactions to calculate P/L

### Tasty
- Delta values not provided (set to 0)
- Multi-leg orders shown as single trade with primary leg
- Assumes all orders are opening positions (no close detection yet)

### Generic
- Requires at minimum: Symbol and Entry date
- All other fields optional with defaults

## Troubleshooting

**Problem**: CSV not detected correctly
- **Solution**: Check that your CSV has the expected headers
- **Workaround**: Convert to generic format with Symbol, Entry, Credit, Debit columns

**Problem**: Some trades missing
- **Solution**: Check browser console for warnings about skipped rows
- **Tip**: Rows with missing Symbol or Entry date are skipped

**Problem**: Wrong P/L calculations
- **Solution**: Verify Credit and Debit values in source CSV
- **Note**: Robinhood uses parentheses for debits, Tasty uses "db" suffix

## Console Logging

The system logs helpful information:
```javascript
// Broker detection
"Detected broker format: robinhood"

// Conversion results
"Converted 45 trades from robinhood format"

// Warnings for skipped rows
"Row 23: Missing Symbol, skipping"
"CSV Import Warnings (3 rows had issues)"
```

Check your browser's developer console (F12) for detailed logs.
