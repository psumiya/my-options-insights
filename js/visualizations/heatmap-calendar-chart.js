/**
 * Heatmap Calendar Chart Component
 * Renders a calendar heatmap showing daily P/L with color intensity
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6
 */
class HeatmapCalendarChart {
  /**
   * Create Heatmap Calendar Chart
   * @param {string} containerId - DOM element ID for the chart container
   * @param {Array} data - Array of {date, pl, tradeCount} objects
   * @param {Object} options - Chart configuration options
   */
  constructor(containerId, data = [], options = {}) {
    this.containerId = containerId;
    this.container = document.getElementById(containerId);

    if (!this.container) {
      console.error(`Container with id "${containerId}" not found`);
      return;
    }

    // Chart configuration
    this.margin = { top: 80, right: 120, bottom: 20, left: 120 };
    this.cellSize = 100; // Increased for text visibility on desktop
    this.cellGap = 4;
    this.options = {
      monthsToShow: 12,
      animationDuration: 750,
      ...options
    };

    // Initialize chart
    this._initChart();

    // Set up resize observer (Requirement 3.1)
    this._setupResizeObserver();

    // Render initial data
    if (data && data.length > 0) {
      this.update(data);
    }
  }

  /**
   * Initialize SVG and chart elements
   * @private
   */
  _initChart() {
    // Clear any existing content
    this.container.innerHTML = '';

    // Create SVG (dimensions will be set during render)
    this.svg = d3.select(`#${this.containerId}`)
      .append('svg')
      .attr('class', 'heatmap-calendar-svg');

    // Create main group for chart content
    this.chartGroup = this.svg.append('g')
      .attr('class', 'chart-content')
      .attr('transform', `translate(${this.margin.left},${this.margin.top})`);

    // Create groups for different chart elements
    this.monthLabelsGroup = this.chartGroup.append('g').attr('class', 'month-labels');
    this.cellsGroup = this.chartGroup.append('g').attr('class', 'cells-group');
    this.cellTextGroup = this.chartGroup.append('g').attr('class', 'cell-text-group');
    this.legendGroup = this.chartGroup.append('g').attr('class', 'legend-group');

    // Create tooltip
    this.tooltip = d3.select('body')
      .append('div')
      .attr('class', 'chart-tooltip')
      .style('position', 'absolute')
      .style('visibility', 'hidden')
      .style('background-color', '#141b2d')
      .style('border', '1px solid #1f2937')
      .style('border-radius', '4px')
      .style('padding', '8px 12px')
      .style('font-size', '12px')
      .style('pointer-events', 'none')
      .style('z-index', '1000')
      .style('box-shadow', '0 4px 6px rgba(0, 0, 0, 0.3)');

    // Initialize color scale (Requirement 3.3)
    // Red (loss) → White (neutral) → Green (profit)
    // Initialize color scale (Requirement 3.3)
    // Initialize color scale (Requirement 3.3)
    const colors = window.ThemeColors ? ThemeColors.get() : { loss: '#ef4444', surface: '#1f2937', profit: '#10b981' };
    this.colorScale = d3.scalePow()
      .exponent(0.6)
      .range([colors.loss, colors.surface, colors.profit])
      .clamp(true);
  }

  /**
   * Set up ResizeObserver for responsive behavior
   * @private
   */
  _setupResizeObserver() {
    this.resizeObserver = new ResizeObserver(() => {
      this.resize();
    });
    this.resizeObserver.observe(this.container);
  }

  /**
   * Update chart with new data
   * @param {Array} data - Array of daily P/L objects
   */
  update(data) {
    if (!data || data.length === 0) {
      this._showEmptyState();
      return;
    }

    // Remove empty state text if it exists
    if (this.chartGroup) {
      this.chartGroup.selectAll('.empty-state-text').remove();
    }

    this.data = data;
    this.currentData = data; // Store for theme updates

    // Update colors based on current theme
    if (window.ThemeColors) {
      const colors = ThemeColors.get();
      this.colorScale.range([colors.loss, colors.surface, colors.profit]);

      // Update tooltip styles
      this.tooltip
        .style('background-color', colors.tooltipBg)
        .style('border', `1px solid ${colors.tooltipBorder}`)
        .style('color', colors.textPrimary);
    }

    this._render();
  }

  /**
   * Render the chart
   * @private
   */
  _render() {
    // Get container dimensions
    const containerRect = this.container.getBoundingClientRect();
    const containerHeight = Math.max(containerRect.height - this.margin.top - this.margin.bottom, 200);

    // Process data and calculate date range (Requirement 3.6)
    this._processData();

    // Calculate optimal cell size based on available space
    // Calendar has 5 rows (weekdays only) and variable columns (weeks)
    const numWeeks = Math.ceil(d3.timeWeek.count(
      d3.timeWeek.floor(this.startDate),
      d3.timeWeek.ceil(this.endDate)
    ));

    // Use height-based sizing to maximize cell size
    // Account for gaps: 5 cells need 4 gaps between them
    const totalGapHeight = this.cellGap * 4;
    const availableHeightForCells = containerHeight - totalGapHeight;
    let targetCellSize = Math.floor(availableHeightForCells / 5);

    // Apply min/max constraints - increased for text visibility
    // Use larger minimum on desktop (80px) vs mobile (60px)
    const minCellSize = window.innerWidth >= 768 ? 80 : 60;
    this.cellSize = Math.min(Math.max(targetCellSize, minCellSize), 140);

    // Calculate actual width needed for the calendar
    const calendarWidth = numWeeks * (this.cellSize + this.cellGap);

    // Set width to the larger of container width or calendar width (allows horizontal scroll)
    this.width = Math.max(calendarWidth, containerRect.width - this.margin.left - this.margin.right);
    this.height = containerHeight;

    // Update SVG dimensions to accommodate full calendar
    const totalSvgWidth = this.width + this.margin.left + this.margin.right;
    const totalSvgHeight = this.height + this.margin.top + this.margin.bottom;

    this.svg
      .attr('width', totalSvgWidth)
      .attr('height', totalSvgHeight);

    // Update color scale domain based on P/L range
    const plValues = this.processedData.map(d => d.pl);
    const maxAbsPL = Math.max(Math.abs(d3.min(plValues) || 0), Math.abs(d3.max(plValues) || 0));
    this.colorScale.domain([-maxAbsPL, 0, maxAbsPL]);

    // Render calendar grid (Requirement 3.2)
    this._renderCalendar();

    // Render cell text
    this._renderCellText();

    // Render month labels (Requirement 3.2)
    this._renderMonthLabels();

    // Render legend
    this._renderLegend();
  }

  /**
   * Process data and filter to last N months
   * @private
   */
  _processData() {
    // Convert dates to Date objects and sort
    // Ensure dates are parsed in local timezone to avoid day-of-week shifts
    this.processedData = this.data.map(d => {
      let date;
      if (d.date instanceof Date) {
        date = d.date;
      } else if (typeof d.date === 'string') {
        // Parse YYYY-MM-DD in local timezone
        const parts = d.date.split('-');
        date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 12, 0, 0);
      } else {
        date = new Date(d.date);
      }
      return {
        date: date,
        pl: d.pl,
        tradeCount: d.tradeCount,
        // Optional short label (e.g. a structure code) shown beside the trade
        // count. Callers that omit it get the original count-only text.
        label: d.label || null
      };
    }).sort((a, b) => a.date - b.date);

    // Filter to last N months (Requirement 3.6)
    const endDate = new Date(Math.max(...this.processedData.map(d => d.date)));
    const startDate = new Date(endDate);
    startDate.setMonth(startDate.getMonth() - this.options.monthsToShow);

    this.processedData = this.processedData.filter(d => d.date >= startDate);

    // Calculate date range for calendar
    if (this.processedData.length > 0) {
      this.startDate = new Date(Math.min(...this.processedData.map(d => d.date)));
      this.endDate = new Date(Math.max(...this.processedData.map(d => d.date)));
    } else {
      const now = new Date();
      this.endDate = now;
      this.startDate = new Date(now);
      this.startDate.setMonth(this.startDate.getMonth() - this.options.monthsToShow);
    }

    // Create a map for quick lookup using local timezone
    this.dataMap = new Map();
    this.processedData.forEach(d => {
      // Format date in local timezone
      const year = d.date.getFullYear();
      const month = String(d.date.getMonth() + 1).padStart(2, '0');
      const day = String(d.date.getDate()).padStart(2, '0');
      const dateKey = `${year}-${month}-${day}`;
      this.dataMap.set(dateKey, d);
    });
  }

  /**
   * Render calendar grid with day cells
   * @private
   */
  _renderCalendar() {
    // Generate all dates in range
    const allDates = d3.timeDays(
      d3.timeWeek.floor(this.startDate),
      d3.timeWeek.ceil(this.endDate)
    );

    // Calculate position for each date (Requirement 3.2)
    // Filter out weekends (Saturday = 6, Sunday = 0)
    const cellData = allDates
      .filter(date => {
        const dayOfWeek = date.getDay();
        return dayOfWeek !== 0 && dayOfWeek !== 6; // Exclude Sunday and Saturday
      })
      .map(date => {
        // Format date in local timezone for lookup
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const dateKey = `${year}-${month}-${day}`;
        const data = this.dataMap.get(dateKey);

        // Calculate week-based position
        const weeksSinceStart = d3.timeWeek.count(d3.timeWeek.floor(this.startDate), date);
        const dayOfWeek = date.getDay();

        // Map day of week to row (Mon=0, Tue=1, Wed=2, Thu=3, Fri=4)
        const rowIndex = dayOfWeek - 1;

        return {
          date: date,
          x: weeksSinceStart * (this.cellSize + this.cellGap),
          y: rowIndex * (this.cellSize + this.cellGap),
          pl: data ? data.pl : null,
          tradeCount: data ? data.tradeCount : 0,
          label: data ? data.label : null,
          hasData: !!data
        };
      });

    // Bind data
    const cells = this.cellsGroup
      .selectAll('.calendar-cell')
      .data(cellData, d => d3.timeFormat('%Y-%m-%d')(d.date));

    // Enter
    const cellsEnter = cells.enter()
      .append('rect')
      .attr('class', 'calendar-cell')
      .attr('width', this.cellSize)
      .attr('height', this.cellSize)
      .attr('rx', 2)
      .attr('ry', 2)
      .attr('opacity', 0)
      .style('cursor', d => d.hasData ? 'pointer' : 'default');

    // Enter + Update
    cellsEnter.merge(cells)
      .on('mouseover', (event, d) => {
        if (d.hasData) {
          this._showTooltip(event, d);
        }
      })
      .on('mouseout', () => this._hideTooltip())
      .transition()
      .duration(this.options.animationDuration)
      .attr('x', d => d.x)
      .attr('y', d => d.y)
      .attr('fill', d => {
        const colors = window.ThemeColors ? ThemeColors.get() : { gridLine: '#1f2937' };
        if (!d.hasData) {
          // Empty days shown as grid line color (distinguishable from surface)
          return colors.gridLine;
        }
        // Color-code based on P/L (Requirement 3.3)
        return this.colorScale(d.pl);
      })
      .attr('stroke', d => {
        const colors = window.ThemeColors ? ThemeColors.get() : { surface: '#141b2d', background: '#0f172a' };
        return d.hasData ? colors.surface : colors.background;
      })
      .attr('stroke-width', 1)
      .attr('opacity', 1);

    // Exit
    cells.exit()
      .transition()
      .duration(this.options.animationDuration / 2)
      .attr('opacity', 0)
      .remove();
  }

  /**
   * Render text inside calendar cells
   * @private
   */
  _renderCellText() {
    // Generate all dates in range
    const allDates = d3.timeDays(
      d3.timeWeek.floor(this.startDate),
      d3.timeWeek.ceil(this.endDate)
    );

    // Calculate position for each date
    const cellData = allDates
      .filter(date => {
        const dayOfWeek = date.getDay();
        return dayOfWeek !== 0 && dayOfWeek !== 6;
      })
      .map(date => {
        // Format date in local timezone for lookup
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const dateKey = `${year}-${month}-${day}`;
        const data = this.dataMap.get(dateKey);

        const weeksSinceStart = d3.timeWeek.count(d3.timeWeek.floor(this.startDate), date);
        const dayOfWeek = date.getDay();
        const rowIndex = dayOfWeek - 1;

        return {
          date: date,
          x: weeksSinceStart * (this.cellSize + this.cellGap),
          y: rowIndex * (this.cellSize + this.cellGap),
          pl: data ? data.pl : null,
          tradeCount: data ? data.tradeCount : 0,
          label: data ? data.label : null,
          hasData: !!data
        };
      })
      .filter(d => d.hasData); // Only show text for cells with data

    // Calculate dynamic font sizes based on cell size
    const dateFontSize = Math.max(9, Math.min(this.cellSize * 0.14, 14));
    const plFontSize = Math.max(11, Math.min(this.cellSize * 0.18, 18));
    const tradeFontSize = Math.max(8, Math.min(this.cellSize * 0.12, 12));

    // Calculate dynamic positioning
    const dateYOffset = this.cellSize * 0.20;
    const plYOffset = this.cellSize * 0.50;
    const tradeYOffset = this.cellSize * 0.85;

    // Bind data for date labels
    const dateLabels = this.cellTextGroup
      .selectAll('.cell-date-text')
      .data(cellData, d => d3.timeFormat('%Y-%m-%d')(d.date));

    // Enter date labels
    const dateLabelsEnter = dateLabels.enter()
      .append('text')
      .attr('class', 'cell-date-text')
      .attr('text-anchor', 'middle')
      .attr('font-weight', '600')
      .attr('opacity', 0)
      .style('pointer-events', 'none');

    // Update date labels
    dateLabelsEnter.merge(dateLabels)
      .transition()
      .duration(this.options.animationDuration)
      .attr('x', d => d.x + this.cellSize / 2)
      .attr('y', d => d.y + dateYOffset)
      .attr('font-size', `${dateFontSize}px`)
      .attr('fill', d => {
        // Use contrasting text color based on background
        const bgColor = this.colorScale(d.pl);
        return this._getContrastColor(bgColor);
      })
      .attr('opacity', 1)
      .text(d => d3.timeFormat('%m/%d')(d.date));

    dateLabels.exit().remove();

    // Bind data for P/L labels
    const plLabels = this.cellTextGroup
      .selectAll('.cell-pl-text')
      .data(cellData, d => d3.timeFormat('%Y-%m-%d')(d.date));

    // Enter P/L labels
    const plLabelsEnter = plLabels.enter()
      .append('text')
      .attr('class', 'cell-pl-text')
      .attr('text-anchor', 'middle')
      .attr('font-weight', '700')
      .attr('opacity', 0)
      .style('pointer-events', 'none');

    // Update P/L labels
    plLabelsEnter.merge(plLabels)
      .transition()
      .duration(this.options.animationDuration)
      .attr('x', d => d.x + this.cellSize / 2)
      .attr('y', d => d.y + plYOffset)
      .attr('font-size', `${plFontSize}px`)
      .attr('fill', d => {
        const bgColor = this.colorScale(d.pl);
        return this._getContrastColor(bgColor);
      })
      .attr('opacity', 1)
      .text(d => this._formatCurrency(d.pl));

    plLabels.exit().remove();

    // Bind data for trade count labels
    const tradeLabels = this.cellTextGroup
      .selectAll('.cell-trade-text')
      .data(cellData, d => d3.timeFormat('%Y-%m-%d')(d.date));

    // Enter trade count labels
    const tradeLabelsEnter = tradeLabels.enter()
      .append('text')
      .attr('class', 'cell-trade-text')
      .attr('text-anchor', 'middle')
      .attr('font-weight', '500')
      .attr('opacity', 0)
      .style('pointer-events', 'none');

    // Update trade count labels
    tradeLabelsEnter.merge(tradeLabels)
      .transition()
      .duration(this.options.animationDuration)
      .attr('x', d => d.x + this.cellSize / 2)
      .attr('y', d => d.y + tradeYOffset)
      .attr('font-size', `${tradeFontSize}px`)
      .attr('fill', d => {
        const bgColor = this.colorScale(d.pl);
        return this._getContrastColor(bgColor);
      })
      .attr('opacity', 0.9)
      .text(d => {
        const count = `${d.tradeCount} trade${d.tradeCount !== 1 ? 's' : ''}`;
        return d.label ? `${d.tradeCount} · ${d.label}` : count;
      });

    tradeLabels.exit().remove();
  }

  /**
   * Get contrasting text color for background
   * @param {string} bgColor - Background color
   * @returns {string} - Contrasting text color
   * @private
   */
  _getContrastColor(bgColor) {
    // Convert color to RGB
    const rgb = d3.rgb(bgColor);

    // Calculate relative luminance
    const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;

    // Return black for light backgrounds, white for dark backgrounds
    return luminance > 0.5 ? '#1f2937' : '#ffffff';
  }

  /**
   * Render month labels above columns
   * @private
   */
  _renderMonthLabels() {
    // Calculate first day of each month in the range
    const months = [];
    let currentDate = new Date(this.startDate);
    currentDate.setDate(1);

    while (currentDate <= this.endDate) {
      const weeksSinceStart = d3.timeWeek.count(d3.timeWeek.floor(this.startDate), currentDate);
      months.push({
        date: new Date(currentDate),
        x: weeksSinceStart * (this.cellSize + this.cellGap),
        label: d3.timeFormat('%b %Y')(currentDate)
      });
      currentDate.setMonth(currentDate.getMonth() + 1);
    }

    // Bind data
    const labels = this.monthLabelsGroup
      .selectAll('.month-label')
      .data(months, d => d3.timeFormat('%Y-%m')(d.date));

    // Enter
    const labelsEnter = labels.enter()
      .append('text')
      .attr('class', 'month-label')
      .attr('fill', window.ThemeColors ? ThemeColors.get().textPrimary : '#e5e7eb')
      .attr('font-size', '12px')
      .attr('font-weight', '600')
      .attr('opacity', 0);

    // Enter + Update
    labelsEnter.merge(labels)
      .transition()
      .duration(this.options.animationDuration)
      .attr('x', d => d.x)
      .attr('y', -10)
      .attr('opacity', 1)
      .attr('fill', window.ThemeColors ? ThemeColors.get().textPrimary : '#e5e7eb')
      .text(d => d.label);

    // Exit
    labels.exit()
      .transition()
      .duration(this.options.animationDuration / 2)
      .attr('opacity', 0)
      .remove();

    // Add day of week labels on the left (weekdays only)
    const daysOfWeek = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    const dayLabels = this.monthLabelsGroup
      .selectAll('.day-label')
      .data(daysOfWeek);

    dayLabels.enter()
      .append('text')
      .attr('class', 'day-label')
      .merge(dayLabels)
      .attr('x', -10)
      .attr('y', (d, i) => i * (this.cellSize + this.cellGap) + this.cellSize / 2)
      .attr('text-anchor', 'end')
      .attr('dominant-baseline', 'middle')
      .attr('fill', '#9ca3af')
      .attr('font-size', '10px')
      .text(d => d);

    dayLabels.exit().remove();
  }

  /**
   * Render color legend
   * @private
   */
  _renderLegend() {
    const legendWidth = 200;
    const legendHeight = 10;
    const legendX = this.width - legendWidth;
    const legendY = -30;

    // Remove existing legend
    this.legendGroup.selectAll('*').remove();

    // Create gradient
    const defs = this.svg.select('defs').empty()
      ? this.svg.append('defs')
      : this.svg.select('defs');

    const gradient = defs.selectAll('#heatmap-gradient').data([null]);
    const gradientEnter = gradient.enter()
      .append('linearGradient')
      .attr('id', 'heatmap-gradient')
      .attr('x1', '0%')
      .attr('x2', '100%');

    const colors = window.ThemeColors ? ThemeColors.get() : { loss: '#ef4444', surface: '#1f2937', profit: '#10b981' };

    gradientEnter.append('stop')
      .attr('offset', '0%')
      .attr('stop-color', colors.loss);

    gradientEnter.append('stop')
      .attr('offset', '50%')
      .attr('stop-color', colors.surface);

    gradientEnter.append('stop')
      .attr('offset', '100%')
      .attr('stop-color', colors.profit);

    // Draw legend rectangle
    this.legendGroup.append('rect')
      .attr('x', legendX)
      .attr('y', legendY)
      .attr('width', legendWidth)
      .attr('height', legendHeight)
      .attr('fill', 'url(#heatmap-gradient)')
      .attr('stroke', '#1f2937')
      .attr('stroke-width', 1);

    // Add legend labels
    const plValues = this.processedData.map(d => d.pl);
    const minPL = d3.min(plValues) || 0;
    const maxPL = d3.max(plValues) || 0;

    this.legendGroup.append('text')
      .attr('x', legendX - 5)
      .attr('y', legendY + legendHeight / 2)
      .attr('text-anchor', 'end')
      .attr('dominant-baseline', 'middle')
      .attr('fill', '#9ca3af')
      .attr('font-size', '10px')
      .text(this._formatCurrency(minPL));

    this.legendGroup.append('text')
      .attr('x', legendX + legendWidth + 5)
      .attr('y', legendY + legendHeight / 2)
      .attr('text-anchor', 'start')
      .attr('dominant-baseline', 'middle')
      .attr('fill', '#9ca3af')
      .attr('font-size', '10px')
      .text(this._formatCurrency(maxPL));
  }

  /**
   * Show tooltip on hover (Requirement 3.4)
   * @param {Event} event - Mouse event
   * @param {Object} data - Cell data
   * @private
   */
  _showTooltip(event, data) {
    const plColor = data.pl >= 0 ? '#10b981' : '#ef4444';
    const dateStr = d3.timeFormat('%b %d, %Y')(data.date);

    this.tooltip
      .style('visibility', 'visible')
      .html(`
        <div style="color: #e5e7eb; font-weight: 600; margin-bottom: 4px;">
          ${dateStr}
        </div>
        <div style="color: #9ca3af; font-size: 11px; margin-bottom: 2px;">
          P/L: <span style="color: ${plColor}; font-weight: 600;">${this._formatCurrency(data.pl)}</span>
        </div>
        <div style="color: #9ca3af; font-size: 11px;">
          Trades: <span style="color: #e5e7eb; font-weight: 600;">${data.tradeCount}</span>
        </div>
        ${data.label ? `<div style="color: #9ca3af; font-size: 11px;">
          Structure: <span style="color: #e5e7eb; font-weight: 600;">${data.label}</span>
        </div>` : ''}
      `);

    this._positionTooltip(event);
  }

  /**
   * Position tooltip near cursor
   * @param {Event} event - Mouse event
   * @private
   */
  _positionTooltip(event) {
    const tooltipNode = this.tooltip.node();
    const tooltipRect = tooltipNode.getBoundingClientRect();
    const offset = 15;

    let left = event.pageX + offset;
    let top = event.pageY + offset;

    // Adjust if tooltip goes off screen
    if (left + tooltipRect.width > window.innerWidth) {
      left = event.pageX - tooltipRect.width - offset;
    }

    if (top + tooltipRect.height > window.innerHeight) {
      top = event.pageY - tooltipRect.height - offset;
    }

    this.tooltip
      .style('left', `${left}px`)
      .style('top', `${top}px`);
  }

  /**
   * Hide tooltip
   * @private
   */
  _hideTooltip() {
    this.tooltip.style('visibility', 'hidden');
  }

  /**
   * Format currency values
   * @param {number} value - Numeric value
   * @returns {string} - Formatted currency string
   * @private
   */
  _formatCurrency(value) {
    const sign = value >= 0 ? '+' : '';
    return sign + '$' + value.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  /**
   * Show empty state when no data
   * @private
   */
  _showEmptyState() {
    // Clear chart groups but keep SVG structure
    if (this.cellsGroup) this.cellsGroup.selectAll('*').remove();
    if (this.cellTextGroup) this.cellTextGroup.selectAll('*').remove();
    if (this.monthLabelsGroup) this.monthLabelsGroup.selectAll('*').remove();
    if (this.legendGroup) this.legendGroup.selectAll('*').remove();

    // Add empty state message to chart group
    if (this.chartGroup) {
      this.chartGroup.selectAll('.empty-state-text').remove();

      const containerRect = this.container.getBoundingClientRect();
      const width = containerRect.width - this.margin.left - this.margin.right;
      const height = containerRect.height - this.margin.top - this.margin.bottom;

      this.chartGroup.append('text')
        .attr('class', 'empty-state-text')
        .attr('x', width / 2)
        .attr('y', height / 2 - 10)
        .attr('text-anchor', 'middle')
        .attr('fill', '#9ca3af')
        .attr('font-size', '16px')
        .text('No calendar data available');

      this.chartGroup.append('text')
        .attr('class', 'empty-state-text')
        .attr('x', width / 2)
        .attr('y', height / 2 + 15)
        .attr('text-anchor', 'middle')
        .attr('fill', '#9ca3af')
        .attr('font-size', '12px')
        .text('Upload trades with close dates to see daily P/L patterns');
    }
  }

  /**
   * Resize chart to fit container
   */
  resize() {
    if (this.data && this.data.length > 0) {
      this._render();
    }
  }

  /**
   * Destroy chart and clean up resources
   */
  destroy() {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }

    if (this.tooltip) {
      this.tooltip.remove();
    }

    if (this.themeObserver) {
      this.themeObserver.disconnect();
    }

    if (this.container) {
      this.container.innerHTML = '';
    }
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = HeatmapCalendarChart;
}
