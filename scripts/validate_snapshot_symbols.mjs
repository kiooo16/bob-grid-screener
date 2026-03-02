import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const path = resolve(process.cwd(), 'data/snapshots/latest.json');
const raw = JSON.parse(await readFile(path, 'utf8'));
const items = Array.isArray(raw) ? raw : raw.items || [];

const bad = items.filter((r) => !/USDT$/i.test(String(r.symbol || '')) || /^COIN\d+/i.test(String(r.symbol || '')));
if (bad.length > 0) {
  console.error(`Invalid symbols found: ${bad.length}`);
  console.error(bad.slice(0, 20).map((b) => b.symbol).join(', '));
  process.exit(1);
}

console.log(`Symbol validation passed: ${items.length} rows`);
