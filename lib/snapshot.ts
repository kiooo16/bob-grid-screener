import fs from 'node:fs/promises';
import path from 'node:path';
import { SnapshotRow } from '@/components/grid-table';

export type UniverseMode = 'all' | 'whitelist' | 'blacklist';

export type UniverseConfig = {
  mode: UniverseMode;
  whitelist: string[];
  blacklist: string[];
};

type SnapshotFile = {
  ts?: string;
  items: SnapshotRow[];
};

async function readJson<T>(filePath: string): Promise<T> {
  const fullPath = path.join(process.cwd(), filePath);
  const content = await fs.readFile(fullPath, 'utf8');
  return JSON.parse(content) as T;
}

function normalizeSnapshot(input: SnapshotRow[] | SnapshotFile): SnapshotFile {
  if (Array.isArray(input)) {
    const ts = input.reduce((acc, row) => (row.ts > acc ? row.ts : acc), '');
    return { ts, items: input };
  }
  return { ts: input.ts, items: input.items || [] };
}

function applyUniverse(rows: SnapshotRow[], universe: UniverseConfig): SnapshotRow[] {
  if (universe.mode === 'all') return rows;
  if (universe.mode === 'whitelist') {
    const allow = new Set(universe.whitelist.map((s) => s.toUpperCase()));
    return rows.filter((row) => allow.has(row.symbol.toUpperCase()));
  }
  const deny = new Set(universe.blacklist.map((s) => s.toUpperCase()));
  return rows.filter((row) => !deny.has(row.symbol.toUpperCase()));
}

function getUpdatedAt(ts: string | undefined, rows: SnapshotRow[]): string {
  if (ts) return ts;
  const maxTs = rows.reduce((acc, row) => (row.ts > acc ? row.ts : acc), '');
  return maxTs || new Date().toISOString();
}

export async function loadSnapshotBundle() {
  const rawSnapshot = await readJson<SnapshotRow[] | SnapshotFile>('data/snapshots/latest.json');
  const snapshot = normalizeSnapshot(rawSnapshot);
  const universe = await readJson<UniverseConfig>('config/universe.json');
  const universeRows = applyUniverse(snapshot.items, universe);
  return {
    rows: universeRows,
    updatedAt: getUpdatedAt(snapshot.ts, snapshot.items),
    universeMode: universe.mode,
    filteredCount: universeRows.length,
    totalCount: snapshot.items.length
  };
}
