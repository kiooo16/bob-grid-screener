import { GridTable, RulesConfig } from '@/components/grid-table';
import { loadSnapshotBundle } from '@/lib/snapshot';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execSync } from 'node:child_process';

async function readJson<T>(filePath: string): Promise<T> {
  const fullPath = path.join(process.cwd(), filePath);
  const content = await fs.readFile(fullPath, 'utf8');
  return JSON.parse(content) as T;
}

function getBuildCommitShortHash(): string {
  const fromEnv = process.env.NEXT_PUBLIC_COMMIT_SHA || process.env.COMMIT_SHA || process.env.GIT_COMMIT;
  if (fromEnv) return fromEnv.slice(0, 8);

  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

export default async function HomePage() {
  const rules = await readJson<RulesConfig>('config/rules.json');
  const bundle = await loadSnapshotBundle();
  const buildHash = getBuildCommitShortHash();

  return (
    <main className="container">
      <h1>Grid Screener（Next.js + TypeScript）</h1>
      <p className="sub">数据来源：data/snapshots/latest.json · 规则：config/rules.json · Universe：config/universe.json</p>
      <p className="sub">Build Commit: <code>{buildHash}</code></p>
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
