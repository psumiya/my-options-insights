/**
 * Research Scenarios
 * The fixed cuts worth reviewing every time, as data. Adding one is an edit to
 * this array; nothing in the rendering path needs to change.
 *
 * These are inherited verbatim from the external build spec and are SPX-
 * specific. A preset naming an underlying the loaded dataset does not contain
 * renders disabled rather than silently showing an empty result.
 *
 * Each entry carries:
 *   id        stable identifier, also the localStorage value for the active chip
 *   title     chip label
 *   filter    { underlying, dteCut, structures } applied on click
 *   focus     id of the output section scrolled into view
 *   params    optional per-output parameters, merged over the panel defaults
 */

const RESEARCH_SCENARIO_DEFAULTS = {
  counterfactualWidths: [10, 15, 20, 25],
  concentrationTopN: [3, 5],
  significance: { column: 'Width', threshold: 20, comparison: 'ge' }
};

const RESEARCH_PRESETS = [
  {
    id: 'spx_0dte_all_structures',
    title: 'SPX 0DTE — condors vs single-sided',
    filter: {
      underlying: 'SPX',
      dteCut: 'zero',
      structures: ['iron_condor', 'put_credit_spread', 'call_credit_spread']
    },
    focus: 'calendar'
  },
  {
    id: 'spx_0dte_condor_only',
    title: 'SPX 0DTE iron condors only',
    filter: { underlying: 'SPX', dteCut: 'zero', structures: ['iron_condor'] },
    focus: 'bar'
  },
  {
    id: 'spx_condor_nonzero_dte',
    title: 'SPX iron condors, excluding 0DTE',
    filter: { underlying: 'SPX', dteCut: 'nonzero', structures: ['iron_condor'] },
    focus: 'bar'
  },
  {
    id: 'spx_dte_buckets',
    title: 'SPX by days to expiration',
    filter: { underlying: 'SPX', dteCut: 'all', structures: null },
    focus: 'dte-buckets'
  },
  {
    id: 'spx_condor_vs_single_side',
    title: 'SPX condor vs single-sided, all DTE',
    filter: {
      underlying: 'SPX',
      dteCut: 'all',
      structures: ['iron_condor', 'put_credit_spread', 'call_credit_spread']
    },
    focus: 'structure-split'
  },
  {
    id: 'spx_put_spread_width_breakdown',
    title: 'SPX put credit spread by width',
    filter: { underlying: 'SPX', dteCut: 'all', structures: ['put_credit_spread'] },
    focus: 'width-breakdown'
  },
  {
    id: 'spx_put_spread_width_counterfactual',
    title: 'SPX put credit spread — uniform width',
    filter: { underlying: 'SPX', dteCut: 'all', structures: ['put_credit_spread'] },
    focus: 'width-counterfactual',
    params: { counterfactualWidths: [10, 15, 20, 25] }
  },
  {
    id: 'spx_runs_test',
    title: 'SPX streak check',
    filter: { underlying: 'SPX', dteCut: 'all', structures: null },
    focus: 'runs-test'
  },
  {
    id: 'spx_loss_concentration',
    title: 'SPX loss concentration',
    filter: { underlying: 'SPX', dteCut: 'all', structures: null },
    focus: 'loss-concentration',
    params: { concentrationTopN: [3, 5] }
  },
  {
    id: 'spx_put_spread_width20_significance',
    title: 'SPX put credit spread — is the width-20 pattern real',
    filter: { underlying: 'SPX', dteCut: 'all', structures: ['put_credit_spread'] },
    focus: 'significance',
    params: { significance: { column: 'Width', threshold: 20, comparison: 'ge' } }
  }
];

/**
 * The output sections, in render order. Calendar and bar views carry the
 * headline picture and open by default; the tables and statistics are opt-in
 * so the tab does not land as a wall of numbers.
 */
const RESEARCH_SECTIONS = [
  { id: 'calendar', title: 'Calendar', defaultExpanded: true },
  { id: 'bar', title: 'Trade by trade', defaultExpanded: true },
  { id: 'dte-buckets', title: 'By days to expiration', defaultExpanded: false },
  { id: 'structure-split', title: 'Condor vs single-sided', defaultExpanded: false },
  { id: 'width-breakdown', title: 'By spread width', defaultExpanded: false },
  { id: 'width-counterfactual', title: 'Uniform-width counterfactual', defaultExpanded: false },
  { id: 'runs-test', title: 'Streak check', defaultExpanded: false },
  { id: 'loss-concentration', title: 'Loss concentration', defaultExpanded: false },
  { id: 'significance', title: 'Threshold significance', defaultExpanded: false }
];

if (typeof window !== 'undefined') {
  window.RESEARCH_PRESETS = RESEARCH_PRESETS;
  window.RESEARCH_SECTIONS = RESEARCH_SECTIONS;
  window.RESEARCH_SCENARIO_DEFAULTS = RESEARCH_SCENARIO_DEFAULTS;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { RESEARCH_PRESETS, RESEARCH_SECTIONS, RESEARCH_SCENARIO_DEFAULTS };
}
