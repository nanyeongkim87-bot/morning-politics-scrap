import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Check, Copy, Search, Newspaper, CalendarDays } from 'lucide-react';
import './styles.css';
import archive from './scraps.json';

const PRESS_ORDER = ['조선', '중앙', '동아', '경향', '한겨레', '국민', '서울', '세계', '한국'];

function App() {
  const dates = Object.keys(archive).sort().reverse();
  const [selectedDate, setSelectedDate] = useState(dates[0] || '');
  const [query, setQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const day = archive[selectedDate] || { sections: {} };

  const filteredSections = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const entries = {};
    for (const press of PRESS_ORDER) {
      const articles = day.sections?.[press] || [];
      entries[press] = normalized
        ? articles.filter((article) => article.title.toLowerCase().includes(normalized))
        : articles;
    }
    return entries;
  }, [day, query]);

  const totalCount = Object.values(day.sections || {}).reduce((sum, articles) => sum + articles.length, 0);

  async function copyCurrentScrap() {
    const text = buildScrapText(selectedDate, day);
    try {
      await copyText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <main className="page">
      <header className="topbar">
        <div>
          <p className="eyebrow">Morning newspaper politics clipping</p>
          <h1>조간 정치기사 스크랩</h1>
        </div>
        <div className="meta">
          <span><CalendarDays size={16} />{formatDate(selectedDate)}</span>
          <span><Newspaper size={16} />{totalCount}건</span>
        </div>
      </header>

      <section className="toolbar" aria-label="스크랩 도구">
        <label className="selectWrap">
          날짜
          <select value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)}>
            {dates.map((date) => (
              <option key={date} value={date}>{formatDate(date)}</option>
            ))}
          </select>
        </label>
        <label className="searchWrap">
          <Search size={17} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="제목 검색"
          />
        </label>
        <button className="copyButton" type="button" onClick={copyCurrentScrap}>
          {copied ? <Check size={17} /> : <Copy size={17} />}
          {copied ? '복사됨' : '목록 전체복사'}
        </button>
      </section>

      <div className="sections">
        {PRESS_ORDER.map((press) => (
          <section className="press" key={press}>
            <div className="pressHead">
              <h2>{press}</h2>
              <span>{filteredSections[press]?.length || 0}</span>
            </div>
            <ul>
              {(filteredSections[press] || []).map((article, index) => (
                <li key={`${press}-${index}`}>
                  {article.url ? (
                    <>
                      <a className="articleTitle" href={article.url} target="_blank" rel="noreferrer">
                        {article.title}
                      </a>
                      {article.showUrl ? (
                        <a className="articleUrl" href={article.url} target="_blank" rel="noreferrer">
                          {article.url}
                        </a>
                      ) : null}
                    </>
                  ) : (
                    <span className="articleTitle">{article.title}</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}

function formatDate(date) {
  if (!date || date.length !== 8) return date || '';
  return `${date.slice(0, 4)}.${date.slice(4, 6)}.${date.slice(6, 8)}`;
}

function formatHeadingDate(date) {
  if (!date || date.length !== 8) return '';
  return `${date.slice(4, 6)}${date.slice(6, 8)}`;
}

function buildScrapText(date, day) {
  const lines = [`#${formatHeadingDate(date)} 조간정리`];
  for (const press of PRESS_ORDER) {
    lines.push('', `<${press}>`, '');
    const articles = day.sections?.[press] || [];
    for (const article of articles) {
      lines.push(article.title);
      if (article.showUrl && article.url) {
        lines.push('', article.url);
      }
      lines.push('');
    }
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd();
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
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

createRoot(document.getElementById('root')).render(<App />);
