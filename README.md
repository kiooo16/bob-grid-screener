# Grid Screener Web App (Next.js + TypeScript)

这是一个基于 **Next.js 14+ App Router** 的可视化网格筛选页面。

## 功能

- 从 `data/snapshots/latest.json` 读取快照数据（每条包含 `ts` ISO 时间字段）。
- 从 `config/rules.json` 读取规则配置。
- 从 `config/universe.json` 读取 universe 过滤配置。
- 首页表格支持：
  - 搜索（symbol）
  - **由 `rules.json.filters` 动态驱动**的筛选控件（number / slider / select）
  - 排序（点击表头）
  - 显示 reason 解释列
- 页面显示：
  - 当前 universe 模式与数量
  - 数据更新时间
  - 「刷新数据」按钮（重新拉取 snapshot 并刷新表格）
- 支持导出当前筛选结果：JSON / CSV（包含 `reason` 字段）。

## universe.json 结构

- `mode`：`all` | `whitelist` | `blacklist`
- `whitelist`：白名单 symbols
- `blacklist`：黑名单 symbols

应用规则：

- `all`：不做处理
- `whitelist`：仅保留 whitelist 中 symbol
- `blacklist`：剔除 blacklist 中 symbol

## rules.json 过滤器结构

`filters` 每一项可定义：

- `field`：对应数据字段名（如 `quote_volume`）
- `type`：`number` | `slider` | `select`
- `default`：默认值
- `min` / `max` / `step`：数值控件参数（number/slider）
- `label`：显示名
- `mode`：比较方式（`gte` / `lte` / `eq`）
- `options`：`select` 类型可选项

## 本地运行

```bash
npm install
npm run dev
```

访问：`http://localhost:3000`

## 构建

```bash
npm run build
npm run start
```
