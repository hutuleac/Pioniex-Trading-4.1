'use strict';

import { CFG, SIG_TIPS, GRID_CONFIG } from './config.js';
import { fvgStatus } from './indicators.js';

// ══════════════════════════════════════════════════════════════════
//  FORMATTERS
// ══════════════════════════════════════════════════════════════════
const CC = { bull:'bull', bear:'bear', neutral:'neutral', warn:'warn' };
export function col(val, cls) { return `<span class="${CC[cls]||''}">${val}</span>`; }
export function fmt(n, d=2)   { return n==null ? '—' : Number(n).toLocaleString('en',{minimumFractionDigits:d,maximumFractionDigits:d}); }
export function fmtB(n)        { return n==null ? '—' : Number(n).toLocaleString('en',{maximumFractionDigits:0}); }
export function sCol(s)        {
  if (s==="Bullish") return col(s,"bull");
  if (s==="Bearish") return col(s,"bear");
  return `<span class="neutral">${s}</span>`;
}
export function scClass(s) { return s>=8?'s-high':s>=6?'s-mid':'s-low'; }
export function scColor(s) { return s>=8?'var(--green)':s>=6?'var(--yellow)':'var(--red)'; }

// ══════════════════════════════════════════════════════════════════
//  MARKET PULSE STRIP
// ══════════════════════════════════════════════════════════════════
export function buildMarketPulseStrip(pulse) {
  const { volume24h, fg, smartMoney, socialHype } = pulse || {};

  const volStr = volume24h == null ? '—'
    : volume24h >= 1e9 ? `$${(volume24h / 1e9).toFixed(2)}B`
    : `$${(volume24h / 1e6).toFixed(0)}M`;

  let fgCls = 'neutral', fgStr = '—';
  if (fg) {
    fgStr = `${fg.value} ${fg.label}`;
    fgCls = fg.value >= 60 ? 'bull' : fg.value <= 40 ? 'bear' : 'warn';
  }

  let smCls = 'neutral', smStr = '—';
  if (smartMoney) {
    const lbl = smartMoney.bias === 'long' ? 'Long' : smartMoney.bias === 'short' ? 'Short' : 'Neutral';
    smStr = `${lbl} ${smartMoney.ratio.toFixed(2)}×`;
    smCls = smartMoney.bias === 'long' ? 'bull' : smartMoney.bias === 'short' ? 'bear' : 'neutral';
  }

  let shCls = 'neutral', shStr = '—';
  if (socialHype) {
    const lbl = socialHype.bias === 'buy' ? 'Buy' : socialHype.bias === 'sell' ? 'Sell' : 'Neutral';
    shStr = `${lbl} ${socialHype.pct.toFixed(0)}%`;
    shCls = socialHype.bias === 'buy' ? 'bull' : socialHype.bias === 'sell' ? 'bear' : 'neutral';
  }

  const pill = (label, val, cls) =>
    `<div class="pill pulse-pill"><span class="pulse-label">${label}</span><span class="${cls}">${val}</span></div>`;
  return [
    pill('24h Vol', volStr, ''),
    pill('F&amp;G',  fgStr,  fgCls),
    pill('Smart $', smStr,  smCls),
  ].join('');
}

export function sigValHtml(val, cls) {
  const cm = { bull:'color:var(--green)', bear:'color:var(--red)', warn:'color:var(--yellow)', neutral:'color:var(--text2)' };
  return `<span style="${cm[cls]||''};font-weight:700">${val}</span>`;
}

// ══════════════════════════════════════════════════════════════════
//  DOM STRING BUILDERS
// ══════════════════════════════════════════════════════════════════

// ── Main table row ────────────────────────────────────────────────
export function buildTableRow(name, m, prov) {
  const rsiH  = m.rsi>70 ? col(fmt(m.rsi,1),"bear") : m.rsi<30 ? col(fmt(m.rsi,1),"bull") : fmt(m.rsi,1);
  const fundH = m.funding>0 ? col(fmt(m.funding,4)+"%","warn") : col(fmt(m.funding,4)+"%","neutral");
  const flowH = m.flow>5 ? col(fmt(m.flow,1)+"%","bull") : m.flow<-5 ? col(fmt(m.flow,1)+"%","bear") : fmt(m.flow,1)+"%";
  const oiH   = m.oiChange>5 ? col(fmt(m.oiChange,2)+"%","bull") : m.oiChange<-5 ? col(fmt(m.oiChange,2)+"%","bear") : fmt(m.oiChange,2)+"%";
  const cvdH  = v => v>0 ? col("[ACC]","bull") : col("[DIS]","bear");
  const trend = m.price>m.avwap5d ? col("[UP]","bull") : col("[DN]","bear");
  const pairs = [Math.abs(m.poc5d-m.poc14d)/m.poc14d*100, Math.abs(m.poc5d-m.poc30d)/m.poc30d*100, Math.abs(m.poc14d-m.poc30d)/m.poc30d*100];
  const conf  = pairs.filter(p=>p<1.5).length>=2 ? col("[YES]","warn") : "–";
  const sweepH= m.sweep==="BUY_SWP" ? col("[BUY SWP]","bear") : m.sweep==="SELL_SWP" ? col("[SELL SWP]","bull") : `<span class="neutral">Neutral</span>`;
  const emaFC = m.price>m.emaFast ? col(fmt(m.emaFast,2),"bull") : col(fmt(m.emaFast,2),"bear");
  let fvgH = "–";
  if (m.fvgList?.length) {
    const g=m.fvgList[0], st=fvgStatus(m.price,g);
    const typ=g.type==='BULL'?'B':'S', zone=`${g.bottom.toFixed(2)}-${g.top.toFixed(2)}`;
    if (st.state==='inside') fvgH = col(`${typ}-FVG ${zone} [IN ${st.fillPct.toFixed(0)}%]`,"warn");
    else fvgH = col(`${typ}-FVG ${zone} d:${st.distPct.toFixed(2)}%`, g.type==='BULL'?"bull":"bear");
  }
  const provH = prov==='Bybit' ? `<span style="color:var(--orange);font-size:.6rem">BB</span>` : `<span style="color:var(--cyan2);font-size:.6rem">BN</span>`;
  const tvEx  = prov==='Bybit' ? 'BYBIT' : 'BINANCE';
  const tvLink = `<a href="https://www.tradingview.com/chart/?symbol=${tvEx}%3A${name}USDT.P" target="_blank" rel="noopener" class="tv-link">${name}</a>`;
  return `<tr>
    <td>${tvLink}</td><td>${fmt(m.price,2)}</td><td>${fundH}</td><td>${rsiH}</td>
    <td>${fmt(m.atr,4)}</td><td>${flowH}</td><td>${fmt(m.poc5d,1)}</td>
    <td>${fmt(m.poc14d,1)}</td><td>${fmt(m.avwap5d,1)}</td>
    <td>${fmt(m.avwap14d,1)}</td><td>${fmt(m.avwap30d,1)}</td>
    <td>${cvdH(m.cvd5d)}</td><td>${cvdH(m.cvd14d)}</td><td>${cvdH(m.cvd30d)}</td>
    <td>${fmtB(m.oiNow)}</td><td>${oiH}</td>
    <td>${sCol(m.structure4h)}</td><td>${sCol(m.structure30d)}</td>
    <td>${emaFC}</td><td>${fmt(m.emaSlow,2)}</td>
    <td>${trend}</td><td>${conf}</td><td>${sweepH}</td><td>${fvgH}</td><td>${provH}</td>
  </tr>`;
}

// ── Signal card ───────────────────────────────────────────────────
export function buildSigCard(name, price, signals, prov) {
  const cats = ['Trend Macro','Trend Swing','Presiune','Calitate Trend','Setup','Risc','Bot Grid','FVG','EMA Trend','Vol Spike'];
  const rows = cats.map(cat => {
    const [val,cls,desc] = signals[cat] || ["–","neutral","—"];
    const tip = SIG_TIPS[cat] ? ` title="${SIG_TIPS[cat]}"` : '';
    return `<div class="sig-row"><span class="sig-cat" style="cursor:help"${tip}>${cat}</span><span class="sig-val">${sigValHtml(val,cls)}</span><span class="sig-desc">${desc}</span></div>`;
  }).join('');
  const mc = signals['Trend Macro']?.[1];
  const pc = mc==='bull'?'var(--green)':mc==='bear'?'var(--red)':'var(--cyan)';
  const pb = prov==='Bybit'?`<span class="prov-badge">Bybit</span>`:`<span class="prov-badge">Binance</span>`;
  const edgeCls = mc==='bull' ? 'edge-bull' : mc==='bear' ? 'edge-bear' : 'edge-neutral';
  return `<div class="sig-card ${edgeCls}">
    <div class="sig-head">
      <span class="sym">${name}</span>
      <span class="price" style="color:${pc}">${fmt(price,2)}</span>
      ${pb}
    </div>
    <div class="sig-rows">${rows}</div>
  </div>`;
}

// ── Bot card ──────────────────────────────────────────────────────
export function buildBotCard(name, bot, score, dir, prov) {
  const tvEx   = prov==='Bybit' ? 'BYBIT' : 'BINANCE';
  const tvLink = `<a href="https://www.tradingview.com/chart/?symbol=${tvEx}%3A${name}USDT.P" target="_blank" rel="noopener" class="tv-link">${name}</a>`;
  const cls = dir==="LONG"?"long":"short", dc = dir==="LONG"?"bull":"bear";
  const rules = dir==="LONG" ? `
    <p>1. Wait for 4H close above ${fmt(bot.entry,4)}</p>
    <p>2. Hard SL at ${fmt(bot.sl,4)} — ATR4H = ${fmt(bot.atrUsed,4)}</p>
    <p>3. At TP1 (${fmt(bot.tp1,4)}): close 50%, move SL to breakeven</p>
    <p>4. Trail remaining 50% with offset ${fmt(bot.trailOffset,4)} toward TP2 (${fmt(bot.tp2,4)})</p>
    <p>5. Cancel if CVD5d turns DIS before entry</p>` : `
    <p>1. Wait for 4H close below ${fmt(bot.entry,4)}</p>
    <p>2. Hard SL at ${fmt(bot.sl,4)} — ATR4H = ${fmt(bot.atrUsed,4)}</p>
    <p>3. At TP1 (${fmt(bot.tp1,4)}): close 50%, move SL to breakeven</p>
    <p>4. Trail remaining 50% toward TP2 (${fmt(bot.tp2,4)})</p>
    <p>5. Cancel if OI drops sharply or CVD returns ACC</p>`;
  const params = [
    ["Entry (FVG/POC/Price)","",fmt(bot.entry,4)],
    [`Stop Loss (${CFG.SL_ATR_MULT}×ATR)`,"",fmt(bot.sl,4)],
    ["Take Profit 1 (R:R 1:2)","Partial profit",fmt(bot.tp1,4)],
    ["Take Profit 2 (R:R 1:3.5)","Full target",fmt(bot.tp2,4)],
    ["Leverage","Max 5x rule",`${bot.leverage}x`],
    ["Capital (% portfolio)","Risk 1-2% per trade",`${bot.posPct}%`],
    ["R:R TP1","Min 1:2",`1:${bot.rr1.toFixed(2)}`],
    ["R:R TP2","Target 1:3+",`1:${bot.rr2.toFixed(2)}`],
    ["Trail trigger","Active after TP1",fmt(bot.trailTrigger,4)],
    ["Trail offset","0.5×ATR",fmt(bot.trailOffset,4)],
  ].map(([l,n,v]) => `<div class="param-row"><span class="param-label">${l}${n?` <em style="opacity:.5;font-size:.6rem">${n}</em>`:''}</span><span class="param-val">${v}</span></div>`).join('');
  const botEdge = dir==='LONG' ? 'edge-bull' : 'edge-bear';
  return `<div class="bot-card ${botEdge}">
    <div class="bot-head ${cls}">
      <span class="bot-title ${dc}">${tvLink} — ${bot.side}</span>
      <span style="font-family:'IBM Plex Mono',monospace;font-size:.72rem">Score: <span class="${scClass(score)}">${score.toFixed(2)}/10</span></span>
    </div>
    <div class="bot-params">${params}</div>
    <div class="bot-rules"><strong style="color:var(--yellow);font-family:'Chakra Petch',sans-serif;text-transform:uppercase;letter-spacing:.06em;font-size:.62rem">EXECUTION RULES</strong>${rules}</div>
  </div>`;
}

// ── Fast decision table row ───────────────────────────────────────
export function buildFastRow(name, m, prov, score, direction, dirConds, rec) {
  const provH = prov === 'Bybit'
    ? `<span style="color:var(--orange);font-size:.6rem">BB</span>`
    : `<span style="color:var(--cyan2);font-size:.6rem">BN</span>`;

  const chg = m.change24h ?? 0;
  const chgH = chg > 0.005
    ? `<span class="bull">+${fmt(chg,2)}%</span>`
    : chg < -0.005
    ? `<span class="bear">${fmt(chg,2)}%</span>`
    : `${fmt(chg,2)}%`;

  const sc = scClass(score);
  const scoreH = `<span class="score-badge ${sc}" title="Composite 0–10 score. ≥8 = active setup, 6–7.9 = developing, &lt;6 = no setup">${score.toFixed(1)}</span>`;

  let setupH;
  if (!direction) {
    setupH = `<span class="neutral">WAIT</span>`;
  } else {
    const cls = direction === 'LONG' ? 'bull' : 'bear';
    setupH = `<span class="${cls}">${direction} ${dirConds.condsMet}/${dirConds.condsTotal} ${dirConds.pct}%</span>`;
  }

  const rsiV = m.rsi;
  const rsiH = rsiV > 70 ? col(fmt(rsiV,1),'bear') : rsiV < 30 ? col(fmt(rsiV,1),'bull') : fmt(rsiV,1);

  const fundH = m.funding > 0.01
    ? col(fmt(m.funding,4)+'%','warn')
    : m.funding < -0.01
    ? col(fmt(m.funding,4)+'%','bull')
    : fmt(m.funding,4)+'%';

  const oiH = m.oiChange > 5
    ? col(fmt(m.oiChange,2)+'%','bull')
    : m.oiChange < -5
    ? col(fmt(m.oiChange,2)+'%','bear')
    : fmt(m.oiChange,2)+'%';

  const recH = `<span class="rec-badge ${rec.recClass}">${rec.rec}</span>`;

  const tvExF  = prov === 'Bybit' ? 'BYBIT' : 'BINANCE';
  const tvLinkF = `<a href="https://www.tradingview.com/chart/?symbol=${tvExF}%3A${name}USDT.P" target="_blank" rel="noopener" class="tv-link">${name}</a>`;
  return `<tr class="fast-row" data-name="${name}">
    <td style="text-align:left">${tvLinkF} ${provH}</td>
    <td>${fmt(m.price,2)}</td>
    <td>${chgH}</td>
    <td>${scoreH}</td>
    <td>${setupH}</td>
    <td>${rsiH}</td>
    <td>${fundH}</td>
    <td>${oiH}</td>
    <td>${sCol(m.structure4h)}</td>
    <td>${sCol(m.structure30d)}</td>
    <td>${recH}</td>
  </tr>
  <tr class="deep-row" id="deep-${name}" style="display:none"><td colspan="11"></td></tr>`;
}

// ── Grid Risk Notice (collapsible banner, once per panel) ────────
export function renderCryptoRiskNotice(allMetrics) {
  const warnings = [];
  for (const [name, m] of Object.entries(allMetrics)) {
    if (!m) continue;
    const adxVal = m.adx?.adx ?? 0;
    if (adxVal > 25) warnings.push(`<span class="warn">⚠ ${name} ADX=${adxVal.toFixed(1)} — trending market, grid bot not recommended</span>`);
    if ((m.atrPct ?? 0) > 5) warnings.push(`<span class="warn">⚠ ${name} ATR=${(m.atrPct).toFixed(1)}% — high volatility, use Geometric mode and widen range</span>`);
    if (m.rsi > 70) warnings.push(`<span class="warn">⚠ ${name} RSI=${m.rsi.toFixed(1)} — overbought, wait for pullback before starting bot</span>`);
  }
  const dynHtml = warnings.length
    ? `<div class="grid-risk-dynamic">${warnings.join('')}</div>`
    : '';
  return `<div class="section">
    <details class="grid-risk-notice">
      <summary class="section-title" style="cursor:pointer;list-style:none">
        ⚠ Grid Bot Risk Warnings
        <span style="font-size:.65rem;opacity:.6;margin-left:6px">▾ click to expand</span>
      </summary>
      <div class="grid-risk-body">
        <div class="grid-risk-static">
          <div>• Grid bots lose in strong trends — check ADX before starting (ADX &lt; 20 ideal)</div>
          <div>• All altcoins (SOL, SUI, TRX, BNB) correlate with BTC — one BTC dump can push all bots below their lower bounds simultaneously</div>
          <div>• Check for token unlocks, protocol upgrades, and macro events (FOMC, ETF flows) within your 1–3 week window before starting</div>
        </div>
        ${dynHtml}
      </div>
    </details>
  </div>`;
}

// ── Grid Bot Panel (per-ticker cards) ────────────────────────────
export function renderGridPanel(allMetrics, allSignals, capital, symProvider = {}) {
  const cards = Object.entries(allMetrics).map(([name, m]) => {
    if (!m || !m.gridViability) return '';
    const v      = m.gridViability;
    const range  = m.gridRange;
    const rec    = m.gridRecommendation;
    const profit = m.gridProfitPerGrid;
    const dd     = m.gridDrawdown;
    const mode   = m.gridMode;
    const sl     = m.gridSL;
    const tp     = m.gridTP;

    // Viability badge
    let badge;
    if (!v.viable) {
      badge = `<span class="grid-badge avoid">AVOID GRID</span>`;
    } else if (v.warning) {
      badge = `<span class="grid-badge caution">CAUTION</span>`;
    } else {
      badge = `<span class="grid-badge ok">GRID OK</span>`;
    }

    // Direction badge
    const dir = m.gridDirection;
    const dirBadge = dir
      ? `<span class="grid-badge ${dir.type === 'Long' ? 'dir-long' : dir.type === 'Short' ? 'dir-short' : 'dir-neutral'}" title="${dir.reason}">${dir.label}</span>`
      : '';

    // Recommended setup block
    let setupHtml = '';
    if (v.viable && range && rec && profit) {
      const capitalPerGrid = capital / rec.recommended;
      const profitUSDT     = capitalPerGrid * profit.netPct;
      const triggerPrice   = (m.price >= range.rangeLow && m.price <= range.rangeHigh)
        ? m.price
        : (range.rangeLow + range.rangeHigh) / 2;
      const profitCls = profit.isViable ? 'bull' : 'warn';

      setupHtml = `<div class="grid-setup">
        <div class="grid-setup-title">Recommended Setup</div>
        <div class="grid-params">
          <div class="grid-param-row"><span class="grid-param-label">Type</span><span class="grid-param-val">${dir?.label ?? 'Neutral Grid'} <em style="opacity:.6;font-size:.68rem">${dir?.reason ?? ''}</em></span></div>
          <div class="grid-param-row"><span class="grid-param-label">Range</span><span class="grid-param-val">$${fmt(range.rangeLow,2)} — $${fmt(range.rangeHigh,2)} <em>(${fmt(range.rangeWidthPct,1)}%)</em></span></div>
          <div class="grid-param-row"><span class="grid-param-label">Grid Count</span><span class="grid-param-val">${rec.recommended} <em>(min ${rec.min}, max ${rec.max})</em></span></div>
          <div class="grid-param-row"><span class="grid-param-label">Mode</span><span class="grid-param-val">${mode.mode} <em style="opacity:.6;font-size:.68rem">${mode.reason}</em></span></div>
          <div class="grid-param-row"><span class="grid-param-label">Profit/Grid (net)</span><span class="grid-param-val ${profitCls}">${(profit.netPct*100).toFixed(3)}% (~$${fmt(profitUSDT,2)})</span></div>
          <div class="grid-param-row"><span class="grid-param-label">Capital/Grid</span><span class="grid-param-val">$${fmt(capitalPerGrid,2)}</span></div>
          <div class="grid-param-row"><span class="grid-param-label">Trigger Price</span><span class="grid-param-val">$${fmt(triggerPrice,2)}</span></div>
          <div class="grid-param-row"><span class="grid-param-label">Stop Loss</span><span class="grid-param-val bear">$${fmt(sl,2)}</span></div>
          <div class="grid-param-row"><span class="grid-param-label">Take Profit</span><span class="grid-param-val bull">$${fmt(tp,2)}</span></div>
        </div>
      </div>`;
    }

    // Worst-case drawdown block
    let drawdownHtml = '';
    if (dd && range) {
      const crashTarget = range.rangeLow * 0.85;
      const ddPct       = dd.drawdownPct * 100;
      const ddCls       = ddPct > 20 ? 'bear' : ddPct > 10 ? 'warn' : 'bull';
      drawdownHtml = `<div class="grid-drawdown">
        <div class="grid-setup-title">Worst-Case Drawdown</div>
        <div style="font-size:.75rem;color:var(--text2)">
          If price drops to $${fmt(crashTarget,2)} → you hold ${fmt(dd.coinsHeld,4)} coins worth $${fmt(dd.valueAtCrash,2)}
          → Drawdown: <span class="${ddCls}">$${fmt(dd.drawdownUSDT,2)} (${fmt(ddPct,1)}%)</span>
        </div>
      </div>`;
    }

    // Warnings block
    let warningsHtml = '';
    const warnItems = [];
    if (!v.viable) warnItems.push(`<span class="bear">✗ ${v.reason}</span>`);
    if (v.warning) v.warning.split(' | ').forEach(w => warnItems.push(`<span class="warn">⚠ ${w}</span>`));
    if (warnItems.length) {
      warningsHtml = `<div class="grid-warnings">${warnItems.join('')}</div>`;
    }

    // Active Signals strip — 3 grid-relevant signals not already in Market Context
    const sigData = (allSignals && allSignals[name]?.signals) ?? {};
    const GAS_KEYS = ['Setup', 'Bot Grid', 'Presiune'];
    const signalsHtml = (() => {
      const pills = GAS_KEYS.map(key => {
        const [val, cls] = sigData[key] || ['—', 'neutral'];
        return `<span class="gas-pill ${cls}"><span class="gas-name">${key}</span><span class="gas-val">${val}</span></span>`;
      }).join('');
      return `<div class="grid-active-signals"><div class="grid-setup-title">Active Signals</div><div class="gas-pills">${pills}</div></div>`;
    })();

    // Market context block — key indicators for go/no-go decision
    const adxVal  = m.adx?.adx ?? 0;
    const adxCls  = adxVal > GRID_CONFIG.VIABILITY.ADX_BLOCK ? 'bear' : adxVal > GRID_CONFIG.VIABILITY.BEARISH_ADX_BLOCK ? 'warn' : 'bull';
    const rsiVal  = m.rsi ?? 0;
    const rsiCls  = rsiVal > GRID_CONFIG.VIABILITY.RSI_BLOCK ? 'bear' : rsiVal < GRID_CONFIG.VIABILITY.RSI_WARN_LOW ? 'warn' : 'neutral';
    const bbVal   = m.bbBw ?? 0;
    const bbCls   = bbVal < GRID_CONFIG.VIABILITY.BB_MIN ? 'bear' : 'neutral';
    const flowVal = m.flow ?? 0;
    const flowLbl = flowVal > 2 ? 'Buy' : flowVal < -2 ? 'Sell' : 'Neutral';
    const flowCls = flowVal > 2 ? 'bull' : flowVal < -2 ? 'bear' : 'neutral';
    const dur     = m.gridDuration;
    const scoreV  = m.gridScore ?? 0;

    const contextHtml = `<div class="grid-context">
      <div class="grid-setup-title">Market Context</div>
      <div class="grid-context-grid">
        <div class="grid-ctx-item"><span class="grid-ctx-label">Score</span><span class="grid-ctx-val ${scClass(scoreV)}">${fmt(scoreV,1)}</span></div>
        <div class="grid-ctx-item"><span class="grid-ctx-label">ADX</span><span class="grid-ctx-val ${adxCls}">${fmt(adxVal,1)}</span></div>
        <div class="grid-ctx-item"><span class="grid-ctx-label">RSI</span><span class="grid-ctx-val ${rsiCls}">${fmt(rsiVal,1)}</span></div>
        <div class="grid-ctx-item"><span class="grid-ctx-label">BB Width</span><span class="grid-ctx-val ${bbCls}">${fmt(bbVal,1)}%</span></div>
        <div class="grid-ctx-item"><span class="grid-ctx-label">ATR%</span><span class="grid-ctx-val">${fmt(m.atrPct,2)}%</span></div>
        <div class="grid-ctx-item"><span class="grid-ctx-label">Structure</span><span class="grid-ctx-val">${sCol(m.structure4h ?? '—')}</span></div>
        <div class="grid-ctx-item"><span class="grid-ctx-label">Flow</span><span class="grid-ctx-val ${flowCls}">${flowLbl} ${fmt(Math.abs(flowVal),1)}%</span></div>
        <div class="grid-ctx-item"><span class="grid-ctx-label">Est. Duration</span><span class="grid-ctx-val">${dur?.label ?? '—'}</span></div>
      </div>
    </div>`;

    const tvExG   = (symProvider[name]||'Binance')==='Bybit' ? 'BYBIT' : 'BINANCE';
    const tvLinkG = `<a href="https://www.tradingview.com/chart/?symbol=${tvExG}%3A${name}USDT.P" target="_blank" rel="noopener" class="tv-link">${name}</a>`;
    return `<div class="grid-card">
      <div class="grid-card-head">
        <span class="grid-ticker">${tvLinkG}</span>
        <span class="grid-price">$${fmt(m.price,2)}</span>
        ${badge}
        ${dirBadge}
        <span class="grid-profile" style="opacity:.5;font-size:.65rem">${m.gridProfile?.profile ?? ''}</span>
      </div>
      ${contextHtml}
      ${signalsHtml}
      ${setupHtml}
      ${drawdownHtml}
      ${warningsHtml}
    </div>`;
  }).join('');

  return `<div class="section">
    <div class="section-title">Grid Bot Advisor · Spot Grid Setup Guide</div>
    <div class="section-sub">Grid bots profit from <strong>sideways chop</strong>, not direction. GRID OK does not mean a strong trade setup — they answer different questions. Ideal conditions: ADX &lt; 20 (no trend) + tight BB + moderate ATR. A bearish asset with low ADX can be a better grid candidate than a bullish trending one.</div>
    <div class="grid-bot-panel">${cards || '<div class="empty">No grid data — refresh to load</div>'}</div>
  </div>`;
}

// ── Deep analyze card ────────────────────────────────────────────
export function buildDeepCard(name, m, score, direction, dirConds, rec, detail = []) {
  const chg = m.change24h ?? 0;
  const chgH = chg > 0.005
    ? `<span class="bull">+${fmt(chg,2)}%</span>`
    : chg < -0.005
    ? `<span class="bear">${fmt(chg,2)}%</span>`
    : `${fmt(chg,2)}%`;

  const dirH = direction
    ? `<span class="${direction === 'LONG' ? 'bull' : 'bear'}">${direction} ${dirConds.condsMet}/${dirConds.condsTotal} ${dirConds.pct}%</span>`
    : `<span class="neutral">WAIT</span>`;

  const scBadge = `<span class="score-badge ${scClass(score)}">${score.toFixed(1)}/10</span>`;

  const rsiLabel  = m.rsi > 70 ? 'Overbought' : m.rsi < 30 ? 'Oversold' : 'Entry zone';
  const rsiCls    = m.rsi > 70 ? 'bear' : m.rsi < 30 ? 'bull' : 'bull';
  const fundLabel = Math.abs(m.funding) < 0.01 ? 'neutral' : m.funding > 0 ? 'longs pay' : 'shorts pay';
  const avwapCls  = m.price > m.avwap30d ? 'bull' : 'bear';
  const avwapLbl  = m.price > m.avwap30d ? '↑ above' : '↓ below';

  const cvdArr = [m.cvd5d, m.cvd14d, m.cvd30d].map(v => v > 0 ? 'ACC' : 'DIS');
  const cvdH   = cvdArr.map(v => `<span class="${v==='ACC'?'bull':'bear'}">${v}</span>`).join('/');

  const adxVal  = m.adx?.adx ?? 0;
  const adxLbl  = adxVal < 20 ? 'weak' : adxVal < 25 ? 'developing' : adxVal < 40 ? 'strong' : 'very strong';
  const adxCls  = adxVal > 20 ? 'bull' : 'neutral';

  const atrPct  = m.atrPct ?? 0;
  const atrLbl  = atrPct > 5 ? 'high vol' : 'normal';
  const atrCls  = atrPct > 5 ? 'warn' : 'neutral';

  const bbBw    = m.bb?.bw ?? 0;
  const bbLbl   = m.bb?.label ?? 'normal';
  const bbCls   = bbLbl === 'squeeze' ? 'warn' : 'neutral';

  const hist    = m.macd?.histogram ?? 0;
  const macdTrd = m.macd?.trend ?? 'neutral';
  const macdCls = macdTrd === 'bull' ? 'bull' : macdTrd === 'bear' ? 'bear' : 'neutral';

  const obvTrd  = m.obv?.trend ?? 'FLAT';
  const obvCls  = obvTrd === 'UP' ? 'bull' : obvTrd === 'DOWN' ? 'bear' : 'neutral';

  let fvgH = '—';
  if (m.fvgList?.length) {
    const g = m.fvgList[0];
    const dp = (Math.abs(m.price - g.mid) / m.price * 100).toFixed(1);
    fvgH = `${g.type==='BULL'?'B':'S'}-FVG ${dp}% away`;
  }

  const emaH = m.emaFast > m.emaSlow
    ? `<span class="bull">50 &gt; 200 (aligned)</span>`
    : `<span class="bear">50 &lt; 200 (contra)</span>`;

  const sweepH = m.sweep === 'BUY_SWP'
    ? `<span class="bear">BUY SWP</span>`
    : m.sweep === 'SELL_SWP'
    ? `<span class="bull">SELL SWP</span>`
    : `<span class="neutral">—</span>`;

  const fibZone = m.fib?.priceZone ?? '—';
  const oiCls   = m.oiChange > 5 ? 'bull' : m.oiChange < -5 ? 'bear' : 'neutral';
  const oiLbl   = m.oiChange > 5 ? 'rising' : m.oiChange < -5 ? 'falling' : 'flat';

  const groups = [
    { title: 'Trend',      cls: 'trend',      items: [
      [`Structure 4H`,  sCol(m.structure4h)],
      [`Structure 30d`, sCol(m.structure30d)],
      [`AVWAP30d`,      `<span class="${avwapCls}">$${fmt(m.avwap30d,1)} ${avwapLbl}</span>`],
      [`EMA 50/200`,    emaH],
    ]},
    { title: 'Momentum',   cls: 'momentum',   items: [
      [`RSI`,           `<span class="${rsiCls}">${fmt(m.rsi,1)} · ${rsiLabel}</span>`],
      [`CVD`,           cvdH],
      [`MACD`,          `<span class="${macdCls}">${hist>=0?'+':''}${fmt(hist,4)} · ${macdTrd}</span>`],
      [`OBV`,           `<span class="${obvCls}">${obvTrd}</span>`],
    ]},
    { title: 'Volatility', cls: 'volatility', items: [
      [`ADX`,           `<span class="${adxCls}">${fmt(adxVal,1)} · ${adxLbl}</span>`],
      [`ATR%`,          `<span class="${atrCls}">${fmt(atrPct,2)}% · ${atrLbl}</span>`],
      [`BB Bandwidth`,  `<span class="${bbCls}">${fmt(bbBw,1)}% · ${bbLbl}</span>`],
      [`Funding`,       `<span class="neutral">${fmt(m.funding,4)}% · ${fundLabel}</span>`],
    ]},
    { title: 'Setup',      cls: 'setup',      items: [
      [`OI% 7d`,        `<span class="${oiCls}">${fmt(m.oiChange,2)}% · ${oiLbl}</span>`],
      [`Sweep`,         sweepH],
      [`FVG`,           `<span class="neutral">${fvgH}</span>`],
      [`Fib Zone`,      `<span class="neutral">${fibZone}</span>`],
    ]},
  ];

  const gridHtml = groups.map(g => `
    <div class="deep-group">
      <div class="deep-group-title ${g.cls}">${g.title}</div>
      ${g.items.map(([label, value]) =>
        `<div class="deep-row-item"><span class="deep-label">${label}</span><span class="deep-value">${value}</span></div>`
      ).join('')}
    </div>`
  ).join('');

  let blockersHtml = '';
  if (rec.blockers?.length) {
    blockersHtml = `<div class="deep-blockers">${rec.blockers.map(b => `<div>⚠ ${b}</div>`).join('')}</div>`;
  }

  let checklistHtml = '';
  if (direction && dirConds.conditions?.length) {
    const items = dirConds.conditions.map(c => {
      const icon = c.met ? '✓' : '✗';
      const cls  = c.met ? 'met' : 'unmet';
      const desc = direction === 'LONG' ? c.longDesc : c.shortDesc;
      return `<div class="dir-check-item ${cls}">${icon} ${desc}</div>`;
    }).join('');
    checklistHtml = `<div class="dir-check">
      <div style="font-size:.72rem;font-weight:700;color:var(--text2);margin-bottom:4px;text-transform:uppercase;letter-spacing:.08em">Direction — leaning ${direction} ${dirConds.condsMet}/${dirConds.condsTotal}</div>
      ${items}
    </div>`;
  }

  return `<div class="deep-card">
    <div class="deep-header">
      <span style="font-weight:700;font-size:.96rem;letter-spacing:.1em">${name}</span>
      <span style="font-family:'IBM Plex Mono',monospace;font-size:.86rem">$${fmt(m.price,2)}</span>
      <span>${chgH}</span>
      ${scBadge}
      ${dirH}
    </div>
    <div class="deep-grid">${gridHtml}</div>
    ${blockersHtml}
    ${checklistHtml}
    ${detail.length ? `
    <div class="deep-section-title">Score Components</div>
    <table class="score-mini-table">
      <thead><tr><th>Component</th><th>Pts</th><th>Reason</th></tr></thead>
      <tbody>${detail.map(([comp,val,reason]) => {
        const vH = val>0 ? `<span class="bull">+${val.toFixed(2)}</span>`
                 : val<0 ? `<span class="bear">${val.toFixed(2)}</span>`
                 : `<span class="neutral">0.00</span>`;
        return `<tr><td>${comp}</td><td>${vH}</td><td class="sc-reason">${reason}</td></tr>`;
      }).join('')}</tbody>
    </table>` : ''}
  </div>`;
}
