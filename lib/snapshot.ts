import fs from 'node:fs/promises';
import path from 'node:path';
import { SnapshotRow } from '@/components/grid-table';

export type UniverseMode = 'all' | 'whitelist' | 'blacklist';

export type UniverseConfig = {
  mode: UniverseMode;
  whitelist: string[];
  blacklist: string[];
};

type UniverseInput =
  | UniverseConfig
  | {
      mode?: UniverseMode;
      symbols?: string[];
      whitelist?: string[];
      blacklist?: string[];
    }
  | string[];

type SnapshotFile = {
  ts?: string;
  items: SnapshotRow[];
};

const PLACEHOLDER_SYMBOL_RE = /^COIN\d+/i;

async function readJson<T>(filePath: string): Promise<T> {
  const fullPath = path.join(process.cwd(), filePath);
  const content = await fs.readFile(fullPath, 'utf8');
  return JSON.parse(content) as T;
}

async function readJsonIfExists<T>(filePath: string): Promise<T | null> {
  try {
    return await readJson<T>(filePath);
  } catch (error) {
    const e = error as NodeJS.ErrnoException;
    if (e?.code === 'ENOENT') return null;
    throw error;
  }
}

function normalizeSnapshot(input: SnapshotRow[] | SnapshotFile): SnapshotFile {
  if (Array.isArray(input)) {
    const ts = input.reduce((acc, row) => (row.ts > acc ? row.ts : acc), '');
    return { ts, items: input };
  }
  return { ts: input.ts, items: input.items || [] };
}

function normalizeRows(rows: SnapshotRow[]): SnapshotRow[] {
  return rows
    .map((row) => ({ ...row, symbol: String(row.symbol || '').toUpperCase() }))
    .filter((row) => Boolean(row.symbol) && !PLACEHOLDER_SYMBOL_RE.test(row.symbol));
}

function applyUniverse(rows: SnapshotRow[], universe: UniverseConfig): SnapshotRow[] {
  if (universe.mode === 'all') return rows;
  if (universe.mode === 'whitelist') {
    if (universe.whitelist.length === 0) return rows;
    const allow = new Set(universe.whitelist.map((s) => s.toUpperCase()));
    return rows.filter((row) => allow.has(row.symbol.toUpperCase()));
  }
  if (universe.blacklist.length === 0) return rows;
  const deny = new Set(universe.blacklist.map((s) => s.toUpperCase()));
  return rows.filter((row) => !deny.has(row.symbol.toUpperCase()));
}

function normalizeUniverse(input: UniverseInput | null): UniverseConfig {
  if (!input) {
    return { mode: 'all', whitelist: [], blacklist: [] };
  }

  if (Array.isArray(input)) {
    if (input.length === 0) return { mode: 'all', whitelist: [], blacklist: [] };
    return { mode: 'whitelist', whitelist: input, blacklist: [] };
  }

  const obj = input as { mode?: UniverseMode; symbols?: string[]; whitelist?: string[]; blacklist?: string[] };
  const mode = obj.mode ?? 'all';
  const symbols = Array.isArray(obj.symbols) ? obj.symbols : [];
  const whitelist = Array.isArray(obj.whitelist) ? obj.whitelist : [];
  const blacklist = Array.isArray(obj.blacklist) ? obj.blacklist : [];

  if (mode === 'whitelist') {
    const effective = whitelist.length > 0 ? whitelist : symbols;
    if (effective.length === 0) return { mode: 'all', whitelist: [], blacklist: [] };
    return { mode: 'whitelist', whitelist: effective, blacklist: [] };
  }

  if (mode === 'blacklist') {
    if (blacklist.length === 0) return { mode: 'all', whitelist: [], blacklist: [] };
    return { mode: 'blacklist', whitelist: [], blacklist };
  }

  return { mode: 'all', whitelist: [], blacklist: [] };
}

async function loadUniverseConfig(): Promise<UniverseConfig> {
  const local = await readJsonIfExists<UniverseInput>('config/universe.local.json');
  if (local !== null) return normalizeUniverse(local);
  const shared = await readJsonIfExists<UniverseInput>('config/universe.json');
  return normalizeUniverse(shared);
}

function getUpdatedAt(ts: string | undefined, rows: SnapshotRow[]): string {
  if (ts) return ts;
  const maxTs = rows.reduce((acc, row) => (row.ts > acc ? row.ts : acc), '');
  return maxTs || new Date().toISOString();
}

export async function loadSnapshotBundle() {
  const rawSnapshot = await readJson<SnapshotRow[] | SnapshotFile>('data/snapshots/latest.json');
  const snapshot = normalizeSnapshot(rawSnapshot);
  const cleanRows = normalizeRows(snapshot.items);
  const universe = await loadUniverseConfig();
  const universeRows = applyUniverse(cleanRows, universe);
  console.log(
    `[snapshot] universeEnabled=${universe.mode !== 'all'} mode=${universe.mode} whitelist=${universe.whitelist.length} blacklist=${universe.blacklist.length} snapshotRows=${cleanRows.length} finalRows=${universeRows.length}`
  );
  return {
    rows: universeRows,
    updatedAt: getUpdatedAt(snapshot.ts, cleanRows),
    universeMode: universe.mode,
    filteredCount: universeRows.length,
    totalCount: cleanRows.length
  };
}
