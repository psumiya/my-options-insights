/**
 * Analytics Engine Component
 * Handles trade enrichment, filtering, and aggregation calculations
 */
class AnalyticsEngine {
  /**
   * Calculate computed fields for a trade record
   * @param {Object} trade - Raw trade record from CSV
   * @returns {Object} - Trade with computed fields added
   */
  enrichTrade(trade) {
    const enriched = { ...trade };

    // Parse dates safely
    const entryDate = this._parseDate(trade.Entry);
    const expiryDate = this._parseDate(trade.Expiry);
    const exitDate = trade.Exit ? this._parseDate(trade.Exit) : null;

    // Calculate Days to Expire at Entry (Requirement 2.1)
    // Uses calendar-date differencing so an afternoon entry on its own
    // expiration date still reads as 0 DTE
    if (entryDate && expiryDate) {
      enriched.DaysToExpireAtEntry = this._daysBetweenDates(entryDate, expiryDate);
    } else {
      enriched.DaysToExpireAtEntry = null;
    }

    // Calculate P/L (Requirement 2.2)
    // Net of commissions and fees; both are stored as positive cost magnitudes
    // and default to zero for brokers whose exports omit them
    const credit = parseFloat(trade.Credit) || 0;
    const debit = parseFloat(trade.Debit) || 0;
    const commissions = parseFloat(trade.Commissions) || 0;
    const fees = parseFloat(trade.Fees) || 0;
    enriched.ProfitLoss = credit - debit - commissions - fees;

    // What the broker counts as realized. Brokers settle leg by leg, so a
    // half-closed strategy has realized P/L while still being an open position.
    // Adapters that cannot distinguish the two fall back to the whole trade.
    if (trade.RealizedPL !== undefined && trade.RealizedPL !== null) {
      enriched.RealizedPL = trade.RealizedPL;
      enriched.RealizedGrossPL = trade.RealizedGrossPL !== undefined
        ? trade.RealizedGrossPL
        : trade.RealizedPL;
    } else {
      enriched.RealizedPL = exitDate ? enriched.ProfitLoss : 0;
      enriched.RealizedGrossPL = exitDate ? credit - debit : 0;
    }

    // Calculate Premium Percentage (Requirement 2.3)
    if (credit > 0) {
      enriched.PremiumPercentage = (enriched.ProfitLoss / credit) * 100;
    } else {
      enriched.PremiumPercentage = null;
    }

    // Calculate Days Held (Requirement 2.4)
    if (exitDate && entryDate) {
      enriched.DaysHeld = this._daysBetween(entryDate, exitDate);
    } else {
      enriched.DaysHeld = null;
    }

    // Calculate Remaining DTE (Requirement 2.5)
    if (exitDate && expiryDate) {
      enriched.RemainingDTE = this._daysBetween(exitDate, expiryDate);
    } else {
      enriched.RemainingDTE = null;
    }

    // Determine Result (Requirements 2.6, 2.7, 2.8)
    if (exitDate) {
      enriched.Result = enriched.ProfitLoss > 0 ? 'Win' : 'Loss';
    } else {
      enriched.Result = 'Open';
    }

    return enriched;
  }

  /**
   * Parse date string safely
   * @param {string} dateStr - Date string to parse
   * @returns {Date|null} - Parsed date or null if invalid
   * @private
   */
  _parseDate(dateStr) {
    if (!dateStr) return null;
    
    const date = new Date(dateStr);
    
    // Check if date is valid
    if (isNaN(date.getTime())) {
      console.warn(`Invalid date format: ${dateStr}`);
      return null;
    }
    
    return date;
  }

  /**
   * Calculate days between two dates
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {number} - Number of days between dates
   * @private
   */
  _daysBetween(startDate, endDate) {
    const msPerDay = 1000 * 60 * 60 * 24;
    const diffMs = endDate.getTime() - startDate.getTime();
    return Math.round(diffMs / msPerDay);
  }

  /**
   * Calculate calendar days between two dates, ignoring time of day
   * Entry timestamps carry a time component while expirations are midnight,
   * so differencing raw timestamps rounds same-day trades to 0 or -1 depending
   * on the hour they were opened. Normalizing both ends first avoids that.
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {number} - Number of calendar days between dates
   * @private
   */
  _daysBetweenDates(startDate, endDate) {
    const msPerDay = 1000 * 60 * 60 * 24;
    const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
    return Math.round((end.getTime() - start.getTime()) / msPerDay);
  }

  /**
   * Filter trades by date range
   * @param {Array} trades - Array of enriched trade records
   * @param {string} rangeType - Date range type: 'last7days', 'last30days', 'last12months', 'ytd', 'alltime'
   * @returns {Array} - Filtered trades
   */
  filterByDateRange(trades, rangeType) {
    if (rangeType === 'alltime') {
      return trades;
    }

    const today = new Date();
    today.setHours(23, 59, 59, 999); // End of today
    let startDate;

    switch (rangeType) {
      case 'last7days':
        startDate = new Date(today);
        startDate.setDate(today.getDate() - 7);
        break;
      
      case 'last30days':
        startDate = new Date(today);
        startDate.setDate(today.getDate() - 30);
        break;
      
      case 'last12months':
        startDate = new Date(today);
        startDate.setMonth(today.getMonth() - 12);
        break;
      
      case 'ytd':
        startDate = new Date(today.getFullYear(), 0, 1); // January 1st of current year
        break;
      
      default:
        console.warn(`Unknown date range type: ${rangeType}`);
        return trades;
    }

    startDate.setHours(0, 0, 0, 0); // Start of day

    return trades.filter(trade => {
      // For closed trades, use Exit date (Requirement 8.2)
      if (trade.Exit) {
        const exitDate = this._parseDate(trade.Exit);
        if (!exitDate) return false;
        return exitDate >= startDate && exitDate <= today;
      }
      
      // For open trades, use Entry date (Requirement 8.5)
      const entryDate = this._parseDate(trade.Entry);
      if (!entryDate) return false;
      return entryDate >= startDate && entryDate <= today;
    });
  }

  /**
   * Filter trades by position status
   * @param {Array} trades - Array of enriched trade records
   * @param {string} status - Position status: 'open', 'closed', or 'all'
   * @returns {Array} - Filtered trades
   */
  filterByStatus(trades, status) {
    if (status === 'all') {
      return trades;
    }

    if (status === 'closed') {
      // Return trades with Result = 'Win' or 'Loss' (Requirement 9.3)
      return trades.filter(trade => trade.Result === 'Win' || trade.Result === 'Loss');
    }

    if (status === 'open') {
      // Return trades with Result = 'Open' (Requirement 9.4)
      return trades.filter(trade => trade.Result === 'Open');
    }

    console.warn(`Unknown status filter: ${status}`);
    return trades;
  }

  /**
   * Calculate monthly P/L with cumulative totals
   * @param {Array} trades - Array of enriched trade records
   * @returns {Array} - Array of {month, monthLabel, pl, cumulativePL} objects
   */
  calculateMonthlyPL(trades) {
    const monthlyMap = new Map();

    // Group trades by month (Requirement 4.4)
    trades.forEach(trade => {
      // Only include closed trades
      if (trade.Result === 'Open') return;

      const exitDate = this._parseDate(trade.Exit);
      if (!exitDate) return;

      // Format as YYYY-MM
      const monthKey = `${exitDate.getFullYear()}-${String(exitDate.getMonth() + 1).padStart(2, '0')}`;
      
      if (!monthlyMap.has(monthKey)) {
        monthlyMap.set(monthKey, 0);
      }
      
      monthlyMap.set(monthKey, monthlyMap.get(monthKey) + trade.ProfitLoss);
    });

    // Convert to array and sort by month
    const monthlyArray = Array.from(monthlyMap.entries())
      .map(([month, pl]) => ({
        month,
        monthLabel: this._formatMonthLabel(month),
        pl
      }))
      .sort((a, b) => a.month.localeCompare(b.month));

    // Calculate cumulative P/L
    let cumulative = 0;
    monthlyArray.forEach(item => {
      cumulative += item.pl;
      item.cumulativePL = cumulative;
    });

    return monthlyArray;
  }

  /**
   * Calculate win rate metrics by strategy
   * @param {Array} trades - Array of enriched trade records
   * @returns {Array} - Array of strategy win rate objects
   */
  calculateWinRateByStrategy(trades) {
    const strategyMap = new Map();

    // Group trades by strategy (Requirements 5.2, 5.3, 5.4)
    trades.forEach(trade => {
      // Only include closed trades (Requirement 5.5)
      if (trade.Result === 'Open') return;

      const strategy = trade.Strategy;
      
      if (!strategyMap.has(strategy)) {
        strategyMap.set(strategy, {
          strategy,
          totalTrades: 0,
          wins: 0,
          losses: 0,
          totalWinAmount: 0,
          totalLossAmount: 0
        });
      }

      const stats = strategyMap.get(strategy);
      stats.totalTrades++;

      if (trade.Result === 'Win') {
        stats.wins++;
        stats.totalWinAmount += trade.ProfitLoss;
      } else {
        stats.losses++;
        stats.totalLossAmount += trade.ProfitLoss;
      }
    });

    // Calculate win rate percentages and net P/L
    return Array.from(strategyMap.values()).map(stats => ({
      ...stats,
      winRate: stats.totalTrades > 0 ? (stats.wins / stats.totalTrades) * 100 : 0,
      netPL: stats.totalWinAmount + stats.totalLossAmount
    }));
  }

  /**
   * Calculate P/L breakdown by flexible dimensions
   * @param {Array} trades - Array of enriched trade records
   * @param {Array} dimensions - Array of field names to group by (e.g., ['Symbol'], ['Type', 'Strategy'])
   * @returns {Array} - Array of grouped P/L objects
   */
  calculatePLBreakdown(trades, dimensions) {
    const breakdownMap = new Map();

    // Group trades by specified dimensions (Requirements 6.2, 7.1, 7.2, 7.3)
    trades.forEach(trade => {
      // Net counts closed positions; gross counts every retired leg, including
      // legs inside positions that are still open, which is how a broker
      // statement reports realized P/L
      const isClosed = trade.Result !== 'Open';
      const gross = trade.RealizedGrossPL !== undefined
        ? trade.RealizedGrossPL
        : (isClosed ? (parseFloat(trade.Credit) || 0) - (parseFloat(trade.Debit) || 0) : 0);

      if (!isClosed && !gross) return;

      // Create composite key from dimensions
      const keyParts = dimensions.map(dim => trade[dim] || 'Unknown');
      const key = keyParts.join('|');

      if (!breakdownMap.has(key)) {
        const dimensionValues = {};
        dimensions.forEach((dim, index) => {
          dimensionValues[dim] = keyParts[index];
        });

        breakdownMap.set(key, {
          dimensions: dimensionValues,
          pl: 0,
          tradeCount: 0,
          plGross: 0,
          realizedCount: 0
        });
      }

      const group = breakdownMap.get(key);

      if (isClosed) {
        group.pl += trade.ProfitLoss;
        group.tradeCount++;
      }

      if (gross) {
        group.plGross += gross;
        group.realizedCount++;
      }
    });

    // Convert to array and sort by P/L descending
    return Array.from(breakdownMap.values())
      .sort((a, b) => b.pl - a.pl);
  }

  /**
   * Calculate summary metrics
   * @param {Array} trades - Array of enriched trade records
   * @returns {Object} - Object with totalTrades, winRate, totalPL, averageWin
   */
  calculateSummaryMetrics(trades) {
    // Filter to closed trades only
    const closedTrades = trades.filter(trade => trade.Result === 'Win' || trade.Result === 'Loss');
    
    // Calculate total trades (Requirement 13.2)
    const totalTrades = closedTrades.length;
    
    // Calculate wins and losses
    const wins = closedTrades.filter(trade => trade.Result === 'Win');
    const winCount = wins.length;
    
    // Calculate win rate (Requirement 13.3)
    const winRate = totalTrades > 0 ? (winCount / totalTrades) * 100 : 0;
    
    // Calculate total P/L (Requirement 13.4)
    const totalPL = closedTrades.reduce((sum, trade) => sum + trade.ProfitLoss, 0);

    // Realized P/L counts every retired leg, including those inside positions
    // that are still open, which is how brokers report it
    const realizedPL = trades.reduce((sum, trade) => sum + (trade.RealizedPL || 0), 0);
    const openPositions = trades.filter(trade => trade.Result === 'Open').length;
    const incompleteBasis = trades.filter(trade =>
      trade._metadata && trade._metadata.incompleteBasis).length;
    
    // Calculate average win (Requirement 13.5)
    const totalWinAmount = wins.reduce((sum, trade) => sum + trade.ProfitLoss, 0);
    const averageWin = winCount > 0 ? totalWinAmount / winCount : 0;
    
    return {
      totalTrades,
      winRate,
      totalPL,
      realizedPL,
      openPositions,
      incompleteBasis,
      averageWin
    };
  }

  /**
   * Calculate win/loss distribution
   * @param {Array} trades - Array of enriched trade records
   * @returns {Object} - Object with {wins, losses, winPercentage, lossPercentage}
   */
  calculateWinLossDistribution(trades) {
    // Filter to closed trades only (Requirement 14.8)
    const closedTrades = trades.filter(trade => trade.Result === 'Win' || trade.Result === 'Loss');
    
    // Calculate win and loss counts (Requirements 14.2, 14.3)
    const wins = closedTrades.filter(trade => trade.Result === 'Win').length;
    const losses = closedTrades.filter(trade => trade.Result === 'Loss').length;
    const total = closedTrades.length;
    
    // Calculate percentages
    const winPercentage = total > 0 ? (wins / total) * 100 : 0;
    const lossPercentage = total > 0 ? (losses / total) * 100 : 0;
    
    return {
      wins,
      losses,
      winPercentage,
      lossPercentage
    };
  }

  /**
   * Calculate top underlyings by winning dollars
   * @param {Array} trades - Array of enriched trade records
   * @param {number} limit - Number of top symbols to return (default 5)
   * @returns {Array} - Array of {symbol, winningDollars, winCount} objects
   */
  calculateTopUnderlyings(trades, limit = 5) {
    const symbolMap = new Map();
    
    // Group winning trades by symbol (Requirement 15.2)
    trades.forEach(trade => {
      // Only include winning trades
      if (trade.Result !== 'Win') return;
      
      const symbol = trade.Symbol;
      
      if (!symbolMap.has(symbol)) {
        symbolMap.set(symbol, {
          symbol,
          winningDollars: 0,
          winCount: 0
        });
      }
      
      const stats = symbolMap.get(symbol);
      stats.winningDollars += trade.ProfitLoss;
      stats.winCount++;
    });
    
    // Convert to array, sort by winning dollars descending, and take top N (Requirement 15.3)
    return Array.from(symbolMap.values())
      .sort((a, b) => b.winningDollars - a.winningDollars)
      .slice(0, limit);
  }

  /**
   * Format month key to display label
   * @param {string} monthKey - Month in YYYY-MM format
   * @returns {string} - Formatted month label (e.g., "Jan 2024")
   * @private
   */
  _formatMonthLabel(monthKey) {
    const [year, month] = monthKey.split('-');
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${monthNames[parseInt(month) - 1]} ${year}`;
  }

  /**
   * Calculate daily P/L for heatmap calendar visualization
   * @param {Array} trades - Array of enriched trade records
   * @returns {Array} - Array of {date, pl, tradeCount} objects
   */
  calculateDailyPL(trades) {
    const dailyMap = new Map();

    // Group closed trades by exit date
    trades.forEach(trade => {
      if (trade.Result === 'Open') return;

      const exitDate = this._parseDate(trade.Exit);
      if (!exitDate) return;

      // Format as YYYY-MM-DD using local timezone
      const year = exitDate.getFullYear();
      const month = String(exitDate.getMonth() + 1).padStart(2, '0');
      const day = String(exitDate.getDate()).padStart(2, '0');
      const dateKey = `${year}-${month}-${day}`;
      
      if (!dailyMap.has(dateKey)) {
        // Create date in local timezone at noon to avoid timezone shifts
        dailyMap.set(dateKey, {
          date: new Date(year, exitDate.getMonth(), exitDate.getDate(), 12, 0, 0),
          pl: 0,
          tradeCount: 0
        });
      }
      
      const dayData = dailyMap.get(dateKey);
      dayData.pl += trade.ProfitLoss;
      dayData.tradeCount++;
    });

    // Convert to array and sort by date
    return Array.from(dailyMap.values())
      .sort((a, b) => a.date - b.date);
  }

  /**
   * Calculate scatter plot data (Days Held vs P/L)
   * @param {Array} trades - Array of enriched trade records
   * @returns {Array} - Array of {symbol, strategy, daysHeld, pl, type} objects
   */
  calculateScatterData(trades) {
    return trades
      .filter(trade => trade.Result !== 'Open' && trade.DaysHeld !== null)
      .map(trade => ({
        symbol: trade.Symbol,
        strategy: trade.Strategy,
        daysHeld: trade.DaysHeld,
        daysToExpire: trade.DaysToExpireAtEntry,
        pl: trade.ProfitLoss,
        type: trade.Type
      }));
  }

  /**
   * Calculate violin plot data (P/L distribution by strategy)
   * @param {Array} trades - Array of enriched trade records
   * @returns {Array} - Array of strategy distribution objects
   */
  calculateViolinData(trades) {
    const strategyMap = new Map();

    // Group P/L values by strategy
    trades.forEach(trade => {
      if (trade.Result === 'Open') return;

      const strategy = trade.Strategy;
      
      if (!strategyMap.has(strategy)) {
        strategyMap.set(strategy, []);
      }
      
      strategyMap.get(strategy).push(trade.ProfitLoss);
    });

    // Calculate statistics for each strategy
    return Array.from(strategyMap.entries()).map(([strategy, plValues]) => {
      plValues.sort((a, b) => a - b);
      
      const mean = plValues.reduce((sum, val) => sum + val, 0) / plValues.length;
      const median = this._calculateMedian(plValues);
      const q1 = this._calculateQuantile(plValues, 0.25);
      const q3 = this._calculateQuantile(plValues, 0.75);
      const min = plValues[0];
      const max = plValues[plValues.length - 1];
      
      // Calculate standard deviation
      const variance = plValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / plValues.length;
      const stdDev = Math.sqrt(variance);

      return {
        strategy,
        plValues,
        median,
        mean,
        q1,
        q3,
        min,
        max,
        stdDev
      };
    });
  }

  /**
   * Calculate Sankey diagram data (Symbol -> Strategy -> Result flow)
   * @param {Array} trades - Array of enriched trade records
   * @param {number} topSymbolsLimit - Limit to top N symbols by trade count (default 10)
   * @returns {Object} - Object with {nodes, links} arrays
   */
  calculateSankeyData(trades, topSymbolsLimit = 10) {
    const closedTrades = trades.filter(trade => trade.Result !== 'Open');
    
    // Find top symbols by trade count
    const symbolCounts = new Map();
    closedTrades.forEach(trade => {
      symbolCounts.set(trade.Symbol, (symbolCounts.get(trade.Symbol) || 0) + 1);
    });
    
    const topSymbols = Array.from(symbolCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, topSymbolsLimit)
      .map(([symbol]) => symbol);
    
    // Filter to top symbols only
    const filteredTrades = closedTrades.filter(trade => topSymbols.includes(trade.Symbol));
    
    // Build nodes and links
    const nodes = [];
    const links = [];
    const nodeIds = new Set();
    
    // Create nodes for symbols (layer 0)
    topSymbols.forEach(symbol => {
      const nodeId = `symbol_${symbol}`;
      if (!nodeIds.has(nodeId)) {
        nodes.push({ id: nodeId, name: symbol, layer: 0 });
        nodeIds.add(nodeId);
      }
    });
    
    // Create nodes for strategies (layer 1)
    const strategies = [...new Set(filteredTrades.map(t => t.Strategy))];
    strategies.forEach(strategy => {
      const nodeId = `strategy_${strategy}`;
      if (!nodeIds.has(nodeId)) {
        nodes.push({ id: nodeId, name: strategy, layer: 1 });
        nodeIds.add(nodeId);
      }
    });
    
    // Create nodes for results (layer 2)
    ['Win', 'Loss'].forEach(result => {
      const nodeId = `result_${result}`;
      if (!nodeIds.has(nodeId)) {
        nodes.push({ id: nodeId, name: result, layer: 2 });
        nodeIds.add(nodeId);
      }
    });
    
    // Create links
    const linkMap = new Map();
    
    filteredTrades.forEach(trade => {
      // Symbol -> Strategy link
      const link1Key = `symbol_${trade.Symbol}|strategy_${trade.Strategy}`;
      if (!linkMap.has(link1Key)) {
        linkMap.set(link1Key, {
          source: `symbol_${trade.Symbol}`,
          target: `strategy_${trade.Strategy}`,
          value: 0,
          tradeCount: 0,
          result: null
        });
      }
      const link1 = linkMap.get(link1Key);
      link1.value += Math.abs(trade.ProfitLoss);
      link1.tradeCount += 1;
      
      // Strategy -> Result link
      const link2Key = `strategy_${trade.Strategy}|result_${trade.Result}`;
      if (!linkMap.has(link2Key)) {
        linkMap.set(link2Key, {
          source: `strategy_${trade.Strategy}`,
          target: `result_${trade.Result}`,
          value: 0,
          tradeCount: 0,
          result: trade.Result
        });
      }
      const link2 = linkMap.get(link2Key);
      link2.value += Math.abs(trade.ProfitLoss);
      link2.tradeCount += 1;
    });
    
    links.push(...Array.from(linkMap.values()));
    
    return { nodes, links };
  }

  /**
   * Calculate bubble chart data (Win Rate vs Average Win by Strategy)
   * @param {Array} trades - Array of enriched trade records
   * @returns {Array} - Array of {strategy, winRate, averageWin, tradeCount, netPL} objects
   */
  calculateBubbleData(trades) {
    const strategyMap = new Map();

    // Group trades by strategy
    trades.forEach(trade => {
      if (trade.Result === 'Open') return;

      const strategy = trade.Strategy;
      
      if (!strategyMap.has(strategy)) {
        strategyMap.set(strategy, {
          strategy,
          totalTrades: 0,
          wins: 0,
          totalWinAmount: 0,
          totalPL: 0
        });
      }

      const stats = strategyMap.get(strategy);
      stats.totalTrades++;
      stats.totalPL += trade.ProfitLoss;

      if (trade.Result === 'Win') {
        stats.wins++;
        stats.totalWinAmount += trade.ProfitLoss;
      }
    });

    // Calculate metrics
    return Array.from(strategyMap.values()).map(stats => ({
      strategy: stats.strategy,
      winRate: stats.totalTrades > 0 ? (stats.wins / stats.totalTrades) * 100 : 0,
      averageWin: stats.wins > 0 ? stats.totalWinAmount / stats.wins : 0,
      tradeCount: stats.totalTrades,
      netPL: stats.totalPL
    }));
  }

  /**
   * Calculate radial chart data (Strategy performance by month)
   * @param {Array} trades - Array of enriched trade records
   * @param {number} monthsLimit - Number of recent months to include (default 12)
   * @returns {Array} - Array of {month, strategies: [{strategy, pl}]} objects
   */
  calculateRadialData(trades, monthsLimit = 12) {
    const monthStrategyMap = new Map();

    // Group trades by month and strategy
    trades.forEach(trade => {
      if (trade.Result === 'Open') return;

      const exitDate = this._parseDate(trade.Exit);
      if (!exitDate) return;

      const monthKey = `${exitDate.getFullYear()}-${String(exitDate.getMonth() + 1).padStart(2, '0')}`;
      
      if (!monthStrategyMap.has(monthKey)) {
        monthStrategyMap.set(monthKey, new Map());
      }
      
      const strategyMap = monthStrategyMap.get(monthKey);
      const strategy = trade.Strategy;
      
      if (!strategyMap.has(strategy)) {
        strategyMap.set(strategy, 0);
      }
      
      strategyMap.set(strategy, strategyMap.get(strategy) + trade.ProfitLoss);
    });

    // Convert to array format
    const monthlyData = Array.from(monthStrategyMap.entries())
      .map(([month, strategyMap]) => ({
        month: this._formatMonthLabel(month),
        monthKey: month,
        strategies: Array.from(strategyMap.entries()).map(([strategy, pl]) => ({
          strategy,
          pl
        }))
      }))
      .sort((a, b) => a.monthKey.localeCompare(b.monthKey));

    // Return most recent N months
    return monthlyData.slice(-monthsLimit);
  }

  /**
   * Calculate waterfall chart data (P/L attribution by symbol)
   * @param {Array} trades - Array of enriched trade records
   * @param {number} topSymbolsLimit - Limit to top N symbols by absolute P/L (default 15)
   * @returns {Array} - Array of {symbol, pl, cumulativePL} objects
   */
  calculateWaterfallData(trades, topSymbolsLimit = 15) {
    const symbolMap = new Map();

    // Group P/L by symbol
    trades.forEach(trade => {
      if (trade.Result === 'Open') return;

      const symbol = trade.Symbol;
      
      if (!symbolMap.has(symbol)) {
        symbolMap.set(symbol, 0);
      }
      
      symbolMap.set(symbol, symbolMap.get(symbol) + trade.ProfitLoss);
    });

    // Convert to array and sort by absolute P/L
    const symbolData = Array.from(symbolMap.entries())
      .map(([symbol, pl]) => ({ symbol, pl }))
      .sort((a, b) => Math.abs(b.pl) - Math.abs(a.pl))
      .slice(0, topSymbolsLimit);

    // Calculate cumulative P/L
    let cumulative = 0;
    symbolData.forEach(item => {
      cumulative += item.pl;
      item.cumulativePL = cumulative;
    });

    return symbolData;
  }

  /**
   * Calculate horizon chart data (Daily cumulative P/L over time)
   * @param {Array} trades - Array of enriched trade records
   * @returns {Array} - Array of {date, cumulativePL} objects
   */
  calculateHorizonData(trades) {
    const dailyPL = this.calculateDailyPL(trades);
    
    // Calculate cumulative P/L
    let cumulative = 0;
    return dailyPL.map(day => {
      cumulative += day.pl;
      return {
        date: day.date,
        cumulativePL: cumulative
      };
    });
  }

  /**
   * Calculate cost basis per symbol
   * @param {Array} trades - Array of enriched trade records
   * @returns {Array} - Array of {symbol, costBasis, totalTrades, openPositions, hasOpenPosition} objects
   */
  calculateCostBasisBySymbol(trades) {
    const symbolMap = new Map();

    // Group trades by symbol
    trades.forEach(trade => {
      const symbol = trade.Symbol;
      const debit = parseFloat(trade.Debit) || 0; // Only count money spent (debits)
      
      if (!symbolMap.has(symbol)) {
        symbolMap.set(symbol, {
          symbol,
          costBasis: 0,
          totalTrades: 0,
          openPositions: 0,
          debitTrades: 0 // Track how many trades involved spending money
        });
      }

      const stats = symbolMap.get(symbol);
      stats.costBasis += debit; // Cost basis = total money spent
      stats.totalTrades++;
      
      if (debit > 0) {
        stats.debitTrades++;
      }
      
      // Count open positions
      if (trade.Result === 'Open') {
        stats.openPositions++;
      }
    });

    // Convert to array and add hasOpenPosition flag
    // Filter out symbols with zero cost basis (only credit trades)
    return Array.from(symbolMap.values())
      .filter(stats => stats.costBasis > 0) // Only show symbols where money was spent
      .map(stats => ({
        ...stats,
        hasOpenPosition: stats.openPositions > 0
      }))
      .sort((a, b) => b.costBasis - a.costBasis); // Sort by cost basis descending
  }

  /**
   * Calculate median of an array
   * @param {Array} values - Sorted array of numbers
   * @returns {number} - Median value
   * @private
   */
  _calculateMedian(values) {
    const mid = Math.floor(values.length / 2);
    return values.length % 2 === 0
      ? (values[mid - 1] + values[mid]) / 2
      : values[mid];
  }

  /**
   * Calculate quantile of an array
   * @param {Array} values - Sorted array of numbers
   * @param {number} q - Quantile (0-1)
   * @returns {number} - Quantile value
   * @private
   */
  _calculateQuantile(values, q) {
    const pos = (values.length - 1) * q;
    const base = Math.floor(pos);
    const rest = pos - base;
    
    if (values[base + 1] !== undefined) {
      return values[base] + rest * (values[base + 1] - values[base]);
    } else {
      return values[base];
    }
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AnalyticsEngine;
}
