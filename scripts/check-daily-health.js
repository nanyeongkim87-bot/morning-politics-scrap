const fs = require('fs');

const SEOUL_TIME_ZONE = 'Asia/Seoul';
const DEFAULT_REPOSITORY = 'nanyeongkim87-bot/morning-politics-scrap';
const DEFAULT_WORKFLOW = 'daily-pages.yml';
const DEFAULT_LIVE_URL = 'https://nanyeongkim87-bot.github.io/morning-politics-scrap/';

function parseArgs(argv) {
  const options = {
    date: '',
    repository: process.env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY,
    workflow: DEFAULT_WORKFLOW,
    liveUrl: process.env.LIVE_URL || DEFAULT_LIVE_URL,
    json: false,
    requireLive: false,
    strictScheduler: false,
    waitSeconds: 0,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') options.json = true;
    else if (arg === '--require-live') options.requireLive = true;
    else if (arg === '--strict-scheduler') options.strictScheduler = true;
    else if (arg === '--date') options.date = argv[++index] || '';
    else if (arg === '--repository') options.repository = argv[++index] || '';
    else if (arg === '--workflow') options.workflow = argv[++index] || '';
    else if (arg === '--live-url') options.liveUrl = argv[++index] || '';
    else if (arg === '--wait-seconds') options.waitSeconds = Number(argv[++index] || 0);
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (options.date && !/^\d{8}$/.test(options.date)) {
    throw new Error('--date must use YYYYMMDD');
  }
  if (!Number.isFinite(options.waitSeconds) || options.waitSeconds < 0) {
    throw new Error('--wait-seconds must be zero or a positive number');
  }
  return options;
}

function seoulParts(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SEOUL_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  }).formatToParts(value);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function seoulDate(value = new Date()) {
  const parts = seoulParts(value);
  return `${parts.year}${parts.month}${parts.day}`;
}

function weekdayForDate(date) {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(4, 6));
  const day = Number(date.slice(6, 8));
  return new Intl.DateTimeFormat('en-US', {
    timeZone: SEOUL_TIME_ZONE,
    weekday: 'short',
  }).format(new Date(Date.UTC(year, month - 1, day, 3)));
}

function afterCutoff(expectedDate, now = new Date(), cutoffMinutes = 9 * 60) {
  const currentDate = seoulDate(now);
  if (expectedDate < currentDate) return true;
  if (expectedDate > currentDate) return false;
  const parts = seoulParts(now);
  return Number(parts.hour) * 60 + Number(parts.minute) >= cutoffMinutes;
}

function runMatchesDate(run, expectedDate) {
  return Boolean(run.created_at) && seoulDate(new Date(run.created_at)) === expectedDate;
}

function evaluateHealth({ expectedDate, now = new Date(), runs = [], archiveHasDate, liveHasDate }) {
  const serviceDay = weekdayForDate(expectedDate) !== 'Sun';
  const cutoffPassed = afterCutoff(expectedDate, now);
  const todayRuns = runs.filter((run) => runMatchesDate(run, expectedDate));
  const scheduleRuns = todayRuns.filter((run) => run.event === 'schedule');
  const successfulRuns = todayRuns.filter((run) => run.conclusion === 'success');
  const failedRuns = todayRuns.filter((run) => run.conclusion === 'failure');

  let scheduler = 'not_applicable';
  if (serviceDay) {
    if (scheduleRuns.length) scheduler = 'created';
    else if (cutoffPassed) scheduler = 'missing';
    else scheduler = 'pending';
  }

  const issues = [];
  if (scheduler === 'missing') issues.push('GitHub schedule event was not created by the 09:00 KST cutoff.');
  if (failedRuns.length) issues.push(`${failedRuns.length} workflow run(s) failed today.`);
  if (!archiveHasDate) issues.push('The main-branch archive is missing today.');
  if (!liveHasDate) issues.push('The deployed page is missing today.');

  let status = 'healthy';
  if (!archiveHasDate || !liveHasDate || failedRuns.length) status = 'critical';
  else if (scheduler === 'missing') status = 'recovered_without_schedule';
  else if (scheduler === 'pending') status = 'pending';

  return {
    status,
    expectedDate,
    serviceDay,
    cutoffPassed,
    scheduler,
    archiveHasDate,
    liveHasDate,
    counts: {
      todayRuns: todayRuns.length,
      scheduleRuns: scheduleRuns.length,
      successfulRuns: successfulRuns.length,
      failedRuns: failedRuns.length,
    },
    latestRun: todayRuns[0] ? {
      id: todayRuns[0].id,
      event: todayRuns[0].event,
      status: todayRuns[0].status,
      conclusion: todayRuns[0].conclusion,
      createdAt: todayRuns[0].created_at,
      headSha: todayRuns[0].head_sha,
      htmlUrl: todayRuns[0].html_url,
    } : null,
    issues,
  };
}

async function fetchText(url, token = '') {
  const headers = {
    accept: 'application/vnd.github+json',
    'user-agent': 'morning-politics-health-harness',
  };
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response.text();
}

async function checkLiveDate(liveUrl, expectedDate) {
  const html = await fetchText(liveUrl);
  if (html.includes(expectedDate)) return true;
  const scriptSources = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map((match) => match[1]);
  for (const source of scriptSources) {
    const scriptUrl = new URL(source, liveUrl).href;
    const script = await fetchText(scriptUrl);
    if (script.includes(expectedDate)) return true;
  }
  return false;
}

async function checkLiveWithRetry(liveUrl, expectedDate, waitSeconds) {
  const deadline = Date.now() + waitSeconds * 1000;
  let lastError = null;
  do {
    try {
      if (await checkLiveDate(liveUrl, expectedDate)) return true;
      lastError = null;
    } catch (error) {
      lastError = error;
    }
    if (Date.now() >= deadline) break;
    await new Promise((resolve) => setTimeout(resolve, Math.min(15000, deadline - Date.now())));
  } while (Date.now() <= deadline);
  if (lastError) throw lastError;
  return false;
}

function formatReport(result) {
  const lines = [
    `Daily health: ${result.status}`,
    `Date (Asia/Seoul): ${result.expectedDate}`,
    `Scheduler: ${result.scheduler} (${result.counts.scheduleRuns} scheduled / ${result.counts.todayRuns} total runs)`,
    `Archive: ${result.archiveHasDate ? 'current' : 'stale'}`,
    `Live page: ${result.liveHasDate ? 'current' : 'stale'}`,
  ];
  for (const issue of result.issues) lines.push(`- ${issue}`);
  return lines.join('\n');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const expectedDate = options.date || seoulDate();
  const [owner, repository] = options.repository.split('/');
  if (!owner || !repository) throw new Error('--repository must use owner/name');

  const apiUrl = `https://api.github.com/repos/${owner}/${repository}/actions/workflows/${encodeURIComponent(options.workflow)}/runs?per_page=100`;
  const archiveUrl = `https://raw.githubusercontent.com/${owner}/${repository}/main/src/scraps.json`;
  const [runsText, archiveText, liveHasDate] = await Promise.all([
    fetchText(apiUrl, process.env.GITHUB_TOKEN || ''),
    fetchText(archiveUrl),
    checkLiveWithRetry(options.liveUrl, expectedDate, options.waitSeconds),
  ]);
  const runs = JSON.parse(runsText).workflow_runs || [];
  const archive = JSON.parse(archiveText);
  const result = evaluateHealth({
    expectedDate,
    runs,
    archiveHasDate: Boolean(archive[expectedDate]),
    liveHasDate,
  });

  const output = options.json ? JSON.stringify(result, null, 2) : formatReport(result);
  console.log(output);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n\`\`\`text\n${output}\n\`\`\`\n`);

  if (!result.archiveHasDate || (options.requireLive && !result.liveHasDate) || result.counts.failedRuns) {
    process.exitCode = 1;
  } else if (options.strictScheduler && result.scheduler === 'missing') {
    process.exitCode = 2;
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Daily health check failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { afterCutoff, evaluateHealth, seoulDate, weekdayForDate };
