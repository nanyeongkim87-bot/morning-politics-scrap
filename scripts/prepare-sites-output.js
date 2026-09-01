const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const distDir = path.join(root, 'dist');
const serverDir = path.join(distDir, 'server');
const openaiDistDir = path.join(distDir, '.openai');
const hostingSource = path.join(root, '.openai', 'hosting.json');
const hostingTarget = path.join(openaiDistDir, 'hosting.json');
const workerTarget = path.join(serverDir, 'index.js');
const scrapsPath = path.join(root, 'src', 'scraps.json');
const cssPath = path.join(root, 'src', 'styles.css');

fs.mkdirSync(serverDir, { recursive: true });
fs.mkdirSync(openaiDistDir, { recursive: true });

const hosting = JSON.parse(fs.readFileSync(hostingSource, 'utf8'));
fs.writeFileSync(
  hostingTarget,
  `${JSON.stringify({ project_id: hosting.project_id }, null, 2)}\n`,
  'utf8',
);

const scraps = fs.readFileSync(scrapsPath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');

const html = `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="noindex, nofollow, noarchive" />
    <title>조간 정치기사 스크랩</title>
    <style>${css}</style>
  </head>
  <body>
    <main class="page">
      <div class="topbar">
        <div>
          <p class="eyebrow">Morning Politics Scrap</p>
          <h1>조간 정치기사 스크랩</h1>
        </div>
        <div class="meta">
          <span id="dateLabel"></span>
          <span id="countLabel"></span>
        </div>
      </div>
      <div class="toolbar">
        <label class="selectWrap">날짜 <select id="dateSelect"></select></label>
        <label class="searchWrap">검색 <input id="searchInput" type="search" placeholder="제목 검색" /></label>
        <button class="copyButton" id="copyButton" type="button">목록 전체복사</button>
      </div>
      <div id="sections" class="sections"></div>
    </main>
    <script>
      const archive = ${scraps};
      const pressOrder = ['조선', '중앙', '동아', '경향', '한겨레', '국민', '서울', '세계', '한국'];
      const dateSelect = document.getElementById('dateSelect');
      const searchInput = document.getElementById('searchInput');
      const sections = document.getElementById('sections');
      const dateLabel = document.getElementById('dateLabel');
      const countLabel = document.getElementById('countLabel');
      const copyButton = document.getElementById('copyButton');
      const dates = Object.keys(archive).sort().reverse();

      for (const date of dates) {
        const option = document.createElement('option');
        option.value = date;
        option.textContent = date.slice(4, 6) + '/' + date.slice(6, 8);
        dateSelect.appendChild(option);
      }

      function render() {
        const date = dateSelect.value || dates[0];
        const query = searchInput.value.trim().toLowerCase();
        const data = archive[date] || { sections: {} };
        let count = 0;
        sections.textContent = '';

        for (const press of pressOrder) {
          const articles = (data.sections[press] || []).filter((article) =>
            !query || article.title.toLowerCase().includes(query)
          );
          count += articles.length;

          const article = document.createElement('section');
          article.className = 'press';
          article.innerHTML = '<div class="pressHead"><h2></h2><span></span></div><ul></ul>';
          article.querySelector('h2').textContent = press;
          article.querySelector('span').textContent = articles.length + '건';
          const list = article.querySelector('ul');

          for (const item of articles) {
            const li = document.createElement('li');
            if (item.url) {
              const titleLink = document.createElement('a');
              titleLink.className = 'articleTitle';
              titleLink.href = item.url;
              titleLink.target = '_blank';
              titleLink.rel = 'noreferrer';
              titleLink.textContent = item.title;

              li.appendChild(titleLink);

              if (item.showUrl) {
                const urlLink = document.createElement('a');
                urlLink.className = 'articleUrl';
                urlLink.href = item.url;
                urlLink.target = '_blank';
                urlLink.rel = 'noreferrer';
                urlLink.textContent = item.url;
                li.appendChild(urlLink);
              }
            } else {
              const node = document.createElement('span');
              node.className = 'articleTitle';
              node.textContent = item.title;
              li.appendChild(node);
            }
            list.appendChild(li);
          }

          sections.appendChild(article);
        }

        dateLabel.textContent = date ? date.slice(0, 4) + '-' + date.slice(4, 6) + '-' + date.slice(6, 8) : '날짜 없음';
        countLabel.textContent = count + '건';
      }

      function buildScrapText(date) {
        const data = archive[date] || { sections: {} };
        const lines = ['#' + date.slice(4, 6) + date.slice(6, 8) + ' 조간정리'];

        for (const press of pressOrder) {
          lines.push('', '<' + press + '>', '');
          for (const item of data.sections[press] || []) {
            lines.push(item.title);
            if (item.showUrl && item.url) {
              lines.push('', item.url);
            }
            lines.push('');
          }
        }

        return lines.join('\\n').replace(/\\n{3,}/g, '\\n\\n').trimEnd();
      }

      async function copyText(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
          return;
        }

        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }

      async function copyCurrentScrap() {
        try {
          await copyText(buildScrapText(dateSelect.value || dates[0] || ''));
          copyButton.textContent = '복사됨';
          window.setTimeout(() => {
            copyButton.textContent = '목록 전체복사';
          }, 1800);
        } catch {
          copyButton.textContent = '복사 실패';
          window.setTimeout(() => {
            copyButton.textContent = '목록 전체복사';
          }, 1800);
        }
      }

      dateSelect.addEventListener('change', render);
      searchInput.addEventListener('input', render);
      copyButton.addEventListener('click', copyCurrentScrap);
      render();
    </script>
  </body>
</html>`;

fs.writeFileSync(
  workerTarget,
  `const html = ${JSON.stringify(html)};

export default {
  async fetch() {
    return new Response(html, {
      headers: {
        "content-type": "text/html; charset=UTF-8",
        "x-robots-tag": "noindex, nofollow, noarchive",
      },
    });
  },
};
`,
  'utf8',
);
