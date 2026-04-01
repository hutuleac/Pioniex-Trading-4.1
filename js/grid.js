'use strict';

import { GRID_CONFIG } from './config.js';

// ══════════════════════════════════════════════════════════════════
//  GRID BOT CALCULATIONS  —  pure functions, no side effects
//  All field names match actual allMetrics object in app.js:
//    adx      → adx.adx
//    bbBw     → bbBw  (extracted bandwidth %)
//    structure → structure4h
// ══════════════════════════════════════════════════════════════════

/**
 * Net profit per grid after fees.
 * Arithmetic: (range%) / gridCount  — fixed $ per step
 * Geometric:  (rangeHigh/rangeLow)^(1/n) − 1  — consistent % per step
 * @returns {{ grossPct, feeCost, netPct, isViable }}
 */
export function calcGridProfitPerGrid(rangeHigh, rangeLow, gridCount, feePct = GRID_CONFIG.FEE_PCT, isGeometric = false) {
  const grossPct = isGeometric
    ? Math.pow(rangeHigh / rangeLow, 1 / gridCount) - 1
    : (rangeHigh - rangeLow) / rangeLow / gridCount;
  const feeCost  = feePct * 2;
  const netPct   = grossPct - feeCost;
  return { grossPct, feeCost, netPct, isViable: netPct >= GRID_CONFIG.MIN_NET_PCT };
}

/**
 * Capital allocated per grid slot.
 * @returns {number}
 */
export function calcGridCapitalPerGrid(totalCapital, gridCount) {
  return totalCapital / gridCount;
}

/**
 * Worst-case drawdown: price drops below rangeLow to crashTargetPrice.
 * Assumes all capital converts to coin at average price of rangeLow.
 * @returns {{ coinsHeld, valueAtCrash, drawdownUSDT, drawdownPct }}
 */
export function calcDrawdownScenario(totalCapital, rangeLow, currentPrice, crashTargetPrice) {
  const coinsHeld    = totalCapital / rangeLow;
  const valueAtCrash = coinsHeld * crashTargetPrice;
  const drawdownUSDT = totalCapital - valueAtCrash;
  const drawdownPct  = drawdownUSDT / totalCapital;
  return { coinsHeld, valueAtCrash, drawdownUSDT, drawdownPct };
}

/**
 * Works backwards from target net profit/grid to find viable grid count.
 * @returns {{ recommended, min, max }}
 */
export function calcRecommendedGridCount(rangeHigh, rangeLow, targetNetPctPerGrid = GRID_CONFIG.TARGET_NET_PCT, feePct = GRID_CONFIG.FEE_PCT) {
  const totalRange = (rangeHigh - rangeLow) / rangeLow;
  const feeCost    = feePct * 2;

  // recommended: achieves target net %
  const recommended = Math.max(1, Math.round(totalRange / (targetNetPctPerGrid + feeCost)));

  // min: just above break-even (netPct > 0)
  let min = 1;
  for (let g = 1; g <= 200; g++) {
    const net = totalRange / g - feeCost;
    if (net > 0) { min = g; break; }
  }

  // max: capped at 100
  const max = Math.min(100, Math.round(totalRange / (0.001 + feeCost)));

  return {
    recommended: Math.max(min, Math.min(recommended, 100)),
    min,
    max: Math.max(min, max),
  };
}

/**
 * Derives a grid range from ATR%, adjusted for grid direction.
 * Neutral: symmetric around price.
 * Long:    range sits below price — accumulate on dips.
 * Short:   range sits above price — sell into pumps.
 * @returns {{ rangeLow, rangeHigh, rangeWidthPct }}
 */
export function calcRangeFromATR(currentPrice, atrPct, multiplier = GRID_CONFIG.ATR_MULTIPLIER_DEFAULT, gridType = 'Neutral') {
  const offset = (atrPct / 100) * multiplier;
  let rangeLow, rangeHigh;
  if (gridType === 'Long') {
    rangeLow  = currentPrice * (1 - offset * 2);
    rangeHigh = currentPrice * (1 + offset * 0.25);
  } else if (gridType === 'Short') {
    rangeLow  = currentPrice * (1 - offset * 0.25);
    rangeHigh = currentPrice * (1 + offset * 2);
  } else {
    rangeLow  = currentPrice * (1 - offset);
    rangeHigh = currentPrice * (1 + offset);
  }
  const rangeWidthPct = ((rangeHigh - rangeLow) / rangeLow) * 100;
  return { rangeLow, rangeHigh, rangeWidthPct };
}

/**
 * Selects grid direction (Long / Short / Neutral) from market structure + score.
 * Uses GRID_CONFIG.DIRECTION thresholds for conservative selection.
 * @returns {{ type: string, label: string, reason: string }}
 */
export function selectGridDirection(structure4h, score) {
  const D = GRID_CONFIG.DIRECTION;
  if (structure4h === 'Bullish' && score >= D.LONG_MIN_SCORE)
    return { type: 'Long',    label: 'Long Grid',    reason: 'Bullish structure — range biased below price to accumulate on dips' };
  if (structure4h === 'Bearish' && score < D.SHORT_MAX_SCORE)
    return { type: 'Short',   label: 'Short Grid',   reason: 'Bearish structure — range biased above price to sell into pumps' };
  return   { type: 'Neutral', label: 'Neutral Grid', reason: 'No strong directional bias — range straddles current price' };
}

/**
 * Recommends Arithmetic or Geometric mode based on range width.
 * @returns {{ mode: string, reason: string }}
 */
export function selectGridMode(rangeWidthPct) {
  if (rangeWidthPct >= GRID_CONFIG.GEOMETRIC_THRESHOLD_PCT) {
    return { mode: 'Geometric', reason: `Wide range (≥${GRID_CONFIG.GEOMETRIC_THRESHOLD_PCT}%) — geometric grids maintain consistent % profit per step` };
  }
  return { mode: 'Arithmetic', reason: `Narrow range (<${GRID_CONFIG.GEOMETRIC_THRESHOLD_PCT}%) — arithmetic grids are simpler and effective` };
}

/**
 * Stop loss price: sits below the lower bound.
 * Buffer scales with volatility profile via GRID_CONFIG.SL_BUFFERS.
 * @returns {number}
 */
export function calcGridStopLoss(rangeLow, profile = 'moderate') {
  const buf = GRID_CONFIG.SL_BUFFERS[profile] ?? GRID_CONFIG.SL_BUFFERS.moderate;
  return rangeLow * (1 - buf);
}

/**
 * Take profit price: sits above the upper bound.
 * Buffer scales with volatility profile via GRID_CONFIG.TP_BUFFERS.
 * @returns {number}
 */
export function calcGridTakeProfit(rangeHigh, profile = 'moderate') {
  const buf = GRID_CONFIG.TP_BUFFERS[profile] ?? GRID_CONFIG.TP_BUFFERS.moderate;
  return rangeHigh * (1 + buf);
}

/**
 * Assesses whether market conditions are suitable for a grid bot.
 * All thresholds driven by GRID_CONFIG.VIABILITY for central control.
 * @returns {{ viable: boolean, reason: string, warning: string|null }}
 */
export function assessGridViability(atrPct, adx, rsi, bbBw, structure) {
  const V = GRID_CONFIG.VIABILITY;

  if (adx > V.ADX_BLOCK)
    return { viable: false, reason: `ADX=${adx.toFixed(1)}: trend detected (>${V.ADX_BLOCK}) — grid bots underperform in trending markets`, warning: null };
  if (rsi > V.RSI_BLOCK)
    return { viable: false, reason: `RSI=${rsi.toFixed(1)}: overbought (>${V.RSI_BLOCK}) — wait for pullback before starting`, warning: null };
  if (bbBw < V.BB_MIN)
    return { viable: false, reason: `BB Bandwidth=${bbBw.toFixed(2)}%: too compressed (<${V.BB_MIN}%) — insufficient volatility for grid profit`, warning: null };
  if (structure === 'Bearish' && adx > V.BEARISH_ADX_BLOCK)
    return { viable: false, reason: `Bearish structure + ADX=${adx.toFixed(1)} (>${V.BEARISH_ADX_BLOCK}): downtrend with momentum — high bot failure risk`, warning: null };

  const warnings = [];
  if (atrPct > V.ATR_WARN)    warnings.push(`ATR=${atrPct.toFixed(1)}%: elevated volatility — use Geometric mode and widen range`);
  if (rsi > V.RSI_WARN_HIGH)  warnings.push(`RSI=${rsi.toFixed(1)}: elevated — mild overbought pressure`);
  if (rsi < V.RSI_WARN_LOW)   warnings.push(`RSI=${rsi.toFixed(1)}: oversold — confirm structure before starting, price may continue lower`);
  if (structure === 'Neutral') warnings.push('Neutral market structure — range may shift; monitor closely');

  return { viable: true, reason: 'Market conditions suitable for grid bot', warning: warnings.length ? warnings.join(' | ') : null };
}

/**
 * Estimates how many days a grid should run based on range width vs daily ATR.
 * ATR is 4h-based; multiply by ~1.5 to approximate daily range.
 * @returns {{ estDays: number, label: string }}
 */
export function estimateGridDuration(rangeWidthPct, atrPct) {
  const dailyRangePct = atrPct * 1.5;
  if (dailyRangePct <= 0) return { estDays: 0, label: '—' };
  const estDays = Math.max(1, Math.min(Math.round(rangeWidthPct / dailyRangePct), 30));
  const label   = estDays <= 3 ? '1–3 days' : estDays <= 7 ? '3–7 days' : estDays <= 14 ? '1–2 weeks' : '2–4 weeks';
  return { estDays, label };
}

/**
 * Returns volatility profile per ticker symbol.
 * @returns {{ profile: string, rangeMultiplier: number, maxGrids: number }}
 */
export function getTickerGridProfile(ticker) {
  const profiles = {
    BTC:  { profile: 'stable',   rangeMultiplier: 2.5, maxGrids: 30 },
    ETH:  { profile: 'stable',   rangeMultiplier: 2.5, maxGrids: 30 },
    BNB:  { profile: 'stable',   rangeMultiplier: 2.5, maxGrids: 30 },
    SOL:  { profile: 'moderate', rangeMultiplier: 3.0, maxGrids: 40 },
    TRX:  { profile: 'moderate', rangeMultiplier: 3.0, maxGrids: 40 },
    DOGE: { profile: 'moderate', rangeMultiplier: 3.0, maxGrids: 40 },
    XLM:  { profile: 'moderate', rangeMultiplier: 3.0, maxGrids: 40 },
    XRP:  { profile: 'moderate', rangeMultiplier: 3.0, maxGrids: 40 },
    SUI:  { profile: 'volatile', rangeMultiplier: 3.5, maxGrids: 50 },
    HYPE: { profile: 'volatile', rangeMultiplier: 3.5, maxGrids: 50 },
  };
  return profiles[ticker] ?? { profile: 'moderate', rangeMultiplier: 3.0, maxGrids: 40 };
}
