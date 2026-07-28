/**
 * Research scenario configuration and caption provenance
 * This file covers the parts that hold regardless of rendering. ResearchPanel
 * itself is DOM-bound and was verified against the running app: preset
 * enable/disable, filter sync, lazy section rendering, caption updates on
 * filter change, and state restored across a reload.
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const load = (path, expression) => new Function(
  `${readFileSync(join(repoRoot, path), 'utf8')}\nreturn ${expression};`
)();

const RA = load('js/research-analytics.js', 'ResearchAnalytics');
const { RESEARCH_PRESETS, RESEARCH_SECTIONS, RESEARCH_SCENARIO_DEFAULTS } = load(
  'js/research-scenarios.js',
  '{ RESEARCH_PRESETS, RESEARCH_SECTIONS, RESEARCH_SCENARIO_DEFAULTS }'
);

// ===== Preset configuration (Requirements 6.2, 6.6) =====

test('the seeded preset list covers all nine cuts', () => {
  assert.strictEqual(RESEARCH_PRESETS.length, 9);
});

test('preset ids are unique', () => {
  const ids = RESEARCH_PRESETS.map(preset => preset.id);
  assert.strictEqual(new Set(ids).size, ids.length);
});

test('every preset carries an id, title, filter and focus', () => {
  RESEARCH_PRESETS.forEach(preset => {
    assert.ok(preset.id, 'id');
    assert.ok(preset.title, `title for ${preset.id}`);
    assert.ok(preset.filter, `filter for ${preset.id}`);
    assert.ok(preset.focus, `focus for ${preset.id}`);
  });
});

test('every preset focuses a section that exists', () => {
  const sectionIds = RESEARCH_SECTIONS.map(section => section.id);

  RESEARCH_PRESETS.forEach(preset => {
    assert.ok(
      sectionIds.includes(preset.focus),
      `${preset.id} focuses unknown section "${preset.focus}"`
    );
  });
});

test('every preset uses a valid DTE cut', () => {
  const valid = Object.keys(RA.DTE_CUT_LABELS);

  RESEARCH_PRESETS.forEach(preset => {
    assert.ok(
      valid.includes(preset.filter.dteCut),
      `${preset.id} has DTE cut "${preset.filter.dteCut}"`
    );
  });
});

test('every preset names only canonical structures', () => {
  const valid = Object.values(RA.STRUCTURES);

  RESEARCH_PRESETS.forEach(preset => {
    const structures = preset.filter.structures;
    if (structures === null) return;

    structures.forEach(structure => {
      assert.ok(valid.includes(structure), `${preset.id} names "${structure}"`);
    });
  });
});

test('the cuts needing every strategy in scope use a null structure filter', () => {
  // DTE buckets, streak check and loss concentration are asked of the whole
  // book, not just the three structures the tab otherwise focuses on
  ['spx_dte_buckets', 'spx_runs_test', 'spx_loss_concentration'].forEach(id => {
    const preset = RESEARCH_PRESETS.find(entry => entry.id === id);
    assert.strictEqual(preset.filter.structures, null, id);
  });
});

test('preset params only override known defaults', () => {
  const known = Object.keys(RESEARCH_SCENARIO_DEFAULTS);

  RESEARCH_PRESETS.forEach(preset => {
    Object.keys(preset.params || {}).forEach(key => {
      assert.ok(known.includes(key), `${preset.id} sets unknown param "${key}"`);
    });
  });
});

// ===== Section configuration (Requirement 15.4) =====

test('section ids are unique', () => {
  const ids = RESEARCH_SECTIONS.map(section => section.id);
  assert.strictEqual(new Set(ids).size, ids.length);
});

test('the bar and calendar views open by default, in that order, and nothing else does', () => {
  const expanded = RESEARCH_SECTIONS
    .filter(section => section.defaultExpanded)
    .map(section => section.id);

  assert.deepStrictEqual(expanded, ['bar', 'calendar']);
});

test('every section has a title', () => {
  RESEARCH_SECTIONS.forEach(section => {
    assert.ok(section.title, `title for ${section.id}`);
  });
});

// ===== describeFilter (Requirement 7.4) =====

test('describeFilter names the underlying, structures and DTE cut', () => {
  assert.strictEqual(
    RA.describeFilter({
      underlying: 'SPX',
      dteCut: 'zero',
      structures: ['iron_condor']
    }),
    'SPX · Iron Condor only · 0DTE only'
  );
});

test('describeFilter lists multiple structures alphabetically', () => {
  assert.strictEqual(
    RA.describeFilter({
      underlying: 'SPX',
      dteCut: 'nonzero',
      structures: ['put_credit_spread', 'iron_condor']
    }),
    'SPX · Iron Condor, Put Credit Spread · DTE > 0'
  );
});

test('describeFilter reports a null structure filter as all strategies', () => {
  assert.strictEqual(
    RA.describeFilter({ underlying: 'SPX', dteCut: 'all', structures: null }),
    'SPX · All strategies · All DTE'
  );
});

test('describeFilter treats an empty structure list as no filter', () => {
  assert.strictEqual(
    RA.describeFilter({ underlying: 'SPX', dteCut: 'all', structures: [] }),
    'SPX · All strategies · All DTE'
  );
});

test('describeFilter handles a missing underlying and missing DTE cut', () => {
  assert.strictEqual(
    RA.describeFilter({}),
    'All underlyings · All strategies · All DTE'
  );
});

test('describeFilter describes every seeded preset without gaps', () => {
  RESEARCH_PRESETS.forEach(preset => {
    const description = RA.describeFilter(preset.filter);
    assert.strictEqual(description.split(' · ').length, 3, preset.id);
    assert.ok(!description.includes('undefined'), preset.id);
  });
});

// ===== buildCaption (Requirements 7.1, 7.2, 7.3) =====

test('buildCaption appends the trade count', () => {
  const caption = RA.buildCaption(
    { underlying: 'SPX', dteCut: 'zero', structures: ['iron_condor'] },
    { n: 47 }
  );

  assert.strictEqual(caption, 'SPX · Iron Condor only · 0DTE only · 47 closed trades');
});

test('buildCaption singularizes a one-trade cut', () => {
  const caption = RA.buildCaption({ underlying: 'SPX' }, { n: 1 });
  assert.match(caption, /1 closed trade$/);
});

test('buildCaption reports a zero count rather than omitting it', () => {
  const caption = RA.buildCaption({ underlying: 'SPX' }, { n: 0 });
  assert.match(caption, /0 closed trades$/);
});

test('buildCaption states exclusions with their reason', () => {
  const caption = RA.buildCaption(
    { underlying: 'SPX', dteCut: 'all', structures: ['put_credit_spread'] },
    { n: 32, excluded: { noWidth: 4 } }
  );

  assert.match(caption, /32 closed trades · 4 excluded \(no spread width\)/);
});

test('buildCaption omits exclusion reasons with a zero count', () => {
  const caption = RA.buildCaption(
    { underlying: 'SPX' },
    { n: 32, excluded: { noWidth: 0, missingDte: 0, unmappedStructure: 2 } }
  );

  assert.match(caption, /2 excluded \(strategy out of scope\)/);
  assert.ok(!caption.includes('no spread width'));
  assert.ok(!caption.includes('no expiration data'));
});

test('buildCaption reports several exclusion reasons together', () => {
  const caption = RA.buildCaption(
    { underlying: 'SPX' },
    { n: 10, excluded: { unmappedStructure: 3, missingDte: 1 } }
  );

  assert.match(caption, /3 excluded \(strategy out of scope\)/);
  assert.match(caption, /1 excluded \(no expiration data\)/);
});

test('buildCaption falls back to the raw key for an unlabelled reason', () => {
  const caption = RA.buildCaption({ underlying: 'SPX' }, { n: 5, excluded: { mystery: 2 } });
  assert.match(caption, /2 excluded \(mystery\)/);
});

test('buildCaption appends an extra note last', () => {
  const caption = RA.buildCaption(
    { underlying: 'SPX' },
    { n: 5, excluded: { noWidth: 1 }, extra: 'linear approximation' }
  );

  assert.match(caption, /1 excluded \(no spread width\) · linear approximation$/);
});

test('buildCaption with no info still describes the cut', () => {
  assert.strictEqual(
    RA.buildCaption({ underlying: 'SPX', dteCut: 'zero', structures: null }, {}),
    'SPX · All strategies · 0DTE only'
  );
});

test('buildCaption is pure', () => {
  const filter = { underlying: 'SPX', dteCut: 'zero', structures: ['iron_condor'] };
  const info = { n: 47, excluded: { noWidth: 4 } };
  const before = JSON.stringify({ filter, info });

  RA.buildCaption(filter, info);
  RA.buildCaption(filter, info);

  assert.strictEqual(JSON.stringify({ filter, info }), before);
});
