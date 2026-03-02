'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

export type SnapshotRow = {
  symbol: string;
  ts: string;
  price?: number;
  quote_volume: number;
  high24h?: number;
  low24h?: number;
  vol_pct: number;
  grid_score: number;
  chop_score: number;
  breakout_risk: number;
  upper: number;
  lower: number;
  grid_count: number;
  grid_step_pct: number;
  max_leverage: number;
  risk_tag?: 'low' | 'mid' | 'high' | string;
  reason?: string;
};

type RowWithReason = SnapshotRow & { reason: string };

type SnapshotBundle = {
  rows: SnapshotRow[];
  updatedAt: string;
  universeMode: 'all' | 'whitelist' | 'blacklist';
  filteredCount: number;
  totalCount: number;
};

export type FilterField = keyof SnapshotRow;

export type FilterDef = {
  field: FilterField;
  label: string;
  type: 'number' | 'slider' | 'select';
  mode: 'gte' | 'lte' | 'eq';
  default: number;
  min?: number;
  max?: number;
  step?: number;
  options?: number[];
};

export type RulesConfig = {
  blacklist: string[];
  default_sort: {
    key: keyof SnapshotRow;
    direction: 'asc' | 'desc';
  };
  filters: FilterDef[];
};

type SortKey = keyof SnapshotRow;
type FilterState = Record<string, number>;
type PageSize = 'all' | 50 | 100 | 200 | 500;

function formatVolume(v: number): string {
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  return `${Math.round(v)}`;
}

function generateReason(row: SnapshotRow): string {
  if (row.reason && row.reason.trim()) return row.reason;
  const liquidity = row.quote_volume >= 10_000_000_000 ? '流动性很强' : row.quote_volume >= 1_000_000_000 ? '流动性充足' : '流动性一般';
  const volatility = row.vol_pct >= 2 && row.vol_pct <= 6 ? '波动适中' : row.vol_pct < 2 ? '波动偏低' : '波动偏高';
  const chop = row.chop_score >= 65 ? '震荡充分' : row.chop_score >= 50 ? '震荡尚可' : '震荡偏弱';
  const risk = row.breakout_risk < 40 ? '突破风险低' : row.breakout_risk < 70 ? '突破风险中等' : '突破风险高';
  const score = row.grid_score >= 75 ? '整体评分高' : row.grid_score >= 60 ? '整体评分中等' : '整体评分偏低';
  return `${liquidity}（${formatVolume(row.quote_volume)}），${volatility}，${chop}，${risk}，${score}`;
}

function toCsv(rows: RowWithReason[]): string {
  const headers = ['symbol', 'ts', 'price', 'quote_volume', 'high24h', 'low24h', 'grid_score', 'vol_pct', 'chop_score', 'breakout_risk', 'upper', 'lower', 'grid_count', 'grid_step_pct', 'max_leverage', 'risk_tag', 'reason'];
  const lines = rows.map((r) => headers.map((h) => JSON.stringify(String(r[h as keyof RowWithReason] ?? '')).replace(/\u2028|\u2029/g, ' ')).join(','));
  return [headers.join(','), ...lines].join('\n');
}

function download(filename: string, content: string, contentType: string) {
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function buildInitialFilterState(defs: FilterDef[]): FilterState {
  return defs.reduce<FilterState>((acc, cur) => {
    acc[cur.field] = cur.default;
    return acc;
  }, {});
}

function passFilter(value: number, mode: FilterDef['mode'], threshold: number): boolean {
  if (mode === 'gte') return value >= threshold;
  if (mode === 'lte') return value <= threshold;
  return value === threshold;
}

export function GridTable({ rows, rules, updatedAt, universeMode, filteredCount, totalCount }: {
  rows: SnapshotRow[];
  rules: RulesConfig;
  updatedAt: string;
  universeMode: 'all' | 'whitelist' | 'blacklist';
  filteredCount: number;
  totalCount: number;
}) {
  const [liveRows, setLiveRows] = useState(rows);
  const [liveUpdatedAt, setLiveUpdatedAt] = useState(updatedAt);
  const [liveUniverseMode, setLiveUniverseMode] = useState(universeMode);
  const [liveFilteredCount, setLiveFilteredCount] = useState(filteredCount);
  const [liveTotalCount, setLiveTotalCount] = useState(totalCount);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [search, setSearch] = useState('');
  const [filterValues, setFilterValues] = useState<FilterState>(() => buildInitialFilterState(rules.filters));
  const [sortKey, setSortKey] = useState<SortKey>(rules.default_sort.key);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(rules.default_sort.direction);
  const [pageSize, setPageSize] = useState<PageSize>(200);
  const [currentPage, setCurrentPage] = useState(1);

  const tableWrapRef = useRef<HTMLDivElement | null>(null);
  const bottomScrollRef = useRef<HTMLDivElement | null>(null);
  const tableRef = useRef<HTMLTableElement | null>(null);
  const syncingRef = useRef(false);
  const [tableWidth, setTableWidth] = useState(0);

  const filtered = useMemo<RowWithReason[]>(() => {
    return liveRows
      .filter((r) => !rules.blacklist.includes(r.symbol))
      .filter((r) => r.symbol.toLowerCase().includes(search.toLowerCase()))
      .filter((r) =>
        rules.filters.every((filter) => {
          const threshold = filterValues[filter.field] ?? filter.default;
          const value = r[filter.field];
          if (typeof value !== 'number') return true;
          return passFilter(value, filter.mode, threshold);
        })
      )
      .sort((a, b) => {
        const av = a[sortKey] ?? '';
        const bv = b[sortKey] ?? '';
        const result = av > bv ? 1 : av < bv ? -1 : 0;
        return sortDir === 'asc' ? result : -result;
      })
      .map((r) => ({ ...r, reason: generateReason(r) }));
  }, [liveRows, rules.blacklist, rules.filters, search, filterValues, sortKey, sortDir]);

  const totalPages = useMemo(() => {
    if (pageSize === 'all') return 1;
    return Math.max(1, Math.ceil(filtered.length / pageSize));
  }, [filtered.length, pageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, filterValues, sortKey, sortDir, pageSize, liveRows]);

  useEffect(() => {
    setCurrentPage((p) => Math.min(p, totalPages));
  }, [totalPages]);

  const displayRows = useMemo(() => {
    if (pageSize === 'all') return filtered;
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, pageSize, currentPage]);

  useEffect(() => {
    const syncWidth = () => setTableWidth(tableRef.current?.scrollWidth ?? 0);
    syncWidth();
    const id = setTimeout(syncWidth, 60);
    window.addEventListener('resize', syncWidth);
    return () => {
      clearTimeout(id);
      window.removeEventListener('resize', syncWidth);
    };
  }, [displayRows.length, filtered.length]);

  const onTableScroll = () => {
    if (syncingRef.current) return;
    const source = tableWrapRef.current;
    const target = bottomScrollRef.current;
    if (!source || !target) return;
    syncingRef.current = true;
    target.scrollLeft = source.scrollLeft;
    syncingRef.current = false;
  };

  const onBottomScroll = () => {
    if (syncingRef.current) return;
    const source = bottomScrollRef.current;
    const target = tableWrapRef.current;
    if (!source || !target) return;
    syncingRef.current = true;
    target.scrollLeft = source.scrollLeft;
    syncingRef.current = false;
  };

  const onSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDir('desc');
  };

  const onFilterValueChange = (field: string, value: number) => {
    setFilterValues((prev) => ({ ...prev, [field]: value }));
  };

  const onRefresh = async () => {
    try {
      setIsRefreshing(true);
      const resp = await fetch('/api/snapshot', { cache: 'no-store' });
      if (!resp.ok) return;
      const bundle = (await resp.json()) as SnapshotBundle;
      setLiveRows(bundle.rows);
      setLiveUpdatedAt(bundle.updatedAt);
      setLiveUniverseMode(bundle.universeMode);
      setLiveFilteredCount(bundle.filteredCount);
      setLiveTotalCount(bundle.totalCount);
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <section>
      <p className="badge">Universe 模式：{liveUniverseMode} · 数量：{liveFilteredCount} / {liveTotalCount}</p>
      <p className="sub">数据更新时间：{new Date(liveUpdatedAt).toLocaleString()}</p>
      <p className="sub">表格显示：{displayRows.length} / 匹配结果：{filtered.length}</p>

      <div className="controls">
        <input placeholder="搜索 symbol" value={search} onChange={(e) => setSearch(e.target.value)} />

        {rules.filters.map((filter) => {
          const value = filterValues[filter.field] ?? filter.default;

          if (filter.type === 'select') {
            return (
              <label key={filter.field}>
                {filter.label}
                <select value={value} onChange={(e) => onFilterValueChange(filter.field, Number(e.target.value))}>
                  {(filter.options ?? []).map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            );
          }

          if (filter.type === 'slider') {
            return (
              <label key={filter.field}>
                {filter.label}: {value}
                <input
                  type="range"
                  min={filter.min}
                  max={filter.max}
                  step={filter.step}
                  value={value}
                  onChange={(e) => onFilterValueChange(filter.field, Number(e.target.value))}
                />
              </label>
            );
          }

          return (
            <label key={filter.field}>
              {filter.label}
              <input
                type="number"
                min={filter.min}
                max={filter.max}
                step={filter.step}
                value={value}
                onChange={(e) => onFilterValueChange(filter.field, Number(e.target.value) || 0)}
              />
            </label>
          );
        })}

        <label>
          显示条数
          <select
            value={String(pageSize)}
            onChange={(e) => setPageSize(e.target.value === 'all' ? 'all' : (Number(e.target.value) as PageSize))}
          >
            <option value="50">50</option>
            <option value="100">100</option>
            <option value="200">200</option>
            <option value="500">500</option>
            <option value="all">全部</option>
          </select>
        </label>

        <button onClick={onRefresh} disabled={isRefreshing}>{isRefreshing ? '刷新中...' : '刷新数据'}</button>
        <button onClick={() => download('grid-screener.json', JSON.stringify(filtered, null, 2), 'application/json')}>导出 JSON</button>
        <button onClick={() => download('grid-screener.csv', toCsv(filtered), 'text/csv')}>导出 CSV</button>
      </div>

      <div className="pagination">
        <button onClick={() => setCurrentPage(1)} disabled={pageSize === 'all' || currentPage <= 1}>首页</button>
        <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={pageSize === 'all' || currentPage <= 1}>上一页</button>
        <span>第 {currentPage} / {totalPages} 页</span>
        <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={pageSize === 'all' || currentPage >= totalPages}>下一页</button>
        <button onClick={() => setCurrentPage(totalPages)} disabled={pageSize === 'all' || currentPage >= totalPages}>末页</button>
      </div>

      <div className="table-area">
        <div className="table-wrap" ref={tableWrapRef} onScroll={onTableScroll}>
          <table ref={tableRef}>
            <thead>
              <tr>
                <th><button onClick={() => onSort('symbol')}>symbol</button></th>
                <th>ts</th>
                <th><button onClick={() => onSort('grid_score')}>grid_score</button></th>
                <th><button onClick={() => onSort('vol_pct')}>vol_pct</button></th>
                <th><button onClick={() => onSort('chop_score')}>chop_score</button></th>
                <th><button onClick={() => onSort('breakout_risk')}>breakout_risk</button></th>
                <th><button onClick={() => onSort('quote_volume')}>quote_volume</button></th>
                <th><button onClick={() => onSort('upper')}>upper</button></th>
                <th><button onClick={() => onSort('lower')}>lower</button></th>
                <th><button onClick={() => onSort('grid_count')}>grid_count</button></th>
                <th><button onClick={() => onSort('grid_step_pct')}>grid_step_pct</button></th>
                <th><button onClick={() => onSort('max_leverage')}>max_leverage</button></th>
                <th>risk_tag</th>
                <th>reason</th>
              </tr>
            </thead>
            <tbody>
              {displayRows.map((r) => {
                const riskTag = r.risk_tag ?? (r.breakout_risk >= 70 ? 'high' : r.breakout_risk >= 40 ? 'mid' : 'low');
                return (
                  <tr key={r.symbol}>
                    <td>{r.symbol}</td>
                    <td>{new Date(r.ts).toLocaleString()}</td>
                    <td>{r.grid_score.toFixed(2)}</td>
                    <td>{r.vol_pct.toFixed(2)}</td>
                    <td>{r.chop_score.toFixed(2)}</td>
                    <td>{r.breakout_risk.toFixed(2)}</td>
                    <td>{Math.round(r.quote_volume).toLocaleString()}</td>
                    <td>{r.upper}</td>
                    <td>{r.lower}</td>
                    <td>{r.grid_count}</td>
                    <td>{r.grid_step_pct}</td>
                    <td>{r.max_leverage}</td>
                    <td><span className={`tag ${riskTag}`}>{riskTag}</span></td>
                    <td className="reason-cell">{r.reason}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="bottom-scroll" ref={bottomScrollRef} onScroll={onBottomScroll}>
          <div style={{ width: tableWidth, height: 1 }} />
        </div>
      </div>
    </section>
  );
}
