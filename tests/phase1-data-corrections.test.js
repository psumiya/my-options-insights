/**
 * Phase 1 data corrections
 * Covers net P/L including fees, calendar-date DTE at entry, nearest-expiry
 * selection, and spread width derivation.
 *
 * tasty-strategy-mapper.js and analytics-engine.js are browser globals with no
 * module exports, so their source is evaluated here to reach the internals.
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadMapper() {
  const src = readFileSync(join(repoRoot, 'js/tasty-strategy-mapper.js'), 'utf8');
  return new Function(
    `${src}\nreturn { aggregateStrategyLegs, deriveWidth, parseAmount };`
  )();
}

function loadAnalyticsEngine() {
  const src = readFileSync(join(repoRoot, 'js/analytics-engine.js'), 'utf8');
  return new Function(`${src}\nreturn AnalyticsEngine;`)();
}

const { aggregateStrategyLegs, deriveWidth } = loadMapper();
const AnalyticsEngine = loadAnalyticsEngine();

/**
 * Build one leg of a TastyTrade-shaped transaction row
 */
function leg(overrides) {
  return {
    Date: '2026-03-20T14:05:00',
    Type: 'Trade',
    'Instrument Type': 'Equity Option',
    Action: 'SELL_TO_OPEN',
    Symbol: 'SPX   260320P05800000',
    'Underlying Symbol': 'SPX',
    'Expiration Date': '03/20/26',
    'Strike Price': '5800',
    'Call or Put': 'PUT',
    Quantity: '1',
    Value: '300.00',
    Commissions: '-1.00',
    Fees: '-0.12',
    Strategy: 'Iron Condor',
    'Strategy Group ID': '1001',
    'Total Legs': 4,
    ...overrides
  };
}

/**
 * Iron condor with a 20-wide put wing and a 25-wide call wing
 */
function ironCondorLegs() {
  return [
    leg({ Action: 'SELL_TO_OPEN', 'Call or Put': 'PUT', 'Strike Price': '5800', Value: '300.00' }),
    leg({ Action: 'BUY_TO_OPEN', 'Call or Put': 'PUT', 'Strike Price': '5780', Value: '-150.00' }),
    leg({ Action: 'SELL_TO_OPEN', 'Call or Put': 'CALL', 'Strike Price': '5900', Value: '280.00' }),
    leg({ Action: 'BUY_TO_OPEN', 'Call or Put': 'CALL', 'Strike Price': '5925', Value: '-130.00' })
  ];
}

// ===== Width derivation (Requirements 3.1 - 3.4) =====

test('deriveWidth takes the wider wing of an iron condor', () => {
  assert.strictEqual(deriveWidth(ironCondorLegs()), 25);
});

test('deriveWidth uses the strike difference of a put vertical', () => {
  const legs = [
    leg({ Action: 'SELL_TO_OPEN', 'Call or Put': 'PUT', 'Strike Price': '5800' }),
    leg({ Action: 'BUY_TO_OPEN', 'Call or Put': 'PUT', 'Strike Price': '5785' })
  ];
  assert.strictEqual(deriveWidth(legs), 15);
});

test('deriveWidth uses the strike difference of a call vertical', () => {
  const legs = [
    leg({ Action: 'SELL_TO_OPEN', 'Call or Put': 'CALL', 'Strike Price': '5900' }),
    leg({ Action: 'BUY_TO_OPEN', 'Call or Put': 'CALL', 'Strike Price': '5910' })
  ];
  assert.strictEqual(deriveWidth(legs), 10);
});

test('deriveWidth returns null for structures with no width', () => {
  const single = [leg({})];
  const strangle = [
    leg({ 'Call or Put': 'PUT', 'Strike Price': '5800' }),
    leg({ 'Call or Put': 'CALL', 'Strike Price': '5900' })
  ];
  assert.strictEqual(deriveWidth(single), null, 'single leg');
  assert.strictEqual(deriveWidth(strangle), null, 'strangle');
});

test('deriveWidth returns null for same-strike legs rather than zero', () => {
  const roll = [
    leg({ Action: 'SELL_TO_OPEN', 'Call or Put': 'PUT', 'Strike Price': '5800' }),
    leg({ Action: 'BUY_TO_OPEN', 'Call or Put': 'PUT', 'Strike Price': '5800' })
  ];
  assert.strictEqual(deriveWidth(roll), null);
});

test('deriveWidth returns null when any strike is unparseable', () => {
  const legs = [
    leg({ 'Call or Put': 'PUT', 'Strike Price': '5800' }),
    leg({ 'Call or Put': 'PUT', 'Strike Price': '' })
  ];
  assert.strictEqual(deriveWidth(legs), null);
});

// ===== Commissions and fees (Requirements 1.1 - 1.3) =====

test('aggregateStrategyLegs sums commissions and fees as positive costs', () => {
  const trade = aggregateStrategyLegs(ironCondorLegs());

  // 4 legs at -1.00 commission and -0.12 fees each
  assert.strictEqual(trade.Commissions, 4);
  assert.strictEqual(trade.Fees, 0.48);
  assert.strictEqual(trade._metadata.feesAvailable, true);
});

test('aggregateStrategyLegs leaves gross credit and debit untouched', () => {
  const trade = aggregateStrategyLegs(ironCondorLegs());

  assert.strictEqual(trade.Credit, 580, '300 + 280');
  assert.strictEqual(trade.Debit, 280, '150 + 130');
});

test('aggregateStrategyLegs reports fees unavailable when columns are absent', () => {
  const legs = ironCondorLegs().map(l => {
    const stripped = { ...l };
    delete stripped.Commissions;
    delete stripped.Fees;
    return stripped;
  });
  const trade = aggregateStrategyLegs(legs);

  assert.strictEqual(trade.Commissions, 0);
  assert.strictEqual(trade.Fees, 0);
  assert.strictEqual(trade._metadata.feesAvailable, false);
});

test('aggregateStrategyLegs treats a "--" fee placeholder as zero', () => {
  const legs = ironCondorLegs().map(l => ({ ...l, Commissions: '--' }));
  const trade = aggregateStrategyLegs(legs);

  assert.strictEqual(trade.Commissions, 0);
  assert.strictEqual(trade._metadata.feesAvailable, true);
});

// ===== Nearest expiry (Requirements 2.3, 2.4) =====

test('aggregateStrategyLegs uses the nearest leg expiration', () => {
  const legs = [
    leg({ 'Expiration Date': '04/17/26' }),
    leg({ 'Expiration Date': '03/20/26', 'Strike Price': '5780', Action: 'BUY_TO_OPEN' })
  ];
  const trade = aggregateStrategyLegs(legs);

  assert.strictEqual(trade.Expiry.getMonth(), 2, 'March, not April');
  assert.strictEqual(trade.Expiry.getDate(), 20);
  assert.strictEqual(trade._metadata.multipleExpirations, true);
});

test('aggregateStrategyLegs flags single-expiry strategies as not calendars', () => {
  const trade = aggregateStrategyLegs(ironCondorLegs());
  assert.strictEqual(trade._metadata.multipleExpirations, false);
});

test('aggregateStrategyLegs exposes derived width on the trade record', () => {
  const trade = aggregateStrategyLegs(ironCondorLegs());
  assert.strictEqual(trade.Width, 25);
});

// ===== DTE at entry (Requirements 2.1, 2.2, 2.5) =====

test('DaysToExpireAtEntry is 0 for an afternoon entry on expiration day', () => {
  const engine = new AnalyticsEngine();

  // 14:05 local on the expiration date. Differencing raw timestamps against a
  // midnight expiry gives -0.58 days, which previously rounded to -1.
  const enriched = engine.enrichTrade({
    Entry: new Date(2026, 2, 20, 14, 5),
    Expiry: new Date(2026, 2, 20),
    Credit: 0,
    Debit: 0
  });

  assert.strictEqual(enriched.DaysToExpireAtEntry, 0);
});

test('DaysToExpireAtEntry is 0 for a morning entry on expiration day', () => {
  const engine = new AnalyticsEngine();
  const enriched = engine.enrichTrade({
    Entry: new Date(2026, 2, 20, 6, 40),
    Expiry: new Date(2026, 2, 20),
    Credit: 0,
    Debit: 0
  });

  assert.strictEqual(enriched.DaysToExpireAtEntry, 0);
});

test('DaysToExpireAtEntry counts calendar days regardless of entry time', () => {
  const engine = new AnalyticsEngine();
  const enriched = engine.enrichTrade({
    Entry: new Date(2026, 2, 20, 15, 50),
    Expiry: new Date(2026, 2, 27),
    Credit: 0,
    Debit: 0
  });

  assert.strictEqual(enriched.DaysToExpireAtEntry, 7);
});

test('DaysToExpireAtEntry is null when either date is missing', () => {
  const engine = new AnalyticsEngine();

  assert.strictEqual(
    engine.enrichTrade({ Expiry: new Date(2026, 2, 20), Credit: 0, Debit: 0 }).DaysToExpireAtEntry,
    null
  );
  assert.strictEqual(
    engine.enrichTrade({ Entry: new Date(2026, 2, 20), Credit: 0, Debit: 0 }).DaysToExpireAtEntry,
    null
  );
});

// ===== Net P/L (Requirements 1.5, 1.6) =====

test('ProfitLoss nets commissions and fees', () => {
  const engine = new AnalyticsEngine();
  const enriched = engine.enrichTrade({
    Entry: new Date(2026, 2, 20, 14, 5),
    Expiry: new Date(2026, 2, 20),
    Exit: new Date(2026, 2, 20, 15, 55),
    Credit: 580,
    Debit: 280,
    Commissions: 4,
    Fees: 0.48
  });

  // 580 - 280 = 300 gross, less 4.48 of costs
  assert.strictEqual(enriched.ProfitLoss, 295.52);
});

test('ProfitLoss falls back to gross when fee fields are absent', () => {
  const engine = new AnalyticsEngine();
  const enriched = engine.enrichTrade({
    Entry: new Date(2026, 2, 20),
    Expiry: new Date(2026, 2, 27),
    Credit: 580,
    Debit: 280
  });

  assert.strictEqual(enriched.ProfitLoss, 300);
});

test('fees can turn a gross win into a net loss', () => {
  const engine = new AnalyticsEngine();
  const enriched = engine.enrichTrade({
    Entry: new Date(2026, 2, 20),
    Expiry: new Date(2026, 2, 20),
    Exit: new Date(2026, 2, 20, 15, 55),
    Credit: 100,
    Debit: 99,
    Commissions: 4,
    Fees: 0.48
  });

  assert.strictEqual(enriched.ProfitLoss, -3.48);
  assert.strictEqual(enriched.Result, 'Loss', 'Result follows net, not gross');
});

test('PremiumPercentage is computed from net P/L', () => {
  const engine = new AnalyticsEngine();
  const enriched = engine.enrichTrade({
    Entry: new Date(2026, 2, 20),
    Expiry: new Date(2026, 2, 20),
    Exit: new Date(2026, 2, 20, 15, 55),
    Credit: 400,
    Debit: 200,
    Commissions: 4,
    Fees: 0
  });

  // (400 - 200 - 4) / 400 = 49%
  assert.strictEqual(enriched.PremiumPercentage, 49);
});

// ===== End-to-end over the aggregated record =====

test('an aggregated iron condor enriches to the expected net figures', () => {
  const engine = new AnalyticsEngine();
  const trade = aggregateStrategyLegs(ironCondorLegs());
  const enriched = engine.enrichTrade(trade);

  assert.strictEqual(enriched.DaysToExpireAtEntry, 0, '0DTE');
  assert.strictEqual(enriched.Width, 25);
  assert.strictEqual(enriched.ProfitLoss, 295.52);
});
