const EXCHANGE_INFO_URL = 'https://fapi.binance.com/fapi/v1/exchangeInfo';
const TICKER_24H_URL = 'https://fapi.binance.com/fapi/v1/ticker/24hr';

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function calcRiskTag(breakoutRisk, volPct) {
  const risk = Math.max(breakoutRisk, volPct * 8);
  if (risk >= 70) return 'high';
  if (risk >= 40) return 'mid';
  return 'low';
}

function calcMaxLeverage(volPct) {
  if (volPct <= 2) return 10;
  if (volPct <= 4) return 7;
  if (volPct <= 6) return 5;
  return 3;
}

function buildReason({ quoteVolume, volPct, breakoutRisk, gridScore }) {
  const liq = quoteVolume >= 1e10 ? '高流动性' : quoteVolume >= 1e9 ? '流动性充足' : '流动性一般';
  const vol = volPct >= 2 && volPct <= 8 ? '波动可做网格' : volPct < 2 ? '波动偏低' : '波动偏高';
  const risk = breakoutRisk < 40 ? '风险较低' : breakoutRisk < 70 ? '风险中等' : '风险较高';
  const score = gridScore >= 70 ? '适配度较好' : gridScore >= 50 ? '适配度一般' : '适配度偏低';
  return `${liq}，${vol}，${risk}，${score}`;
}

async function getJson(url) {
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Request failed: ${url} ${resp.status}`);
  }
  return resp.json();
}

async function main() {
  const now = new Date().toISOString();
  const [exchangeInfo, ticker24h] = await Promise.all([getJson(EXCHANGE_INFO_URL), getJson(TICKER_24H_URL)]);

  const tradable = new Set(
    (exchangeInfo.symbols || [])
      .filter((s) => s.status === 'TRADING' && s.quoteAsset === 'USDT' && s.contractType === 'PERPETUAL')
      .map((s) => s.symbol)
  );

  const items = ticker24h
    .filter((t) => tradable.has(t.symbol))
    .map((t) => {
      const symbol = t.symbol;
      const price = Number(t.lastPrice || 0);
      const high24h = Number(t.highPrice || 0);
      const low24h = Number(t.lowPrice || 0);
      const quoteVolume = Number(t.quoteVolume || 0);

      const volPct = price > 0 ? ((high24h - low24h) / price) * 100 : 0;
      const halfRangePct = clamp(volPct / 200, 0.003, 0.08);
      const upper = price * (1 + halfRangePct);
      const lower = Math.max(0, price * (1 - halfRangePct));

      const chopScore = clamp(55 + (volPct - 3) * 4, 20, 92);
      const breakoutRisk = clamp(volPct * 7 + (quoteVolume < 1e9 ? 15 : 0), 10, 95);
      const liquidityScore = clamp(Math.log10(Math.max(quoteVolume, 1) / 5e7) * 22 + 35, 0, 100);
      const volScore = clamp(100 - Math.abs(volPct - 5) * 12, 0, 100);
      const riskScore = 100 - breakoutRisk;
      const gridScore = clamp(0.35 * chopScore + 0.3 * volScore + 0.25 * riskScore + 0.1 * liquidityScore, 0, 100);

      const gridStepPct = clamp(volPct / 20, 0.2, 0.6);
      const gridCount = clamp(Math.round((upper - lower) / ((gridStepPct / 100) * Math.max(price, 1e-8))), 20, 80);
      const maxLeverage = calcMaxLeverage(volPct);
      const riskTag = calcRiskTag(breakoutRisk, volPct);
      const reason = buildReason({ quoteVolume, volPct, breakoutRisk, gridScore });

      return {
        symbol,
        ts: now,
        price,
        quote_volume: quoteVolume,
        high24h,
        low24h,
        vol_pct: volPct,
        grid_score: gridScore,
        chop_score: chopScore,
        breakout_risk: breakoutRisk,
        upper,
        lower,
        grid_count: gridCount,
        grid_step_pct: gridStepPct,
        max_leverage: maxLeverage,
        risk_tag: riskTag,
        reason
      };
    })
    .sort((a, b) => b.quote_volume - a.quote_volume);

  const output = { ts: now, items };

  const { writeFile } = await import('node:fs/promises');
  const { resolve } = await import('node:path');
  const outputPath = resolve(process.cwd(), 'data/snapshots/latest.json');
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

  console.log(`Wrote ${items.length} symbols to ${outputPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
