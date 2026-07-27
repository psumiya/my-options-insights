/**
 * TastyTrade position reconstruction
 * Covers the ledger shapes that broke reconciliation against a real broker
 * statement: non-trade exits, cash settlement, FIFO lots, partial closes,
 * assigned shares, and option-type parsing.
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const mapper = new Function(
  `${readFileSync(join(repoRoot, 'js/tasty-strategy-mapper.js'), 'utf8')}
   return { convertTastyWithStrategyInference, classifyStrategy, extractOptionType,
            isOptionTrade, isOptionRemoval, processEquityTrades };`
)();

let orderSeq = 1000;

/** One transaction-history row, with sensible defaults */
function row(overrides) {
  return {
    Date: '2026-03-02T09:30:00-0800',
    Type: 'Trade',
    'Sub Type': 'Sell to Open',
    Action: 'SELL_TO_OPEN',
    Symbol: 'AMD   260320P00100000',
    'Instrument Type': 'Equity Option',
    Description: '',
    Value: '100.00',
    Quantity: '1',
    Commissions: '-1.00',
    Fees: '-0.12',
    'Underlying Symbol': 'AMD',
    'Expiration Date': '03/20/26',
    'Strike Price': '100',
    'Call or Put': 'PUT',
    'Order #': String(orderSeq++),
    Total: '',
    ...overrides
  };
}

const convert = rows => mapper.convertTastyWithStrategyInference(rows);
const bySymbol = (trades, symbol) => trades.filter(t => t.Symbol === symbol);

// ===== Option type parsing =====

test('extractOptionType reads the OCC type character, not any letter', () => {
  // SPXW contains a P; a substring search calls every SPXW call a put
  assert.strictEqual(mapper.extractOptionType('SPXW  260609C07575000'), 'CALL');
  assert.strictEqual(mapper.extractOptionType('SPXW  260609P07390000'), 'PUT');
  assert.strictEqual(mapper.extractOptionType('PLTR  260320C00130000'), 'CALL');
  assert.strictEqual(mapper.extractOptionType('CMG   260320P00045000'), 'PUT');
});

test('extractOptionType prefers the ledger column when present', () => {
  const leg = { 'Call or Put': 'CALL' };
  assert.strictEqual(mapper.extractOptionType('SPXW  260609P07390000', leg), 'CALL');
});

test('an SPXW iron condor classifies as an iron condor', () => {
  const order = '5000';
  const legs = [
    ['SPXW  260609P07385000', 'PUT', 'BUY_TO_OPEN', '7385'],
    ['SPXW  260609P07390000', 'PUT', 'SELL_TO_OPEN', '7390'],
    ['SPXW  260609C07575000', 'CALL', 'SELL_TO_OPEN', '7575'],
    ['SPXW  260609C07580000', 'CALL', 'BUY_TO_OPEN', '7580']
  ].map(([sym, cp, action, strike]) => row({
    Symbol: sym, 'Call or Put': cp, Action: action, 'Strike Price': strike,
    'Underlying Symbol': 'SPX', 'Order #': order
  }));

  assert.strictEqual(mapper.classifyStrategy(legs), 'Iron Condor');
});

test('three legs of one type classify as a butterfly', () => {
  const legs = [
    row({ 'Strike Price': '95', Action: 'BUY_TO_OPEN', Symbol: 'AMD   260320P00095000' }),
    row({ 'Strike Price': '100', Action: 'SELL_TO_OPEN', Quantity: '2' }),
    row({ 'Strike Price': '105', Action: 'BUY_TO_OPEN', Symbol: 'AMD   260320P00105000' })
  ];
  assert.strictEqual(mapper.classifyStrategy(legs), 'Butterfly');
});

// ===== Non-trade exits =====

test('an expiration closes the position it retires', () => {
  const order = '6000';
  const trades = convert([
    row({ 'Order #': order, Value: '150.00' }),
    row({
      Type: 'Receive Deliver', 'Sub Type': 'Expiration', Action: 'BUY_TO_CLOSE',
      Value: '0.00', Commissions: '0.00', Fees: '0.00', 'Order #': '',
      Date: '2026-03-20T13:00:00-0700'
    })
  ]);

  assert.strictEqual(trades.length, 1);
  assert.ok(trades[0].Exit, 'expired position must be closed');
  assert.strictEqual(trades[0].RealizedGrossPL, 150);
});

test('an assignment with no action closes a short position', () => {
  const trades = convert([
    row({ 'Order #': '6100', Value: '150.00' }),
    row({
      Type: 'Receive Deliver', 'Sub Type': 'Assignment', Action: '',
      Value: '0.00', Commissions: '0.00', Fees: '0.00', 'Order #': '',
      Date: '2026-03-20T14:00:00-0700'
    })
  ]);

  assert.strictEqual(trades.length, 1);
  assert.ok(trades[0].Exit);
  assert.strictEqual(trades[0].RealizedGrossPL, 150);
});

test('cash settlement lands on the position it settles, not a phantom one', () => {
  // Index options are retired by a zero-value Expiration row and a separate
  // Cash Settled row carrying the money
  const trades = convert([
    row({
      'Order #': '6200', Symbol: 'SPXW  260609C07575000', 'Call or Put': 'CALL',
      'Underlying Symbol': 'SPX', Value: '500.00'
    }),
    row({
      Type: 'Receive Deliver', 'Sub Type': 'Expiration', Action: 'BUY_TO_CLOSE',
      Symbol: 'SPXW  260609C07575000', 'Call or Put': 'CALL', 'Underlying Symbol': 'SPX',
      Value: '0.00', Commissions: '0.00', Fees: '0.00', 'Order #': '',
      Date: '2026-06-09T13:00:00-0700'
    }),
    row({
      Type: 'Receive Deliver', 'Sub Type': 'Cash Settled Assignment', Action: '',
      Symbol: 'SPXW  260609C07575000', 'Call or Put': 'CALL', 'Underlying Symbol': 'SPX',
      Value: '-2000.00', Commissions: '0.00', Fees: '0.00', 'Order #': '',
      Date: '2026-06-09T13:00:00-0700'
    })
  ]);

  const spx = bySymbol(trades, 'SPX');
  assert.strictEqual(spx.length, 1, 'settlement must not spawn a second position');
  assert.strictEqual(spx[0].RealizedGrossPL, -1500, '500 collected less 2000 settled');
  assert.strictEqual(spx[0]._metadata.incompleteBasis, false);
});

// ===== FIFO lots =====

test('the same contract opened by two orders makes two positions', () => {
  const trades = convert([
    row({ 'Order #': '7001', Value: '100.00', Date: '2026-03-02T09:30:00-0800' }),
    row({ 'Order #': '7002', Value: '120.00', Date: '2026-03-03T09:30:00-0800' }),
    row({
      Action: 'BUY_TO_CLOSE', 'Sub Type': 'Buy to Close', Value: '-40.00',
      'Order #': '7003', Date: '2026-03-04T09:30:00-0800'
    }),
    row({
      Action: 'BUY_TO_CLOSE', 'Sub Type': 'Buy to Close', Value: '-50.00',
      'Order #': '7004', Date: '2026-03-05T09:30:00-0800'
    })
  ]);

  assert.strictEqual(trades.length, 2, 'must not merge into one position');
  const sorted = trades.slice().sort((a, b) => a.RealizedGrossPL - b.RealizedGrossPL);
  assert.strictEqual(sorted[0].RealizedGrossPL, 60, 'first lot: 100 in, 40 out');
  assert.strictEqual(sorted[1].RealizedGrossPL, 70, 'second lot: 120 in, 50 out');
  assert.ok(sorted.every(t => t.Exit), 'both fully closed');
});

test('one closing row spanning two lots is split between them', () => {
  const trades = convert([
    row({ 'Order #': '7101', Value: '100.00', Date: '2026-03-02T09:30:00-0800' }),
    row({ 'Order #': '7102', Value: '100.00', Date: '2026-03-03T09:30:00-0800' }),
    row({
      Type: 'Receive Deliver', 'Sub Type': 'Expiration', Action: 'BUY_TO_CLOSE',
      Quantity: '2', Value: '0.00', Commissions: '0.00', Fees: '0.00', 'Order #': '',
      Date: '2026-03-20T13:00:00-0700'
    })
  ]);

  assert.strictEqual(trades.length, 2);
  assert.ok(trades.every(t => t.Exit), 'a qty-2 removal retires both lots');
  assert.strictEqual(trades.reduce((s, t) => s + t.RealizedGrossPL, 0), 200);
});

// ===== Partial closes =====

test('a half-closed strangle stays open but realizes its closed leg', () => {
  const order = '8000';
  const trades = convert([
    row({ 'Order #': order, Value: '145.00', Symbol: 'UBER  260828C00080000', 'Call or Put': 'CALL', 'Underlying Symbol': 'UBER', 'Strike Price': '80' }),
    row({ 'Order #': order, Value: '118.00', Symbol: 'UBER  260828P00064000', 'Call or Put': 'PUT', 'Underlying Symbol': 'UBER', 'Strike Price': '64' }),
    row({
      Action: 'BUY_TO_CLOSE', 'Sub Type': 'Buy to Close', Value: '-111.00',
      Symbol: 'UBER  260828C00080000', 'Call or Put': 'CALL', 'Underlying Symbol': 'UBER',
      'Strike Price': '80', 'Order #': '8001', Date: '2026-07-22T09:30:00-0700'
    })
  ]);

  const uber = bySymbol(trades, 'UBER');
  assert.strictEqual(uber.length, 1);
  assert.strictEqual(uber[0].Exit, null, 'the put is still open');
  assert.strictEqual(uber[0].RealizedGrossPL, 34, 'the closed call leg: 145 - 111');
});

test('a fully closed position realizes its whole P/L', () => {
  const order = '8100';
  const trades = convert([
    row({ 'Order #': order, Value: '145.00', Symbol: 'AMD   260320C00110000', 'Call or Put': 'CALL', 'Strike Price': '110' }),
    row({ 'Order #': order, Value: '118.00' }),
    row({ Action: 'BUY_TO_CLOSE', 'Sub Type': 'Buy to Close', Value: '-111.00', Symbol: 'AMD   260320C00110000', 'Call or Put': 'CALL', 'Strike Price': '110', 'Order #': '8101' }),
    row({ Action: 'BUY_TO_CLOSE', 'Sub Type': 'Buy to Close', Value: '-60.00', 'Order #': '8102' })
  ]);

  assert.strictEqual(trades.length, 1);
  assert.ok(trades[0].Exit);
  assert.strictEqual(trades[0].RealizedGrossPL, 92, '145 + 118 - 111 - 60');
  assert.strictEqual(trades[0].Credit - trades[0].Debit, 92, 'realized equals position P/L when done');
});

// ===== Boundary positions =====

test('a close with no opening leg is kept and flagged, not discarded', () => {
  const trades = convert([
    row({
      Action: 'BUY_TO_CLOSE', 'Sub Type': 'Buy to Close', Value: '-512.00',
      Symbol: 'NFLX  260116P00095000', 'Underlying Symbol': 'NFLX', 'Strike Price': '95',
      'Order #': '9001'
    })
  ]);

  assert.strictEqual(trades.length, 1, 'realized loss must not be dropped');
  assert.strictEqual(trades[0].RealizedGrossPL, -512);
  assert.strictEqual(trades[0]._metadata.incompleteBasis, true);
  assert.ok(trades[0].Exit, 'it is realized even though the open is unknown');
});

// ===== Assigned shares =====

test('assignment creates a share position that stays open until sold', () => {
  const equity = mapper.processEquityTrades([
    {
      Date: '2026-02-17T14:00:00-0800', Type: 'Receive Deliver', 'Sub Type': 'Buy to Open',
      Action: 'BUY_TO_OPEN', Symbol: 'SOFI', 'Instrument Type': 'Equity',
      Value: '-2400.00', Quantity: '100', Commissions: '0.00', Fees: '0.00'
    }
  ]);

  assert.strictEqual(equity.length, 1);
  assert.strictEqual(equity[0].Strategy, 'Long Stock');
  assert.strictEqual(equity[0].Exit, null);
  assert.strictEqual(equity[0].RealizedPL, 0, 'unsold shares realize nothing');
});

test('shares sold after assignment realize their P/L', () => {
  const equity = mapper.processEquityTrades([
    {
      Date: '2026-03-06T14:00:00-0800', Type: 'Receive Deliver', 'Sub Type': 'Buy to Open',
      Action: 'BUY_TO_OPEN', Symbol: 'HOOD', 'Instrument Type': 'Equity',
      Value: '-9000.00', Quantity: '100', Commissions: '0.00', Fees: '0.00'
    },
    {
      Date: '2026-07-02T14:00:00-0700', Type: 'Receive Deliver', 'Sub Type': 'Sell to Close',
      Action: 'SELL_TO_CLOSE', Symbol: 'HOOD', 'Instrument Type': 'Equity',
      Value: '9500.00', Quantity: '100', Commissions: '0.00', Fees: '-0.50'
    }
  ]);

  assert.strictEqual(equity.length, 1);
  assert.ok(equity[0].Exit);
  assert.strictEqual(equity[0].RealizedGrossPL, 500);
  assert.strictEqual(equity[0].RealizedPL, 499.5, 'net of the sale fee');
});

test('share rows are not mistaken for option rows', () => {
  const share = {
    Type: 'Receive Deliver', 'Sub Type': 'Buy to Open', Action: 'BUY_TO_OPEN',
    Symbol: 'SOFI', 'Instrument Type': 'Equity'
  };
  assert.strictEqual(mapper.isOptionTrade(share), false);
  assert.strictEqual(mapper.isOptionRemoval(share), false);
});
