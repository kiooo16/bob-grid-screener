import { spawn } from 'node:child_process';
import { mkdir, writeFile, appendFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const logsDir = resolve(process.cwd(), 'logs');
const logFile = resolve(logsDir, 'snapshot-job.log');
const healthFile = resolve(logsDir, 'snapshot-health.json');

function now() {
  return new Date().toISOString();
}

async function sendAlert(message) {
  const webhook = process.env.ALERT_WEBHOOK_URL;
  if (!webhook) return false;
  try {
    const resp = await fetch(webhook, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: message, ts: now() })
    });
    return resp.ok;
  } catch {
    return false;
  }
}

async function main() {
  await mkdir(logsDir, { recursive: true });

  const startedAt = now();
  await appendFile(logFile, `\n[${startedAt}] snapshot job started\n`, 'utf8');

  const child = spawn(process.execPath, ['scripts/fetch_snapshot_binance_futures.mjs'], {
    cwd: process.cwd(),
    env: process.env
  });

  let out = '';
  let err = '';
  child.stdout.on('data', (d) => {
    const t = d.toString();
    out += t;
  });
  child.stderr.on('data', (d) => {
    const t = d.toString();
    err += t;
  });

  const code = await new Promise((resolveCode) => {
    child.on('close', resolveCode);
  });

  const finishedAt = now();
  const ok = code === 0;

  const logBlock = [
    `[${finishedAt}] snapshot job finished code=${code}`,
    out ? `stdout:\n${out.trim()}` : '',
    err ? `stderr:\n${err.trim()}` : ''
  ]
    .filter(Boolean)
    .join('\n');

  await appendFile(logFile, `${logBlock}\n`, 'utf8');

  const health = {
    ok,
    startedAt,
    finishedAt,
    exitCode: code,
    lastError: ok ? '' : (err || out || 'unknown error').slice(0, 2000)
  };
  await writeFile(healthFile, `${JSON.stringify(health, null, 2)}\n`, 'utf8');

  if (!ok) {
    const alerted = await sendAlert(`Grid snapshot job failed at ${finishedAt}, exit=${code}`);
    if (!alerted) {
      console.error('ALERT: snapshot job failed and ALERT_WEBHOOK_URL is missing/unreachable');
    }
    process.exit(code ?? 1);
  }

  console.log('snapshot job success');
}

main().catch(async (e) => {
  await mkdir(logsDir, { recursive: true });
  await appendFile(logFile, `[${now()}] fatal runner error: ${String(e)}\n`, 'utf8');
  await writeFile(
    healthFile,
    `${JSON.stringify({ ok: false, finishedAt: now(), exitCode: 1, lastError: String(e) }, null, 2)}\n`,
    'utf8'
  );
  process.exit(1);
});
