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

/**
 * Call or put for one leg
 * Prefers the ledger's own column. The OCC fallback reads the type character
 * that sits between the expiry and the strike: a substring search would see the
 * P in SPXW or PLTR and call every one of their contracts a put.
 * @param {string} symbol - OCC symbol
 * @param {Object} [trade] - Raw CSV row, when available
 * @returns {string|null} - 'PUT', 'CALL', or null
 */
function extractOptionType(symbol, trade) {
  const declared = trade && String(trade['Call or Put'] || '').trim().toUpperCase();
  if (declared === 'PUT' || declared === 'CALL') return declared;

  const match = String(symbol || '').match(/(\d{6})([CP])(\d{8})$/);
  if (match) return match[2] === 'P' ? 'PUT' : 'CALL';

  return null;
}

function isOpeningAction(action) {
  return action === 'BUY_TO_OPEN' || action === 'SELL_TO_OPEN';
}

// Group id prefix for closing legs whose opening order predates the export
const BOUNDARY_GROUP_PREFIX = 'preexisting:';

function isClosingAction(action) {
  return action === 'BUY_TO_CLOSE' || action === 'SELL_TO_CLOSE';
}

/**
 * Whether a row removes an option position without a trade
 * TastyTrade books expirations, assignments and exercises as "Receive Deliver"
 * rather than "Trade". They are the normal exit for anything held to
 * expiration, so a position whose only exit is one of these looks open forever
 * if they are ignored. Cash-settled index options (SPX and friends) close this
 * way almost exclusively, and their rows carry the settlement cash, so dropping
 * them loses the money as well as the exit.
 *
 * Recognized by behaviour rather than by sub-type name: any Receive Deliver row
 * against an option that either closes explicitly or carries no action at all
 * is removing the position. Matching on names would miss the next variant, and
 * this ledger already uses five ("Expiration", "Assignment", "Exercise", and
 * the "Cash Settled" forms of the latter two).
 * @param {Object} trade - Raw CSV row
 * @returns {boolean}
 */
function isOptionRemoval(trade) {
  if (trade.Type !== 'Receive Deliver') return false;
  if (trade['Instrument Type'] !== 'Equity Option') return false;

  const action = String(trade.Action || '').trim();
  return action === '' || isClosingAction(action);
}

/**
 * The closing action a row represents
 * Expirations carry one already; assignments and exercises leave Action blank,
 * so infer the direction from the position being removed.
 * @param {Object} trade - Raw CSV row
 * @param {number} netQuantity - Signed quantity currently open for this contract
 * @returns {string} - Action to treat this row as
 */
function effectiveAction(trade, netQuantity) {
  if (trade.Action) return trade.Action;
  if (!isOptionRemoval(trade)) return trade.Action;

  // Closing a short means buying it back, and vice versa
  return netQuantity < 0 ? 'BUY_TO_CLOSE' : 'SELL_TO_CLOSE';
}

function getSignedQuantity(trade) {
  const qty = parseInt(trade.Quantity);
  return String(trade.Action || '').startsWith('SELL') ? -qty : qty;
}

function classifyStrategy(orderGroup) {
  const legs = orderGroup.length;
  
  const calls = orderGroup.filter(t => extractOptionType(t.Symbol, t) === 'CALL');
  const puts = orderGroup.filter(t => extractOptionType(t.Symbol, t) === 'PUT');
  const buys = orderGroup.filter(t => t.Action === 'BUY_TO_OPEN');
  const sells = orderGroup.filter(t => t.Action === 'SELL_TO_OPEN');
  
  if (legs === 1) {
    const trade = orderGroup[0];
    const optionType = extractOptionType(trade.Symbol, trade);
    
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
      const longCall = buys.find(t => extractOptionType(t.Symbol, t) === 'CALL');
      const shortCall = sells.find(t => extractOptionType(t.Symbol, t) === 'CALL');
      
      if (longCall && shortCall) {
        const longStrike = extractStrike(longCall.Symbol);
        const shortStrike = extractStrike(shortCall.Symbol);
        return longStrike < shortStrike ? 'Bull Call Spread' : 'Bear Call Spread';
      }
    }
    
    if (puts.length === 2) {
      const longPut = buys.find(t => extractOptionType(t.Symbol, t) === 'PUT');
      const shortPut = sells.find(t => extractOptionType(t.Symbol, t) === 'PUT');
      
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
  
  // Three legs of one type is a butterfly or a broken-wing variant of one
  if (legs === 3 && (puts.length === 3 || calls.length === 3)) {
    return 'Butterfly';
  }

  return 'Custom';
}

function isOptionTrade(trade) {
  if (trade['Instrument Type'] !== 'Equity Option') return false;
  return trade.Type === 'Trade' || isOptionRemoval(trade);
}

/**
 * Accumulate the realized money of one matched open/close pair onto its group
 * @param {Map} store - Group id to running totals
 * @param {string} orderId - Group id
 * @param {Object} amounts - { value, commissions, fees, incompleteBasis }
 */
function addRealized(store, orderId, amounts) {
  const entry = store.get(orderId)
    || { value: 0, commissions: 0, fees: 0, incompleteBasis: false };

  entry.value += amounts.value;
  entry.commissions += amounts.commissions;
  entry.fees += amounts.fees;
  if (amounts.incompleteBasis) entry.incompleteBasis = true;
  store.set(orderId, entry);
}

/**
 * Prorate a leg's money across a partial quantity
 * A single closing row can retire lots opened by several different orders, so
 * its value, commissions and fees are split in proportion to the quantity each
 * lot takes.
 * @param {Object} trade - Raw CSV row
 * @param {number} qty - Quantity attributed to this piece
 * @param {number} totalQty - Full quantity of the row
 * @returns {Object} - Money fields for this piece
 */
function proratedAmounts(trade, qty, totalQty) {
  const share = totalQty > 0 ? qty / totalQty : 1;
  const scale = value => Math.round(parseAmount(value) * share * 100) / 100;

  return {
    Value: scale(trade.Value !== undefined && trade.Value !== '' ? trade.Value : trade.Total),
    Commissions: scale(trade.Commissions),
    Fees: scale(trade.Fees)
  };
}

/**
 * Reconstruct option positions from a transaction ledger
 *
 * Positions are tracked as FIFO lots keyed on contract *and* opening order,
 * not on contract alone. Selling the same strike twice in two orders opens two
 * positions, and attributing both to whichever order came first merges them
 * into one trade with the wrong leg count and the wrong strategy.
 *
 * @param {Array} trades - All raw CSV rows
 * @returns {Object} - { enrichedTrades, strategyInfo }
 */
function processOptionTrades(trades) {
  const optionTrades = trades.filter(isOptionTrade);

  // Lot matching depends on ledger order, and the export is newest first
  const chronological = optionTrades
    .slice()
    .sort((a, b) => {
      const da = parseDate(a.Date);
      const db = parseDate(b.Date);
      return (da ? da.getTime() : 0) - (db ? db.getTime() : 0);
    });

  // Classify each opening order from the legs it opened
  const orderGroups = {};
  chronological
    .filter(trade => isOpeningAction(trade.Action))
    .forEach(trade => {
      const orderId = trade['Order #'];
      if (!orderGroups[orderId]) orderGroups[orderId] = [];
      orderGroups[orderId].push(trade);
    });

  const strategyInfo = {};
  const legNumbers = new Map();

  Object.entries(orderGroups).forEach(([orderId, group]) => {
    strategyInfo[orderId] = {
      strategy: classifyStrategy(group),
      totalLegs: group.length,
      underlyingSymbol: group[0]['Underlying Symbol']
    };
    group.forEach((trade, index) => {
      legNumbers.set(`${orderId}|${trade.Symbol}`, index + 1);
    });
  });

  const tag = (trade, action, orderId, amounts, quantity) => {
    const info = strategyInfo[orderId];
    return {
      ...trade,
      ...(amounts || {}),
      ...(quantity === undefined ? {} : { Quantity: quantity }),
      Action: action,
      Strategy: info ? info.strategy : 'Opened before this export',
      'Strategy Group ID': orderId,
      'Leg Number': legNumbers.get(`${orderId}|${trade.Symbol}`) || 1,
      'Total Legs': info ? info.totalLegs : 1
    };
  };

  const openLots = new Map();
  const enrichedTrades = [];
  const realizedByGroup = new Map();

  // Which group last retired each contract, so a follow-up settlement row
  // lands on the same position instead of looking pre-existing
  const lastGroupByContract = new Map();

  chronological.forEach(trade => {
    const symbol = trade.Symbol;
    const quantity = Math.abs(parseInt(trade.Quantity, 10) || 0);
    const queue = openLots.get(symbol) || [];
    const netOpen = queue.reduce((sum, lot) => sum + lot.signed, 0);
    const action = effectiveAction(trade, netOpen);

    if (isOpeningAction(action)) {
      const orderId = trade['Order #'];
      if (!openLots.has(symbol)) openLots.set(symbol, []);
      openLots.get(symbol).push({
        orderId,
        remaining: quantity,
        signed: action === 'SELL_TO_OPEN' ? -quantity : quantity,
        // Per-unit money, so a matched pair's realized P/L is computable no
        // matter how the closing quantity is split across lots
        value: parseAmount(trade.Value) / quantity,
        commissions: parseAmount(trade.Commissions) / quantity,
        fees: parseAmount(trade.Fees) / quantity
      });
      enrichedTrades.push(tag(trade, action, orderId));
      return;
    }

    if (isClosingAction(action)) {
      let unmatched = quantity;
      const pieces = [];
      const closeValue = parseAmount(trade.Value) / quantity;
      const closeCommissions = parseAmount(trade.Commissions) / quantity;
      const closeFees = parseAmount(trade.Fees) / quantity;

      while (unmatched > 0 && queue.length > 0) {
        const lot = queue[0];
        const taken = Math.min(unmatched, lot.remaining);
        pieces.push({ orderId: lot.orderId, quantity: taken });
        lastGroupByContract.set(symbol, lot.orderId);

        // The broker realizes P/L leg by leg, the moment a contract is retired,
        // even while other legs of the same strategy stay open. Recording it
        // here lets the app report a realized total that ties to the broker
        // without giving up strategy-level trades.
        addRealized(realizedByGroup, lot.orderId, {
          value: taken * (lot.value + closeValue),
          commissions: taken * (lot.commissions + closeCommissions),
          fees: taken * (lot.fees + closeFees)
        });

        lot.remaining -= taken;
        lot.signed -= Math.sign(lot.signed) * taken;
        unmatched -= taken;
        if (lot.remaining <= 0) queue.shift();
      }

      // Whatever is left was opened before this export window began. Keeping it
      // as its own trade preserves realized P/L that would otherwise be dropped.
      // A residual close on a contract this export did see opened belongs to the
      // position that already retired it, not to a pre-existing one. Cash-settled
      // index options rely on this: tastytrade books the retirement and the cash
      // as two rows, an Expiration at zero plus a Cash Settled row carrying the
      // settlement, so the second row always arrives with the lot already gone.
      if (unmatched > 0) {
        const previous = lastGroupByContract.get(symbol);
        const residualId = previous || `${BOUNDARY_GROUP_PREFIX}${symbol}`;

        pieces.push({ orderId: residualId, quantity: unmatched });
        addRealized(realizedByGroup, residualId, {
          value: unmatched * closeValue,
          commissions: unmatched * closeCommissions,
          fees: unmatched * closeFees,
          incompleteBasis: !previous
        });
      }

      pieces.forEach(piece => {
        enrichedTrades.push(tag(
          trade,
          action,
          piece.orderId,
          proratedAmounts(trade, piece.quantity, quantity),
          piece.quantity
        ));
      });
      return;
    }

    enrichedTrades.push(trade);
  });

  // Non-option rows are passed through so row-level consumers still see them
  trades.filter(trade => !isOptionTrade(trade)).forEach(trade => {
    enrichedTrades.push({
      ...trade,
      Strategy: '',
      'Strategy Group ID': '',
      'Leg Number': '',
      'Total Legs': ''
    });
  });

  return { enrichedTrades, strategyInfo, realizedByGroup };
}

/**
 * Whether a row belongs to a share position
 * Assignment and exercise convert an option into stock, and the resulting
 * position carries its own realized P/L. Ignoring it leaves an open holding
 * invisible and the symbol's realized total short of the broker's.
 * @param {Object} trade - Raw CSV row
 * @returns {boolean}
 */
function isEquityTrade(trade) {
  if (trade['Instrument Type'] !== 'Equity') return false;
  return trade.Type === 'Trade' || trade.Type === 'Receive Deliver';
}

/**
 * Reconstruct share positions from a transaction ledger
 * FIFO lots per symbol, the same treatment options get. One trade per lot.
 * @param {Array} trades - All raw CSV rows
 * @returns {Array} - Trades in internal format
 */
function processEquityTrades(trades) {
  const chronological = trades
    .filter(isEquityTrade)
    .slice()
    .sort((a, b) => {
      const da = parseDate(a.Date);
      const db = parseDate(b.Date);
      return (da ? da.getTime() : 0) - (db ? db.getTime() : 0);
    });

  const openLots = new Map();
  const finished = [];

  const newLot = (trade, quantity, isLong) => ({
    symbol: trade.Symbol,
    isLong,
    quantity,
    remaining: quantity,
    entry: parseDate(trade.Date),
    exit: null,
    credit: 0,
    debit: 0,
    commissions: 0,
    fees: 0
  });

  const applyMoney = (lot, trade, quantity, totalQuantity) => {
    const amounts = proratedAmounts(trade, quantity, totalQuantity);
    if (amounts.Value > 0) {
      lot.credit += amounts.Value;
    } else {
      lot.debit += Math.abs(amounts.Value);
    }
    lot.commissions += -amounts.Commissions;
    lot.fees += -amounts.Fees;
  };

  chronological.forEach(trade => {
    const symbol = trade.Symbol;
    const quantity = Math.abs(parseInt(trade.Quantity, 10) || 0);
    if (!quantity) return;

    if (!openLots.has(symbol)) openLots.set(symbol, []);
    const queue = openLots.get(symbol);

    if (isOpeningAction(trade.Action)) {
      const lot = newLot(trade, quantity, trade.Action === 'BUY_TO_OPEN');
      applyMoney(lot, trade, quantity, quantity);
      queue.push(lot);
      return;
    }

    if (isClosingAction(trade.Action)) {
      let unmatched = quantity;

      while (unmatched > 0 && queue.length > 0) {
        const lot = queue[0];
        const taken = Math.min(unmatched, lot.remaining);
        applyMoney(lot, trade, taken, quantity);
        lot.remaining -= taken;
        lot.exit = parseDate(trade.Date);
        unmatched -= taken;
        if (lot.remaining <= 0) {
          finished.push(lot);
          queue.shift();
        }
      }

      // Shares acquired before this export window began
      if (unmatched > 0) {
        const lot = newLot(trade, unmatched, false);
        lot.entry = null;
        lot.exit = parseDate(trade.Date);
        lot.remaining = 0;
        applyMoney(lot, trade, unmatched, quantity);
        finished.push(lot);
      }
    }
  });

  const stillOpen = [];
  openLots.forEach(queue => queue.forEach(lot => stillOpen.push(lot)));

  return finished.concat(stillOpen).map(lot => ({
    Symbol: lot.symbol,
    Type: 'Stock',
    Strategy: lot.isLong ? 'Long Stock' : 'Short Stock',
    Strike: 0,
    Expiry: null,
    Volume: lot.quantity,
    Entry: lot.entry,
    Delta: 0,
    Exit: lot.remaining <= 0 ? lot.exit : null,
    Debit: Math.round(lot.debit * 100) / 100,
    Credit: Math.round(lot.credit * 100) / 100,
    RealizedGrossPL: lot.remaining <= 0
      ? Math.round((lot.credit - lot.debit) * 100) / 100
      : 0,
    RealizedPL: lot.remaining <= 0
      ? Math.round((lot.credit - lot.debit - lot.commissions - lot.fees) * 100) / 100
      : 0,
    OpenCredit: 0,
    Commissions: Math.round(lot.commissions * 100) / 100,
    Fees: Math.round(lot.fees * 100) / 100,
    Width: null,
    Account: 'TastyTrade',
    _metadata: {
      totalLegs: 1,
      strategyGroupId: `stock:${lot.symbol}:${lot.entry ? lot.entry.toISOString().slice(0, 10) : 'preexisting'}`,
      strikes: [],
      legCount: 1,
      feesAvailable: true,
      multipleExpirations: false,
      instrument: 'Equity'
    }
  }));
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
  
  // Filter to only option trades, including the Receive Deliver rows that
  // close a position at expiration or assignment
  const optionTrades = enrichedTrades.filter(isOptionTrade);
  
  console.log('Option trades:', optionTrades.length);
  
  // Group by Strategy Group ID to aggregate legs into complete strategies
  const strategyGroups = groupByStrategyGroupId(optionTrades);
  
  console.log('Unique strategies:', strategyGroups.size);
  
  // Convert each strategy group to internal trade format
  const trades = [];
  
  strategyGroups.forEach((legs, groupId) => {
    const trade = aggregateStrategyLegs(legs);
    if (!trade) return;

    // What the broker counts as realized for this strategy so far: the legs
    // already retired, whether or not the strategy as a whole is finished
    const realized = result.realizedByGroup && result.realizedByGroup.get(groupId);
    if (realized) {
      // Gross matches the broker's "P/L Realized" column, which reports
      // commissions and fees separately rather than netting them
      trade.RealizedGrossPL = Math.round(realized.value * 100) / 100;
      trade.RealizedPL = Math.round(
        (realized.value + realized.commissions + realized.fees) * 100
      ) / 100;
      trade._metadata.incompleteBasis = realized.incompleteBasis;
    } else {
      trade.RealizedGrossPL = 0;
      trade.RealizedPL = 0;
      trade._metadata.incompleteBasis = false;
    }

    trades.push(trade);
  });
  
  // Share positions created by assignment or exercise carry their own P/L
  const equityTrades = processEquityTrades(rows);
  if (equityTrades.length) {
    console.log('Share positions from assignment/exercise:', equityTrades.length);
    equityTrades.forEach(t => trades.push(t));
  }

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
  
  // A position is closed only when every contract it opened has been retired.
  // Any single closing leg used to be enough, which reported a half-closed
  // spread as done and pulled its unrealized P/L into the realized figures.
  const netByContract = new Map();
  legs.forEach(leg => {
    const quantity = Math.abs(parseInt(leg.Quantity, 10) || 0);
    let signed = 0;
    if (isOpeningAction(leg.Action)) {
      signed = leg.Action === 'SELL_TO_OPEN' ? -quantity : quantity;
    } else if (isClosingAction(leg.Action)) {
      signed = leg.Action === 'BUY_TO_CLOSE' ? quantity : -quantity;
    }
    netByContract.set(leg.Symbol, (netByContract.get(leg.Symbol) || 0) + signed);
  });

  // A group with no opening legs is a position opened before this export whose
  // close we did see, so it is realized by definition
  const fullyClosed = openingLegs.length === 0
    ? closingLegs.length > 0
    : [...netByContract.values()].every(net => net === 0);

  // Calculate dates
  const entryDate = findEarliestDate(openingLegs);
  const exitDate = fullyClosed && closingLegs.length > 0 ? findLatestDate(closingLegs) : null;
  
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

  // Credit taken in when the position was opened. Distinct from totalCredit,
  // which also picks up sell-to-close proceeds and so overstates what the
  // structure was originally sold for.
  let openCredit = 0;

  openingLegs.forEach(leg => {
    const amount = parseAmount(leg.Value || leg.Total || '0');
    if (amount > 0) {
      openCredit += amount;
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
    OpenCredit: Math.round(openCredit * 100) / 100,
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
    realizedByGroup: result.realizedByGroup,
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
