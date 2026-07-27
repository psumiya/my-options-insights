/**
 * Dashboard Controller Component
 * Orchestrates data flow between components and manages UI state
 * Requirements: 1.1, 8.3, 9.6, 12.1, 12.2, 12.3, 12.4, 12.5
 */
class DashboardController {
  constructor(dataStore, analyticsEngine, strategyDetector, csvParser) {
    this.dataStore = dataStore;
    this.analyticsEngine = analyticsEngine;
    this.strategyDetector = strategyDetector;
    this.csvParser = csvParser;

    // Visualization components
    this.visualizations = {};

    // Current enriched trades
    this.enrichedTrades = [];

    // Debounce timer for filter changes
    this.filterDebounceTimer = null;
    this.filterDebounceDelay = 300; // 300ms debounce (Requirement 8.3)

    // UI element references
    this.elements = {
      dashboard: document.getElementById('dashboard'),
      emptyState: document.getElementById('empty-state'),
      loadingSpinner: document.getElementById('loading-spinner'),
      toastContainer: document.getElementById('toast-container')
    };
  }

  /**
   * Initialize dashboard with visualization components
   * Sets up all chart instances and loads persisted data
   */
  initialize() {
    // Initialize visualization components
    this.visualizations = {
      summaryMetrics: new SummaryMetricsPanel('summary-metrics-panel'),
      tradeFlow: new SankeyDiagramChart('trade-flow-chart'),
      plTrend: new PLTrendChart('pl-trend-chart'),
      winRate: new WinRateChart('win-rate-chart'),
      plBreakdown: new PLBreakdownChart('pl-breakdown-chart'),
      symbolPL: new SymbolPLChart('symbol-pl-chart'),
      winLossDonut: new WinLossDonutChart('win-loss-donut-chart'),
      topUnderlyings: new TopUnderlyingsChart('top-underlyings-chart'),
      costBasis: new CostBasisChart('cost-basis-chart')
    };

    // Initialize Advanced Visualization Panel (Requirements: 2.1, 2.2)
    this.advancedVizPanel = new AdvancedVisualizationPanel('advanced-viz-panel', {
      showLoadingIndicator: true,
      loadingThreshold: 100 // Requirement 12.3
    });
    this.advancedVizPanel.initialize();

    // Research tab (Requirement 5.1)
    this.researchPanel = new ResearchPanel('research-panel');
    this.researchPanel.initialize();
    ResearchOutputs.register(this.researchPanel);

    this.initializePLMeasureToggle();

    // Register all advanced visualizations (Requirements: 2.3, 2.4)
    // Note: Pass factory functions instead of instances so charts are created
    // only when their tab container is ready
    this.advancedVizPanel.registerVisualization(
      'heatmap',
      'Calendar Heatmap',
      {
        instance: null,
        initialize: (container) => {
          if (!this.advancedVizPanel.charts) this.advancedVizPanel.charts = {};
          this.advancedVizPanel.charts.heatmap = new HeatmapCalendarChart(container.id);
          return this.advancedVizPanel.charts.heatmap;
        },
        update: (data) => {
          if (this.advancedVizPanel.charts?.heatmap) {
            const dailyPL = this.analyticsEngine.calculateDailyPL(data);
            this.advancedVizPanel.charts.heatmap.update(dailyPL);
          }
        }
      }
    );

    this.advancedVizPanel.registerVisualization(
      'scatter',
      'Days Held vs P/L',
      {
        instance: null,
        initialize: (container) => {
          if (!this.advancedVizPanel.charts) this.advancedVizPanel.charts = {};
          this.advancedVizPanel.charts.scatter = new ScatterPlotChart(container.id);
          return this.advancedVizPanel.charts.scatter;
        },
        update: (data) => {
          if (this.advancedVizPanel.charts?.scatter) {
            const scatterData = this.analyticsEngine.calculateScatterData(data);
            this.advancedVizPanel.charts.scatter.update(scatterData);
          }
        }
      }
    );

    this.advancedVizPanel.registerVisualization(
      'dteScatter',
      'Days to Expire (at Entry) vs P/L',
      {
        instance: null,
        initialize: (container) => {
          if (!this.advancedVizPanel.charts) this.advancedVizPanel.charts = {};
          this.advancedVizPanel.charts.dteScatter = new ScatterPlotChart(container.id, [], {
            xField: 'daysToExpire',
            xLabel: 'DTE at Entry'
          });
          return this.advancedVizPanel.charts.dteScatter;
        },
        update: (data) => {
          if (this.advancedVizPanel.charts?.dteScatter) {
            const scatterData = this.analyticsEngine.calculateScatterData(data);
            this.advancedVizPanel.charts.dteScatter.update(scatterData);
          }
        }
      }
    );

    this.advancedVizPanel.registerVisualization(
      'violin',
      'P/L Distribution',
      {
        instance: null,
        initialize: (container) => {
          if (!this.advancedVizPanel.charts) this.advancedVizPanel.charts = {};
          this.advancedVizPanel.charts.violin = new ViolinPlotChart(container.id);
          return this.advancedVizPanel.charts.violin;
        },
        update: (data) => {
          if (this.advancedVizPanel.charts?.violin) {
            const violinData = this.analyticsEngine.calculateViolinData(data);
            this.advancedVizPanel.charts.violin.update(violinData);
          }
        }
      }
    );


    this.advancedVizPanel.registerVisualization(
      'bubble',
      'Win Rate Analysis',
      {
        instance: null,
        initialize: (container) => {
          if (!this.advancedVizPanel.charts) this.advancedVizPanel.charts = {};
          this.advancedVizPanel.charts.bubble = new BubbleChart(container.id);
          return this.advancedVizPanel.charts.bubble;
        },
        update: (data) => {
          if (this.advancedVizPanel.charts?.bubble) {
            const bubbleData = this.analyticsEngine.calculateBubbleData(data);
            this.advancedVizPanel.charts.bubble.update(bubbleData);
          }
        }
      }
    );

    this.advancedVizPanel.registerVisualization(
      'radial',
      'Monthly Performance',
      {
        instance: null,
        initialize: (container) => {
          if (!this.advancedVizPanel.charts) this.advancedVizPanel.charts = {};
          this.advancedVizPanel.charts.radial = new RadialChart(container.id);
          return this.advancedVizPanel.charts.radial;
        },
        update: (data) => {
          if (this.advancedVizPanel.charts?.radial) {
            const radialData = this.analyticsEngine.calculateRadialData(data);
            this.advancedVizPanel.charts.radial.update(radialData);
          }
        }
      }
    );

    this.advancedVizPanel.registerVisualization(
      'waterfall',
      'P/L Attribution',
      {
        instance: null,
        initialize: (container) => {
          if (!this.advancedVizPanel.charts) this.advancedVizPanel.charts = {};
          this.advancedVizPanel.charts.waterfall = new WaterfallChart(container.id);
          return this.advancedVizPanel.charts.waterfall;
        },
        update: (data) => {
          if (this.advancedVizPanel.charts?.waterfall) {
            // Pass a high limit to get all symbols, let the chart handle filtering
            const waterfallData = this.analyticsEngine.calculateWaterfallData(data, 999);
            this.advancedVizPanel.charts.waterfall.update(waterfallData);
          }
        }
      }
    );

    this.advancedVizPanel.registerVisualization(
      'horizon',
      'Long-term Trends',
      {
        instance: null,
        initialize: (container) => {
          if (!this.advancedVizPanel.charts) this.advancedVizPanel.charts = {};
          this.advancedVizPanel.charts.horizon = new HorizonChart(container.id);
          return this.advancedVizPanel.charts.horizon;
        },
        update: (data) => {
          if (this.advancedVizPanel.charts?.horizon) {
            const horizonData = this.analyticsEngine.calculateHorizonData(data);
            this.advancedVizPanel.charts.horizon.update(horizonData);
          }
        }
      }
    );

    // Initialize collapsible section for table (Requirements: 1.1, 1.2, 1.3)
    this.collapsibleSection = new CollapsibleSection('symbol-strategy-section-container', {
      title: 'P/L by Symbol & Strategy',
      defaultExpanded: false, // Collapsed by default (Requirement 1.1)
      animationDuration: 300, // Smooth animation (Requirement 1.4)
      showSummary: true, // Show summary when collapsed (Requirement 1.5)
      summaryText: 'Loading...', // Initial summary text
      persistState: true, // Persist state to localStorage (Requirement 1.3)
      storageKey: 'symbol_strategy_table_state'
    });
    this.collapsibleSection.initialize();

    // Load persisted trades from data store
    const storedTrades = this.dataStore.loadTrades();

    if (storedTrades && storedTrades.length > 0) {
      // Enrich trades and show dashboard
      this.enrichedTrades = storedTrades.map(trade =>
        this.analyticsEngine.enrichTrade(trade)
      );
      this.showDashboard();
      this.refreshDashboard();
    } else {
      // Show empty state (Requirement 12.4)
      this.showEmptyState();
    }
  }

  /**
   * Handle CSV file upload
   * Orchestrates parsing, enrichment, and storage
   * @param {File} file - CSV file from file input
   */
  async handleFileUpload(file) {
    try {
      // Show loading spinner (Requirement 12.5)
      this.showLoading();

      // Parse CSV file (Requirement 1.1)
      const rawTrades = await this.csvParser.parse(file);

      // Enrich trades with computed fields
      this.enrichedTrades = rawTrades.map(trade => {
        // Apply strategy detection
        const detectedStrategy = this.strategyDetector.detect(trade);
        trade.Strategy = detectedStrategy;

        // Enrich with analytics
        return this.analyticsEngine.enrichTrade(trade);
      });

      // Save to data store
      try {
        this.dataStore.saveTrades(this.enrichedTrades);
      } catch (storageError) {
        console.warn('Failed to save to localStorage:', storageError);
        // Handle localStorage quota exceeded (Requirement 12.3)
        this.showToast(
          'Warning: Unable to save data to browser storage. Your trades will not persist after closing the browser.',
          'warning',
          5000
        );
      }

      // Hide loading and show dashboard
      this.hideLoading();
      this.showDashboard();
      this.refreshDashboard();

      // Show success notification (Requirement 12.2)
      this.showToast(
        `Successfully loaded ${this.enrichedTrades.length} trade${this.enrichedTrades.length !== 1 ? 's' : ''}`,
        'success'
      );

    } catch (error) {
      // Hide loading
      this.hideLoading();

      // Log detailed error for debugging
      console.error('File upload error:', error);

      // Show error modal with details (Requirement 12.1)
      this.showErrorModal(error);
    }
  }

  /**
   * Handle filter changes with debouncing
   * @param {Object} filters - New filter values
   */
  handleFilterChange(filters) {
    // Clear existing debounce timer
    if (this.filterDebounceTimer) {
      clearTimeout(this.filterDebounceTimer);
    }

    // Debounce filter updates (300ms delay)
    this.filterDebounceTimer = setTimeout(() => {
      // Save filter state
      this.dataStore.setFilters(filters);

      // Refresh dashboard with new filters
      this.refreshDashboard();
    }, this.filterDebounceDelay);
  }

  /**
   * Refresh all visualizations with current data and filters
   * Applies filters and updates all chart components
   */
  refreshDashboard() {
    if (!this.enrichedTrades || this.enrichedTrades.length === 0) {
      this.showEmptyState();
      return;
    }

    // Get current filters
    const filters = this.dataStore.getFilters();

    // Apply filters to trades
    let filteredTrades = this.enrichedTrades;

    // Apply date range filter (Requirement 8.3)
    filteredTrades = this.analyticsEngine.filterByDateRange(
      filteredTrades,
      filters.dateRange.type
    );

    // Apply position status filter (Requirement 9.6)
    filteredTrades = this.analyticsEngine.filterByStatus(
      filteredTrades,
      filters.positionStatus
    );

    // Note: Don't show empty state if we have enriched trades but filters result in no matches
    // Instead, let the visualizations show their own empty states

    // Calculate analytics data
    const summaryMetrics = this.analyticsEngine.calculateSummaryMetrics(filteredTrades);
    const monthlyPL = this.analyticsEngine.calculateMonthlyPL(filteredTrades);
    const winRateData = this.analyticsEngine.calculateWinRateByStrategy(filteredTrades);
    const plByStrategy = this.analyticsEngine.calculatePLBreakdown(filteredTrades, ['Strategy']);
    const plBySymbol = this.analyticsEngine.calculatePLBreakdown(filteredTrades, ['Symbol']);
    const plByTypeStrategy = this.analyticsEngine.calculatePLBreakdown(filteredTrades, ['Type', 'Strategy']);
    console.log('P/L by type/strategy:', plByTypeStrategy);

    const plBySymbolStrategy = this.analyticsEngine.calculatePLBreakdown(filteredTrades, ['Symbol', 'Strategy']);
    console.log('P/L by symbol/strategy:', plBySymbolStrategy);

    const winLossDistribution = this.analyticsEngine.calculateWinLossDistribution(filteredTrades);
    console.log('Win/Loss distribution:', winLossDistribution);

    const topUnderlyings = this.analyticsEngine.calculateTopUnderlyings(filteredTrades, 5);
    console.log('Top underlyings:', topUnderlyings);

    const costBasisData = this.analyticsEngine.calculateCostBasisBySymbol(filteredTrades);
    console.log('Cost basis by symbol:', costBasisData);

    // Update visualizations
    console.log('Updating visualizations...');
    try {
      this.visualizations.summaryMetrics.update(summaryMetrics);
      console.log('✓ Summary Metrics updated');
    } catch (e) {
      console.error('✗ Summary Metrics error:', e);
    }

    try {
      const sankeyData = this.analyticsEngine.calculateSankeyData(filteredTrades, 20);
      this.visualizations.tradeFlow.update(sankeyData);
      console.log('✓ Trade Flow updated');
    } catch (e) {
      console.error('✗ Trade Flow error:', e);
    }

    try {
      this.visualizations.plTrend.update(monthlyPL);
      console.log('✓ P/L Trend updated');
    } catch (e) {
      console.error('✗ P/L Trend error:', e);
    }

    try {
      this.visualizations.winRate.update(winRateData);
      console.log('✓ Win Rate updated');
    } catch (e) {
      console.error('✗ Win Rate error:', e);
    }

    try {
      this.visualizations.plBreakdown.update(plByStrategy);
      console.log('✓ P/L Breakdown updated');
    } catch (e) {
      console.error('✗ P/L Breakdown error:', e);
    }

    try {
      this.visualizations.symbolPL.update(plBySymbol);
      console.log('✓ Symbol P/L updated');
    } catch (e) {
      console.error('✗ Symbol P/L error:', e);
    }

    try {
      this.visualizations.winLossDonut.update(winLossDistribution);
      console.log('✓ Win/Loss Donut updated');
    } catch (e) {
      console.error('✗ Win/Loss Donut error:', e);
    }

    try {
      this.visualizations.topUnderlyings.update(topUnderlyings);
      console.log('✓ Top Underlyings updated');
    } catch (e) {
      console.error('✗ Top Underlyings error:', e);
    }

    try {
      this.visualizations.costBasis.update(costBasisData);
      console.log('✓ Cost Basis updated');
    } catch (e) {
      console.error('✗ Cost Basis error:', e);
    }

    // Update table
    try {
      this.updateTable(plBySymbolStrategy);
      console.log('✓ Table updated');
    } catch (e) {
      console.error('✗ Table error:', e);
    }

    // Update advanced visualization panel with filtered trades (Requirements: 12.1, 12.2)
    if (this.advancedVizPanel) {
      try {
        this.advancedVizPanel.update(filteredTrades);
        console.log('✓ Advanced Visualization Panel updated');
      } catch (e) {
        console.error('✗ Advanced Visualization Panel error:', e);
      }
    }

    // Update research tab with the same filtered set (Requirement 5.5)
    if (this.researchPanel) {
      try {
        this.researchPanel.update(filteredTrades);
        console.log('✓ Research Panel updated');
      } catch (e) {
        console.error('✗ Research Panel error:', e);
      }
    }

    console.log('=== refreshDashboard END ===');
  }

  /**
   * Update the Symbol & Strategy table
   * @param {Array} data - P/L breakdown data
   * @private
   */
  updateTable(data) {
    const table = document.getElementById('symbol-strategy-table');
    if (!table) return;

    const tbody = table.querySelector('tbody');
    tbody.innerHTML = '';

    if (data.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="4" class="text-center text-text-secondary py-8">
            No data available for current filters
          </td>
        </tr>
      `;

      // Update collapsible section summary (Requirement 1.5)
      if (this.collapsibleSection) {
        this.collapsibleSection.updateSummary('No data available');
      }
      return;
    }

    // Store original data for sorting (don't pre-sort here)
    this.tableData = [...data];

    const gross = this.plMeasure === 'gross';
    const valueOf = item => (gross ? item.plGross : item.pl);
    const countOf = item => (gross ? item.realizedCount : item.tradeCount);

    const visible = data
      .filter(item => countOf(item) > 0)
      .sort((a, b) => valueOf(b) - valueOf(a));

    visible.forEach(item => {
      const row = document.createElement('tr');
      const value = valueOf(item);
      const plColor = value >= 0 ? 'text-profit' : 'text-loss';

      row.innerHTML = `
        <td>${item.dimensions.Symbol || 'Unknown'}</td>
        <td>${item.dimensions.Strategy || 'Unknown'}</td>
        <td class="font-mono">${countOf(item)}</td>
        <td class="font-mono ${plColor}">${this.formatCurrency(value)}</td>
      `;

      tbody.appendChild(row);
    });

    // Update collapsible section summary with row count (Requirement 1.5)
    if (this.collapsibleSection) {
      const rowText = visible.length === 1 ? 'row' : 'rows';
      this.collapsibleSection.updateSummary(`${visible.length} ${rowText} available`);
    }
  }

  /**
   * Wire the net/gross toggle above the Symbol & Strategy table
   *
   * Net is what the position actually returned after costs. Gross matches the
   * P/L column of a broker statement, which reports commissions and fees
   * separately, so it is the measure to reconcile against.
   */
  initializePLMeasureToggle() {
    let stored = null;
    try {
      stored = localStorage.getItem('pl_measure');
    } catch (error) {
      console.warn('Could not read P/L measure preference:', error);
    }

    this.plMeasure = stored === 'gross' ? 'gross' : 'net';

    // Delegated, because CollapsibleSection rebuilds the section's innerHTML
    // when it initializes and would drop listeners bound to the buttons here
    document.addEventListener('click', event => {
      const button = event.target.closest('[data-pl-measure]');
      if (!button) return;

      this.plMeasure = button.dataset.plMeasure;
      try {
        localStorage.setItem('pl_measure', this.plMeasure);
      } catch (error) {
        console.warn('Could not persist P/L measure preference:', error);
      }
      this.syncPLMeasureToggle();
      if (this.tableData) this.updateTable(this.tableData);
    });

    this.syncPLMeasureToggle();
  }

  syncPLMeasureToggle() {
    const gross = this.plMeasure === 'gross';

    document.querySelectorAll('[data-pl-measure]').forEach(button => {
      const active = button.dataset.plMeasure === this.plMeasure;
      button.classList.toggle('active', active);
      button.setAttribute('aria-checked', String(active));
    });

    const column = document.getElementById('pl-measure-column');
    if (column) column.textContent = gross ? 'P/L (gross)' : 'P/L (net)';

    const caption = document.getElementById('pl-measure-caption');
    if (caption) {
      caption.textContent = gross
        ? 'Gross of commissions and fees, counting every retired leg including legs of positions still open. '
          + 'This is the measure that matches the P/L column of a broker statement.'
        : 'Net of commissions and fees, for positions that are fully closed. '
          + 'This is what each strategy actually returned.';
    }
  }

  /**
   * Show loading spinner
   * @private
   */
  showLoading() {
    if (this.elements.loadingSpinner) {
      this.elements.loadingSpinner.classList.remove('hidden');
    }
  }

  /**
   * Hide loading spinner
   * @private
   */
  hideLoading() {
    if (this.elements.loadingSpinner) {
      this.elements.loadingSpinner.classList.add('hidden');
    }
  }

  /**
   * Show dashboard and hide empty state
   * @private
   */
  showDashboard() {
    if (this.elements.dashboard) {
      this.elements.dashboard.classList.remove('hidden');
    }
    if (this.elements.emptyState) {
      this.elements.emptyState.classList.add('hidden');
    }
  }

  /**
   * Show empty state and hide dashboard
   * @private
   */
  showEmptyState() {
    if (this.elements.dashboard) {
      this.elements.dashboard.classList.add('hidden');
    }
    if (this.elements.emptyState) {
      this.elements.emptyState.classList.remove('hidden');
    }
  }

  /**
   * Show toast notification
   * @param {string} message - Notification message
   * @param {string} type - Notification type: 'success', 'error', 'warning'
   * @param {number} duration - Duration in milliseconds (default: 3000)
   */
  showToast(message, type = 'success', duration = 3000) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    // Icon based on type
    const icons = {
      success: '✓',
      error: '✕',
      warning: '⚠'
    };

    toast.innerHTML = `
      <div class="flex items-center gap-3">
        <span class="toast-icon">${icons[type] || icons.success}</span>
        <span>${message}</span>
      </div>
    `;

    this.elements.toastContainer.appendChild(toast);

    // Trigger animation
    setTimeout(() => {
      toast.classList.add('toast-show');
    }, 10);

    // Auto-remove after duration
    setTimeout(() => {
      toast.classList.remove('toast-show');
      setTimeout(() => {
        toast.remove();
      }, 300);
    }, duration);
  }

  /**
   * Show error modal with CSV parsing errors
   * @param {Error} error - Error object from CSV parser
   */
  showErrorModal(error) {
    // Create modal overlay
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center';
    modal.id = 'error-modal';

    // Format error message
    let errorMessage = error.message || 'An unknown error occurred';

    // Check if it's a ParseError with row numbers
    if (error.name === 'ParseError') {
      errorMessage = errorMessage.replace(/\n/g, '<br>');
    }

    modal.innerHTML = `
      <div class="bg-surface border border-border rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
        <div class="flex items-start justify-between mb-4">
          <h2 class="text-xl font-semibold text-loss">CSV Parsing Error</h2>
          <button id="close-error-modal" class="text-text-secondary hover:text-text-primary" aria-label="Close error modal">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        </div>
        <div class="bg-background border border-border rounded p-4 mb-4 font-mono text-sm overflow-x-auto">
          <pre class="whitespace-pre-wrap text-text-secondary">${errorMessage}</pre>
        </div>
        <div class="text-sm text-text-secondary mb-4">
          <p>Please check your CSV file and ensure:</p>
          <ul class="list-disc list-inside mt-2 space-y-1">
            <li>All required fields are present</li>
            <li>Date formats are valid (YYYY-MM-DD or MM/DD/YYYY)</li>
            <li>Numeric fields contain valid numbers</li>
            <li>No extra commas or special characters</li>
          </ul>
        </div>
        <button id="close-error-modal-btn" class="btn-primary w-full">Close</button>
      </div>
    `;

    document.body.appendChild(modal);

    // Add close handlers
    const closeModal = () => {
      modal.remove();
    };

    document.getElementById('close-error-modal').addEventListener('click', closeModal);
    document.getElementById('close-error-modal-btn').addEventListener('click', closeModal);

    // Close on overlay click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeModal();
      }
    });
  }

  /**
   * Clear all data and reset to empty state
   */
  clearData() {
    this.enrichedTrades = [];
    this.dataStore.clearTrades();
    this.showEmptyState();
  }

  /**
   * Format currency values
   * @param {number} value - Numeric value
   * @returns {string} - Formatted currency string
   * @private
   */
  formatCurrency(value) {
    const sign = value >= 0 ? '+$' : '-$';
    const absValue = Math.abs(value);
    return sign + absValue.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  /**
   * Destroy dashboard and clean up resources
   */
  destroy() {
    // Clear debounce timer
    if (this.filterDebounceTimer) {
      clearTimeout(this.filterDebounceTimer);
    }

    // Destroy all visualizations
    Object.values(this.visualizations).forEach(viz => {
      if (viz && typeof viz.destroy === 'function') {
        viz.destroy();
      }
    });

    this.visualizations = {};

    // Destroy advanced visualization panel
    if (this.advancedVizPanel && typeof this.advancedVizPanel.destroy === 'function') {
      this.advancedVizPanel.destroy();
      this.advancedVizPanel = null;
    }

    // Destroy collapsible section
    if (this.collapsibleSection && typeof this.collapsibleSection.destroy === 'function') {
      this.collapsibleSection.destroy();
      this.collapsibleSection = null;
    }
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DashboardController;
}
