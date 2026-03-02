# Grid Screener Web App (Next.js + TypeScript)

这是一个基于 **Next.js 14+ App Router** 的可视化网格筛选页面。

## 功能

- 从 `data/snapshots/latest.json` 读取快照数据（顶层 `ts` + `items`）。
- 从 `config/rules.json` 读取规则配置。
- 从 `config/universe.json` 读取 universe 过滤配置。
- 首页表格支持：
  - 搜索（symbol）
  - **由 `rules.json.filters` 动态驱动**的筛选控件（number / slider / select）
  - 排序（点击表头）
  - 显示 reason 解释列
- 页面显示：
  - 当前 universe 模式与数量（过滤后 / 原始总数）
  - 数据更新时间
  - 「刷新数据」按钮（重新拉取 snapshot 并刷新表格）
  - 「显示条数」选择器（50/100/200/500/全部）
  - 分页控件（首页/上一页/下一页/末页）
  - 固定顶部表头 + 固定底部横向滚动条
- 支持导出当前筛选结果：JSON / CSV（包含 `reason` 字段）。
- 页面顶部显示 Build Commit short hash（用于部署版本核对）。

## 获取 Binance Futures 全标的快照

```bash
npm run snapshot:futures
npm run dev
```

`snapshot:futures` 会请求 Binance USDT 永续全量 TRADING 合约，并写入：

- `data/snapshots/latest.json`
  - 顶层：`ts`
  - 列表：`items[]`

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


## 调度与推送链路排查（VPS）

新增两个脚本：

```bash
npm run snapshot:job       # 带日志与健康文件的更新任务（失败可报警）
npm run scheduler:check    # 检查 cron/systemd/pm2/TZ/健康状态
```

### 日志与健康检查

- 日志文件：`logs/snapshot-job.log`
- 健康文件：`logs/snapshot-health.json`
  - 包含 `ok`, `exitCode`, `startedAt`, `finishedAt`, `lastError`

### 失败报警

设置环境变量后，任务失败会 POST 报警：

```bash
export ALERT_WEBHOOK_URL="https://your-webhook-endpoint"
```

未配置时失败会写日志并在 stderr 输出告警。

### 调度示例

**cron（每小时）**

```cron
0 * * * * cd /path/to/bob-grid-screener && /usr/bin/npm run snapshot:job >> /path/to/bob-grid-screener/logs/cron.log 2>&1
```

**systemd timer（推荐）**

- service 执行 `npm run snapshot:job`
- timer 每小时触发
- 环境变量（如 `ALERT_WEBHOOK_URL`、`TZ`）写入 service 的 `Environment=`

**pm2**

```bash
pm2 start npm --name grid-snapshot-job -- run snapshot:job
pm2 logs grid-snapshot-job
```
