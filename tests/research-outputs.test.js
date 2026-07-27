/**
 * Research output wiring
 * The renderers themselves need a DOM and were verified against the running
 * app. What is checkable here is that every section gets one, and that the
 * pure helpers behave.
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(join(repoRoot, path), 'utf8');

const RA = new Function(`${read('js/research-analytics.js')}\nreturn ResearchAnalytics;`)();
const { RESEARCH_SECTIONS } = new Function(
  `${read('js/research-scenarios.js')}\nreturn { RESEARCH_SECTIONS };`
)();

// research-outputs.js closes over ResearchAnalytics at call time, not load time,
// so it evaluates without a DOM as long as no renderer is invoked
const ResearchOutputs = new Function(
  'ResearchAnalytics',
  `${read('js/research-outputs.js')}\nreturn ResearchOutputs;`
)(RA);

/** Stub standing in for ResearchPanel's registration surface */
function stubPanel() {
  const registered = {};
  return {
    registered,
    registerRenderer(sectionId, renderer) {
      registered[sectionId] = renderer;
    }
  };
}

// ===== Registration coverage (Requirements 8.1, 8.4, 9.5, 11.6, 12.6, 13.7) =====

test('every section declared in the config gets a renderer', () => {
  const panel = stubPanel();
  ResearchOutputs.register(panel);

  RESEARCH_SECTIONS.forEach(section => {
    assert.strictEqual(
      typeof panel.registered[section.id],
      'function',
      `no renderer registered for "${section.id}"`
    );
  });
});

test('no renderer is registered for a section that does not exist', () => {
  const panel = stubPanel();
  ResearchOutputs.register(panel);

  const sectionIds = RESEARCH_SECTIONS.map(section => section.id);
  Object.keys(panel.registered).forEach(id => {
    assert.ok(sectionIds.includes(id), `renderer registered for unknown section "${id}"`);
  });
});

// ===== Structure codes (Requirement 8.3) =====

test('structureCode abbreviates the three structures and the mixed case', () => {
  assert.strictEqual(ResearchOutputs.structureCode('Iron Condor'), 'IC');
  assert.strictEqual(ResearchOutputs.structureCode('Bull Put Spread'), 'P');
  assert.strictEqual(ResearchOutputs.structureCode('Put Credit Spread'), 'P');
  assert.strictEqual(ResearchOutputs.structureCode('Bear Call Spread'), 'C');
  assert.strictEqual(ResearchOutputs.structureCode('Call Credit Spread'), 'C');
  assert.strictEqual(ResearchOutputs.structureCode('Mixed'), 'MIX');
});

test('structureCode falls back to an abbreviation for other strategies', () => {
  assert.strictEqual(ResearchOutputs.structureCode('Short Put'), 'SHO');
  assert.strictEqual(ResearchOutputs.structureCode('Butterfly Spread'), 'BUT');
});

test('structureCode returns null for no strategy', () => {
  assert.strictEqual(ResearchOutputs.structureCode(null), null);
  assert.strictEqual(ResearchOutputs.structureCode(''), null);
});

// ===== Table columns (Requirement 9.2) =====

test('the shared stat columns cover every metric winLossStats reports', () => {
  const reported = Object.keys(RA.winLossStats([
    { ProfitLoss: 100, Exit: new Date(), Strategy: 'Iron Condor' }
  ]));
  const columns = ResearchOutputs.STAT_COLUMNS.map(column => column.key);

  reported.forEach(key => {
    assert.ok(columns.includes(key), `no column renders "${key}"`);
  });
});

test('every stat column declares a label and a format', () => {
  ResearchOutputs.STAT_COLUMNS.forEach(column => {
    assert.ok(column.label, `label for ${column.key}`);
    assert.ok(['int', 'percent', 'currency'].includes(column.format), `format for ${column.key}`);
  });
});
