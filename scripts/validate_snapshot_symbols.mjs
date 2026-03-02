import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const path = resolve(process.cwd(), 'data/snapshots/latest.json');
const raw = JSON.parse(await readFile(path, 'utf8'));
const items = Array.isArray(raw) ? raw : raw.items || [];

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await readFile(resolve(process.cwd(), filePath), 'utf8'));
  } catch (error) {
    if (error && error.code === 'ENOENT') return null;
    throw error;
  }
}

function universeIsDisabled(input) {
  if (!input) return true;
  if (Array.isArray(input)) return input.length === 0;
  const mode = input.mode || 'all';
  const symbols = Array.isArray(input.symbols) ? input.symbols : [];
  const whitelist = Array.isArray(input.whitelist) ? input.whitelist : [];
  if (mode === 'all') return true;
  if (mode === 'whitelist') return whitelist.length === 0 && symbols.length === 0;
  return false;
}

const bad = items.filter((r) => !/USDT$/i.test(String(r.symbol || '')) || /^COIN\d+/i.test(String(r.symbol || '')));
if (bad.length > 0) {
  console.error(`Invalid symbols found: ${bad.length}`);
  console.error(bad.slice(0, 20).map((b) => b.symbol).join(', '));
  process.exit(1);
}

const universe = (await readJsonIfExists('config/universe.local.json')) ?? (await readJsonIfExists('config/universe.json'));
if (universeIsDisabled(universe)) {
  const thresholdRaw = process.env.MIN_ROWS_WHEN_UNIVERSE_ALL;
  const minWhenAll = thresholdRaw ? Number(thresholdRaw) : null;
  if (minWhenAll !== null && Number.isFinite(minWhenAll) && items.length < minWhenAll) {
    console.error(`Universe disabled but row count too low: ${items.length} < ${minWhenAll}`);
    process.exit(1);
  }
}

console.log(`Symbol validation passed: ${items.length} rows`);
