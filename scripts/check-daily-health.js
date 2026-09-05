const fs = require('fs');

const SEOUL_TIME_ZONE = 'Asia/Seoul';
const DEFAULT_REPOSITORY = 'nanyeongkim87-bot/morning-politics-scrap';
const DEFAULT_WORKFLOW = 'daily-pages.yml';
const DEFAULT_LIVE_URL = 'https://nanyeongkim87-bot.github.io/morning-politics-scrap/';
const EXPECTED_PRESSES = ['조선', '중앙', '동아', '경향', '한겨레', '국민', '서울', '세계', '한국'];

function parseArgs(argv) {
  const options = {
    date: '',
    repository: process.env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY,
    workflow: DEFAULT_WORKFLOW,
    liveUrl: process.env.LIVE_URL || DEFAULT_LIVE_URL,
    json: false,
    requireLive: false,
    liveOnly: false,
    strictScheduler: false,
    waitSeconds: 0,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') options.json = true;
    else if (arg === '--live-only') options.liveOnly = true;
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

function afterCutoff(expectedDate, now = new Date(), cutoffMinutes = 6 * 60 + 40) {
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
  if (scheduler === 'missing') issues.push('GitHub schedule event was not created by the 06:40 KST deadline.');
  if (failedRuns.length) issues.push(`${failedRuns.length} earlier workflow run(s) failed today.`);
  if (!archiveHasDate) issues.push('The main-branch archive is missing today.');
  if (!liveHasDate) issues.push('The deployed page is missing today.');

  let status = 'healthy';
  if (!archiveHasDate || !liveHasDate) status = 'critical';
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

function validateHealthManifest(manifest, expectedDate) {
  if (!manifest || manifest.date !== expectedDate) return false;
  if (!Number.isInteger(manifest.articleCount) || manifest.articleCount < 5) return false;
  if (!Number.isInteger(manifest.sectionCount) || manifest.sectionCount !== EXPECTED_PRESSES.length) return false;
  if (EXPECTED_PRESSES.some((press) => !Object.hasOwn(manifest.sections || {}, press))) return false;
  const sectionCounts = EXPECTED_PRESSES.map((press) => manifest.sections[press]);
  if (sectionCounts.some((count) => !Number.isInteger(count) || count < 0)) return false;
  if (sectionCounts.reduce((sum, count) => sum + count, 0) !== manifest.articleCount) return false;
  if (sectionCounts.filter((count) => count > 0).length !== manifest.populatedPressCount) return false;
  const minimumPopulatedPresses = manifest.mode === 'saturday-partial' ? 1 : 3;
  return Number.isInteger(manifest.populatedPressCount) && manifest.populatedPressCount >= minimumPopulatedPresses;
}

async function checkLiveHealth(liveUrl, expectedDate) {
  const healthUrl = new URL('health.json', liveUrl.endsWith('/') ? liveUrl : `${liveUrl}/`);
  healthUrl.searchParams.set('check', String(Date.now()));
  const manifest = JSON.parse(await fetchText(healthUrl.href));
  return validateHealthManifest(manifest, expectedDate) ? manifest : null;
}

async function checkLiveWithRetry(liveUrl, expectedDate, waitSeconds) {
  const deadline = Date.now() + waitSeconds * 1000;
  let lastError = null;
  do {
    try {
      const manifest = await checkLiveHealth(liveUrl, expectedDate);
      if (manifest) return manifest;
      lastError = null;
    } catch (error) {
      lastError = error;
    }
    if (Date.now() >= deadline) break;
    await new Promise((resolve) => setTimeout(resolve, Math.min(15000, deadline - Date.now())));
  } while (Date.now() <= deadline);
  if (lastError) throw lastError;
  return null;
}

function formatReport(result) {
  const lines = [
    `Daily health: ${result.status}`,
    `Date (Asia/Seoul): ${result.expectedDate}`,
    `Scheduler: ${result.scheduler} (${result.counts.scheduleRuns} scheduled / ${result.counts.todayRuns} total runs)`,
    `Archive: ${result.archiveHasDate ? 'current' : 'stale'}`,
    `Live page: ${result.liveHasDate ? 'current' : 'stale'}`,
  ];
  if (result.liveHealth) {
    lines.push(
      `Live data: ${result.liveHealth.articleCount} articles / ${result.liveHealth.populatedPressCount} presses / ${result.liveHealth.mode}`,
    );
  }
  for (const issue of result.issues) lines.push(`- ${issue}`);
  return lines.join('\n');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const expectedDate = options.date || seoulDate();
  if (options.liveOnly) {
    const liveHealth = await checkLiveWithRetry(options.liveUrl, expectedDate, options.waitSeconds);
    const result = {
      status: liveHealth ? 'healthy' : 'critical',
      expectedDate,
      liveHasDate: Boolean(liveHealth),
      liveHealth,
      verifiedAt: new Date().toISOString(),
    };
    console.log(options.json ? JSON.stringify(result, null, 2) : `Live page: ${liveHealth ? 'current' : 'stale'}`);
    if (options.requireLive && !liveHealth) process.exitCode = 1;
    return;
  }
  const [owner, repository] = options.repository.split('/');
  if (!owner || !repository) throw new Error('--repository must use owner/name');

  const apiUrl = `https://api.github.com/repos/${owner}/${repository}/actions/workflows/${encodeURIComponent(options.workflow)}/runs?per_page=100`;
  const archiveUrl = `https://raw.githubusercontent.com/${owner}/${repository}/main/src/scraps.json`;
  const [runsText, archiveText, liveHealth] = await Promise.all([
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
    liveHasDate: Boolean(liveHealth),
  });
  result.liveHealth = liveHealth;
  result.verifiedAt = new Date().toISOString();

  const output = options.json ? JSON.stringify(result, null, 2) : formatReport(result);
  console.log(output);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n\`\`\`text\n${output}\n\`\`\`\n`);

  if (!result.archiveHasDate || (options.requireLive && !result.liveHasDate)) {
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

module.exports = { afterCutoff, evaluateHealth, seoulDate, validateHealthManifest, weekdayForDate };
