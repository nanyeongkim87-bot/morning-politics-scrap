const fs = require('fs');
const path = require('path');

function readJsonIfExists(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function normalizeRule(rule) {
  return {
    reason: rule.reason || 'unnamed-rule',
    score: Number(rule.score || 0),
    phrases: Array.isArray(rule.phrases) ? rule.phrases.filter(Boolean) : [],
  };
}

function loadPoliticsRules(root) {
  const rulesDir = path.join(root, 'rules');
  const rules = readJsonIfExists(path.join(rulesDir, 'current.json'), {});
  const feedback = loadFeedbackCases(root);
  return {
    scoreThreshold: Number(rules.scoreThreshold || 2),
    forceIncludePhrases: rules.forceIncludePhrases || [],
    forceExcludePhrases: rules.forceExcludePhrases || [],
    positiveSignals: (rules.positiveSignals || []).map(normalizeRule),
    negativeSignals: (rules.negativeSignals || []).map(normalizeRule),
    manualQa: {
      date: (rules.manualQa || {}).date || '',
      allow: ((rules.manualQa || {}).allow || []).filter(Boolean),
      deny: ((rules.manualQa || {}).deny || []).filter(Boolean),
    },
    feedback,
  };
}

function loadFeedbackCases(root) {
  const feedbackDir = path.join(root, 'feedback');
  if (!fs.existsSync(feedbackDir)) return [];
  return fs.readdirSync(feedbackDir)
    .filter((file) => /^\d{8}\.json$/.test(file))
    .flatMap((file) => {
      const feedback = readJsonIfExists(path.join(feedbackDir, file), {});
      const date = feedback.date || file.slice(0, 8);
      return (feedback.items || []).map((item, index) => ({
        id: `${date}-${index + 1}`,
        date,
        title: item.title || '',
        expected: item.expected || '',
        reason: item.reason || '',
      }));
    })
    .filter((item) => item.title && ['include', 'exclude'].includes(item.expected));
}

function matchedPhrases(title, phrases) {
  return phrases.filter((phrase) => title.includes(phrase));
}

function scoreTitle(title, rules) {
  const matches = [];
  let score = 0;

  for (const rule of [...rules.positiveSignals, ...rules.negativeSignals]) {
    const phrases = matchedPhrases(title, rule.phrases);
    if (!phrases.length) continue;
    score += rule.score;
    matches.push({ reason: rule.reason, score: rule.score, phrases });
  }

  return { score, matches };
}

function classifyTitle(title, rules, legacyExcluded = false) {
  const exactFeedback = rules.feedback.find((item) => item.title === title);
  if (exactFeedback?.expected === 'exclude') {
    return { include: false, reason: 'feedback-exclude', score: -999, matches: [{ reason: exactFeedback.reason || 'feedback-exclude', score: -999, phrases: [title] }] };
  }
  if (exactFeedback?.expected === 'include') {
    return { include: true, reason: 'feedback-include', score: Math.max(rules.scoreThreshold, 999), matches: [{ reason: exactFeedback.reason || 'feedback-include', score: 999, phrases: [title] }] };
  }

  const forceExclude = matchedPhrases(title, rules.forceExcludePhrases);
  if (forceExclude.length) {
    return { include: false, reason: 'force-exclude', score: -999, matches: [{ reason: 'force-exclude', score: -999, phrases: forceExclude }] };
  }

  const forceInclude = matchedPhrases(title, rules.forceIncludePhrases);
  const scored = scoreTitle(title, rules);
  if (forceInclude.length) {
    return {
      include: true,
      reason: 'force-include',
      score: Math.max(scored.score, rules.scoreThreshold),
      matches: [{ reason: 'force-include', score: rules.scoreThreshold, phrases: forceInclude }, ...scored.matches],
    };
  }

  if (legacyExcluded && scored.score < rules.scoreThreshold) {
    return { include: false, reason: 'legacy-exclude', score: scored.score, matches: scored.matches };
  }

  if (scored.score <= -2) {
    return { include: false, reason: 'negative-score', score: scored.score, matches: scored.matches };
  }

  return { include: true, reason: scored.score >= rules.scoreThreshold ? 'positive-score' : 'default-include', score: scored.score, matches: scored.matches };
}

function flattenTitles(day) {
  const titles = [];
  for (const articles of Object.values((day || {}).sections || {})) {
    for (const article of articles || []) {
      titles.push(article.title || '');
    }
  }
  return titles;
}

function validateManualQa(day, rules) {
  if (rules.manualQa.date && rules.manualQa.date !== (day || {}).date) {
    return { missingAllow: [], presentDeny: [], skipped: true, expectedDate: rules.manualQa.date };
  }
  const titles = flattenTitles(day);
  const haystack = titles.join('\n');
  const missingAllow = rules.manualQa.allow.filter((phrase) => !haystack.includes(phrase));
  const presentDeny = rules.manualQa.deny.filter((phrase) => haystack.includes(phrase));
  return { missingAllow, presentDeny };
}

function validateFeedbackRegression(archive, rules, date = '') {
  const failures = [];
  const cases = date ? rules.feedback.filter((item) => item.date === date) : rules.feedback;
  for (const item of cases) {
    const day = archive[item.date];
    const haystack = flattenTitles(day).join('\n');
    const present = haystack.includes(item.title);
    if (item.expected === 'include' && !present) {
      failures.push({ ...item, actual: 'missing' });
    }
    if (item.expected === 'exclude' && present) {
      failures.push({ ...item, actual: 'present' });
    }
  }
  return {
    checked: cases.length,
    failures,
  };
}

module.exports = {
  classifyTitle,
  loadPoliticsRules,
  validateManualQa,
  validateFeedbackRegression,
};
