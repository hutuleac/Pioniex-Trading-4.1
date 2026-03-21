'use strict';

import { CFG, LEGENDS, GRID_CONFIG, getGridCapital, setGridCapital } from './config.js';
import { calcRangeFromATR, calcRecommendedGridCount, calcGridProfitPerGrid,
         calcDrawdownScenario, selectGridMode, calcGridStopLoss, calcGridTakeProfit,
         assessGridViability, getTickerGridProfile } from './grid.js';
import { fetchPriceFunding } from './api.js';
import { getAdvancedMetrics, interpretSignals, calcScore, calcBotParams,
         calcRecommendation, calcDirectionConditions } from './indicators.js';
import { buildTableRow, buildSigCard, buildScoreRow, buildScoreDetail, buildBotCard,
         buildFastRow, buildDeepCard, renderCryptoRiskNotice, renderGridPanel } from './ui.js';

// ══════════════════════════════════════════════════════════════════
//  MODULE-LEVEL STATE
// ══════════════════════════════════════════════════════════════════
let SYMBOLS = { BTC:"BTCUSDT", ETH:"ETHUSDT", BNB:"BNBUSDT", SOL:"SOLUSDT", TRX:"TRXUSDT", SUI:"SUIUSDT" };
let symProvider = {};     // name → 'Binance' | 'Bybit'
let refreshTimer = null, countdownTimer = null, nextRefresh = 0;
let isLoading = false;
let lastAllMetrics = {};  // cached for grid panel re-render on capital change


// ══════════════════════════════════════════════════════════════════
//  STATUS + TIMER
// ══════════════════════════════════════════════════════════════════
function setStatus(state, text) {
  document.getElementById('status-dot').className = 'dot ' + state;
  document.getElementById('status-text').textContent = text;
}

function scheduleRefresh() {
  if (refreshTimer)   clearTimeout(refreshTimer);
  if (countdownTimer) clearInterval(countdownTimer);
  nextRefresh = Date.now() + CFG.REFRESH_INTERVAL_SEC * 1000;
  refreshTimer = setTimeout(fetchAndDisplay, CFG.REFRESH_INTERVAL_SEC * 1000);
  countdownTimer = setInterval(() => {
    const s = Math.max(0, Math.round((nextRefresh - Date.now()) / 1000));
    document.getElementById('countdown').textContent =
      `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
  }, 1000);
}

function triggerRefresh() {
  if (refreshTimer)   clearTimeout(refreshTimer);
  if (countdownTimer) clearInterval(countdownTimer);
  isLoading = false; // allow re-entry
  fetchAndDisplay();
}

// ══════════════════════════════════════════════════════════════════
//  MAIN REFRESH LOOP
// ══════════════════════════════════════════════════════════════════
async function fetchAndDisplay() {
  if (isLoading) return;
  isLoading = true;
  const refreshBtn = document.getElementById('refresh-btn');
  if (refreshBtn) refreshBtn.disabled = true;
  setStatus('loading', 'Fetching…');

  const tbody = document.getElementById('main-tbody');
  tbody.innerHTML = Object.keys(SYMBOLS).map(n =>
    `<tr class="shimmer"><td>${n}</td>${'<td>…</td>'.repeat(24)}</tr>`
  ).join('');
  const fastTbodyShimmer = document.getElementById('fast-tbody');
  if (fastTbodyShimmer) {
    fastTbodyShimmer.innerHTML = Object.keys(SYMBOLS).map(n =>
      `<tr class="shimmer"><td>${n}</td>${'<td>…</td>'.repeat(10)}</tr>`
    ).join('');
  }

  const allMetrics = {}, allSignals = {}, allScores = {}, allBots = {}, allDirConds = {}, allRecs = {};

  for (const [name, symbol] of Object.entries(SYMBOLS)) {
    try {
      // 1. price + funding (with fallback)
      const pf = await fetchPriceFunding(name, symbol);
      symProvider[name] = pf.provider;

      // 2. all advanced metrics (klines, OI, calculations)
      const m  = await getAdvancedMetrics(name, symbol);

      // 3. signals, score, bot
      const signals = interpretSignals(
        pf.price, m.rsi, m.atr, m.flow, m.oiChange,
        m.poc5d, m.avwap5d, m.poc14d, m.avwap14d, m.avwap30d,
        m.cvd5d, m.cvd14d, m.cvd30d,
        m.structure4h, m.structure30d, m.sweep, m.fvgList,
        m.emaFast, m.emaSlow, m.volSpike, m.volCurr, m.volAvg
      );

      const { score, direction, detail } = calcScore(
        pf.price, m.atr, m.rsi, m.flow, m.oiChange,
        m.poc5d, m.avwap5d, m.poc14d, m.avwap14d, m.avwap30d,
        m.cvd5d, m.cvd14d, m.cvd30d,
        m.structure4h, m.structure30d, m.sweep, m.fvgList,
        m.emaFast, m.emaSlow
      );

      const bot = calcBotParams(pf.price, m.atr, score, direction, m.poc5d, m.poc14d, m.avwap5d, m.fvgList);

      const mFull   = { ...m, price:pf.price, funding:pf.funding };
      const dirConds = calcDirectionConditions(pf.price, m.emaSlow, m.structure4h, m.structure30d, m.avwap30d, m.rsi, m.adx?.adx ?? 0, direction);
      const rec      = calcRecommendation(score, direction, m.atrPct ?? 0, pf.funding, m.rsi);

      // Grid bot advisory calculations
      const gridProfile = getTickerGridProfile(name);
      mFull.gridProfile     = gridProfile;
      mFull.gridViability   = assessGridViability(mFull.atrPct ?? 0, mFull.adx?.adx ?? 0, mFull.rsi, mFull.bbBw ?? 0, mFull.structure4h);
      mFull.gridRange       = calcRangeFromATR(pf.price, mFull.atrPct ?? 1, gridProfile.rangeMultiplier);
      mFull.gridRecommendation = calcRecommendedGridCount(mFull.gridRange.rangeHigh, mFull.gridRange.rangeLow);
      mFull.gridProfitPerGrid  = calcGridProfitPerGrid(mFull.gridRange.rangeHigh, mFull.gridRange.rangeLow, mFull.gridRecommendation.recommended);
      mFull.gridDrawdown    = calcDrawdownScenario(getGridCapital(), mFull.gridRange.rangeLow, pf.price, mFull.gridRange.rangeLow * 0.85);
      mFull.gridMode        = selectGridMode(mFull.gridRange.rangeWidthPct);
      mFull.gridSL          = calcGridStopLoss(mFull.gridRange.rangeLow);
      mFull.gridTP          = calcGridTakeProfit(mFull.gridRange.rangeHigh);

      allMetrics[name] = mFull;
      allSignals[name] = { price:pf.price, signals };
      allScores[name]  = { score, direction, detail };
      allBots[name]    = bot;
      allDirConds[name] = dirConds;
      allRecs[name]     = rec;

    } catch(e) {
      console.error(`[${name}] FATAL:`, e);
      allMetrics[name] = null;
      allSignals[name] = null;
    }
  }

  // ── Render fast decision table ─────────────────────────────────
  const fastTbody = document.getElementById('fast-tbody');
  if (fastTbody) {
    fastTbody.innerHTML = Object.entries(allMetrics).map(([name, m]) => {
      if (!m) return '';
      return buildFastRow(name, m, symProvider[name]||'?', allScores[name]?.score??0,
        allScores[name]?.direction??null, allDirConds[name], allRecs[name]);
    }).join('');
    // Populate deep card content
    Object.entries(allMetrics).forEach(([name, m]) => {
      if (!m) return;
      const deepTd = document.querySelector(`#deep-${name} td`);
      if (deepTd) {
        deepTd.innerHTML = buildDeepCard(name, m, allScores[name]?.score??0,
          allScores[name]?.direction??null, allDirConds[name], allRecs[name]);
      }
    });
    if (window._attachHeaderTips) window._attachHeaderTips();
  }

  // ── Render main table ──────────────────────────────────────────
  tbody.innerHTML = Object.entries(allMetrics).map(([name, m]) => {
    if (!m) return `<tr><td>${name}</td><td colspan="24" style="color:var(--red);text-align:left">Error: both Binance and Bybit failed for this symbol</td></tr>`;
    return buildTableRow(name, m, symProvider[name]||'?');
  }).join('') || `<tr><td colspan="25" class="empty">No data</td></tr>`;

  // ── Render signals ─────────────────────────────────────────────
  document.getElementById('signals-grid').innerHTML =
    Object.entries(allSignals).filter(([,v])=>v).map(([name,{price,signals}]) =>
      buildSigCard(name, price, signals, symProvider[name])
    ).join('') || '<div class="empty" style="grid-column:1/-1">No signal data</div>';

  // ── Render scores ──────────────────────────────────────────────
  const sorted = Object.entries(allScores).sort((a,b) => b[1].score - a[1].score);
  document.getElementById('score-tbody').innerHTML =
    sorted.map(([n,{score,direction}]) => buildScoreRow(n, score, direction, allBots[n])).join('') ||
    '<tr><td colspan="6" class="empty">—</td></tr>';
  document.getElementById('score-details').innerHTML =
    sorted.map(([n,{score,direction,detail}]) => buildScoreDetail(n, score, direction, detail)).join('');

  // ── Render bots ────────────────────────────────────────────────
  const active = sorted.filter(([n]) => allBots[n]);
  document.getElementById('bot-grid').innerHTML = active.length
    ? active.map(([n,{score,direction}]) => buildBotCard(n, allBots[n], score, direction)).join('')
    : `<div class="empty">No asset has reached score ${CFG.SCORE_BOT_MIN} yet.<br><small>Watch for: 4H sweep or STRONG BUY/SELL pressure to upgrade score.</small></div>`;

  // ── Render grid bot advisor ────────────────────────────────────
  lastAllMetrics = allMetrics;
  document.getElementById('grid-risk-notice').innerHTML = renderCryptoRiskNotice(allMetrics);
  document.getElementById('grid-panel').innerHTML       = renderGridPanel(allMetrics, getGridCapital());

  // Wire copy buttons (after innerHTML is set)
  document.querySelectorAll('.grid-copy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const text = btn.dataset.text.replace(/&quot;/g, '"');
      navigator.clipboard.writeText(text).then(() => {
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
      });
    });
  });

  // ── Status ─────────────────────────────────────────────────────
  const ok = Object.values(allMetrics).filter(Boolean).length;
  document.getElementById('last-update').textContent = `Updated: ${new Date().toLocaleTimeString('en-GB')}`;
  setStatus('live', `Live · ${ok}/${Object.keys(SYMBOLS).length} ok`);
  isLoading = false;
  if (refreshBtn) refreshBtn.disabled = false;
  scheduleRefresh();
}

// ══════════════════════════════════════════════════════════════════
//  MODAL
// ══════════════════════════════════════════════════════════════════
function showModal() {
  document.getElementById('modal-body').innerHTML = `
    <p><strong>Refresh interval:</strong> ${CFG.REFRESH_INTERVAL_SEC}s (${CFG.REFRESH_INTERVAL_SEC/60} min)</p>
    <p><strong>Score bot minimum:</strong> ${CFG.SCORE_BOT_MIN}/10</p>
    <p><strong>RSI OB/OS:</strong> ${CFG.RSI_OB} / ${CFG.RSI_OS} (extreme: ${CFG.RSI_EXTREME_OB}/${CFG.RSI_EXTREME_OS})</p>
    <p><strong>Flow strong threshold:</strong> ±${CFG.FLOW_STRONG}%</p>
    <p><strong>OI squeeze high/med:</strong> >${CFG.OI_SQUEEZE_HIGH}% / >${CFG.OI_SQUEEZE_MED}%</p>
    <p><strong>SL mult:</strong> ${CFG.SL_ATR_MULT}×ATR · <strong>TP1:</strong> ${CFG.TP1_ATR_MULT}×SL · <strong>TP2:</strong> ${CFG.TP2_ATR_MULT}×SL</p>
    <p><strong>API primary:</strong> Binance Futures (fapi.binance.com)</p>
    <p><strong>API fallback:</strong> Bybit V5 (api.bybit.com) — BuyVol estimated via Williams %R</p>
    <p style="margin-top:10px;font-size:.65rem;color:var(--dim)">All parameters match Trading.py. Bybit CVD uses price-action approximation when taker buy vol is unavailable.</p>
    <div style="margin-top:14px;border-top:1px solid var(--border2);padding-top:12px">
      <label style="display:block;font-size:.75rem;font-weight:600;margin-bottom:6px;color:var(--text)">Grid Bot Capital (USDT)</label>
      <div style="display:flex;align-items:center;gap:8px">
        <input id="grid-capital-input" type="number" min="50" max="100000" step="10"
          value="${getGridCapital()}"
          style="background:var(--bg2);border:1px solid var(--border2);color:var(--text);padding:5px 8px;border-radius:4px;font-family:'IBM Plex Mono',monospace;font-size:.82rem;width:120px">
        <button id="btn-save-capital" class="btn primary" style="font-size:.75rem">Save</button>
        <span id="capital-saved-msg" style="font-size:.7rem;color:var(--green);display:none">Saved!</span>
      </div>
      <p style="font-size:.65rem;color:var(--dim);margin-top:4px">Default: $500. Used for capital/grid and drawdown calculations.</p>
    </div>`;
  document.getElementById('modal-overlay').classList.add('show');

  document.getElementById('btn-save-capital').addEventListener('click', () => {
    const val = parseFloat(document.getElementById('grid-capital-input').value);
    if (!isNaN(val) && val >= 50) {
      setGridCapital(val);
      document.getElementById('grid-panel').innerHTML = renderGridPanel(lastAllMetrics, val);
      // Re-wire copy buttons after re-render
      document.querySelectorAll('.grid-copy-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const text = btn.dataset.text.replace(/&quot;/g, '"');
          navigator.clipboard.writeText(text).then(() => {
            btn.textContent = 'Copied!';
            setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
          });
        });
      });
      const msg = document.getElementById('capital-saved-msg');
      if (msg) { msg.style.display = 'inline'; setTimeout(() => { msg.style.display = 'none'; }, 2000); }
    }
  });
}
function hideModal() { document.getElementById('modal-overlay').classList.remove('show'); }

// ══════════════════════════════════════════════════════════════════
//  SCORE BREAKDOWN TOGGLE
// ══════════════════════════════════════════════════════════════════
function toggleScoreDetails() {
  const details = document.getElementById('score-details');
  const ci      = document.getElementById('details-ci');
  const btnText = document.getElementById('details-btn-text');
  if (details.style.display === 'none') {
    details.style.display = 'block';
    ci.textContent = '▼';
    btnText.textContent = 'Hide Score Breakdown';
  } else {
    details.style.display = 'none';
    ci.textContent = '▶';
    btnText.textContent = 'Show Score Breakdown';
  }
}

// ══════════════════════════════════════════════════════════════════
//  GLOSSARY TOGGLE
// ══════════════════════════════════════════════════════════════════
function toggleGlossary() {
  const grid = document.getElementById('legend-grid');
  const ci   = document.getElementById('glossary-ci');
  if (grid.style.display === 'none') {
    grid.style.display = 'grid';
    ci.textContent = '▼';
  } else {
    grid.style.display = 'none';
    ci.textContent = '▶';
  }
}

// ══════════════════════════════════════════════════════════════════
//  HEADER TOOLTIP FLOATER
//  Uses position:fixed to bypass overflow-x:auto clipping on the
//  main metrics table.
// ══════════════════════════════════════════════════════════════════
function initHeaderTooltips() {
  const floater = document.createElement('div');
  floater.id = 'th-tip-floater';
  document.body.appendChild(floater);

  function showFloater(tipEl, anchorEl) {
    floater.innerHTML = tipEl.innerHTML;
    floater.style.display = 'block';

    const r  = anchorEl.getBoundingClientRect();
    const fw = floater.offsetWidth;
    const fh = floater.offsetHeight;
    let left = r.left + r.width / 2 - fw / 2;
    let top  = r.bottom + 6;

    left = Math.max(6, Math.min(left, window.innerWidth - fw - 6));
    if (top + fh > window.innerHeight - 6) top = r.top - fh - 6;

    floater.style.left = left + 'px';
    floater.style.top  = top  + 'px';
  }

  function attachHeaderTips() {
    document.querySelectorAll('th .tip').forEach(tip => {
      if (tip._thTipBound) return; // avoid duplicate listeners
      tip._thTipBound = true;
      const tiptext = tip.querySelector('.tiptext');
      if (!tiptext) return;
      tip.addEventListener('mouseenter', () => showFloater(tiptext, tip));
      tip.addEventListener('mouseleave', () => { floater.style.display = 'none'; });
    });
  }

  attachHeaderTips();
  window._attachHeaderTips = attachHeaderTips;
}

// ══════════════════════════════════════════════════════════════════
//  INIT  — wire up events, render legend, chips, then auto-start fetch
// ══════════════════════════════════════════════════════════════════

// Event listeners — replace all inline onclick handlers
document.getElementById('refresh-btn').addEventListener('click', triggerRefresh);
document.getElementById('btn-config').addEventListener('click', showModal);
document.getElementById('toggle-details-btn').addEventListener('click', toggleScoreDetails);
document.getElementById('btn-glossary').addEventListener('click', toggleGlossary);
document.getElementById('btn-close-modal').addEventListener('click', hideModal);
document.getElementById('modal-overlay').addEventListener('click', e => { if (e.target === e.currentTarget) hideModal(); });

// Fast table click expand handler
document.addEventListener('click', e => {
  const row = e.target.closest('.fast-row');
  if (!row) return;
  const name = row.dataset.name;
  const deepRow = document.getElementById(`deep-${name}`);
  if (!deepRow) return;
  const isOpen = deepRow.style.display !== 'none';
  deepRow.style.display = isOpen ? 'none' : 'table-row';
  row.classList.toggle('expanded', !isOpen);
});

// Full metrics column toggle
document.getElementById('btn-toggle-cols')?.addEventListener('click', e => {
  const table    = document.querySelector('.main-metrics-table');
  const btn      = e.currentTarget;
  const expanded = table.classList.toggle('expanded');
  btn.textContent = expanded ? '⊟ Compact' : '⊞ Show All';
});

// Collapsible sections
document.querySelectorAll('.collapsible-toggle').forEach(el => {
  el.addEventListener('click', () => {
    const target = document.getElementById(el.dataset.target);
    if (target) target.classList.toggle('hidden');
    el.classList.toggle('collapsed');
  });
});

// Render legend
document.getElementById('legend-grid').innerHTML = LEGENDS.map(([n,d]) =>
  `<div class="legend-item"><div class="legend-name">${n}</div><div class="legend-desc">${d}</div></div>`
).join('');

// Init header tooltips
initHeaderTooltips();

fetchAndDisplay();
