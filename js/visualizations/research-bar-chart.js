/**
 * Research Bar Chart Component
 * One bar per closed trade, ordered by entry date, drawn from a zero baseline:
 * gains up, losses down. Same-day trades stay as separate bars, which is what
 * distinguishes this from the calendar view of the same cut.
 *
 * Polarity is carried twice over — by direction from the baseline and by the
 * dashboard's profit/loss hues — so the sign survives for a reader who cannot
 * separate the two colors.
 */
class ResearchBarChart {
  /**
   * @param {string} containerId - DOM element id
   * @param {Object} data - barSeries() output, or null
   * @param {Object} options - Chart configuration
   */
  constructor(containerId, data = null, options = {}) {
    this.containerId = containerId;
    this.container = document.getElementById(containerId);

    if (!this.container) {
      console.error(`Container with id "${containerId}" not found`);
      return;
    }

    this.margin = { top: 16, right: 16, bottom: 56, left: 68 };
    this.options = {
      animationDuration: 500,
      minBarWidth: 14,
      // A handful of trades should read as a handful of bars, not as slabs
      // stretched to fill the container
      maxBarWidth: 48,
      barGap: 2,
      // Above this many bars a value on every bar is unreadable, so only the
      // extremes stay labelled and the tooltip carries the rest
      labelEveryBarUpTo: 150,
      ...options
    };

    this._initChart();
    this._setupResizeObserver();

    if (data) this.update(data);
  }

  _initChart() {
    this.container.innerHTML = '';

    this.svg = d3.select(`#${this.containerId}`)
      .append('svg')
      .attr('class', 'research-bar-svg');

    this.chartGroup = this.svg.append('g');
    // Paint order matters: the grid sits behind the bars, everything else in
    // front of them
    this.gridGroup = this.chartGroup.append('g').attr('class', 'grid');
    this.barsGroup = this.chartGroup.append('g').attr('class', 'bars');
    this.labelsGroup = this.chartGroup.append('g').attr('class', 'bar-labels');
    this.axisGroup = this.chartGroup.append('g').attr('class', 'axes');

    this.tooltip = d3.select('body')
      .append('div')
      .attr('class', 'chart-tooltip')
      .style('position', 'absolute')
      .style('visibility', 'hidden')
      .style('padding', '8px 10px')
      .style('border-radius', '6px')
      .style('font-size', '12px')
      .style('pointer-events', 'none')
      .style('z-index', '1000');
  }

  _setupResizeObserver() {
    this.resizeObserver = new ResizeObserver(() => {
      if (this.currentData) this._render();
    });
    this.resizeObserver.observe(this.container);
  }

  /**
   * @param {Object} data - barSeries() output: { trades, net, avgPerTrade, n }
   */
  update(data) {
    if (!data || !data.trades || !data.trades.length) {
      this._showEmptyState();
      return;
    }

    this.currentData = data;
    this._render();
  }

  destroy() {
    if (this.resizeObserver) this.resizeObserver.disconnect();
    if (this.tooltip) this.tooltip.remove();
    if (this.container) this.container.innerHTML = '';
  }

  _showEmptyState() {
    this.currentData = null;
    const colors = this._colors();

    this.svg.attr('width', '100%').attr('height', 160);
    this.barsGroup.selectAll('*').remove();
    this.labelsGroup.selectAll('*').remove();
    this.axisGroup.selectAll('*').remove();

    this.chartGroup.selectAll('.empty-state-text').remove();
    this.chartGroup.append('text')
      .attr('class', 'empty-state-text')
      .attr('x', 20)
      .attr('y', 80)
      .attr('fill', colors.textSecondary)
      .attr('font-size', '13px')
      .text('No closed trades in this cut.');
  }

  _colors() {
    return window.ThemeColors ? ThemeColors.get() : {
      profit: '#10b981',
      loss: '#ef4444',
      textPrimary: '#e5e7eb',
      textSecondary: '#9ca3af',
      gridLine: '#1f2937',
      zeroLine: '#9ca3af',
      tooltipBg: '#141b2d',
      tooltipBorder: '#1f2937'
    };
  }

  _render() {
    const colors = this._colors();
    const trades = this.currentData.trades;

    this.chartGroup.selectAll('.empty-state-text').remove();

    this.tooltip
      .style('background-color', colors.tooltipBg)
      .style('border', `1px solid ${colors.tooltipBorder}`)
      .style('color', colors.textPrimary);

    // A wide cut scrolls inside its own container rather than squeezing bars
    // below legibility
    const available = this.container.getBoundingClientRect().width
      - this.margin.left - this.margin.right;
    const minNeeded = trades.length * (this.options.minBarWidth + this.options.barGap);
    const maxUseful = trades.length * (this.options.maxBarWidth + this.options.barGap);

    // Grow past the container only when bars would otherwise fall below the
    // legibility floor; stop short of it when there are too few to fill it
    const plotWidth = Math.max(Math.min(available, maxUseful), minNeeded);
    const plotHeight = 300;

    // The SVG ends where the plot ends, so a narrow cut reads as a compact
    // chart rather than one stranded in a wide empty frame
    this.svg
      .attr('width', plotWidth + this.margin.left + this.margin.right)
      .attr('height', plotHeight + this.margin.top + this.margin.bottom);
    this.chartGroup.attr('transform', `translate(${this.margin.left},${this.margin.top})`);

    const x = d3.scaleBand()
      .domain(trades.map((trade, index) => index))
      .range([0, plotWidth])
      .paddingInner(this.options.barGap / (this.options.minBarWidth + this.options.barGap));

    // Fit the range the trades actually occupy while always including zero, so
    // an all-wins or all-losses cut uses the full height instead of leaving an
    // empty half where the other sign would have been
    const top = Math.max(d3.max(trades, trade => trade.net), 0);
    const bottom = Math.min(d3.min(trades, trade => trade.net), 0);
    const pad = (top - bottom) * 0.12 || 1;

    const y = d3.scaleLinear()
      .domain([bottom - (bottom < 0 ? pad : 0), top + (top > 0 ? pad : 0)])
      .range([plotHeight, 0]);

    this._renderAxes(x, y, plotWidth, plotHeight, colors, trades);
    this._renderBars(x, y, colors, trades);
    this._renderLabels(x, y, colors, trades, plotHeight);
  }

  _renderAxes(x, y, plotWidth, plotHeight, colors, trades) {
    this.axisGroup.selectAll('*').remove();
    this.gridGroup.selectAll('*').remove();

    // Hairline horizontal grid, one shade off the surface
    this.gridGroup.append('g')
      .call(d3.axisLeft(y).ticks(6).tickSize(-plotWidth).tickFormat(''))
      .call(group => group.select('.domain').remove())
      .selectAll('line')
      .attr('stroke', colors.gridLine)
      .attr('stroke-width', 1);

    this.axisGroup.append('g')
      .call(d3.axisLeft(y).ticks(6).tickFormat(value => this._formatCurrency(value, true)))
      .call(group => group.select('.domain').remove())
      .call(group => group.selectAll('line').remove())
      .selectAll('text')
      .attr('fill', colors.textSecondary)
      .attr('font-size', '11px');

    // The baseline every bar is measured from, drawn above the grid
    this.axisGroup.append('line')
      .attr('x1', 0)
      .attr('x2', plotWidth)
      .attr('y1', y(0))
      .attr('y2', y(0))
      .attr('stroke', colors.zeroLine)
      .attr('stroke-width', 1);

    // Date ticks thin out to whatever fits; every bar's date is in its tooltip
    const step = Math.max(1, Math.ceil(trades.length / Math.floor(plotWidth / 90)));
    const ticks = trades
      .map((trade, index) => ({ trade, index }))
      .filter(entry => entry.index % step === 0);

    const dateAxis = this.axisGroup.append('g')
      .attr('transform', `translate(0,${plotHeight})`);

    dateAxis.selectAll('text')
      .data(ticks)
      .enter()
      .append('text')
      .attr('x', entry => x(entry.index) + x.bandwidth() / 2)
      .attr('y', 18)
      .attr('text-anchor', 'end')
      .attr('transform', entry =>
        `rotate(-45,${x(entry.index) + x.bandwidth() / 2},18)`)
      .attr('fill', colors.textSecondary)
      .attr('font-size', '10px')
      .text(entry => entry.trade.date);
  }

  _renderBars(x, y, colors, trades) {
    const bars = this.barsGroup.selectAll('.research-bar')
      .data(trades.map((trade, index) => ({ ...trade, index })), entry => entry.index);

    bars.exit().remove();

    bars.enter()
      .append('rect')
      .attr('class', 'research-bar')
      .attr('rx', 2)
      .attr('ry', 2)
      .attr('y', y(0))
      .attr('height', 0)
      .on('mouseover', (event, entry) => this._showTooltip(event, entry))
      .on('mousemove', event => this._positionTooltip(event))
      .on('mouseout', () => this.tooltip.style('visibility', 'hidden'))
      .merge(bars)
      .attr('fill', entry => (entry.net >= 0 ? colors.profit : colors.loss))
      .attr('x', entry => x(entry.index))
      .attr('width', x.bandwidth())
      .transition()
      .duration(this.options.animationDuration)
      .attr('y', entry => (entry.net >= 0 ? y(entry.net) : y(0)))
      .attr('height', entry => Math.abs(y(entry.net) - y(0)));
  }

  _renderLabels(x, y, colors, trades, plotHeight) {
    // Requirement 8.5 asks for a value on every bar. That is legible for the
    // small cuts these scenarios were written against, but a year of 0DTE runs
    // to hundreds of bars where per-bar text becomes noise, so past the
    // threshold only the best and worst trade stay labelled.
    const labelAll = trades.length <= this.options.labelEveryBarUpTo;

    let labelled;
    if (labelAll) {
      labelled = trades.map((trade, index) => ({ ...trade, index }));
    } else {
      const indexed = trades.map((trade, index) => ({ ...trade, index }));
      const best = indexed.reduce((a, b) => (b.net > a.net ? b : a));
      const worst = indexed.reduce((a, b) => (b.net < a.net ? b : a));
      labelled = best.index === worst.index ? [best] : [best, worst];
    }

    const labels = this.labelsGroup.selectAll('.bar-label')
      .data(labelled, entry => entry.index);

    labels.exit().remove();

    labels.enter()
      .append('text')
      .attr('class', 'bar-label')
      .attr('text-anchor', 'middle')
      .style('pointer-events', 'none')
      .merge(labels)
      .attr('x', entry => x(entry.index) + x.bandwidth() / 2)
      // Outside the bar's end by default, flipped inside when that would put
      // the text past the edge of the plot
      .attr('y', entry => {
        if (entry.net >= 0) {
          const above = y(entry.net) - 6;
          return above < 10 ? y(entry.net) + 14 : above;
        }
        const below = y(entry.net) + 14;
        return below > plotHeight - 2 ? y(entry.net) - 6 : below;
      })
      .attr('fill', colors.textSecondary)
      .attr('font-size', trades.length > 60 ? '9px' : '10px')
      .text(entry => this._formatCurrency(entry.net, true));
  }

  _showTooltip(event, entry) {
    const colors = this._colors();
    const plColor = entry.net >= 0 ? colors.profit : colors.loss;
    const dte = entry.dte === null || entry.dte === undefined ? '—' : entry.dte;
    const width = entry.width === null || entry.width === undefined ? '—' : entry.width;

    this.tooltip
      .style('visibility', 'visible')
      .html(`
        <div style="font-weight: 600; margin-bottom: 4px;">${entry.date}</div>
        <div style="font-size: 11px; margin-bottom: 2px;">
          P/L: <span style="color: ${plColor}; font-weight: 600;">${this._formatCurrency(entry.net)}</span>
        </div>
        <div style="font-size: 11px; color: ${colors.textSecondary};">${entry.strategy || 'Unknown'}</div>
        <div style="font-size: 11px; color: ${colors.textSecondary};">DTE at entry: ${dte} · Width: ${width}</div>
      `);

    this._positionTooltip(event);
  }

  _positionTooltip(event) {
    const rect = this.tooltip.node().getBoundingClientRect();
    const offset = 15;

    let left = event.pageX + offset;
    let top = event.pageY + offset;

    if (left + rect.width > window.innerWidth) left = event.pageX - rect.width - offset;
    if (top + rect.height > window.innerHeight) top = event.pageY - rect.height - offset;

    this.tooltip.style('left', `${left}px`).style('top', `${top}px`);
  }

  _formatCurrency(value, compact = false) {
    if (value === null || value === undefined || isNaN(value)) return '—';

    const sign = value < 0 ? '-' : '';
    const abs = Math.abs(value);

    if (compact && abs >= 1000) {
      return `${sign}$${(abs / 1000).toFixed(1)}k`;
    }

    return `${sign}$${(compact ? Math.round(abs) : abs.toFixed(2))
      .toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
  }
}

if (typeof window !== 'undefined') {
  window.ResearchBarChart = ResearchBarChart;
}
