/**
 * Research Analytics
 * Every expected value below is derived by hand from the fixture, not captured
 * from a run of the implementation, so these tests can actually fail.
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(repoRoot, 'js/research-analytics.js'), 'utf8');
const RA = new Function(`${src}\nreturn ResearchAnalytics;`)();

/**
 * Twelve closed SPX trades, chronological. Dates use local-time constructors so
 * the fixture is timezone-independent.
 *
 *  #   date        strategy           dte  width   P/L   openCredit
 *  1   01-05       Iron Condor          0     20   +100        200
 *  2   01-06       Iron Condor          0     20   +150        250
 *  3   01-07       Bull Put Spread      0     10   -300        120
 *  4   01-08 09:35 Bull Put Spread      0     10    +80        110
 *  5   01-08 13:10 Bear Call Spread     0     10    +60        100
 *  6   01-12       Iron Condor          3     25   -500        300
 *  7   01-13       Iron Condor          3     25   +200        280
 *  8   01-14       Bull Put Spread     10     20    +90        150
 *  9   01-15       Bull Put Spread     10     20   -700        160
 * 10   01-16       Bear Call Spread    10     20    +40         90
 * 11   01-19       Short Put            5   null    +30         70
 * 12   01-20       Iron Condor          0     20      0        180
 */
function trade(day, strategy, dte, width, profitLoss, openCredit, extra = {}) {
  const entry = extra.entry || new Date(2026, 0, day, 10, 0);
  return {
    Symbol: 'SPX',
    Strategy: strategy,
    DaysToExpireAtEntry: dte,
    Width: width,
    ProfitLoss: profitLoss,
    OpenCredit: openCredit,
    Entry: entry,
    Exit: new Date(2026, 0, day, 15, 55),
    ...extra
  };
}

function fixture() {
  return [
    trade(5, 'Iron Condor', 0, 20, 100, 200),
    trade(6, 'Iron Condor', 0, 20, 150, 250),
    trade(7, 'Bull Put Spread', 0, 10, -300, 120),
    trade(8, 'Bull Put Spread', 0, 10, 80, 110, { entry: new Date(2026, 0, 8, 9, 35) }),
    trade(8, 'Bear Call Spread', 0, 10, 60, 100, { entry: new Date(2026, 0, 8, 13, 10) }),
    trade(12, 'Iron Condor', 3, 25, -500, 300),
    trade(13, 'Iron Condor', 3, 25, 200, 280),
    trade(14, 'Bull Put Spread', 10, 20, 90, 150),
    trade(15, 'Bull Put Spread', 10, 20, -700, 160),
    trade(16, 'Bear Call Spread', 10, 20, 40, 90),
    trade(19, 'Short Put', 5, null, 30, 70),
    trade(20, 'Iron Condor', 0, 20, 0, 180)
  ];
}

/** Fixture plus an open position and a different underlying, for filter tests */
function fixtureWithNoise() {
  const openPosition = trade(21, 'Iron Condor', 0, 20, 0, 190);
  openPosition.Exit = null;

  const otherUnderlying = trade(22, 'Iron Condor', 0, 20, 500, 210);
  otherUnderlying.Symbol = 'SPY';

  return [...fixture(), openPosition, otherUnderlying];
}

// ===== Structure mapping (Requirements 4.1 - 4.4) =====

test('canonicalStructure maps the dashboard labels for all three structures', () => {
  assert.strictEqual(RA.canonicalStructure('Iron Condor'), 'iron_condor');
  assert.strictEqual(RA.canonicalStructure('Bull Put Spread'), 'put_credit_spread');
  assert.strictEqual(RA.canonicalStructure('Bear Call Spread'), 'call_credit_spread');
});

test('canonicalStructure maps the Robinhood adapter labels too', () => {
  assert.strictEqual(RA.canonicalStructure('Put Credit Spread'), 'put_credit_spread');
  assert.strictEqual(RA.canonicalStructure('Call Credit Spread'), 'call_credit_spread');
});

test('canonicalStructure returns null for out-of-scope strategies', () => {
  assert.strictEqual(RA.canonicalStructure('Short Put'), null);
  assert.strictEqual(RA.canonicalStructure('Custom'), null);
  assert.strictEqual(RA.canonicalStructure(''), null);
  assert.strictEqual(RA.canonicalStructure(undefined), null);
});

test('structureLabel preserves the display vocabulary', () => {
  assert.strictEqual(RA.structureLabel('put_credit_spread'), 'Put Credit Spread');
});

// ===== Filtering (Requirements 5.6, 4.4, 4.5, 2.5) =====

test('applyFilter keeps closed trades for the chosen underlying only', () => {
  const result = RA.applyFilter(fixtureWithNoise(), { underlying: 'SPX', dteCut: 'all' });

  assert.strictEqual(result.trades.length, 12);
  assert.strictEqual(result.excluded.open, 1);
  assert.strictEqual(result.excluded.underlying, 1);
});

test('applyFilter separates unmapped strategies from deselected ones', () => {
  const result = RA.applyFilter(fixture(), {
    underlying: 'SPX',
    dteCut: 'all',
    structures: [RA.STRUCTURES.IRON_CONDOR]
  });

  assert.strictEqual(result.trades.length, 5, 'five iron condors');
  assert.strictEqual(result.excluded.unmappedStructure, 1, 'the Short Put');
  assert.strictEqual(result.excluded.structureNotSelected, 6, 'the credit spreads');
});

test('applyFilter with no structure list keeps every strategy', () => {
  const result = RA.applyFilter(fixture(), { underlying: 'SPX', dteCut: 'all', structures: null });

  assert.strictEqual(result.trades.length, 12);
  assert.strictEqual(result.excluded.unmappedStructure, 0);
});

test('applyFilter splits the zero and non-zero DTE cuts', () => {
  const zero = RA.applyFilter(fixture(), { underlying: 'SPX', dteCut: 'zero' });
  const nonzero = RA.applyFilter(fixture(), { underlying: 'SPX', dteCut: 'nonzero' });

  assert.strictEqual(zero.trades.length, 6);
  assert.strictEqual(nonzero.trades.length, 6);
  assert.ok(zero.trades.every(t => t.DaysToExpireAtEntry === 0));
  assert.ok(nonzero.trades.every(t => t.DaysToExpireAtEntry > 0));
});

test('applyFilter excludes trades with unknown DTE from DTE cuts only', () => {
  const trades = fixture();
  trades[0].DaysToExpireAtEntry = null;

  const all = RA.applyFilter(trades, { underlying: 'SPX', dteCut: 'all' });
  const zero = RA.applyFilter(trades, { underlying: 'SPX', dteCut: 'zero' });

  assert.strictEqual(all.trades.length, 12, 'kept when no DTE cut is active');
  assert.strictEqual(all.excluded.missingDte, 0);
  assert.strictEqual(zero.trades.length, 5);
  assert.strictEqual(zero.excluded.missingDte, 1);
});

test('applyFilter does not mutate its input', () => {
  const trades = fixture();
  const before = trades.map(t => t.Strategy);
  RA.applyFilter(trades, { underlying: 'SPX', dteCut: 'zero' });

  assert.deepStrictEqual(trades.map(t => t.Strategy), before);
});

// ===== winLossStats (Requirements 9.2, 9.3) =====

test('winLossStats over the whole fixture', () => {
  // wins 100+150+80+60+200+90+40+30 = 750 over 8 trades, avg 93.75
  // losses -300-500-700+0 = -1500 over 4 trades, avg -375
  // breakeven 375 / (93.75 + 375) = 80%
  assert.deepStrictEqual(RA.winLossStats(fixture()), {
    n: 12,
    winRate: 66.7,
    avgWin: 93.75,
    avgLoss: -375,
    breakevenWinRate: 80,
    net: -750,
    worst: -700,
    expectancy: -62.5
  });
});

test('winLossStats counts a scratch as a loss', () => {
  const scratch = [trade(5, 'Iron Condor', 0, 20, 0, 200)];

  const stats = RA.winLossStats(scratch);
  assert.strictEqual(stats.winRate, 0);
  assert.strictEqual(stats.avgLoss, 0);
  assert.strictEqual(stats.n, 1);
});

test('winLossStats on an empty set reports nulls, not zeros', () => {
  assert.deepStrictEqual(RA.winLossStats([]), {
    n: 0,
    winRate: null,
    avgWin: null,
    avgLoss: null,
    breakevenWinRate: null,
    net: 0,
    worst: null,
    expectancy: null
  });
});

test('winLossStats on an all-wins set', () => {
  const wins = [
    trade(5, 'Iron Condor', 0, 20, 100, 200),
    trade(6, 'Iron Condor', 0, 20, 300, 200)
  ];

  const stats = RA.winLossStats(wins);
  assert.strictEqual(stats.winRate, 100);
  assert.strictEqual(stats.avgWin, 200);
  assert.strictEqual(stats.avgLoss, 0);
  assert.strictEqual(stats.breakevenWinRate, 0, 'no losses to break even against');
  assert.strictEqual(stats.net, 400);
});

test('winLossStats on an all-losses set', () => {
  const losses = [
    trade(5, 'Iron Condor', 0, 20, -100, 200),
    trade(6, 'Iron Condor', 0, 20, -300, 200)
  ];

  const stats = RA.winLossStats(losses);
  assert.strictEqual(stats.winRate, 0);
  assert.strictEqual(stats.avgWin, 0);
  assert.strictEqual(stats.avgLoss, -200);
  assert.strictEqual(stats.breakevenWinRate, 100);
  assert.strictEqual(stats.worst, -300);
});

// ===== dteBucketStats (Requirements 9.1, 9.4) =====

test('dteBucketStats buckets in ascending DTE order', () => {
  const buckets = RA.dteBucketStats(fixture());
  assert.deepStrictEqual(Object.keys(buckets), ['0DTE', '1-7DTE', '>7DTE']);
});

test('dteBucketStats 0DTE bucket', () => {
  // 100, 150, -300, 80, 60, 0 → wins 390/4 = 97.5, losses -300/2 = -150
  // breakeven 150 / 247.5 = 60.6%
  assert.deepStrictEqual(RA.dteBucketStats(fixture())['0DTE'], {
    n: 6,
    winRate: 66.7,
    avgWin: 97.5,
    avgLoss: -150,
    breakevenWinRate: 60.6,
    net: 90,
    worst: -300,
    expectancy: 15
  });
});

test('dteBucketStats 1-7DTE bucket', () => {
  // -500, 200, 30 → wins 230/2 = 115, losses -500
  // breakeven 500 / 615 = 81.3%
  assert.deepStrictEqual(RA.dteBucketStats(fixture())['1-7DTE'], {
    n: 3,
    winRate: 66.7,
    avgWin: 115,
    avgLoss: -500,
    breakevenWinRate: 81.3,
    net: -270,
    worst: -500,
    expectancy: -90
  });
});

test('dteBucketStats >7DTE bucket', () => {
  // 90, -700, 40 → wins 130/2 = 65, losses -700
  // breakeven 700 / 765 = 91.5%
  assert.deepStrictEqual(RA.dteBucketStats(fixture())['>7DTE'], {
    n: 3,
    winRate: 66.7,
    avgWin: 65,
    avgLoss: -700,
    breakevenWinRate: 91.5,
    net: -570,
    worst: -700,
    expectancy: -190
  });
});

test('dteBucketStats omits empty buckets', () => {
  const zeroOnly = fixture().filter(t => t.DaysToExpireAtEntry === 0);
  assert.deepStrictEqual(Object.keys(RA.dteBucketStats(zeroOnly)), ['0DTE']);
});

test('dteBucketStats skips trades with unknown DTE', () => {
  const trades = fixture();
  trades.forEach(t => { t.DaysToExpireAtEntry = null; });
  assert.deepStrictEqual(RA.dteBucketStats(trades), {});
});

// ===== condorVsSingleSide (Requirements 10.1, 10.4) =====

test('condorVsSingleSide splits the three structures', () => {
  const split = RA.condorVsSingleSide(fixture());

  // condors 100, 150, -500, 200, 0 → net -50 over 5
  assert.strictEqual(split.iron_condor.n, 5);
  assert.strictEqual(split.iron_condor.net, -50);
  assert.strictEqual(split.iron_condor.winRate, 60);
  assert.strictEqual(split.iron_condor.breakevenWinRate, 62.5);

  // put credit spreads -300, 80, 90, -700 → net -830 over 4
  assert.strictEqual(split.put_credit_spread.n, 4);
  assert.strictEqual(split.put_credit_spread.net, -830);
  assert.strictEqual(split.put_credit_spread.winRate, 50);
  assert.strictEqual(split.put_credit_spread.expectancy, -207.5);

  // call credit spreads 60, 40 → net 100 over 2
  assert.strictEqual(split.call_credit_spread.n, 2);
  assert.strictEqual(split.call_credit_spread.net, 100);
  assert.strictEqual(split.call_credit_spread.winRate, 100);
});

test('condorVsSingleSide keeps a zero-trade structure visible', () => {
  const condorsOnly = fixture().filter(t => t.Strategy === 'Iron Condor');
  const split = RA.condorVsSingleSide(condorsOnly);

  assert.deepStrictEqual(Object.keys(split),
    ['iron_condor', 'put_credit_spread', 'call_credit_spread']);
  assert.strictEqual(split.put_credit_spread.n, 0);
  assert.strictEqual(split.put_credit_spread.winRate, null);
});

test('condorVsSingleSide ignores unmapped strategies', () => {
  const split = RA.condorVsSingleSide(fixture());
  const counted = split.iron_condor.n + split.put_credit_spread.n + split.call_credit_spread.n;

  assert.strictEqual(counted, 11, 'the Short Put is not in any group');
});

// ===== widthBreakdown (Requirements 11.1, 11.2, 11.5) =====

test('widthBreakdown groups by width in ascending order', () => {
  const result = RA.widthBreakdown(fixture());

  assert.deepStrictEqual(Object.keys(result.byWidth), ['10', '20', '25']);
  assert.strictEqual(result.excludedNoWidth, 1, 'the Short Put has no width');
});

test('widthBreakdown width 10 group', () => {
  // -300, 80, 60 with open credits 120, 110, 100
  const group = RA.widthBreakdown(fixture()).byWidth['10'];

  assert.strictEqual(group.n, 3);
  assert.strictEqual(group.net, -160);
  assert.strictEqual(group.avgWin, 70);
  assert.strictEqual(group.avgLoss, -300);
  assert.strictEqual(group.breakevenWinRate, 81.1, '300 / 370');
  assert.strictEqual(group.expectancy, -53.33);
  assert.strictEqual(group.avgCreditCollected, 110);
});

test('widthBreakdown width 20 group', () => {
  // 100, 150, 90, -700, 40, 0 with open credits 200, 250, 150, 160, 90, 180
  const group = RA.widthBreakdown(fixture()).byWidth['20'];

  assert.strictEqual(group.n, 6);
  assert.strictEqual(group.net, -320);
  assert.strictEqual(group.avgWin, 95, '380 / 4');
  assert.strictEqual(group.avgLoss, -350, '-700 / 2, the scratch counting as a loss');
  assert.strictEqual(group.breakevenWinRate, 78.7, '350 / 445');
  assert.strictEqual(group.expectancy, -53.33, '-320 / 6');
  assert.strictEqual(group.avgCreditCollected, 171.67, '1030 / 6');
});

test('widthBreakdown reports nothing when no trade has a width', () => {
  const noWidth = fixture().map(t => ({ ...t, Width: null }));
  const result = RA.widthBreakdown(noWidth);

  assert.deepStrictEqual(result.byWidth, {});
  assert.strictEqual(result.excludedNoWidth, 12);
});

// ===== widthCounterfactual (Requirements 11.3, 11.4, 11.5) =====

test('widthCounterfactual rescales the book to a uniform width', () => {
  const result = RA.widthCounterfactual(fixture(), [10, 20]);

  assert.strictEqual(result.actualN, 11, 'the Short Put has no width');
  assert.strictEqual(result.actualNet, -780, '-750 total less the +30 Short Put');

  // width 10: 50 + 75 - 300 + 80 + 60 - 200 + 80 + 45 - 350 + 20 + 0
  assert.strictEqual(result.byWidth['10'], -440);

  // width 20: 100 + 150 - 600 + 160 + 120 - 400 + 160 + 90 - 700 + 40 + 0
  assert.strictEqual(result.byWidth['20'], -880);
  assert.strictEqual(result.excludedNoWidth, 1);
});

test('widthCounterfactual at the widths already traded reproduces those trades', () => {
  const tens = fixture().filter(t => t.Width === 10);
  const result = RA.widthCounterfactual(tens, [10]);

  assert.strictEqual(result.byWidth['10'], result.actualNet);
});

test('widthCounterfactual on an empty set returns zeros', () => {
  const result = RA.widthCounterfactual([], [10]);

  assert.strictEqual(result.actualNet, 0);
  assert.strictEqual(result.actualN, 0);
  assert.strictEqual(result.byWidth['10'], 0);
});

// ===== runsTest (Requirements 12.1, 12.2, 12.3) =====

test('runsTest over the whole fixture', () => {
  // sequence 1 1 0 1 1 0 1 1 0 1 1 0 → 8 runs, 8 wins, 4 losses
  // expected runs 2*8*4/12 + 1 = 6.33, variance 3328/1584 = 2.101, z = 1.15
  // two-sided p for |z| = 1.15 is 0.25
  const result = RA.runsTest(fixture());

  assert.strictEqual(result.n, 12);
  assert.strictEqual(result.wins, 8);
  assert.strictEqual(result.losses, 4);
  assert.strictEqual(result.runs, 8);
  assert.strictEqual(result.expectedRuns, 6.3);
  assert.strictEqual(result.z, 1.15);
  assert.strictEqual(result.p, 0.25);
  assert.strictEqual(result.note, null);
});

test('runsTest declines a sample under ten trades', () => {
  const result = RA.runsTest(fixture().slice(0, 9));

  assert.strictEqual(result.n, 9);
  assert.strictEqual(result.z, null);
  assert.strictEqual(result.p, null);
  assert.match(result.note, /too small/);
});

test('runsTest declines a sample with fewer than two losses', () => {
  const wins = Array.from({ length: 12 }, (_, i) =>
    trade(5 + i, 'Iron Condor', 0, 20, i === 0 ? -100 : 100, 200));

  const result = RA.runsTest(wins);
  assert.strictEqual(result.losses, 1);
  assert.strictEqual(result.z, null);
  assert.match(result.note, /too small/);
});

test('runsTest declines an empty set', () => {
  const result = RA.runsTest([]);

  assert.strictEqual(result.n, 0);
  assert.strictEqual(result.z, null);
  assert.match(result.note, /too small/);
});

test('runsTest reads the sequence chronologically, not in array order', () => {
  const shuffled = fixture().slice().reverse();
  assert.deepStrictEqual(RA.runsTest(shuffled), RA.runsTest(fixture()));
});

// ===== lossConcentration (Requirements 12.4, 12.5) =====

test('lossConcentration on a set with more losses than the top-N', () => {
  // losses -1000, -500, -300, -200 → total -2000, top 3 = -1800
  const trades = [
    trade(5, 'Iron Condor', 0, 20, -1000, 200),
    trade(6, 'Iron Condor', 0, 20, -500, 200),
    trade(7, 'Iron Condor', 0, 20, -300, 200),
    trade(8, 'Iron Condor', 0, 20, -200, 200),
    trade(9, 'Iron Condor', 0, 20, 400, 200)
  ];

  const result = RA.lossConcentration(trades, [3, 5]);

  assert.strictEqual(result.nLosses, 4);
  assert.strictEqual(result.totalLoss, -2000);
  assert.strictEqual(result.shares['3'], 90);
  assert.strictEqual(result.shares['5'], 100);
  assert.strictEqual(result.note, null);
});

test('lossConcentration treats a scratch as no loss', () => {
  const result = RA.lossConcentration(fixture(), [3, 5]);

  assert.strictEqual(result.nLosses, 3, 'the zero-P/L trade is not a dollar loss');
  assert.strictEqual(result.totalLoss, -1500);
  assert.strictEqual(result.shares['3'], 100);
});

test('lossConcentration reports a note when there are no losses', () => {
  const wins = fixture().filter(t => t.ProfitLoss > 0);
  const result = RA.lossConcentration(wins, [3, 5]);

  assert.strictEqual(result.nLosses, 0);
  assert.deepStrictEqual(result.shares, {});
  assert.match(result.note, /no losing trades/);
});

// ===== bucketSignificance (Requirements 13.1 - 13.5) =====

test('bucketSignificance computes a probability when losses are one-sided', () => {
  // Iron condors: widths 20, 20, 25, 25, 20 with the only loss at width 25.
  // Group A (width >= 25) holds 2 of 5 trades, so comb(2,1)/comb(5,1) = 0.4
  const condors = fixture().filter(t => t.Strategy === 'Iron Condor');
  const result = RA.bucketSignificance(condors, {
    column: 'Width',
    threshold: 25,
    comparison: 'ge'
  });

  assert.strictEqual(result.groupAn, 2);
  assert.strictEqual(result.groupBn, 3);
  assert.strictEqual(result.lossesTotal, 1);
  assert.strictEqual(result.lossesInGroupA, 1);
  assert.strictEqual(result.p, 0.4);
  assert.strictEqual(result.concentratedIn, 'a');
  assert.match(result.note, /all 1 loss fell where Width >= 25/);
});

test('bucketSignificance measures losses concentrated below the threshold too', () => {
  // Same condors, threshold flipped: the only loss is now in group B, at
  // width 25, with group B holding 2 of 5 trades. comb(2,1)/comb(5,1) = 0.4
  const condors = fixture().filter(t => t.Strategy === 'Iron Condor');
  const result = RA.bucketSignificance(condors, {
    column: 'Width',
    threshold: 25,
    comparison: 'lt'
  });

  assert.strictEqual(result.groupAn, 3, 'width < 25');
  assert.strictEqual(result.lossesInGroupA, 0);
  assert.strictEqual(result.concentratedIn, 'b');
  assert.strictEqual(result.p, 0.4);
  assert.match(result.note, /all 1 loss fell where Width >= 25/);
});

test('bucketSignificance declines when losses fall on both sides', () => {
  // Put credit spreads: widths 10, 10, 20, 20 with losses at 10 and 20
  const spreads = fixture().filter(t => t.Strategy === 'Bull Put Spread');
  const result = RA.bucketSignificance(spreads, {
    column: 'Width',
    threshold: 20,
    comparison: 'ge'
  });

  assert.strictEqual(result.lossesTotal, 2);
  assert.strictEqual(result.lossesInGroupA, 1);
  assert.strictEqual(result.p, null);
  assert.match(result.note, /Fisher exact/);
});

test('bucketSignificance declines when there are no losses', () => {
  const wins = fixture().filter(t => t.ProfitLoss > 0);
  const result = RA.bucketSignificance(wins, {
    column: 'Width',
    threshold: 20,
    comparison: 'ge'
  });

  assert.strictEqual(result.p, null);
  assert.match(result.note, /no losses to test/);
});

test('bucketSignificance declines an empty set', () => {
  const result = RA.bucketSignificance([], { column: 'Width', threshold: 20 });

  assert.strictEqual(result.groupAn, 0);
  assert.strictEqual(result.groupBn, 0);
  assert.strictEqual(result.p, null);
});

test('bucketSignificance treats a null width as outside the threshold group', () => {
  const result = RA.bucketSignificance(fixture(), {
    column: 'Width',
    threshold: 10,
    comparison: 'ge'
  });

  assert.strictEqual(result.groupAn, 11, 'every trade but the widthless Short Put');
  assert.strictEqual(result.groupBn, 1);
});

// ===== calendarSeries (Requirements 8.1, 8.3, 8.8) =====

test('calendarSeries collapses same-day trades into one cell', () => {
  const zero = RA.applyFilter(fixture(), { underlying: 'SPX', dteCut: 'zero' }).trades;
  const series = RA.calendarSeries(zero);

  assert.strictEqual(series.length, 5, 'six trades across five dates');

  const shared = series.find(row => row.date === '2026-01-08');
  assert.strictEqual(shared.net, 140, '80 + 60');
  assert.strictEqual(shared.n, 2);
  assert.strictEqual(shared.category, 'Mixed');
  assert.deepStrictEqual(shared.strategies, ['Bear Call Spread', 'Bull Put Spread']);
});

test('calendarSeries names the structure on single-structure dates', () => {
  const series = RA.calendarSeries(fixture());
  const single = series.find(row => row.date === '2026-01-05');

  assert.strictEqual(single.category, 'Iron Condor');
  assert.strictEqual(single.net, 100);
  assert.strictEqual(single.n, 1);
});

test('calendarSeries returns dates in ascending order', () => {
  const dates = RA.calendarSeries(fixture()).map(row => row.date);
  assert.deepStrictEqual(dates, dates.slice().sort());
});

test('calendarSeries on an empty set returns an empty array', () => {
  assert.deepStrictEqual(RA.calendarSeries([]), []);
});

// ===== barSeries (Requirements 8.4, 8.6, 8.7, 8.8) =====

test('barSeries keeps same-day trades as separate rows', () => {
  const zero = RA.applyFilter(fixture(), { underlying: 'SPX', dteCut: 'zero' }).trades;
  const series = RA.barSeries(zero);

  assert.strictEqual(series.n, 6);
  assert.strictEqual(series.trades.filter(row => row.date === '2026-01-08').length, 2);
});

test('barSeries summary figures match the rows it emits', () => {
  const zero = RA.applyFilter(fixture(), { underlying: 'SPX', dteCut: 'zero' }).trades;
  const series = RA.barSeries(zero);

  // 100 + 150 - 300 + 80 + 60 + 0 = 90 over 6 trades
  assert.strictEqual(series.net, 90);
  assert.strictEqual(series.avgPerTrade, 15);
  assert.strictEqual(series.trades.reduce((s, r) => s + r.net, 0), 90);
});

test('barSeries orders rows chronologically', () => {
  const series = RA.barSeries(fixture().slice().reverse());
  const dates = series.trades.map(row => row.date);

  assert.deepStrictEqual(dates, dates.slice().sort());
});

test('barSeries on an empty set reports a null average', () => {
  const series = RA.barSeries([]);

  assert.deepStrictEqual(series.trades, []);
  assert.strictEqual(series.net, 0);
  assert.strictEqual(series.avgPerTrade, null);
  assert.strictEqual(series.n, 0);
});

// ===== Purity (Requirements 14.1, 14.2) =====

test('every statistic returns the same result on a repeated call', () => {
  const trades = fixture();
  const calls = [
    () => RA.winLossStats(trades),
    () => RA.dteBucketStats(trades),
    () => RA.condorVsSingleSide(trades),
    () => RA.widthBreakdown(trades),
    () => RA.widthCounterfactual(trades, [10, 20]),
    () => RA.runsTest(trades),
    () => RA.lossConcentration(trades, [3, 5]),
    () => RA.bucketSignificance(trades, { column: 'Width', threshold: 20 }),
    () => RA.calendarSeries(trades),
    () => RA.barSeries(trades)
  ];

  calls.forEach(call => assert.deepStrictEqual(call(), call()));
});

test('no statistic mutates or reorders its input', () => {
  const trades = fixture();
  const before = JSON.stringify(trades);

  RA.winLossStats(trades);
  RA.dteBucketStats(trades);
  RA.condorVsSingleSide(trades);
  RA.widthBreakdown(trades);
  RA.widthCounterfactual(trades, [10, 20]);
  RA.runsTest(trades);
  RA.lossConcentration(trades, [3, 5]);
  RA.bucketSignificance(trades, { column: 'Width', threshold: 20 });
  RA.calendarSeries(trades);
  RA.barSeries(trades);

  assert.strictEqual(JSON.stringify(trades), before);
});
