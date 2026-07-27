/**
 * Tasty Strategy Mapper
 * Bridges between tastyAdapter.js strategy inference and broker-adapters.js format
 * Aggregates transaction-level data into strategy-level trades
 * 
 * This file includes the core strategy inference logic for browser use
 */

// ===== Core Strategy Inference Functions (from tastyAdapter.js) =====

function extractStrike(symbol) {
  const match = symbol.match(/[PC](\d{8})$/);
  if (!match) return null;
  return parseInt(match[1]) / 1000;
}

function extractOptionType(symbol) {
  if (symbol.includes('P')) return 'PUT';
  if (symbol.includes('C')) return 'CALL';
  return null;
}

function isOpeningAction(action) {
  return action === 'BUY_TO_OPEN' || action === 'SELL_TO_OPEN';
}

function isClosingAction(action) {
  return action === 'BUY_TO_CLOSE' || action === 'SELL_TO_CLOSE';
}

function getSignedQuantity(trade) {
  const qty = parseInt(trade.Quantity);
  return trade.Action.startsWith('SELL') ? -qty : qty;
}

function classifyStrategy(orderGroup) {
  const legs = orderGroup.length;
  
  const calls = orderGroup.filter(t => extractOptionType(t.Symbol) === 'CALL');
  const puts = orderGroup.filter(t => extractOptionType(t.Symbol) === 'PUT');
  const buys = orderGroup.filter(t => t.Action === 'BUY_TO_OPEN');
  const sells = orderGroup.filter(t => t.Action === 'SELL_TO_OPEN');
  
  if (legs === 1) {
    const trade = orderGroup[0];
    const optionType = extractOptionType(trade.Symbol);
    
    if (optionType === 'CALL') {
      return trade.Action === 'BUY_TO_OPEN' ? 'Long Call' : 'Short Call';
    } else if (optionType === 'PUT') {
      return trade.Action === 'BUY_TO_OPEN' ? 'Long Put' : 'Short Put';
    }
  }
  
  if (legs === 2) {
    const strikes = orderGroup.map(t => extractStrike(t.Symbol)).sort((a, b) => a - b);
    const sameStrike = strikes[0] === strikes[1];
    
    if (calls.length === 2) {
      const longCall = buys.find(t => extractOptionType(t.Symbol) === 'CALL');
      const shortCall = sells.find(t => extractOptionType(t.Symbol) === 'CALL');
      
      if (longCall && shortCall) {
        const longStrike = extractStrike(longCall.Symbol);
        const shortStrike = extractStrike(shortCall.Symbol);
        return longStrike < shortStrike ? 'Bull Call Spread' : 'Bear Call Spread';
      }
    }
    
    if (puts.length === 2) {
      const longPut = buys.find(t => extractOptionType(t.Symbol) === 'PUT');
      const shortPut = sells.find(t => extractOptionType(t.Symbol) === 'PUT');
      
      if (longPut && shortPut) {
        const longStrike = extractStrike(longPut.Symbol);
        const shortStrike = extractStrike(shortPut.Symbol);
        return longStrike > shortStrike ? 'Bear Put Spread' : 'Bull Put Spread';
      }
    }
    
    if (calls.length === 1 && puts.length === 1) {
      return sameStrike ? 'Straddle' : 'Strangle';
    }
  }
  
  if (legs === 4 && calls.length === 2 && puts.length === 2) {
    const callBuys = calls.filter(t => t.Action === 'BUY_TO_OPEN').length;
    const callSells = calls.filter(t => t.Action === 'SELL_TO_OPEN').length;
    const putBuys = puts.filter(t => t.Action === 'BUY_TO_OPEN').length;
    const putSells = puts.filter(t => t.Action === 'SELL_TO_OPEN').length;
    
    if (callBuys === 1 && callSells === 1 && putBuys === 1 && putSells === 1) {
      return 'Iron Condor';
    }
  }
  
  return 'Custom';
}

function isOptionTrade(trade) {
  return trade.Type === 'Trade' && trade['Instrument Type'] === 'Equity Option';
}

function processOptionTrades(trades) {
  const optionTrades = trades.filter(isOptionTrade);
  
  const orderGroups = {};
  const openingTrades = optionTrades.filter(t => isOpeningAction(t.Action));
  
  openingTrades.forEach(trade => {
    const orderId = trade['Order #'];
    if (!orderGroups[orderId]) {
      orderGroups[orderId] = [];
    }
    orderGroups[orderId].push(trade);
  });
  
  const positionRegistry = {};
  const strategyInfo = {};
  
  Object.entries(orderGroups).forEach(([orderId, group]) => {
    const strategy = classifyStrategy(group);
    const totalLegs = group.length;
    
    strategyInfo[orderId] = {
      strategy,
      totalLegs,
      underlyingSymbol: group[0]['Underlying Symbol']
    };
    
    group.forEach((trade, index) => {
      const symbol = trade.Symbol;
      
      if (!positionRegistry[symbol]) {
        positionRegistry[symbol] = {
          openOrderNumber: orderId,
          strategy,
          strategyGroupId: orderId,
          totalLegs,
          legNumber: index + 1,
          netQuantity: 0,
          trades: []
        };
      }
      
      positionRegistry[symbol].netQuantity += getSignedQuantity(trade);
      positionRegistry[symbol].trades.push(trade);
    });
  });
  
  const enrichedTrades = trades.map(trade => {
    if (!isOptionTrade(trade)) {
      return {
        ...trade,
        Strategy: '',
        'Strategy Group ID': '',
        'Leg Number': '',
        'Total Legs': ''
      };
    }
    
    const symbol = trade.Symbol;
    
    if (isOpeningAction(trade.Action)) {
      const position = positionRegistry[symbol];
      
      return {
        ...trade,
        Strategy: position.strategy,
        'Strategy Group ID': position.strategyGroupId,
        'Leg Number': position.legNumber,
        'Total Legs': position.totalLegs
      };
    } else if (isClosingAction(trade.Action)) {
      const position = positionRegistry[symbol];
      
      if (position) {
        position.netQuantity += getSignedQuantity(trade);
        
        return {
          ...trade,
          Strategy: position.strategy,
          'Strategy Group ID': position.strategyGroupId,
          'Leg Number': position.legNumber,
          'Total Legs': position.totalLegs
        };
      } else {
        return {
          ...trade,
          Strategy: 'Unknown',
          'Strategy Group ID': null,
          'Leg Number': null,
          'Total Legs': null
        };
      }
    }
    
    return trade;
  });
  
  return {
    enrichedTrades,
    positionRegistry,
    strategyInfo
  };
}

function parseCSVLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  
  values.push(current);
  
  return values;
}

function parseCSV(csvText) {
  const lines = csvText.trim().split('\n');
  const headers = lines[0].split(',');
  
  const data = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row = {};
    
    headers.forEach((header, index) => {
      row[header.trim()] = values[index] ? values[index].trim() : '';
    });
    
    data.push(row);
  }
  
  return data;
}

// ===== End of Core Strategy Inference Functions =====

/**
 * Convert TastyTrade CSV rows to internal trade format using strategy inference
 * @param {Array} rows - Raw CSV rows from TastyTrade
 * @returns {Array} - Array of trade objects in internal format
 */
function convertTastyWithStrategyInference(rows) {
  console.log('=== TastyTrade Strategy Inference Processing ===');
  console.log('Total CSV rows:', rows.length);
  
  // Convert rows back to CSV format for processing
  const csvText = rowsToCSV(rows);
  
  // Use the proven strategy inference logic
  const result = processCSV(csvText);
  const enrichedTrades = result.enrichedTrades;
  
  console.log('Enriched trades:', enrichedTrades.length);
  console.log('Strategy statistics:', result.stats);
  
  // Filter to only option trades
  const optionTrades = enrichedTrades.filter(t => 
    t.Type === 'Trade' && t['Instrument Type'] === 'Equity Option'
  );
  
  console.log('Option trades:', optionTrades.length);
  
  // Group by Strategy Group ID to aggregate legs into complete strategies
  const strategyGroups = groupByStrategyGroupId(optionTrades);
  
  console.log('Unique strategies:', strategyGroups.size);
  
  // Convert each strategy group to internal trade format
  const trades = [];
  
  strategyGroups.forEach((legs, groupId) => {
    const trade = aggregateStrategyLegs(legs);
    if (trade) {
      trades.push(trade);
    }
  });
  
  console.log('\n=== Results ===');
  console.log('Total trades created:', trades.length);
  
  const closedTrades = trades.filter(t => t.Exit !== null);
  const openTrades = trades.filter(t => t.Exit === null);
  
  console.log('  - Closed trades:', closedTrades.length);
  console.log('  - Open trades:', openTrades.length);
  
  // Calculate P/L
  const totalPL = trades.reduce((sum, t) => sum + (t.Credit - t.Debit), 0);
  console.log('\n=== P/L Summary ===');
  console.log('Total P/L: $' + totalPL.toFixed(2));
  
  if (trades.length > 0) {
    console.log('\nSample trade:', trades[0]);
  }
  
  console.log('=================================\n');
  
  return trades;
}

/**
 * Convert array of row objects back to CSV string
 * @param {Array} rows - Array of row objects
 * @returns {string} - CSV string
 */
function rowsToCSV(rows) {
  if (rows.length === 0) return '';
  
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(',')];
  
  rows.forEach(row => {
    const values = headers.map(header => {
      const value = row[header] || '';
      // Escape values with commas or quotes
      if (String(value).includes(',') || String(value).includes('"') || String(value).includes('\n')) {
        return `"${String(value).replace(/"/g, '""')}"`;
      }
      return value;
    });
    lines.push(values.join(','));
  });
  
  return lines.join('\n');
}

/**
 * Group option trades by Strategy Group ID
 * @param {Array} trades - Enriched option trades
 * @returns {Map} - Map of groupId -> array of legs
 */
function groupByStrategyGroupId(trades) {
  const groups = new Map();
  
  trades.forEach(trade => {
    const groupId = trade['Strategy Group ID'];
    
    // Skip trades without a group ID (shouldn't happen with proper data)
    if (!groupId) {
      console.warn('Trade without Strategy Group ID:', trade);
      return;
    }
    
    if (!groups.has(groupId)) {
      groups.set(groupId, []);
    }
    
    groups.get(groupId).push(trade);
  });
  
  return groups;
}

/**
 * Aggregate multiple legs into a single strategy-level trade
 * @param {Array} legs - Array of leg transactions for a strategy
 * @returns {Object} - Aggregated trade object
 */
function aggregateStrategyLegs(legs) {
  if (legs.length === 0) return null;
  
  // Get strategy info from first leg (all legs share same strategy)
  const firstLeg = legs[0];
  const strategy = firstLeg.Strategy || 'Unknown';
  const underlyingSymbol = firstLeg['Underlying Symbol'] || firstLeg.Symbol;
  
  // Separate opening and closing transactions
  const openingLegs = legs.filter(leg => 
    leg.Action === 'BUY_TO_OPEN' || leg.Action === 'SELL_TO_OPEN'
  );
  const closingLegs = legs.filter(leg => 
    leg.Action === 'BUY_TO_CLOSE' || leg.Action === 'SELL_TO_CLOSE'
  );
  
  // Calculate dates
  const entryDate = findEarliestDate(openingLegs);
  const exitDate = closingLegs.length > 0 ? findLatestDate(closingLegs) : null;
  
  // Calculate total debit and credit across all legs
  let totalDebit = 0;
  let totalCredit = 0;

  legs.forEach(leg => {
    const amount = parseAmount(leg.Value || leg.Total || '0');

    // Positive amount = credit (we received money)
    // Negative amount = debit (we paid money)
    if (amount > 0) {
      totalCredit += amount;
    } else {
      totalDebit += Math.abs(amount);
    }
  });

  // Sum commissions and fees across all legs. TastyTrade reports both as
  // negative values (money leaving the account), so negate to store them as
  // positive cost magnitudes that callers subtract from gross P/L.
  const feesAvailable = legs.some(leg =>
    Object.prototype.hasOwnProperty.call(leg, 'Commissions') ||
    Object.prototype.hasOwnProperty.call(leg, 'Fees')
  );

  let totalCommissions = 0;
  let totalFees = 0;

  legs.forEach(leg => {
    totalCommissions += -parseAmount(leg.Commissions);
    totalFees += -parseAmount(leg.Fees);
  });

  totalCommissions = Math.round(totalCommissions * 100) / 100;
  totalFees = Math.round(totalFees * 100) / 100;

  // Determine option type from legs
  const optionType = determineOptionType(openingLegs);
  
  // Get strike prices for display (use middle strike for spreads)
  const strikes = openingLegs
    .map(leg => parseFloat(leg['Strike Price']) || 0)
    .filter(s => s > 0)
    .sort((a, b) => a - b);
  
  const displayStrike = strikes.length > 0 
    ? strikes[Math.floor(strikes.length / 2)] 
    : 0;
  
  // Use the nearest expiration across opening legs, not just the first leg's.
  // Legs expiring on different dates make this a calendar or diagonal, which
  // downstream DTE cuts need to know about.
  const legExpirations = openingLegs
    .map(leg => parseDate(leg['Expiration Date']))
    .filter(date => date !== null);

  const expiryDate = legExpirations.length > 0
    ? new Date(Math.min(...legExpirations.map(date => date.getTime())))
    : parseDate(firstLeg['Expiration Date']);

  const multipleExpirations =
    new Set(legExpirations.map(date => date.getTime())).size > 1;

  const width = deriveWidth(openingLegs);

  // Get volume (use first leg's quantity as representative)
  const volume = Math.abs(parseInt(firstLeg.Quantity) || 1);
  
  return {
    Symbol: underlyingSymbol,
    Type: optionType,
    Strategy: strategy,
    Strike: displayStrike,
    Expiry: expiryDate,
    Volume: volume,
    Entry: entryDate,
    Delta: 0, // Not provided by TastyTrade
    Exit: exitDate,
    Debit: totalDebit,
    Credit: totalCredit,
    Commissions: totalCommissions,
    Fees: totalFees,
    Width: width,
    Account: 'TastyTrade',
    // Store additional metadata for reference
    _metadata: {
      totalLegs: firstLeg['Total Legs'] || legs.length,
      strategyGroupId: firstLeg['Strategy Group ID'],
      strikes: strikes,
      legCount: legs.length,
      feesAvailable: feesAvailable,
      multipleExpirations: multipleExpirations
    }
  };
}

/**
 * Derive spread width from the opening legs of a strategy
 * Two same-type legs use the strike difference; a four-leg condor or butterfly
 * uses the wider of its two wings. Structures with no meaningful width
 * (single legs, straddles, strangles) return null.
 * @param {Array} openingLegs - Array of opening leg transactions
 * @returns {number|null} - Spread width, or null when not applicable
 */
function deriveWidth(openingLegs) {
  const strikeOf = leg => parseFloat(leg['Strike Price']);
  const typeOf = leg => String(leg['Call or Put'] || '').toUpperCase();

  const usable = openingLegs.filter(leg => {
    const strike = strikeOf(leg);
    return Number.isFinite(strike) && strike > 0;
  });

  // A partially parseable set would give a misleading width
  if (usable.length !== openingLegs.length) return null;

  const puts = usable.filter(leg => typeOf(leg) === 'PUT').map(strikeOf).sort((a, b) => a - b);
  const calls = usable.filter(leg => typeOf(leg) === 'CALL').map(strikeOf).sort((a, b) => a - b);

  let width = null;

  if (usable.length === 2 && (puts.length === 2 || calls.length === 2)) {
    const side = puts.length === 2 ? puts : calls;
    width = side[1] - side[0];
  } else if (usable.length === 4 && puts.length === 2 && calls.length === 2) {
    width = Math.max(puts[1] - puts[0], calls[1] - calls[0]);
  }

  // Same-strike legs grouped into one order (a roll, for instance) compute to
  // zero, which is not a width
  return width > 0 ? width : null;
}

/**
 * Find earliest date from array of legs
 * @param {Array} legs - Array of leg transactions
 * @returns {Date|null} - Earliest date
 */
function findEarliestDate(legs) {
  let earliest = null;
  
  legs.forEach(leg => {
    const date = parseDate(leg.Date);
    if (date && (!earliest || date < earliest)) {
      earliest = date;
    }
  });
  
  return earliest;
}

/**
 * Find latest date from array of legs
 * @param {Array} legs - Array of leg transactions
 * @returns {Date|null} - Latest date
 */
function findLatestDate(legs) {
  let latest = null;
  
  legs.forEach(leg => {
    const date = parseDate(leg.Date);
    if (date && (!latest || date > latest)) {
      latest = date;
    }
  });
  
  return latest;
}

/**
 * Determine option type from opening legs
 * @param {Array} openingLegs - Array of opening leg transactions
 * @returns {string} - Option type (Call, Put, or Mixed)
 */
function determineOptionType(openingLegs) {
  const types = new Set(openingLegs.map(leg => leg['Call or Put']));
  
  if (types.size === 1) {
    return types.values().next().value || 'Unknown';
  } else if (types.size > 1) {
    return 'Mixed'; // For strategies like straddles/strangles
  }
  
  return 'Unknown';
}

/**
 * Parse date string to Date object
 * @param {string} dateStr - Date string
 * @returns {Date|null} - Parsed date or null
 */
function parseDate(dateStr) {
  if (!dateStr) return null;
  
  const date = new Date(dateStr);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * Parse amount string to number
 * @param {string} amountStr - Amount string
 * @returns {number} - Parsed amount
 */
function parseAmount(amountStr) {
  if (!amountStr) return 0;
  
  let cleaned = String(amountStr).replace(/[$,]/g, '');
  
  if (cleaned.includes('(') || cleaned.includes(')')) {
    cleaned = cleaned.replace(/[()]/g, '');
    return -parseFloat(cleaned);
  }
  
  return parseFloat(cleaned) || 0;
}

/**
 * Helper function to process CSV string
 * @param {string} csvText - CSV text
 * @returns {Object} - Result with enrichedTrades, csv, and stats
 */
function processCSV(csvText) {
  const trades = parseCSV(csvText);
  const result = processOptionTrades(trades);
  
  return {
    enrichedTrades: result.enrichedTrades,
    stats: generateStats(result)
  };
}

/**
 * Generate strategy statistics
 * @param {Object} result - Result from processOptionTrades
 * @returns {Object} - Statistics object
 */
function generateStats(result) {
  const stats = {};
  
  if (result.strategyInfo) {
    Object.values(result.strategyInfo).forEach(info => {
      if (!stats[info.strategy]) {
        stats[info.strategy] = 0;
      }
      stats[info.strategy]++;
    });
  }
  
  return stats;
}

// Export as global object for browser use (non-module)
if (typeof window !== 'undefined') {
  window.TastyStrategyMapper = {
    convertTastyWithStrategyInference
  };
}

// Also support CommonJS for Node.js testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    convertTastyWithStrategyInference
  };
}
