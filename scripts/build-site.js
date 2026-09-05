const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { classifyTitle, loadPoliticsRules, validateFeedbackRegression, validateManualQa } = require('./politics-rules');

const root = path.resolve(__dirname, '..');
const outputsDir = path.join(root, 'outputs');
const oneDriveDir = path.join(process.env.USERPROFILE || '', 'OneDrive', 'MorningPolitics');
const srcDir = path.join(root, 'src');
const qaDir = path.join(outputsDir, 'qa');
const scrapsPath = path.join(srcDir, 'scraps.json');
const bundledPython = 'C:\\Users\\Nan Kim\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe';
const python = process.env.PYTHON || (
  fs.existsSync(bundledPython)
    ? bundledPython
    : process.platform === 'win32' ? 'python' : 'python3'
);
const politicsRules = loadPoliticsRules(root);
const candidateAudit = [];

function getSeoulYyyymmdd() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(new Date()).replaceAll('-', '');
}

const WEB_EXCLUDE_TITLE_KEYWORDS = [
  '[조수빈의 말로 사람 읽기]',
  '레이건',
  '공감 리더십',
  '두산에 SK실트론 지분 매각',
  'SK실트론',
  '캄보디아 스캠',
  '천즈',
  '중국 검찰 정식체포',
  '대통령배',
  '강속구',
  '덕수고',
  '체력검사',
  '장애 직원 폭행',
  '구의원',
  '전북도의원',
  '충남 여야의원',
  '발전통합본사',
  '파주메디컬클러스터',
  '조선대 선정',
  '[신문과 놀자!',
  '독립협회',
  '백정',
  '성소수자 축제',
  '베를린',
  '유럽 극우화',
  '일 총리',
  '압수 와인 바꿔치기',
  '뇌물 특사경',
  '냉방 천국',
  '찜통 지옥',
  '[씨줄날줄] 국가 정상의 타국 대선 개입',
  '3기 신도시',
  '정비사업',
  '최저임금 적용',
  '민주노총',
  '성범죄 해보고 싶다',
  '장윤기 고교시절',
  '[기고] 풀뿌리 민주주의',
  '폭염',
  "위기경보 '심각'",
  '축구협회장',
  'K-축구',
  '박지성',
  '佛·伊',
  '경찰 ‘정당방위 인정’',
  '[김병기의 필향만리]',
  '여권형 폴드',
  '여권형 갤폴드',
  '폴드8',
  '여권처럼 한손에',
  '여천NCC',
  '여천엔씨씨',
  '석화 구조조정',
  '석화',
  'SK하이닉스 성과급',
  '자사주 지급',
  'N% 성과급',
  '[글로벌 이슈',
  '수정 대통령',
  '다산 행정부',
  '초음파 검사',
  '기술평가',
  '디올 의류',
  '외국인 입국',
  'QR로 간편하게',
  '통합 입국 신고 시스템',
  '콜센터 노동자',
  '원청’ 정부 기관',
  '인신매매 피해 확인서',
  '산모등록제',
  '공공보건의원',
  '손흥민의 인터뷰',
  '무회전 킥',
  '산지관리법 시행령',
  '한교총·NCCK',
  '교계 의견 전달',
  '법제 전 분야',
  '통합 자문',
  '한국 여권 파워',
  '작은 영화관',
  '중국 서열',
  '베이징 온 북 총리',
  '북 총리 환대',
  '다카이치',
  '아베',
  'NYT 기자',
  '트럼프',
  '美국무',
  '쿠바',
  '전기트럭',
  '경제경영',
  '판타지',
  '무협',
  '로맨스',
  '배재고',
  '교육감 선거',
  '직선제 폐지',
  '깜깜이 선거',
  '무효표',
  '인기 투표',
  '학교가 공약 도구',
  '용인 반도체 산단',
  '국토장관',
  '통계조작 감사',
  '될 때까지 조사',
  '노조 없는 노동자',
  '노동회의소',
  '조완규',
  '전 장관 별세',
  '투표지 인쇄비',
  '선거관리 수고비',
  '인천 구의원',
  '임기 이틀 만에 탈당',
  '협회장 궐위',
  '체육회서 기한 연장',
  '한강 작가',
  '한강 노벨',
  '한강공원',
  '정치적 글쓰기',
  '국립국어원장',
  '이관규',
  '스토킹',
  '교제폭력',
  '현장 집행력',
  'JTBC 채권',
  '금융 검사',
  '현대차 임금협상',
  '부분파업',
  '삼성전자 노조',
  '호남 반도체',
  '조합원',
  '이스라엘',
  '네타냐후',
  '석화 재편',
  '울산 산단',
  '샤힌',
  '국장 유인책',
  '롤러코스피',
  '개미들 탈출',
  '숨은 감염자',
  '확진자 치료',
  '서초',
  '인구의 날',
  '대통령 표창',
  '학폭 대응',
  '선거관리 예산집행',
  '여권 발급',
  '휴가철 앞두고',
  'WT논평',
  'American agriculture',
  '젤렌스키',
  '새로운 정치 전략',
  '에볼라',
  '민주콩고',
  '남수단',
  '드론전 영웅',
  '우크라 국방장관',
  '정서 학대',
  '아동복지법 개정',
  '의정부 아파트',
  '추락사',
  '숨진채 발견',
  '아르헨 대통령',
  '직관하면 질까봐',
  'TV로 결승전 시청',
  '소아 심장수술',
  '서울대병원',
  '윤희영의 News English',
  '버넘',
  '영국 총리',
  '북부의 왕',
  '다우닝가',
  '서킷브레이커',
  '사망세',
  '반도체 역풍론',
  '최태원',
  'K방산',
  '무인수상정',
  '바다의 드론',
  '마켓 나우',
  '기대수익률',
  '광주 군공항',
  '무안 이전',
  '생기부',
  '서울교육청 부실 관리',
  '세대교체',
  '미국 민주사회주의',
  '풀뿌리 제도권',
  '바퀴벌레당',
  '인도 청년',
  '우크라',
  '국방장관 경질',
  '강제 징집',
  '청도 운문사',
  '비구니',
  '승가대학',
  'GPU, 정부 투자',
  '북·러',
  '한반도 상황 관리',
  '풍력 바지선',
  '어로구역',
  '조업 방해',
  'ODA 연계 AI',
  'AI 해외진출',
  '경기북부',
  '철도망 구축',
  '니카라과',
  '오르테가',
  '대통령 장기 독재',
  '탁구 영재',
  '강시혁',
  '대통령기 초등부',
  '소아청소년과 의원',
  '진찰료',
  '영국 새 내각',
  '넘버2',
  '재무장관 컴백',
  '시스루 피플',
  '브라질 전 대통령',
  '미 영주권',
  '시선의 전복',
  '옥상이 품은',
  '민주적 가치',
  '유병호',
  '감사원 돌격대',
  '외로운 늑대',
  '민주주의 고향',
  '글로벌 인사이트',
  '선거 결과에도 돈',
  '세계·사람·생각',
  '특파원 리포트',
  '미국 중간선거',
  'K관광',
  '정부·통신 3사',
  '고물가 속 할인혜택',
  '우라늄 농축 허용',
  '한미 원자력협정',
  '성매매 시의원',
  '전기차 배터리',
  '초정밀 검사기술',
  '국방수권법안',
  '주한미군 감축',
  '깡패 출신 친일파',
  '농산물값',
  '정부 관리 물량',
  '대형마트 새벽배송',
  '의무휴업 완화',
  '[여의춘추]',
  '최저임금 협상',
  '국가대표 AI',
  '에이전트 능력',
  '정치 깡패 이정재',
  'MZ 조폭',
  '대학교수 노조 정치 활동',
  '교원노조법',
  '백신 불신론자',
  '홍역 환자',
];

const NON_CENTRAL_POLITICS_TITLE_KEYWORDS = [
  '\uc784\uc885\uc5b8',
  '\ub3c4\ud551\uac80\uc0ac',
  '\uc18c\uc7ac\uc9c0 \ubcf4\uace0',
  '\uc790\uaca9\uc815\uc9c0',
  '\uc778\ub2c8 \uc120\uc6d0',
  '\uc778\uc2e0\ub9e4\ub9e4 \ud53c\ud574\uc790',
  '\ubd80\uc0b0 \ubaa8\ud154 \ucd94\ub77d',
  '\ube44\ub2d0\uc9d1',
  '\uc8fc\ubbfc\uc138',
  '[\ud604\uc7a5]',
  '\uc9c0\ubc29 \uc815\ubd80, \ub2eb\ud78c \ud68c\uc758',
  '[\uc65c\ub0d0\uba74]',
  '\uc801\uadf9\ud589\uc815',
  '\uc131\ubd81',
  '\ud589\uc548\ubd80 \uc7a5\uad00\uc0c1',
  '\ubc29\ubb38\uc9c4 \uc0c8 \uc774\uc0ac\uc7a5',
  'MBC 24\uc77c\ubd80\ud130 \uc0ac\uc7a5\ud6c4\ubcf4',
  '\ub178\ub3d9\uc7a5\uad00 "\uc8fc 52\uc2dc\uac04 \uc608\uc678 \uc5c6\uc5b4\ub3c4 \ubc18\ub3c4\uccb4',
  '\ucc9c\ubb38\ud559\uc801 \uc131\uacfc',
  '\uc608\uc1a1 \ub17c\uc7c1',
  '\ud55c\uc218\uc6d0',
  '\ud3ed\ud589 \ubd80\uc7a5\uac80\uc0ac',
];

const NON_CENTRAL_POLITICS_TITLE_RULES = [
  ['\uc815\ubd80', '\uc778\ub2c8 \uc120\uc6d0'],
  ['\uc815\ubd80', '\uc778\uc2e0\ub9e4\ub9e4'],
  ['\uc815\ubd80', '\ube44\ub2d0\uc9d1'],
  ['\uc815\ubd80', '\uc8fc\ubbfc\uc138'],
  ['\uc9c0\ubc29 \uc815\ubd80', '\ud68c\uc758'],
  ['\ud589\uc548\ubd80', '\uc7a5\uad00\uc0c1'],
  ['\ub178\ub3d9\uc7a5\uad00', '\ubc18\ub3c4\uccb4'],
  ['\u6aa2', '\ud55c\uc218\uc6d0'],
];

function isNonCentralPoliticsTitle(title) {
  return (
    NON_CENTRAL_POLITICS_TITLE_KEYWORDS.some((word) => title.includes(word)) ||
    NON_CENTRAL_POLITICS_TITLE_RULES.some((rule) => rule.every((word) => title.includes(word)))
  );
}

function shouldExcludeFromWeb(title) {
  return WEB_EXCLUDE_TITLE_KEYWORDS.some((word) => title.includes(word)) || isNonCentralPoliticsTitle(title);
}

function classifyArticleForWeb(title, source, press, date, url = '') {
  const legacyExcluded = shouldExcludeFromWeb(title);
  const decision = classifyTitle(title, politicsRules, legacyExcluded);
  candidateAudit.push({
    date,
    press,
    source,
    title,
    url,
    included: decision.include,
    reason: decision.reason,
    score: decision.score,
    matches: decision.matches,
  });
  return decision;
}

function normalizeParsedDay(day, source = 'json') {
  const sections = {};
  for (const [press, articles] of Object.entries(day.sections || {})) {
    sections[press] = articles
      .filter((article) => classifyArticleForWeb(article.title || '', source, press, day.date || '', article.url || '').include)
      .map((article) => ({
        title: article.title || '',
        url: article.url || '',
        showUrl: Boolean(article.showUrl),
      }));
  }
  return { date: day.date || '', sections };
}

function parseScrap(text, source = 'txt') {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const heading = lines.find((line) => /^#\d{4}\s/.test(line.trim())) || '';
  const dateMatch = heading.match(/^#(\d{2})(\d{2})/);
  const year = new Date().getFullYear();
  const date = dateMatch ? `${year}${dateMatch[1]}${dateMatch[2]}` : '';
  const sections = {};
  let press = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    const sectionMatch = line.match(/^<(.+)>$/);
    if (sectionMatch) {
      press = sectionMatch[1];
      sections[press] = sections[press] || [];
      continue;
    }
    if (!press || !line || line.startsWith('#') || line.startsWith('http')) continue;

    let url = '';
    let lookahead = index + 1;
    while (lookahead < lines.length && !lines[lookahead].trim()) {
      lookahead += 1;
    }
    const next = (lines[lookahead] || '').trim();
    if (next.startsWith('http')) {
      url = next;
      index = lookahead;
    }
    if (classifyArticleForWeb(line, source, press, date, url).include) {
      sections[press].push({ title: line, url, showUrl: Boolean(url) });
    }
  }

  return { date, sections };
}

function readJsonScrap(fullPath) {
  return normalizeParsedDay(JSON.parse(fs.readFileSync(fullPath, 'utf8')), path.basename(fullPath));
}

function flattenDayTitles(day) {
  return new Set(
    Object.values((day || {}).sections || {})
      .flatMap((articles) => articles || [])
      .map((article) => article.title || ''),
  );
}

function applyFeedbackIncludes(archive) {
  for (const item of politicsRules.feedback.filter((entry) => entry.expected === 'include')) {
    const day = archive[item.date];
    if (!day) continue;
    const titles = flattenDayTitles(day);
    if (titles.has(item.title)) continue;
    day.sections = day.sections || {};
    day.sections['한국'] = day.sections['한국'] || [];
    day.sections['한국'].push({
      title: item.title,
      url: '',
      showUrl: false,
      feedbackReason: item.reason || '',
    });
    candidateAudit.push({
      date: item.date,
      press: '한국',
      source: 'feedback',
      title: item.title,
      url: '',
      included: true,
      reason: 'feedback-include-missing-source',
      score: 999,
      matches: [{ reason: item.reason || 'feedback-include', score: 999, phrases: [item.title] }],
    });
  }
}

fs.mkdirSync(outputsDir, { recursive: true });
fs.mkdirSync(srcDir, { recursive: true });
fs.mkdirSync(qaDir, { recursive: true });

const yyyymmdd = getSeoulYyyymmdd();
const todayOutput = path.join(outputsDir, `morning_politics_${yyyymmdd}.txt`);
const todayJsonOutput = path.join(outputsDir, `morning_politics_${yyyymmdd}.json`);
const todayOneDriveOutput = path.join(oneDriveDir, `morning_politics_${yyyymmdd}.txt`);
const todayOneDriveJsonOutput = path.join(oneDriveDir, `morning_politics_${yyyymmdd}.json`);

if (process.env.SKIP_SCRAPE !== '1') {
  try {
    const scrapeArgs = [
      path.join(outputsDir, 'naver_morning_politics_scrap.py'),
      '--output',
      todayOutput,
      '--json-output',
      todayJsonOutput,
    ];
    const seoulWeekday = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Seoul',
      weekday: 'short',
    }).format(new Date());
    if (process.env.ALLOW_PARTIAL_SATURDAY === '1' && seoulWeekday === 'Sat') {
      scrapeArgs.push('--allow-partial-sources');
      console.log('Saturday partial-source close is enabled.');
    }
    execFileSync(python, scrapeArgs, {
      stdio: 'inherit',
    });
  } catch (error) {
    console.warn('Could not refresh today scrape before building site.');
    if (process.env.REQUIRE_TODAY === '1') {
      process.exit(error.status || 1);
    }
  }
}

const archive = fs.existsSync(scrapsPath)
  ? JSON.parse(fs.readFileSync(scrapsPath, 'utf8'))
  : {};
for (const dir of [outputsDir, oneDriveDir]) {
  if (!dir || !fs.existsSync(dir)) continue;
  for (const file of fs.readdirSync(dir)) {
    const jsonMatch = file.match(/^morning_politics_(\d{8})(?:_updated)?\.json$/);
    if (jsonMatch) {
      const fullPath = path.join(dir, file);
      archive[jsonMatch[1]] = readJsonScrap(fullPath);
      continue;
    }
  }
}

if (fs.existsSync(todayOneDriveJsonOutput)) {
  archive[yyyymmdd] = readJsonScrap(todayOneDriveJsonOutput);
} else if (fs.existsSync(todayOneDriveOutput)) {
  archive[yyyymmdd] = parseScrap(fs.readFileSync(todayOneDriveOutput, 'utf8'), path.basename(todayOneDriveOutput));
}

for (const dir of [outputsDir, oneDriveDir]) {
  if (!dir || !fs.existsSync(dir)) continue;
  for (const file of fs.readdirSync(dir)) {
    const match = file.match(/^morning_politics_(\d{8})(?:_updated)?\.txt$/);
    if (!match) continue;
    if (archive[match[1]]) continue;
    const fullPath = path.join(dir, file);
    const parsed = parseScrap(fs.readFileSync(fullPath, 'utf8'), path.basename(fullPath));
    const date = match[1] || parsed.date;
    archive[date] = parsed;
  }
}

applyFeedbackIncludes(archive);

if (process.env.REQUIRE_TODAY === '1' && !archive[yyyymmdd]) {
  console.error(`Today's data (${yyyymmdd}) was not collected; refusing to publish stale content.`);
  process.exit(1);
}

if (process.env.REQUIRE_TODAY === '1') {
  const todaySections = Object.values(archive[yyyymmdd].sections || {});
  const todayArticleCount = todaySections.reduce((sum, articles) => sum + articles.length, 0);
  const populatedPressCount = todaySections.filter((articles) => articles.length > 0).length;
  if (todayArticleCount < 5 || populatedPressCount < 3) {
    console.error(
      `Today's data (${yyyymmdd}) is incomplete: ${todayArticleCount} articles across ${populatedPressCount} presses.`,
    );
    process.exit(1);
  }
}

const todayQa = validateManualQa(archive[yyyymmdd], politicsRules);
const feedbackRegression = validateFeedbackRegression(archive, politicsRules);
const todayAuditPath = path.join(qaDir, `candidate_audit_${yyyymmdd}.json`);
fs.writeFileSync(
  todayAuditPath,
  `${JSON.stringify({
    date: yyyymmdd,
    manualQa: todayQa,
    feedbackRegression,
    candidates: candidateAudit.filter((item) => item.date === yyyymmdd),
  }, null, 2)}\n`,
  'utf8',
);

if (todayQa.presentDeny.length || todayQa.missingAllow.length || feedbackRegression.failures.length) {
  console.error(`QA failed for ${yyyymmdd}`);
  if (todayQa.presentDeny.length) console.error(`Deny phrases still present: ${todayQa.presentDeny.join(', ')}`);
  if (todayQa.missingAllow.length) console.error(`Allow phrases missing: ${todayQa.missingAllow.join(', ')}`);
  if (feedbackRegression.failures.length) {
    console.error(`Feedback regression failures: ${feedbackRegression.failures.length}/${feedbackRegression.checked}`);
    for (const failure of feedbackRegression.failures.slice(0, 20)) {
      console.error(`- ${failure.date} ${failure.expected} ${failure.actual}: ${failure.title}`);
    }
  }
  console.error(`See ${todayAuditPath}`);
  process.exit(1);
}

fs.writeFileSync(scrapsPath, `${JSON.stringify(archive, null, 2)}\n`, 'utf8');

const viteBin = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
execFileSync(process.execPath, [viteBin, 'build'], { cwd: root, stdio: 'inherit' });
if (process.env.EXTERNAL_STATIC !== '1' && fs.existsSync(path.join(root, '.openai', 'hosting.json'))) {
  execFileSync(process.execPath, [path.join(root, 'scripts', 'prepare-sites-output.js')], {
    cwd: root,
    stdio: 'inherit',
  });
}
