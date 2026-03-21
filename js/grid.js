'use strict';

// ══════════════════════════════════════════════════════════════════
//  GRID BOT CALCULATIONS  —  pure functions, no side effects
//  All field names match actual allMetrics object in app.js:
//    adx      → adx.adx
//    bbBw     → bbBw  (extracted bandwidth %)
//    structure → structure4h
// ══════════════════════════════════════════════════════════════════

/**
 * Net profit per grid after fees.
 * Formula: ((rangeHigh - rangeLow) / rangeLow / gridCount) - (feePct * 2)
 * @returns {{ grossPct, feeCost, netPct, isViable }}
 */
export function calcGridProfitPerGrid(rangeHigh, rangeLow, gridCount, feePct = 0.001) {
  const grossPct = (rangeHigh - rangeLow) / rangeLow / gridCount;
  const feeCost  = feePct * 2;
  const netPct   = grossPct - feeCost;
  return { grossPct, feeCost, netPct, isViable: netPct >= 0.006 };
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
export function calcRecommendedGridCount(rangeHigh, rangeLow, targetNetPctPerGrid = 0.008, feePct = 0.001) {
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
 * Derives a grid range from ATR%.
 * @returns {{ rangeLow, rangeHigh, rangeWidthPct }}
 */
export function calcRangeFromATR(currentPrice, atrPct, multiplier = 2.5) {
  const rangeLow      = currentPrice * (1 - (atrPct / 100) * multiplier);
  const rangeHigh     = currentPrice * (1 + (atrPct / 100) * multiplier);
  const rangeWidthPct = ((rangeHigh - rangeLow) / rangeLow) * 100;
  return { rangeLow, rangeHigh, rangeWidthPct };
}

/**
 * Recommends Arithmetic or Geometric mode based on range width.
 * @returns {{ mode: string, reason: string }}
 */
export function selectGridMode(rangeWidthPct) {
  if (rangeWidthPct >= 20) {
    return { mode: 'Geometric', reason: 'Wide range (≥20%) — geometric grids maintain consistent % profit per step' };
  }
  return { mode: 'Arithmetic', reason: 'Narrow range (<20%) — arithmetic grids are simpler and effective' };
}

/**
 * Stop loss price: sits below the lower bound.
 * @returns {number}
 */
export function calcGridStopLoss(rangeLow, bufferPct = 0.12) {
  return rangeLow * (1 - bufferPct);
}

/**
 * Take profit price: sits above the upper bound.
 * @returns {number}
 */
export function calcGridTakeProfit(rangeHigh, bufferPct = 0.05) {
  return rangeHigh * (1 + bufferPct);
}

/**
 * Assesses whether market conditions are suitable for a grid bot.
 * Uses actual allMetrics field names:
 *   adx      → pass allMetrics[name].adx.adx
 *   bbBw     → pass allMetrics[name].bbBw
 *   structure → pass allMetrics[name].structure4h
 *
 * @returns {{ viable: boolean, reason: string, warning: string|null }}
 */
export function assessGridViability(atrPct, adx, rsi, bbBw, structure) {
  // Block conditions
  if (adx > 25) {
    return { viable: false, reason: `ADX=${adx.toFixed(1)}: strong trend detected — grid bots underperform in trending markets`, warning: null };
  }
  if (rsi > 70) {
    return { viable: false, reason: `RSI=${rsi.toFixed(1)}: overbought — wait for pullback before starting`, warning: null };
  }
  if (bbBw < 1.5) {
    return { viable: false, reason: `BB Bandwidth=${bbBw.toFixed(2)}%: market too compressed — volatility too low for grid profit`, warning: null };
  }
  if (structure === 'Bearish' && adx > 20) {
    return { viable: false, reason: `Bearish structure + ADX=${adx.toFixed(1)}: downtrend with momentum — high bot failure risk`, warning: null };
  }

  // Warn conditions (viable but caution)
  const warnings = [];
  if (atrPct > 5)          warnings.push(`ATR=${atrPct.toFixed(1)}%: high volatility — use Geometric mode and widen range`);
  if (rsi > 60)            warnings.push(`RSI=${rsi.toFixed(1)}: elevated — mild overbought pressure`);
  if (structure === 'Neutral') warnings.push('Neutral market structure — range may shift; monitor closely');

  const warning = warnings.length > 0 ? warnings.join(' | ') : null;
  return { viable: true, reason: 'Market conditions suitable for grid bot', warning };
}

/**
 * Returns hardcoded volatility profile per ticker symbol.
 * @returns {{ profile: string, rangeMultiplier: number, maxGrids: number }}
 */
export function getTickerGridProfile(ticker) {
  const profiles = {
    BTC: { profile: 'stable',   rangeMultiplier: 2.5, maxGrids: 30 },
    ETH: { profile: 'stable',   rangeMultiplier: 2.5, maxGrids: 30 },
    BNB: { profile: 'stable',   rangeMultiplier: 2.5, maxGrids: 30 },
    SOL: { profile: 'moderate', rangeMultiplier: 3.0, maxGrids: 40 },
    TRX: { profile: 'moderate', rangeMultiplier: 3.0, maxGrids: 40 },
    SUI: { profile: 'volatile', rangeMultiplier: 3.5, maxGrids: 50 },
  };
  return profiles[ticker] ?? { profile: 'moderate', rangeMultiplier: 3.0, maxGrids: 40 };
}
