const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(process.cwd(), 'atis.db');

// Color codes for terminal output
const G = '\x1b[32m';  // green
const R = '\x1b[31m';  // red
const Y = '\x1b[33m';  // yellow
const C = '\x1b[36m';  // cyan
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

function check(cond, msg) {
  if (cond) {
    console.log(`${G}  ✓${RESET} ${msg}`);
    return 1;
  } else {
    console.log(`${R}  ✗${RESET} ${msg}`);
    return 0;
  }
}

function info(label, value) {
  console.log(`${C}  →${RESET} ${label}: ${BOLD}${value}${RESET}`);
}

function section(title) {
  console.log(`\n${BOLD}${Y}${title}${RESET}`);
  console.log(`${Y}${'='.repeat(title.length)}${RESET}`);
}

function safeJsonParse(str) {
  if (!str) return null;
  try { return JSON.parse(str); } catch { return null; }
}

function safeQuery(db, sql, fallback = []) {
  try {
    return db.prepare(sql).all();
  } catch (e) {
    return fallback;
  }
}

function safeCount(db, table) {
  try {
    return db.prepare(`SELECT COUNT(*) as c FROM ${table}`).get().c;
  } catch (e) {
    return -1;
  }
}

// Open DB
let db;
try {
  db = new Database(DB_PATH);
} catch (e) {
  console.error(`${R}Failed to open database at ${DB_PATH}${RESET}`);
  console.error(e.message);
  process.exit(1);
}

console.log(`${BOLD}ATIS v4 SYSTEM EVALUATION REPORT${RESET}`);
console.log(`Database: ${DB_PATH}\n`);

let totalScore = 0;
let totalMax = 0;

function grade(label, score, max, details = []) {
  totalScore += score;
  totalMax += max;
  const pct = max > 0 ? Math.round((score / max) * 100) : 0;
  let grade = pct >= 90 ? 'A' : pct >= 75 ? 'B' : pct >= 60 ? 'C' : pct >= 40 ? 'D' : 'F';
  let color = pct >= 90 ? G : pct >= 60 ? Y : R;
  console.log(`\n${BOLD}[${label}]${RESET} ${color}${score}/${max} (${pct}%) — Grade ${grade}${RESET}`);
  details.forEach(d => console.log(`  ${d}`));
}

// ========================
// 1. EVIDENCE & SUMMARIES
// ========================
section('1. EVIDENCE & SUMMARIES (Max 20)');

const evidenceRows = db.prepare('SELECT id, title, summary, content FROM evidence ORDER BY id DESC LIMIT 5').all();
info('Evidence items found', evidenceRows.length);

let summaryScore = 0;
let summaryDetails = [];

if (evidenceRows.length === 0) {
  summaryDetails.push(`${R}No evidence found in database.${RESET}`);
} else {
  evidenceRows.forEach((row, idx) => {
    const summary = safeJsonParse(row.summary);
    const hasSummary = summary && typeof summary === 'object';
    const hasOverview = hasSummary && summary.overview && summary.overview.length > 20;
    const hasFindings = hasSummary && Array.isArray(summary.keyFindings) && summary.keyFindings.length > 0;
    const hasImplications = hasSummary && Array.isArray(summary.implications) && summary.implications.length > 0;
    const hasConfidence = hasSummary && typeof summary.confidence === 'number';

    const ok = hasSummary && hasOverview && hasFindings;
    const icon = ok ? G + '✓' : R + '✗';
    console.log(`  ${icon}${RESET} E${row.id}: "${row.title.substring(0, 50)}..." — findings:${hasFindings ? summary.keyFindings.length : 0}, confidence:${hasConfidence ? summary.confidence : 'none'}`);

    if (ok) summaryScore += 1;
  });
}

const summaryMax = evidenceRows.length || 5;
grade('Summaries', summaryScore, summaryMax, [
  'Checks: structured JSON, overview present, keyFindings array, confidence score'
]);

// ========================
// 2. ENTITIES
// ========================
section('2. ENTITIES (Max 20)');

const entityRows = db.prepare('SELECT id, name, type FROM entities').all();
info('Total entities extracted', entityRows.length);

const entityNames = entityRows.map(e => e.name.toLowerCase());
const expectedEntities = [
  { names: ['african development bank', 'afdb'], label: 'African Development Bank' },
  { names: ['zambia'], label: 'Zambia' },
  { names: ['zimbabwe'], label: 'Zimbabwe' },
  { names: ['zesco'], label: 'ZESCO' },
  { names: ['zesa', 'zimbabwe electricity supply authority'], label: 'ZESA/ZESA' },
  { names: ['sapp', 'southern african power pool'], label: 'SAPP' },
  { names: ['reap', 'renewable energy access project'], label: 'REAP' },
  { names: ['kariba'], label: 'Kariba Dam' },
  { names: ['rural electrification authority', 'rea'], label: 'REA' },
  { names: ['zera', 'zimbabwe energy regulatory authority'], label: 'ZERA' },
];

let entityScore = 0;
expectedEntities.forEach(exp => {
  const found = exp.names.some(n => entityNames.some(en => en.includes(n)));
  check(found, `Entity "${exp.label}" ${found ? 'found' : 'MISSING'}`);
  if (found) entityScore += 1;
});

// Bonus for total count
if (entityRows.length >= 15) entityScore += 2;
else if (entityRows.length >= 8) entityScore += 1;

info('Bonus points', entityRows.length >= 15 ? '+2 (15+ entities)' : entityRows.length >= 8 ? '+1 (8+ entities)' : '+0');

grade('Entities', entityScore, expectedEntities.length + 2, [
  'Checks: 10 key organizations/countries/programs from test documents',
  'Bonus: +2 for 15+ entities, +1 for 8+'
]);

// ========================
// 3. FACTS
// ========================
section('3. FACTS (Max 15)');

// Defensive: facts table schema may vary — select all columns
const factRows = safeQuery(db, 'SELECT * FROM facts LIMIT 200');
info('Total facts extracted', factRows.length);

let factScore = 0;

if (factRows.length === 0) {
  console.log(`${R}  ✗ No facts found in database.${RESET}`);
} else {
  // Inspect first row to see available columns
  const sampleCols = Object.keys(factRows[0]);
  info('Fact table columns', sampleCols.join(', '));

  // Build searchable text from whatever columns exist
  const factTexts = factRows.map(f => {
    const parts = [];
    if (f.subject) parts.push(f.subject);
    if (f.predicate) parts.push(f.predicate);
    if (f.object) parts.push(f.object);
    if (f.statement) parts.push(f.statement);
    if (f.description) parts.push(f.description);
    if (f.content) parts.push(f.content);
    return parts.join(' ').toLowerCase();
  });

  const expectedFacts = [
    { keywords: ['75', 'million'], label: '$75M loan mentioned' },
    { keywords: ['200', 'million'], label: '$200M SAPP interconnector mentioned' },
    { keywords: ['reap', 'renewable'], label: 'REAP program mentioned' },
    { keywords: ['zambia'], label: 'Zambia mentioned in facts' },
    { keywords: ['zimbabwe'], label: 'Zimbabwe mentioned in facts' },
    { keywords: ['sapp', 'power pool'], label: 'SAPP mentioned' },
    { keywords: ['kariba'], label: 'Kariba mentioned' },
    { keywords: ['solar'], label: 'Solar energy mentioned' },
    { keywords: ['mini-grid', 'minigrid'], label: 'Mini-grids mentioned' },
    { keywords: ['18', 'percent'], label: '18% industrial decline mentioned' },
  ];

  expectedFacts.forEach(exp => {
    const found = factTexts.some(ft => exp.keywords.some(kw => ft.includes(kw.toLowerCase())));
    check(found, `Fact "${exp.label}" ${found ? 'found' : 'MISSING'}`);
    if (found) factScore += 1;
  });
}

// Bonus for volume
if (factRows.length >= 20) factScore += 3;
else if (factRows.length >= 10) factScore += 2;
else if (factRows.length >= 5) factScore += 1;

info('Bonus points', factRows.length >= 20 ? '+3 (20+ facts)' : factRows.length >= 10 ? '+2 (10+ facts)' : factRows.length >= 5 ? '+1 (5+ facts)' : '+0');

grade('Facts', factScore, 10 + 3, [
  'Checks: 10 key factual claims from test documents',
  'Bonus: +3 for 20+ facts, +2 for 10+, +1 for 5+'
]);

// ========================
// 4. V4 INTELLIGENCE
// ========================
section('4. V4 INTELLIGENCE (Max 15)');

let v4Score = 0;
const v4Tables = [
  { table: 'programs', label: 'Programs' },
  { table: 'events', label: 'Events' },
  { table: 'problems', label: 'Problems' },
  { table: 'outcomes', label: 'Outcomes' },
  { table: 'actors', label: 'Actors' },
];

v4Tables.forEach(v4 => {
  const count = safeCount(db, v4.table);
  if (count === -1) {
    check(false, `${v4.label}: TABLE NOT FOUND`);
  } else {
    const ok = count > 0;
    check(ok, `${v4.label}: ${count} items`);
    if (ok) v4Score += 1;
  }
});

// Check for specific expected intelligence
const programRows = safeQuery(db, 'SELECT name FROM programs');
const programNames = programRows.map(r => (r.name || '').toLowerCase());
const hasReap = programNames.some(n => n.includes('reap') || n.includes('renewable energy access'));
const hasSapp = programNames.some(n => n.includes('sapp') || n.includes('interconnector'));
check(hasReap, `Program "REAP" ${hasReap ? 'found' : 'MISSING'}`);
check(hasSapp, `Program "SAPP Interconnector" ${hasSapp ? 'found' : 'MISSING'}`);
if (hasReap) v4Score += 1;
if (hasSapp) v4Score += 1;

const problemRows = safeQuery(db, 'SELECT name FROM problems');
const problemNames = problemRows.map(r => (r.name || '').toLowerCase());
const hasPowerCrisis = problemNames.some(n => n.includes('power') || n.includes('energy') || n.includes('shortage') || n.includes('crisis'));
check(hasPowerCrisis, `Problem "Power/Energy crisis" ${hasPowerCrisis ? 'found' : 'MISSING'}`);
if (hasPowerCrisis) v4Score += 1;

grade('v4 Intelligence', v4Score, 8, [
  'Checks: programs, events, problems, outcomes, actors tables populated',
  'Checks: REAP and SAPP Interconnector programs identified',
  'Checks: Power crisis problem identified'
]);

// ========================
// 5. STORY CANDIDATES / CLUSTERS
// ========================
section('5. STORIES & CLUSTERS (Max 15)');

let storyScore = 0;

const storyRows = safeQuery(db, 'SELECT id, title, status FROM stories');
info('Stories in stories table', storyRows.length);

const candidateRows = safeQuery(db, 'SELECT id, name, status FROM story_candidates');
info('Story candidates', candidateRows.length);

const clusterRows = safeQuery(db, 'SELECT id, name FROM graph_clusters');
info('Graph clusters', clusterRows.length);

if (storyRows.length > 0) storyScore += 2;
if (candidateRows.length > 0) storyScore += 2;
if (clusterRows.length > 0) storyScore += 2;

// Check for thematic clustering
const allStoryNames = [
  ...storyRows.map(s => s.title || ''),
  ...candidateRows.map(c => c.name || ''),
  ...clusterRows.map(c => c.name || '')
].map(n => n.toLowerCase());

const hasZambiaTheme = allStoryNames.some(n => n.includes('zambia') || n.includes('reap'));
const hasZimbabweTheme = allStoryNames.some(n => n.includes('zimbabwe') || n.includes('power crisis') || n.includes('power'));
const hasSappTheme = allStoryNames.some(n => n.includes('sapp') || n.includes('regional') || n.includes('interconnector'));

check(hasZambiaTheme, `Zambia/REAP theme ${hasZambiaTheme ? 'found' : 'MISSING'}`);
check(hasZimbabweTheme, `Zimbabwe/Power theme ${hasZimbabweTheme ? 'found' : 'MISSING'}`);
check(hasSappTheme, `SAPP/Regional theme ${hasSappTheme ? 'found' : 'MISSING'}`);

if (hasZambiaTheme) storyScore += 2;
if (hasZimbabweTheme) storyScore += 2;
if (hasSappTheme) storyScore += 2;

// Check evidence linking
const linkCount = safeCount(db, 'story_evidence');
info('Evidence-story links', linkCount >= 0 ? linkCount : 'TABLE NOT FOUND');
if (linkCount >= 3) storyScore += 1;
if (linkCount >= 5) storyScore += 1;

grade('Stories', storyScore, 15, [
  'Checks: stories, candidates, or clusters exist',
  'Checks: Zambia/REAP, Zimbabwe/Power, SAPP/Regional themes detected',
  'Checks: evidence linked to stories (3+ links = +1, 5+ = +2)'
]);

// ========================
// 6. RELATIONSHIPS / GRAPH
// ========================
section('6. RELATIONSHIPS & GRAPH (Max 10)');

let graphScore = 0;

const relCount = safeCount(db, 'relationships');
const storyRelCount = safeCount(db, 'story_relationships');
const edgeCount = safeCount(db, 'story_graph_edges');

info('Relationships (entities)', relCount >= 0 ? relCount : 'TABLE NOT FOUND');
info('Story relationships', storyRelCount >= 0 ? storyRelCount : 'TABLE NOT FOUND');
info('Graph edges', edgeCount >= 0 ? edgeCount : 'TABLE NOT FOUND');

if (relCount > 0) graphScore += 1;
if (storyRelCount > 0) graphScore += 2;
if (edgeCount > 0) graphScore += 2;

// Check for cross-document connections
const evConnCount = safeCount(db, 'evidence_connections');
info('Evidence connections', evConnCount >= 0 ? evConnCount : 'TABLE NOT FOUND');
if (evConnCount > 0) graphScore += 2;

// Check narrative links
const narrativeCount = safeCount(db, 'narratives');
info('Narratives', narrativeCount >= 0 ? narrativeCount : 'TABLE NOT FOUND');
if (narrativeCount > 0) graphScore += 2;
if (narrativeCount >= 2) graphScore += 1;

grade('Graph', graphScore, 10, [
  'Checks: entity relationships, story relationships, graph edges',
  'Checks: evidence connections between documents',
  'Checks: auto-generated narratives'
]);

// ========================
// 7. TIMELINE
// ========================
section('7. TIMELINE (Max 5)');

let timelineScore = 0;
const timelineRows = safeQuery(db, 'SELECT * FROM timeline_events LIMIT 50');
info('Timeline events', timelineRows.length);

if (timelineRows.length > 0) timelineScore += 1;
if (timelineRows.length >= 3) timelineScore += 1;
if (timelineRows.length >= 5) timelineScore += 1;

// Check for expected dates
const timelineDates = timelineRows.map(r => {
  const d = r.date || r.eventDate || r.event_date || r.timestamp || '';
  return String(d).toLowerCase();
});
const has2028 = timelineDates.some(d => d.includes('2028'));
const has2027 = timelineDates.some(d => d.includes('2027'));
const has2024 = timelineDates.some(d => d.includes('2024'));
const has2026 = timelineDates.some(d => d.includes('2026'));

check(has2028, `Date "2028" (REAP completion) ${has2028 ? 'found' : 'MISSING'}`);
check(has2027, `Date "2027" (SAPP start) ${has2027 ? 'found' : 'MISSING'}`);

if (has2028) timelineScore += 1;
if (has2027) timelineScore += 1;

grade('Timeline', timelineScore, 5, [
  'Checks: timeline events extracted',
  'Checks: key dates (2028 REAP completion, 2027 SAPP start)'
]);

// ========================
// FINAL SCORE
// ========================
section('FINAL SCORE');

const overallPct = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0;
const overallGrade = overallPct >= 90 ? 'A' : overallPct >= 75 ? 'B' : overallPct >= 60 ? 'C' : overallPct >= 40 ? 'D' : 'F';
const gradeColor = overallPct >= 90 ? G : overallPct >= 60 ? Y : R;

console.log(`\n${BOLD}Total Score: ${gradeColor}${totalScore}/${totalMax} (${overallPct}%)${RESET}`);
console.log(`${BOLD}Overall Grade: ${gradeColor}${overallGrade}${RESET}\n`);

// Interpretation
console.log(`${BOLD}Interpretation:${RESET}`);
if (overallGrade === 'A') {
  console.log(`${G}Excellent!${RESET} The system is extracting, structuring, and connecting data effectively.`);
  console.log('All major facets are working. Ready for production use with real data.');
} else if (overallGrade === 'B') {
  console.log(`${G}Good.${RESET} Core functionality works with minor gaps.`);
  console.log('Review the ✗ marks above to identify which extraction or linking stages need tuning.');
} else if (overallGrade === 'C') {
  console.log(`${Y}Acceptable.${RESET} Basic extraction works but clustering/graph is weak.`);
  console.log('Likely causes: LLM prompt not extracting enough entities/facts, or graph builder not finding connections.');
} else if (overallGrade === 'D') {
  console.log(`${R}Poor.${RESET} Significant portions of the pipeline are broken or not populating data.`);
  console.log('Check: Is the worker running? Is the LLM API key valid? Are there DB schema mismatches?');
} else {
  console.log(`${R}Critical failure.${RESET} The system is not processing evidence correctly.`);
  console.log('Check: Worker logs, LLM connectivity, database state, and API route fixes.');
}

console.log(`\n${BOLD}Next Steps:${RESET}`);
console.log('1. Review all ✗ marks above — they show exactly what is missing');
console.log('2. Check server console logs for worker errors during evidence processing');
console.log('3. Verify CEREBRAS_API_KEY and CEREBRAS_MODEL env vars are set');
console.log('4. Run discovery (/discover page) if story candidates are empty');
console.log('5. Re-upload test documents if evidence count is zero');

db.close();
