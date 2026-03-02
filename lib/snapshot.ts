import fs from 'node:fs/promises';
import path from 'node:path';
import { SnapshotRow } from '@/components/grid-table';

export type UniverseMode = 'all' | 'whitelist' | 'blacklist';

export type UniverseConfig = {
  mode: UniverseMode;
  whitelist: string[];
  blacklist: string[];
};

async function readJson<T>(filePath: string): Promise<T> {
  const fullPath = path.join(process.cwd(), filePath);
  const content = await fs.readFile(fullPath, 'utf8');
  return JSON.parse(content) as T;
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

function getUpdatedAt(rows: SnapshotRow[]): string {
  const maxTs = rows.reduce((acc, row) => (row.ts > acc ? row.ts : acc), '');
  return maxTs || new Date().toISOString();
}

export async function loadSnapshotBundle() {
  const snapshots = await readJson<SnapshotRow[]>('data/snapshots/latest.json');
  const universe = await readJson<UniverseConfig>('config/universe.json');
  const universeRows = applyUniverse(snapshots, universe);
  return {
    rows: universeRows,
    updatedAt: getUpdatedAt(snapshots),
    universeMode: universe.mode,
    filteredCount: universeRows.length,
    totalCount: snapshots.length
  };
}
