const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const distDir = path.join(root, 'dist');
const expectedPresses = ['조선', '중앙', '동아', '경향', '한겨레', '국민', '서울', '세계', '한국'];
const expectedDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date()).replaceAll('-', '');

function collectFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    return entry.isDirectory() ? collectFiles(fullPath) : [fullPath];
  });
}

if (!fs.existsSync(path.join(distDir, 'index.html'))) {
  throw new Error('dist/index.html is missing');
}

const healthPath = path.join(distDir, 'health.json');
if (!fs.existsSync(healthPath)) {
  throw new Error('dist/health.json is missing');
}
const health = JSON.parse(fs.readFileSync(healthPath, 'utf8'));
if (health.date !== expectedDate) {
  throw new Error(`Health manifest date mismatch: ${health.date || 'missing'} != ${expectedDate}`);
}
if (!Number.isInteger(health.articleCount) || health.articleCount < 5) {
  throw new Error(`Health manifest article count is invalid: ${health.articleCount}`);
}
const minimumPopulatedPresses = health.mode === 'saturday-partial' ? 1 : 3;
if (!Number.isInteger(health.populatedPressCount) || health.populatedPressCount < minimumPopulatedPresses) {
  throw new Error(`Health manifest populated press count is invalid: ${health.populatedPressCount}`);
}
if (!Number.isInteger(health.sectionCount) || health.sectionCount !== expectedPresses.length) {
  throw new Error(`Health manifest must contain all 9 newspaper sections: ${health.sectionCount}`);
}
if (expectedPresses.some((press) => !Object.hasOwn(health.sections || {}, press))) {
  throw new Error('Health manifest is missing one or more named newspaper sections');
}
const sectionValues = expectedPresses.map((press) => health.sections[press]);
if (sectionValues.some((count) => !Number.isInteger(count) || count < 0)) {
  throw new Error('Health manifest contains an invalid newspaper article count');
}
if (sectionValues.reduce((sum, count) => sum + count, 0) !== health.articleCount) {
  throw new Error('Health manifest article total does not match its newspaper sections');
}
if (sectionValues.filter((count) => count > 0).length !== health.populatedPressCount) {
  throw new Error('Health manifest populated press total does not match its newspaper sections');
}

const searchable = collectFiles(distDir)
  .filter((file) => /\.(?:html|js|css)$/.test(file))
  .map((file) => fs.readFileSync(file, 'utf8'))
  .join('\n');

for (const marker of [expectedDate, '목록 전체복사']) {
  if (!searchable.includes(marker)) {
    throw new Error(`Deployment marker is missing: ${marker}`);
  }
}

console.log(
  `Static deployment verified for ${expectedDate}: ${health.articleCount} articles across ${health.populatedPressCount} presses (${health.mode}).`,
);
