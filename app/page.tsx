import { GridTable, RulesConfig } from '@/components/grid-table';
import { loadSnapshotBundle } from '@/lib/snapshot';
import fs from 'node:fs/promises';
import path from 'node:path';

async function readJson<T>(filePath: string): Promise<T> {
  const fullPath = path.join(process.cwd(), filePath);
  const content = await fs.readFile(fullPath, 'utf8');
  return JSON.parse(content) as T;
}

export default async function HomePage() {
  const rules = await readJson<RulesConfig>('config/rules.json');
  const bundle = await loadSnapshotBundle();

  return (
    <main className="container">
      <h1>Grid Screener（Next.js + TypeScript）</h1>
      <p className="sub">数据来源：data/snapshots/latest.json · 规则：config/rules.json · Universe：config/universe.json</p>
      <GridTable
        rows={bundle.rows}
        rules={rules}
        updatedAt={bundle.updatedAt}
        universeMode={bundle.universeMode}
        filteredCount={bundle.filteredCount}
        totalCount={bundle.totalCount}
      />
    </main>
  );
}
