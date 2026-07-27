/**
 * Research Panel
 * Owns the Research tab: the preset chips, the filter bar, and the output
 * sections. Holds no analysis logic of its own; every number comes from
 * ResearchAnalytics against the currently filtered set.
 *
 * Output components register themselves through registerRenderer(). A section
 * with no registered renderer shows its caption and trade count only, so the
 * provenance line is verifiable before the charts exist.
 */
class ResearchPanel {
  /**
   * @param {string} containerId - DOM element id to render into
   * @param {Object} options - { storageKey }
   */
  constructor(containerId, options = {}) {
    this.containerId = containerId;
    this.container = document.getElementById(containerId);
    this.storageKey = options.storageKey || 'research_filter_state';

    this.trades = [];
    this.underlyings = [];
    this.renderers = {};
    this.sections = {};
    this.renderedSections = {};
    this.activePresetId = null;

    // Whether the underlying was chosen deliberately (by the user, a preset, or
    // restored state) rather than defaulted. An underlying that was never chosen
    // must keep tracking the busiest symbol as more data arrives.
    this.underlyingExplicit = false;

    this.filter = {
      underlying: null,
      dteCut: 'all',
      structures: [
        ResearchAnalytics.STRUCTURES.IRON_CONDOR,
        ResearchAnalytics.STRUCTURES.PUT_CREDIT_SPREAD,
        ResearchAnalytics.STRUCTURES.CALL_CREDIT_SPREAD
      ]
    };

    this.params = { ...RESEARCH_SCENARIO_DEFAULTS };
  }

  /**
   * Build the panel chrome. Safe to call before any data has loaded.
   */
  initialize() {
    if (!this.container) {
      console.error(`ResearchPanel container "${this.containerId}" not found`);
      return;
    }

    this.container.innerHTML = `
      <section class="bg-surface border border-border rounded-lg p-4 mb-6" role="region" aria-label="Scenario presets">
        <div class="research-presets-label">Presets</div>
        <div class="research-presets" role="group" aria-label="Scenario preset chips"></div>
      </section>

      <section class="bg-surface border border-border rounded-lg p-4 mb-6" role="region" aria-label="Research filters">
        <div class="research-filter-bar">
          <div class="filter-group">
            <span class="filter-label" id="research-underlying-label">Underlying:</span>
            <select class="research-select" aria-labelledby="research-underlying-label"></select>
          </div>

          <div class="filter-group">
            <span class="filter-label">Days to expiration:</span>
            <div class="filter-button-group" role="radiogroup" aria-label="DTE cut">
              <button class="filter-btn" data-research-dte="all" role="radio" aria-checked="false">All</button>
              <button class="filter-btn" data-research-dte="zero" role="radio" aria-checked="false">0DTE</button>
              <button class="filter-btn" data-research-dte="nonzero" role="radio" aria-checked="false">Over 0DTE</button>
            </div>
          </div>

          <div class="filter-group">
            <span class="filter-label">Structures:</span>
            <div class="filter-button-group" role="group" aria-label="Structure selection"></div>
          </div>
        </div>
        <p class="research-filter-hint">
          Closed trades only; open positions have no realized outcome to analyze.
          Deselect every structure to drop the structure filter and include all strategies.
        </p>
      </section>

      <div class="research-notice" role="status" hidden></div>
      <div class="research-sections"></div>
    `;

    this.elements = {
      presets: this.container.querySelector('.research-presets'),
      select: this.container.querySelector('.research-select'),
      dteButtons: [...this.container.querySelectorAll('[data-research-dte]')],
      structureGroup: this.container.querySelector('[aria-label="Structure selection"]'),
      notice: this.container.querySelector('.research-notice'),
      sections: this.container.querySelector('.research-sections')
    };

    this.loadFilterState();
    this.buildStructureButtons();
    this.buildPresetChips();
    this.buildSections();
    this.bindFilterEvents();
  }

  /**
   * Register the component that renders one output section
   * @param {string} sectionId - Section id from RESEARCH_SECTIONS
   * @param {Function} renderer - (container, context) => void
   */
  registerRenderer(sectionId, renderer) {
    this.renderers[sectionId] = renderer;
    this.renderedSections[sectionId] = false;
  }

  /**
   * Supply the current trade set and re-render
   * @param {Array} enrichedTrades - Enriched trades from the dashboard
   */
  update(enrichedTrades) {
    this.trades = enrichedTrades || [];
    this.refreshUnderlyings();
    this.syncControls();
    this.renderOutputs();
  }

  /**
   * @returns {Object} - A copy of the active filter state
   */
  getFilterState() {
    return {
      underlying: this.filter.underlying,
      dteCut: this.filter.dteCut,
      structures: this.filter.structures ? this.filter.structures.slice() : null
    };
  }

  /**
   * Apply a preset's filters and bring its output into view
   * @param {string} presetId - Preset id
   */
  applyPreset(presetId) {
    const preset = RESEARCH_PRESETS.find(entry => entry.id === presetId);
    if (!preset) return;

    this.filter = {
      underlying: preset.filter.underlying,
      dteCut: preset.filter.dteCut || 'all',
      structures: preset.filter.structures ? preset.filter.structures.slice() : null
    };
    this.params = { ...RESEARCH_SCENARIO_DEFAULTS, ...(preset.params || {}) };
    this.activePresetId = presetId;
    this.underlyingExplicit = true;

    this.saveFilterState();
    this.syncControls();
    this.renderOutputs();
    this.focusSection(preset.focus);
  }

  destroy() {
    Object.values(this.sections).forEach(section => {
      if (section.collapsible && section.collapsible.destroy) {
        section.collapsible.destroy();
      }
    });
    this.sections = {};
    if (this.container) this.container.innerHTML = '';
  }

  // ===== control construction =====

  buildStructureButtons() {
    const structures = [
      ResearchAnalytics.STRUCTURES.IRON_CONDOR,
      ResearchAnalytics.STRUCTURES.PUT_CREDIT_SPREAD,
      ResearchAnalytics.STRUCTURES.CALL_CREDIT_SPREAD
    ];

    this.elements.structureGroup.innerHTML = structures.map(structure => `
      <button class="filter-btn" data-research-structure="${structure}"
              role="checkbox" aria-checked="false">
        ${ResearchAnalytics.structureLabel(structure)}
      </button>
    `).join('');

    this.elements.structureButtons =
      [...this.elements.structureGroup.querySelectorAll('[data-research-structure]')];
  }

  buildPresetChips() {
    this.elements.presets.innerHTML = RESEARCH_PRESETS.map(preset => `
      <button class="research-chip" data-research-preset="${preset.id}">
        ${preset.title}
      </button>
    `).join('');

    this.elements.presets.querySelectorAll('[data-research-preset]').forEach(chip => {
      chip.addEventListener('click', () => {
        if (chip.disabled) return;
        this.applyPreset(chip.dataset.researchPreset);
      });
    });
  }

  buildSections() {
    this.elements.sections.innerHTML = RESEARCH_SECTIONS.map(section => `
      <div class="research-section" data-research-section="${section.id}">
        <div id="research-section-${section.id}">
          <div class="research-section-body"></div>
        </div>
      </div>
    `).join('');

    RESEARCH_SECTIONS.forEach(section => {
      const collapsible = new CollapsibleSection(`research-section-${section.id}`, {
        title: section.title,
        defaultExpanded: section.defaultExpanded,
        storageKey: `research_section_${section.id}`
      });
      collapsible.initialize();

      const wrapper = this.elements.sections
        .querySelector(`[data-research-section="${section.id}"]`);

      this.sections[section.id] = {
        config: section,
        collapsible: collapsible,
        wrapper: wrapper,
        body: wrapper.querySelector('.research-section-body')
      };

      // CollapsibleSection exposes no toggle callback, so listen after its own
      // handler and read the state it just committed. Deferred sections render
      // the first time they are opened.
      const header = wrapper.querySelector('.collapsible-header');
      if (header) {
        header.addEventListener('click', () => this.renderSection(section.id));
      }
    });
  }

  bindFilterEvents() {
    this.elements.select.addEventListener('change', () => {
      this.filter.underlying = this.elements.select.value || null;
      this.underlyingExplicit = true;
      this.onManualFilterChange();
    });

    this.elements.dteButtons.forEach(button => {
      button.addEventListener('click', () => {
        this.filter.dteCut = button.dataset.researchDte;
        this.onManualFilterChange();
      });
    });

    this.elements.structureButtons.forEach(button => {
      button.addEventListener('click', () => {
        const structure = button.dataset.researchStructure;
        const active = this.filter.structures || [];
        this.filter.structures = active.indexOf(structure) === -1
          ? active.concat([structure])
          : active.filter(entry => entry !== structure);
        this.onManualFilterChange();
      });
    });
  }

  /**
   * A hand-set filter is no longer the preset that seeded it
   */
  onManualFilterChange() {
    this.activePresetId = null;
    this.saveFilterState();
    this.syncControls();
    this.renderOutputs();
  }

  // ===== state =====

  refreshUnderlyings() {
    const counts = new Map();

    this.trades.forEach(trade => {
      if (!trade.Exit || !trade.Symbol) return;
      counts.set(trade.Symbol, (counts.get(trade.Symbol) || 0) + 1);
    });

    this.underlyings = [...counts.entries()]
      .sort((a, b) => (b[1] - a[1]) || (a[0] < b[0] ? -1 : 1))
      .map(([symbol, count]) => ({ symbol, count }));

    // Default to the underlying with the most closed trades. A defaulted
    // selection is recomputed on every update, because the first update can
    // arrive on a partial set where a different symbol happens to lead; only a
    // deliberate choice pins the selection.
    const known = this.underlyings.some(entry => entry.symbol === this.filter.underlying);
    if (!known || !this.underlyingExplicit) {
      this.filter.underlying = this.underlyings.length ? this.underlyings[0].symbol : null;
    }
  }

  loadFilterState() {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (!stored) return;

      const parsed = JSON.parse(stored);
      if (parsed.underlying !== undefined && parsed.underlying !== null) {
        this.filter.underlying = parsed.underlying;
        this.underlyingExplicit = true;
      }
      if (parsed.dteCut) this.filter.dteCut = parsed.dteCut;
      if (parsed.structures !== undefined) {
        this.filter.structures = parsed.structures ? parsed.structures.slice() : null;
      }
      if (parsed.activePresetId) this.activePresetId = parsed.activePresetId;
    } catch (error) {
      console.warn('Could not restore research filter state:', error);
    }
  }

  saveFilterState() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify({
        underlying: this.filter.underlying,
        dteCut: this.filter.dteCut,
        structures: this.filter.structures,
        activePresetId: this.activePresetId
      }));
    } catch (error) {
      console.warn('Could not persist research filter state:', error);
    }
  }

  /**
   * Push filter state into the controls, including which presets are reachable
   */
  syncControls() {
    const selected = this.filter.underlying;

    this.elements.select.innerHTML = this.underlyings.length
      ? this.underlyings.map(entry => `
          <option value="${entry.symbol}" ${entry.symbol === selected ? 'selected' : ''}>
            ${entry.symbol} (${entry.count})
          </option>
        `).join('')
      : '<option value="">No closed trades</option>';

    this.elements.dteButtons.forEach(button => {
      const active = button.dataset.researchDte === this.filter.dteCut;
      button.classList.toggle('active', active);
      button.setAttribute('aria-checked', String(active));
    });

    const structures = this.filter.structures || [];
    this.elements.structureButtons.forEach(button => {
      const active = structures.indexOf(button.dataset.researchStructure) !== -1;
      button.classList.toggle('active', active);
      button.setAttribute('aria-checked', String(active));
    });

    const available = new Set(this.underlyings.map(entry => entry.symbol));
    this.elements.presets.querySelectorAll('[data-research-preset]').forEach(chip => {
      const preset = RESEARCH_PRESETS.find(entry => entry.id === chip.dataset.researchPreset);
      const reachable = !preset.filter.underlying || available.has(preset.filter.underlying);

      chip.disabled = !reachable;
      chip.classList.toggle('disabled', !reachable);
      chip.classList.toggle('active', reachable && preset.id === this.activePresetId);
      chip.title = reachable
        ? `Apply: ${ResearchAnalytics.describeFilter(preset.filter)}`
        : `${preset.filter.underlying} has no closed trades in this dataset`;
    });
  }

  // ===== rendering =====

  renderOutputs() {
    const result = ResearchAnalytics.applyFilter(this.trades, this.getFilterState());
    this.filtered = result.trades;
    this.excluded = result.excluded;

    this.renderNotice();

    // A filter change invalidates every section, including collapsed ones
    RESEARCH_SECTIONS.forEach(section => { this.renderedSections[section.id] = false; });
    RESEARCH_SECTIONS.forEach(section => this.renderSection(section.id));
  }

  /**
   * Render one section, if it is open and not already current
   * @param {string} sectionId - Section id
   */
  renderSection(sectionId) {
    const section = this.sections[sectionId];
    if (!section) return;

    if (!section.collapsible.isExpanded()) return;
    if (this.renderedSections[sectionId]) return;

    const filter = this.getFilterState();
    const caption = ResearchAnalytics.buildCaption(filter, {
      n: this.filtered.length,
      excluded: {
        unmappedStructure: this.excluded.unmappedStructure,
        structureNotSelected: this.excluded.structureNotSelected,
        missingDte: this.excluded.missingDte
      }
    });

    section.body.innerHTML = '';

    if (!this.filtered.length) {
      section.body.innerHTML = `
        <p class="research-empty">
          No closed trades match ${ResearchAnalytics.describeFilter(filter)}.
        </p>
      `;
      section.collapsible.updateSummary('no matching trades');
      this.renderedSections[sectionId] = true;
      return;
    }

    const captionElement = document.createElement('p');
    captionElement.className = 'research-caption';
    captionElement.textContent = caption;
    section.body.appendChild(captionElement);

    const outputElement = document.createElement('div');
    outputElement.className = 'research-output';
    section.body.appendChild(outputElement);

    const renderer = this.renderers[sectionId];
    if (renderer) {
      try {
        renderer(outputElement, {
          trades: this.filtered,
          filter: filter,
          params: this.params,
          excluded: this.excluded
        });
      } catch (error) {
        console.error(`Research section "${sectionId}" failed to render:`, error);
        outputElement.innerHTML =
          '<p class="research-empty">This output could not be rendered.</p>';
      }
    } else {
      outputElement.innerHTML =
        '<p class="research-pending">Awaiting its output component.</p>';
    }

    section.collapsible.updateSummary(`${this.filtered.length} trades`);
    this.renderedSections[sectionId] = true;
  }

  /**
   * Warn when P/L in this cut is gross of fees
   * Brokers whose exports carry no commission or fee columns cannot be netted,
   * and a silently gross figure is worse than a stated one.
   */
  renderNotice() {
    const withoutFees = this.filtered.filter(trade =>
      !trade._metadata || trade._metadata.feesAvailable !== true
    ).length;

    // Positions opened before the export window have no cost basis here, so
    // their P/L is the closing side only and will not tie to a broker statement
    const withoutBasis = this.filtered.filter(trade =>
      trade._metadata && trade._metadata.incompleteBasis
    ).length;

    const notices = [];

    if (withoutFees) {
      notices.push(withoutFees === this.filtered.length
        ? 'This broker export carries no commission or fee columns, so every P/L figure below is gross of fees.'
        : `${withoutFees} of ${this.filtered.length} trades have no commission or fee data, so their P/L is gross of fees.`);
    }

    if (withoutBasis) {
      notices.push(`${withoutBasis} trade${withoutBasis === 1 ? ' was' : 's were'} opened before this export begins, `
        + 'so only the closing side is known and their P/L is understated. Re-export covering the opening dates to fix.');
    }

    if (!notices.length) {
      this.elements.notice.hidden = true;
      this.elements.notice.textContent = '';
      return;
    }

    this.elements.notice.hidden = false;
    this.elements.notice.textContent = notices.join(' ');
  }

  focusSection(sectionId) {
    const section = this.sections[sectionId];
    if (!section) return;

    if (!section.collapsible.isExpanded()) {
      section.collapsible.expand();
      this.renderSection(sectionId);
    }

    section.wrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

if (typeof window !== 'undefined') {
  window.ResearchPanel = ResearchPanel;
}
