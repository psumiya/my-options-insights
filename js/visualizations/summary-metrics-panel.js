/**
 * Summary Metrics Panel Component
 * Displays key performance metrics in a 2x2 grid of cards
 */
class SummaryMetricsPanel {
  /**
   * Create summary metrics panel
   * @param {string} containerId - DOM element ID
   * @param {Object} metrics - Metrics data
   * @param {number} metrics.totalTrades - Count of closed trades
   * @param {number} metrics.winRate - Win rate percentage (0-100)
   * @param {number} metrics.totalPL - Total profit/loss
   * @param {number} metrics.averageWin - Average win amount
   */
  constructor(containerId, metrics = {}) {
    this.container = document.getElementById(containerId);
    if (!this.container) {
      console.error(`Container with id "${containerId}" not found`);
      return;
    }

    this.metrics = metrics;
    this.render();
  }

  /**
   * Format currency value with dollar sign and 2 decimal places
   * @param {number} value - Currency value
   * @returns {string} Formatted currency string
   */
  formatCurrency(value) {
    if (value === null || value === undefined || isNaN(value)) {
      return '$0.00';
    }
    const sign = value >= 0 ? '' : '-';
    const absValue = Math.abs(value);
    return `${sign}$${absValue.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
  }

  /**
   * Format percentage value with 1 decimal place
   * @param {number} value - Percentage value (0-100)
   * @returns {string} Formatted percentage string
   */
  formatPercentage(value) {
    if (value === null || value === undefined || isNaN(value)) {
      return '0.0%';
    }
    return `${value.toFixed(1)}%`;
  }

  /**
   * Get color class for P/L value
   * @param {number} value - P/L value
   * @returns {string} Tailwind color class
   */
  getPLColorClass(value) {
    if (value > 0) return 'text-green-500';
    if (value < 0) return 'text-red-500';
    return 'text-gray-400';
  }

  /**
   * Render the metrics panel
   */
  render() {
    const {
      totalTrades = 0,
      winRate = 0,
      totalPL = 0,
      realizedPL = null,
      openPositions = 0,
      averageWin = 0
    } = this.metrics;

    // Realized P/L is the figure that ties to a broker statement: it counts
    // every retired leg, including legs of positions that are still open.
    // Adapters that cannot tell the two apart pass no realizedPL and fall back.
    const headlinePL = realizedPL === null ? totalPL : realizedPL;
    const plColorClass = this.getPLColorClass(headlinePL);

    this.container.innerHTML = `
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <!-- Total Trades Card -->
        <div class="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div class="text-gray-400 text-sm font-medium mb-2">Total Trades</div>
          <div class="text-4xl font-bold font-mono text-gray-100">${totalTrades}</div>
        </div>

        <!-- Win Rate Card -->
        <div class="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div class="text-gray-400 text-sm font-medium mb-2">Win Rate</div>
          <div class="text-4xl font-bold font-mono text-gray-100">${this.formatPercentage(winRate)}</div>
        </div>

        <!-- Total P/L Card -->
        <div class="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div class="text-gray-400 text-sm font-medium mb-2">Realized P/L</div>
          <div class="text-4xl font-bold font-mono ${plColorClass}">${this.formatCurrency(headlinePL)}</div>
          ${openPositions ? `<div class="text-gray-500 text-xs mt-1">${openPositions} position${openPositions === 1 ? '' : 's'} still open</div>` : ''}
        </div>

        <!-- Average Win Card -->
        <div class="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div class="text-gray-400 text-sm font-medium mb-2">Average Win</div>
          <div class="text-4xl font-bold font-mono text-gray-100">${this.formatCurrency(averageWin)}</div>
        </div>
      </div>
    `;
  }

  /**
   * Update metrics with new data
   * @param {Object} metrics - New metrics data
   */
  update(metrics) {
    this.metrics = metrics;
    this.render();
  }

  /**
   * Destroy the panel and clean up
   */
  destroy() {
    if (this.container) {
      this.container.innerHTML = '';
    }
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SummaryMetricsPanel;
}
