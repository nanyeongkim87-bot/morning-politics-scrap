const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const distDir = path.join(root, 'dist');
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

const searchable = collectFiles(distDir)
  .filter((file) => /\.(?:html|js|css)$/.test(file))
  .map((file) => fs.readFileSync(file, 'utf8'))
  .join('\n');

for (const marker of [expectedDate, '목록 전체복사']) {
  if (!searchable.includes(marker)) {
    throw new Error(`Deployment marker is missing: ${marker}`);
  }
}

console.log(`Static deployment verified for ${expectedDate}.`);
