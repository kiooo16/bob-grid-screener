import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

async function run(cmd, args) {
  try {
    const { stdout, stderr } = await execFileAsync(cmd, args, { encoding: 'utf8' });
    return { ok: true, stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (e) {
    return { ok: false, stdout: e.stdout?.trim() || '', stderr: e.stderr?.trim() || e.message };
  }
}

async function main() {
  const report = {
    ts: new Date().toISOString(),
    cwd: process.cwd(),
    tz: process.env.TZ || '(system default)',
    node: process.version,
    envChecks: {
      alertWebhookConfigured: Boolean(process.env.ALERT_WEBHOOK_URL)
    }
  };

  report.cron = await run('crontab', ['-l']);
  report.systemdTimer = await run('systemctl', ['list-timers', '--all', '--no-pager']);
  report.pm2 = await run('pm2', ['list']);
  report.snapshotHealth = await run('cat', ['logs/snapshot-health.json']);

  const hints = [];
  if (!report.cron.ok) hints.push('cron not available or no crontab; verify crontab -l as target user');
  if (!report.systemdTimer.ok) hints.push('systemd unavailable in this environment; check on VPS host');
  if (!report.pm2.ok) hints.push('pm2 command missing or no process; verify pm2 status on VPS');
  if (!report.envChecks.alertWebhookConfigured) hints.push('ALERT_WEBHOOK_URL not configured, failure alerts will only print to stderr/logs');
  report.hints = hints;

  console.log(JSON.stringify(report, null, 2));
}

main();
