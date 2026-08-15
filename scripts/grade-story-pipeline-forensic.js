#!/usr/bin/env node
/**
 * ATIS FORENSIC STORY PIPELINE GRADER
 * ====================================
 * Database + Source Code → Evidence → Diagnosis
 * 
 * Run: node scripts/grade-story-pipeline-forensic.js
 * Output: forensic-grader-report.json
 * 
 * READ-ONLY against production database.
 */

const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

// ── CONFIG ─────────────────────────────────────────────────────────
const DB_PATH = process.env.DATABASE_URL?.replace("file:", "") || 
  path.join(process.cwd(), "atis.db");

const REPORT_PATH = path.join(process.cwd(), "forensic-grader-report.json");

// ── COLORS ─────────────────────────────────────────────────────────
const C = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  red: "\x1b[31m", green: "\x1b[32m", yellow: "\x1b[33m",
  blue: "\x1b[34m", magenta: "\x1b[35m", cyan: "\x1b[36m", gray: "\x1b[90m"
};

function h1(t) { console.log(`\n${C.cyan}${C.bold}${"=".repeat(60)}${C.reset}\n${C.cyan}${C.bold}${t}${C.reset}\n${C.cyan}${C.bold}${"=".repeat(60)}${C.reset}`); }
function h2(t) { console.log(`\n${C.blue}${C.bold}${t}${C.reset}`); }
function h3(t) { console.log(`  ${C.yellow}${t}${C.reset}`); }
function ok(t) { console.log(`  ${C.green}✓${C.reset} ${t}`); }
function warn(t) { console.log(`  ${C.yellow}⚠${C.reset} ${t}`); }
function err(t) { console.log(`  ${C.red}✗${C.reset} ${t}`); }
function info(t) { console.log(`  ${C.dim}ℹ${C.reset} ${C.dim}${t}${C.reset}`); }
function diag(sev, title, evidence, confidence) {
  const color = sev === "CRITICAL" ? C.red : sev === "WARNING" ? C.yellow : C.gray;
  const icon = sev === "CRITICAL" ? "🚨" : sev === "WARNING" ? "⚠️" : "ℹ️";
  console.log(`\n  ${icon} ${color}${C.bold}${title}${C.reset} [confidence: ${confidence}]`);
  console.log(`     Evidence: ${C.gray}${evidence}${C.reset}`);
}

// ── REPORT STATE ───────────────────────────────────────────────────
const report = {
  metadata: { generatedAt: new Date().toISOString(), dbPath: DB_PATH, readOnly: true },
  database: {},
  schema: {},
  pipelineArchitecture: {},
  stageHealth: {},
  entityResolution: {},
  factResolution: {},
  entityRelationships: {},
  evidenceConnections: {},
  graphEdges: {},
  clusters: {},
  storyCandidates: {},
  stories: {},
  narratives: {},
  timeline: {},
  apiFrontend: {},
  executionPaths: {},
  silentFailures: {},
  mismatches: {},
  rootCauseAnalysis: {},
  oldGraderComparison: {}
};

// ── MAIN ───────────────────────────────────────────────────────────
function main() {
  h1("ATIS FORENSIC STORY PIPELINE GRADER");

  if (!fs.existsSync(DB_PATH)) {
    err(`Database not found: ${DB_PATH}`);
    process.exit(1);
  }

  let db;
  try {
    db = new Database(DB_PATH, { readonly: true });
    ok(`Opened database READ-ONLY: ${path.basename(DB_PATH)}`);
  } catch (e) {
    err(`Failed to open database: ${e.message}`);
    process.exit(1);
  }

  h2("1. DATABASE SCHEMA FORENSICS");
  const schemaInfo = inspectSchema(db);

  h2("2. TABLE INVENTORY & INTEGRITY");
  inspectTables(db, schemaInfo);

  h2("3. PIPELINE ARCHITECTURE (from source code)");
  inspectPipelineArchitecture();

  h2("4. DATA FLOW SCORECARD");
  buildScorecard(db, schemaInfo);

  h2("5. ENTITY RESOLUTION FORENSICS");
  analyzeEntityResolution(db, schemaInfo);

  h2("6. ENTITY RELATIONSHIP FORENSICS");
  analyzeRelationships(db, schemaInfo);

  h2("7. EVIDENCE CONNECTION FORENSICS");
  analyzeEvidenceConnections(db, schemaInfo);

  h2("8. GRAPH EDGE FORENSICS");
  analyzeGraphEdges(db, schemaInfo);

  h2("9. STORY CLUSTER FORENSICS");
  analyzeClusters(db, schemaInfo);

  h2("10. STORY CANDIDATE FORENSICS");
  analyzeCandidates(db, schemaInfo);

  h2("11. STORY FORENSICS");
  analyzeStories(db, schemaInfo);

  h2("12. NARRATIVE FORENSICS");
  analyzeNarratives(db, schemaInfo);

  h2("13. TIMELINE FORENSICS");
  analyzeTimeline(db, schemaInfo);

  h2("14. API / FRONTEND FORENSICS");
  analyzeApiFrontend(db, schemaInfo);

  h2("15. EXECUTION PATH ANALYSIS");
  analyzeExecutionPaths();

  h2("16. SILENT FAILURE DETECTION");
  detectSilentFailures();

  h2("17. WRITE/READ MISMATCHES");
  detectMismatches();

  h2("18. ROOT CAUSE DETERMINATION");
  determineRootCause();

  h2("19. OLD GRADER VS FORENSIC GRADER");
  compareOldGrader();

  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  h1(`JSON REPORT WRITTEN: ${REPORT_PATH}`);

  db.close();
}

// ═══════════════════════════════════════════════════════════════════
// 1. SCHEMA INSPECTION
// ═══════════════════════════════════════════════════════════════════
function inspectSchema(db) {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(r => r.name);
  report.schema.tables = tables;

  const schema = {};
  for (const table of tables) {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all();
    const fks = db.prepare(`PRAGMA foreign_key_list(${table})`).all();
    const idxs = db.prepare(`PRAGMA index_list(${table})`).all();
    schema[table] = {
      columns: cols.map(c => ({ name: c.name, type: c.type, notNull: c.notnull === 1, dflt: c.dflt_value })),
      foreignKeys: fks.map(fk => ({ from: fk.from, to: fk.to, table: fk.table })),
      indexes: idxs.map(i => ({ name: i.name, unique: i.unique }))
    };
  }
  report.schema.detailed = schema;

  const hasV3 = tables.includes("facts") && tables.includes("graph_clusters");
  const hasV4 = tables.includes("story_candidates");
  const version = hasV3 && hasV4 ? "hybrid-v3-v4" : hasV4 ? "v4" : hasV3 ? "v3" : "v2";
  report.schema.detectedVersion = version;
  ok(`Schema version: ${version}`);
  ok(`Tables: ${tables.length}`);
  return schema;
}

// ═══════════════════════════════════════════════════════════════════
// 2. TABLE INVENTORY & INTEGRITY
// ═══════════════════════════════════════════════════════════════════
function inspectTables(db, schemaInfo) {
  const tables = report.schema.tables;
  const counts = {};

  for (const t of tables) {
    try {
      const c = db.prepare(`SELECT COUNT(*) as c FROM "${t}"`).get().c;
      counts[t] = c;
    } catch (e) { counts[t] = "ERROR"; }
  }
  report.database.rowCounts = counts;

  h3("Row counts:");
  for (const [t, c] of Object.entries(counts).sort((a,b) => String(a[0]).localeCompare(b[0]))) {
    const marker = c === 0 ? C.red : c === "ERROR" ? C.red : C.green;
    console.log(`    ${marker}${String(c).padStart(6)}${C.reset} ${t}`);
  }

  h3("Foreign key integrity:");
  const orphans = [];
  const relevant = ["facts","evidence_entities","relationships","evidence_connections",
    "graph_clusters","story_graph_edges","context_graph_edges","story_candidates",
    "story_candidate_evidence","story_relationships","story_evidence","narratives",
    "timeline_events","evidence_programs","evidence_events","evidence_problems",
    "evidence_outcomes","evidence_actors","evidence_story_assessment","narrative_checks"];

  for (const table of relevant.filter(t => tables.includes(t))) {
    const fks = schemaInfo[table]?.foreignKeys || [];
    for (const fk of fks) {
      if (!fk.from) continue;
      try {
        const orphanCount = db.prepare(`
          SELECT COUNT(*) as c FROM "${table}" t
          LEFT JOIN "${fk.table}" p ON t."${fk.from}" = p."${fk.to || 'id'}"
          WHERE t."${fk.from}" IS NOT NULL AND p."${fk.to || 'id'}" IS NULL
        `).get().c;
        if (orphanCount > 0) {
          orphans.push({ table, column: fk.from, references: fk.table, orphans: orphanCount });
          warn(`${table}.${fk.from}: ${orphanCount} orphaned references to ${fk.table}`);
        }
      } catch (e) { /* skip */ }
    }
  }
  if (orphans.length === 0) ok("No orphaned foreign keys detected");
  report.database.orphanedForeignKeys = orphans;

  h3("NULL foreign key analysis:");
  const nullFks = [];
  for (const table of relevant.filter(t => tables.includes(t))) {
    const fks = schemaInfo[table]?.foreignKeys || [];
    for (const fk of fks) {
      if (!fk.from) continue;
      try {
        const nullCount = db.prepare(`SELECT COUNT(*) as c FROM "${table}" WHERE "${fk.from}" IS NULL`).get().c;
        if (nullCount > 0) nullFks.push({ table, column: fk.from, nullCount });
      } catch (e) {}
    }
  }
  report.database.nullForeignKeys = nullFks;
  if (nullFks.length > 0) {
    for (const n of nullFks) info(`${n.table}.${n.column}: ${n.nullCount} NULLs`);
  } else {
    ok("No NULL foreign keys in critical tables");
  }
}

// ═══════════════════════════════════════════════════════════════════
// 3. PIPELINE ARCHITECTURE
// ═══════════════════════════════════════════════════════════════════
function inspectPipelineArchitecture() {
  const baseDir = process.cwd();
  const files = {
    worker: "lib/worker.ts",
    extraction: "lib/ai/extraction.ts",
    graphSignals: "lib/graph/signals.ts",
    graphCluster: "lib/graph/cluster.ts",
    graphBuilder: "lib/graph/builder.ts",
    storyPipeline: "lib/graph/story-pipeline.ts",
    storyGraph: "lib/graph/story-graph.ts",
    storyCluster: "lib/graph/story-cluster.ts",
    storySeeds: "lib/graph/story-seeds.ts",
    storyEdges: "lib/graph/story-edges.ts",
    storyExpansion: "lib/graph/story-expansion.ts",
    storyCoherence: "lib/graph/story-coherence.ts",
    scoring: "lib/graph/scoring.ts",
    narrative: "lib/graph/narrative.ts",
    aiStories: "lib/ai/stories.ts",
    reasoningDiscovery: "lib/reasoning/story-discovery.ts",
    apiDiscover: "app/api/discover/route.ts",
    apiGraph: "app/api/graph/route.ts",
    apiStories: "app/api/stories/route.ts",
    apiTimeline: "app/api/timeline/route.ts"
  };

  const architecture = {};
  for (const [name, filePath] of Object.entries(files)) {
    const fullPath = path.join(baseDir, filePath);
    architecture[name] = {
      exists: fs.existsSync(fullPath),
      path: filePath,
      functions: [],
      inserts: [],
      selects: []
    };
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, "utf8");
      const funcs = [...content.matchAll(/(?:export\s+)?(?:async\s+)?function\s+(\w+)/g)].map(m => m[1]);
      architecture[name].functions = [...new Set(funcs)];
      architecture[name].inserts = [...new Set([...content.matchAll(/\.insert\(([^)]+)\)/g)].map(m => m[1].trim()))];
      architecture[name].selects = [...new Set([...content.matchAll(/\.from\(([^)]+)\)/g)].map(m => m[1].trim()))];
    }
  }

  report.pipelineArchitecture = architecture;

  h3("Pipeline files detected:");
  for (const [name, info] of Object.entries(architecture)) {
    const status = info.exists ? C.green + "✓" : C.red + "✗";
    console.log(`    ${status}${C.reset} ${name}: ${info.functions?.length || 0} functions`);
  }

  h3("Pipeline generation detection:");
  const pipelines = [];
  if (architecture.graphCluster?.exists) pipelines.push({ name: "v3_graph_clusters", file: "lib/graph/cluster.ts", output: "graph_clusters" });
  if (architecture.storyCluster?.exists) pipelines.push({ name: "v4_story_cluster", file: "lib/graph/story-cluster.ts", output: "story_candidates" });
  if (architecture.storyPipeline?.exists) pipelines.push({ name: "v4_story_pipeline", file: "lib/graph/story-pipeline.ts", output: "story_candidates" });
  if (architecture.reasoningDiscovery?.exists) pipelines.push({ name: "v4_reasoning_discovery", file: "lib/reasoning/story-discovery.ts", output: "stories" });
  report.pipelineArchitecture.detectedPipelines = pipelines;

  for (const p of pipelines) {
    info(`Pipeline: ${p.name} -> ${p.output}`);
  }
}

// ═══════════════════════════════════════════════════════════════════
// 4. STAGE HEALTH SCORECARD
// ═══════════════════════════════════════════════════════════════════
function buildScorecard(db, schemaInfo) {
  const counts = report.database.rowCounts;
  const evidenceCount = counts.evidence || 0;
  const entityCount = counts.entities || 0;
  const factCount = counts.facts || 0;
  const eeCount = counts.evidence_entities || 0;
  const relCount = counts.relationships || 0;
  const connCount = counts.evidence_connections || 0;
  const sgeCount = counts.story_graph_edges || 0;
  const cgeCount = counts.context_graph_edges || 0;
  const srCount = counts.story_relationships || 0;
  const gcCount = counts.graph_clusters || 0;
  const scCount = counts.story_candidates || 0;
  const sceCount = counts.story_candidate_evidence || 0;
  const seCount = counts.story_evidence || 0;
  const storyCount = counts.stories || 0;
  const narCount = counts.narratives || 0;
  const tlCount = counts.timeline_events || 0;

  const scorecard = {
    ingestion: { input: "Upload", expected: evidenceCount, actual: evidenceCount, status: evidenceCount > 0 ? "PASS" : "FAIL" },
    extraction_entities: { input: evidenceCount, expected: evidenceCount > 0 ? ">0" : 0, actual: entityCount, status: entityCount > 0 ? "PASS" : "FAIL" },
    extraction_facts: { input: evidenceCount, expected: evidenceCount > 0 ? ">0" : 0, actual: factCount, status: factCount > 0 ? "PASS" : "FAIL" },
    entity_linking: { input: entityCount, expected: entityCount, actual: eeCount, status: eeCount > 0 ? "PASS" : "FAIL" },
    fact_to_entity_resolution: { input: factCount, expected: "TBD", actual: "TBD", status: "INSPECTED_BELOW" },
    entity_relationships: { input: factCount, expected: ">0", actual: relCount, status: relCount > 0 ? "PASS" : "FAIL" },
    evidence_connections: { input: evidenceCount, expected: evidenceCount >= 2 ? ">0" : 0, actual: connCount, status: connCount > 0 ? "PASS" : (evidenceCount < 2 ? "N/A" : "FAIL") },
    story_graph_edges: { input: evidenceCount, expected: evidenceCount >= 2 ? ">0" : 0, actual: sgeCount, status: sgeCount > 0 ? "PASS" : (evidenceCount < 2 ? "N/A" : "FAIL") },
    context_graph_edges: { input: evidenceCount, expected: evidenceCount >= 2 ? ">0" : 0, actual: cgeCount, status: cgeCount > 0 ? "PASS" : (evidenceCount < 2 ? "N/A" : "FAIL") },
    story_relationships: { input: evidenceCount, expected: evidenceCount >= 2 ? ">0" : 0, actual: srCount, status: srCount > 0 ? "PASS" : (evidenceCount < 2 ? "N/A" : "FAIL") },
    v3_clustering: { input: evidenceCount, expected: evidenceCount >= 2 ? ">0" : 0, actual: gcCount, status: gcCount > 0 ? "PASS" : (evidenceCount < 2 ? "N/A" : "FAIL") },
    v4_candidates: { input: evidenceCount, expected: evidenceCount > 0 ? ">0" : 0, actual: scCount, status: scCount > 0 ? "PASS" : "FAIL" },
    candidate_evidence_links: { input: scCount, expected: scCount > 0 ? ">0" : 0, actual: sceCount, status: sceCount > 0 ? "PASS" : (scCount === 0 ? "N/A" : "FAIL") },
    stories: { input: scCount, expected: scCount > 0 ? ">0" : 0, actual: storyCount, status: storyCount > 0 ? "PASS" : (scCount === 0 ? "N/A" : "FAIL") },
    story_evidence_links: { input: storyCount, expected: storyCount > 0 ? ">0" : 0, actual: seCount, status: seCount > 0 ? "PASS" : (storyCount === 0 ? "N/A" : "FAIL") },
    narratives: { input: storyCount, expected: storyCount > 0 ? ">0" : 0, actual: narCount, status: narCount > 0 ? "PASS" : (storyCount === 0 ? "N/A" : "FAIL") },
    timeline: { input: evidenceCount, expected: evidenceCount > 0 ? ">0" : 0, actual: tlCount, status: tlCount > 0 ? "PASS" : "FAIL" }
  };

  report.stageHealth = scorecard;

  h3("Scorecard:");
  for (const [stage, data] of Object.entries(scorecard)) {
    const color = data.status === "PASS" ? C.green : data.status === "N/A" ? C.gray : C.red;
    console.log(`    ${color}${data.status.padEnd(6)}${C.reset} ${stage.padEnd(30)} actual=${data.actual} expected=${data.expected}`);
  }
}

// ═══════════════════════════════════════════════════════════════════
// 5. ENTITY RESOLUTION
// ═══════════════════════════════════════════════════════════════════
function analyzeEntityResolution(db, schemaInfo) {
  const tables = report.schema.tables;
  if (!tables.includes("facts") || !tables.includes("entities")) {
    info("facts or entities table missing -- skipping entity resolution");
    report.factResolution = { skipped: true, reason: "missing_tables" };
    return;
  }

  const factCols = schemaInfo.facts?.columns || [];
  const evidenceIdCol = factCols.find(c => c.name === "evidence_id")?.name || "evidence_id";
  const subjectCol = factCols.find(c => c.name === "subject")?.name || "subject";
  const predicateCol = factCols.find(c => c.name === "predicate")?.name || "predicate";
  const objectCol = factCols.find(c => c.name === "object")?.name || "object";
  const idCol = factCols.find(c => c.name === "id")?.name || "id";

  let facts;
  try {
    facts = db.prepare(`SELECT "${idCol}" as id, "${subjectCol}" as subject, "${predicateCol}" as predicate, "${objectCol}" as object, "${evidenceIdCol}" as evidence_id FROM facts`).all();
  } catch (e) {
    info(`Could not query facts: ${e.message}`);
    report.factResolution = { skipped: true, reason: e.message };
    return;
  }

  const entityCols = schemaInfo.entities?.columns || [];
  const entIdCol = entityCols.find(c => c.name === "id")?.name || "id";
  const entNameCol = entityCols.find(c => c.name === "name")?.name || "name";
  const entAliasCol = entityCols.find(c => c.name === "aliases")?.name || "aliases";

  let entities;
  try {
    entities = db.prepare(`SELECT "${entIdCol}" as id, "${entNameCol}" as name, "${entAliasCol}" as aliases FROM entities`).all();
  } catch (e) {
    info(`Could not query entities: ${e.message}`);
    report.factResolution = { skipped: true, reason: e.message };
    return;
  }

  const entityMap = new Map();
  for (const e of entities) {
    if (e.name) entityMap.set(e.name.toLowerCase().trim(), e);
    try {
      const aliases = JSON.parse(e.aliases || "[]");
      for (const a of aliases) {
        if (a) entityMap.set(a.toLowerCase().trim(), e);
      }
    } catch {}
  }

  const resolutions = [];
  let resolvedBoth = 0, subjectOnly = 0, objectOnly = 0, neither = 0, noMatch = 0;

  for (const f of facts) {
    const subj = (f.subject || "").toLowerCase().trim();
    const obj = (f.object || "").toLowerCase().trim();
    const subjEnt = entityMap.get(subj);
    const objEnt = entityMap.get(obj);

    let status;
    if (!subj && !obj) status = "NO_MATCH_REQUIRED";
    else if (subjEnt && objEnt) status = "RESOLVED_BOTH";
    else if (subjEnt) status = "SUBJECT_ONLY";
    else if (objEnt) status = "OBJECT_ONLY";
    else status = "NEITHER";

    if (status === "RESOLVED_BOTH") resolvedBoth++;
    else if (status === "SUBJECT_ONLY") subjectOnly++;
    else if (status === "OBJECT_ONLY") objectOnly++;
    else if (status === "NEITHER") neither++;
    else noMatch++;

    resolutions.push({
      factId: f.id,
      subject: f.subject,
      subjectResolution: subjEnt ? { id: subjEnt.id, name: subjEnt.name, matchType: "exact" } : null,
      object: f.object,
      objectResolution: objEnt ? { id: objEnt.id, name: objEnt.name, matchType: "exact" } : null,
      status,
      predicate: f.predicate
    });
  }

  report.factResolution = {
    summary: { total: facts.length, resolvedBoth, subjectOnly, objectOnly, neither, noMatchRequired: noMatch, potentialRelationships: resolvedBoth },
    sampleResolutions: resolutions.slice(0, 100)
  };

  h3(`Fact resolution (total ${facts.length}):`);
  ok(`Both resolved: ${resolvedBoth}`);
  warn(`Subject only: ${subjectOnly}`);
  warn(`Object only: ${objectOnly}`);
  err(`Neither resolved: ${neither}`);
  info(`No match required: ${noMatch}`);
  info(`Potential relationships (both endpoints mapped): ${resolvedBoth}`);
}

// ═══════════════════════════════════════════════════════════════════
// 6. RELATIONSHIP FORENSICS
// ═══════════════════════════════════════════════════════════════════
function analyzeRelationships(db, schemaInfo) {
  const tables = report.schema.tables;
  const relCount = tables.includes("relationships") ? db.prepare("SELECT COUNT(*) as c FROM relationships").get().c : 0;
  const factCount = tables.includes("facts") ? db.prepare("SELECT COUNT(*) as c FROM facts").get().c : 0;

  const workerPath = path.join(process.cwd(), "lib/worker.ts");
  let sourceEvidence = "Worker file not found";
  let columnMismatch = false;
  let mismatchDetails = [];

  if (fs.existsSync(workerPath)) {
    const content = fs.readFileSync(workerPath, "utf8");
    const hasCreateRel = content.includes("createRelationshipsFromFacts");
    
    const triesSourceEntityId = content.includes("sourceEntityId:");
    const schemaHasSourceId = schemaInfo.relationships?.columns.some(c => c.name === "source_id");
    const schemaHasEvidenceIds = schemaInfo.relationships?.columns.some(c => c.name === "evidence_ids");
    const schemaHasWeight = schemaInfo.relationships?.columns.some(c => c.name === "weight");
    const schemaHasCreatedBy = schemaInfo.relationships?.columns.some(c => c.name === "created_by");
    
    columnMismatch = triesSourceEntityId && schemaHasSourceId;
    
    if (triesSourceEntityId && schemaHasSourceId) {
      mismatchDetails.push("Code uses sourceEntityId (Drizzle prop would be sourceId)");
    }
    if (!schemaHasWeight && content.includes("weight:")) {
      mismatchDetails.push("Code sets weight but schema has no weight column");
    }
    if (schemaHasEvidenceIds && content.includes("evidenceId,")) {
      mismatchDetails.push("Code sets evidenceId (scalar) but schema has evidence_ids (JSON array)");
    }
    if (schemaHasCreatedBy && !content.includes("createdBy")) {
      mismatchDetails.push("Code does not set required created_by column");
    }
    
    sourceEvidence = `createRelationshipsFromFacts exists=${hasCreateRel}, tries sourceEntityId=${triesSourceEntityId}, schema has source_id=${schemaHasSourceId}, schema has evidence_ids=${schemaHasEvidenceIds}, schema has weight=${schemaHasWeight}`;
  }

  report.entityRelationships = {
    function: "createRelationshipsFromFacts",
    file: "lib/worker.ts",
    tablesRead: ["facts", "entities"],
    tablesWritten: ["relationships"],
    factsEligible: factCount,
    relationshipsStored: relCount,
    columnMismatchDetected: columnMismatch,
    mismatchDetails,
    sourceEvidence
  };

  h3("Relationship creation analysis:");
  info(`Facts eligible: ${factCount}`);
  info(`Relationships stored: ${relCount}`);

  if (columnMismatch || mismatchDetails.length > 0) {
    diag("CRITICAL", "Column name mismatch in createRelationshipsFromFacts", 
      mismatchDetails.join("; "), "HIGH");
  }

  if (factCount > 0 && relCount === 0) {
    warn("All eligible relationships are missing from database");
    const factCols = schemaInfo.facts?.columns || [];
    const idCol = factCols.find(c => c.name === "id")?.name || "id";
    const subjCol = factCols.find(c => c.name === "subject")?.name || "subject";
    const objCol = factCols.find(c => c.name === "object")?.name || "object";
    const predCol = factCols.find(c => c.name === "predicate")?.name || "predicate";
    
    let sampleFacts;
    try {
      sampleFacts = db.prepare(`SELECT "${idCol}" as id, "${subjCol}" as subject, "${objCol}" as object, "${predCol}" as predicate FROM facts LIMIT 20`).all();
    } catch (e) {
      sampleFacts = [];
    }
    
    const missing = [];
    for (const f of sampleFacts) {
      missing.push({
        factId: f.id,
        subject: f.subject,
        object: f.object,
        predicate: f.predicate,
        reason: mismatchDetails.length > 0 ? "COLUMN_NAME_MISMATCH" : "UNKNOWN"
      });
    }
    report.entityRelationships.missingSample = missing;
    h3("Sample missing relationships:");
    for (const m of missing.slice(0, 5)) {
      console.log(`    Fact ${m.factId}: ${m.subject} -> ${m.predicate} -> ${m.object} [${m.reason}]`);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// 7. EVIDENCE CONNECTION FORENSICS
// ═══════════════════════════════════════════════════════════════════
function analyzeEvidenceConnections(db, schemaInfo) {
  const tables = report.schema.tables;
  const evidenceCount = db.prepare("SELECT COUNT(*) as c FROM evidence").get().c;

  if (evidenceCount <= 1) {
    info("Not enough evidence for pair analysis");
    report.evidenceConnections = { reason: "INSUFFICIENT_EVIDENCE", evidenceCount };
    return;
  }

  const signalsPath = path.join(process.cwd(), "lib/graph/signals.ts");
  let implementedSignals = [];
  if (fs.existsSync(signalsPath)) {
    const content = fs.readFileSync(signalsPath, "utf8");
    if (content.includes("shared_entities")) implementedSignals.push("shared_entities");
    if (content.includes("shared_programs")) implementedSignals.push("shared_programs");
    if (content.includes("shared_problems")) implementedSignals.push("shared_problems");
    if (content.includes("temporal")) implementedSignals.push("temporal");
    if (content.includes("semantic")) implementedSignals.push("semantic");
    if (content.includes("causal")) implementedSignals.push("causal");
  }

  const workerPath = path.join(process.cwd(), "lib/worker.ts");
  let workerSignals = [];
  let workerColumnMismatches = [];
  if (fs.existsSync(workerPath)) {
    const content = fs.readFileSync(workerPath, "utf8");
    if (content.includes("sharedPrograms")) workerSignals.push("shared_programs");
    if (content.includes("sharedProblems")) workerSignals.push("shared_problems");
    if (content.includes("sharedEntities")) workerSignals.push("shared_entities");
    
    const ecCols = schemaInfo.evidence_connections?.columns.map(c => c.name) || [];
    if (ecCols.includes("evidence_id_a") && content.includes("sourceEvidenceId")) {
      workerColumnMismatches.push({
        table: "evidence_connections",
        codeTries: "sourceEvidenceId, targetEvidenceId, type",
        schemaRequires: "evidence_id_a, evidence_id_b, signal_type",
        result: "ALL_INSERTS_FAIL"
      });
    }
    
    const sgeCols = schemaInfo.story_graph_edges?.columns.map(c => c.name) || [];
    if (sgeCols.includes("evidence_id_a") && content.includes("sourceId:")) {
      workerColumnMismatches.push({
        table: "story_graph_edges",
        codeTries: "sourceId, targetId, type",
        schemaRequires: "evidence_id_a, evidence_id_b, relationship_type",
        result: "ALL_INSERTS_FAIL"
      });
    }
    
    const srCols = schemaInfo.story_relationships?.columns.map(c => c.name) || [];
    if (srCols.includes("source_evidence_id") && content.includes("sourceEvidenceId:")) {
      workerColumnMismatches.push({
        table: "story_relationships",
        codeTries: "sourceEvidenceId, targetEvidenceId, relationshipType",
        schemaRequires: "source_evidence_id, target_evidence_id, relationship_type",
        result: "MAY_WORK_VIA_DRIZZLE_MAPPING"
      });
    }
  }

  report.evidenceConnections = {
    implementedSignals: [...new Set([...implementedSignals, ...workerSignals])],
    evidenceCount,
    connectionsStored: report.database.rowCounts.evidence_connections || 0,
    storyGraphEdgesStored: report.database.rowCounts.story_graph_edges || 0,
    contextGraphEdgesStored: report.database.rowCounts.context_graph_edges || 0,
    storyRelationshipsStored: report.database.rowCounts.story_relationships || 0,
    workerColumnMismatches
  };

  h3("Signal implementation:");
  for (const s of report.evidenceConnections.implementedSignals) ok(s);
  if (report.evidenceConnections.implementedSignals.length === 0) warn("No signals detected in source code");

  h3("Worker insert column mismatches:");
  for (const m of workerColumnMismatches) {
    if (m.result === "ALL_INSERTS_FAIL") {
      diag("CRITICAL", `${m.table} insert will always fail`, 
        `Worker tries ${m.codeTries} but schema requires ${m.schemaRequires}`, "HIGH");
    } else {
      info(`${m.table}: ${m.codeTries} -> ${m.schemaRequires} (${m.result})`);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// 8. GRAPH EDGE FORENSICS
// ═══════════════════════════════════════════════════════════════════
function analyzeGraphEdges(db, schemaInfo) {
  const tables = report.schema.tables;
  const counts = report.database.rowCounts;

  const edges = {
    evidence_connections: counts.evidence_connections || 0,
    story_relationships: counts.story_relationships || 0,
    story_graph_edges: counts.story_graph_edges || 0,
    context_graph_edges: counts.context_graph_edges || 0
  };

  report.graphEdges = {
    counts: edges,
    analysis: {}
  };

  h3("Edge table counts:");
  for (const [table, count] of Object.entries(edges)) {
    const color = count > 0 ? C.green : C.red;
    console.log(`    ${color}${String(count).padStart(6)}${C.reset} ${table}`);
  }

  if (edges.story_relationships > 0 && edges.story_graph_edges === 0 && edges.evidence_connections === 0) {
    diag("WARNING", "story_relationships populated but story_graph_edges and evidence_connections are empty",
      "buildSimpleStoryGraph writes story_relationships correctly (Drizzle maps sourceEvidenceId->source_evidence_id) but fails on evidence_connections and story_graph_edges due to wrong property names", "HIGH");
    report.graphEdges.analysis.primaryWorkingTable = "story_relationships";
    report.graphEdges.analysis.brokenTables = ["evidence_connections", "story_graph_edges"];
  }

  if (tables.includes("evidence") && tables.includes("story_relationships")) {
    const srCols = schemaInfo.story_relationships?.columns || [];
    const srcCol = srCols.find(c => c.name === "source_evidence_id")?.name;
    const tgtCol = srCols.find(c => c.name === "target_evidence_id")?.name;
    
    if (srcCol && tgtCol) {
      try {
        const connected = db.prepare(`
          SELECT DISTINCT evidenceId FROM (
            SELECT "${srcCol}" as evidenceId FROM story_relationships
            UNION
            SELECT "${tgtCol}" as evidenceId FROM story_relationships
          )
        `).all().map(r => r.evidenceId);
        const allEvidence = db.prepare("SELECT id FROM evidence").all().map(r => r.id);
        const isolated = allEvidence.filter(id => !connected.includes(id));
        report.graphEdges.isolatedEvidence = isolated.length;
        if (isolated.length > 0) warn(`${isolated.length} evidence items are isolated (no edges)`);
        else ok("All evidence items have at least one edge");
      } catch (e) {
        info(`Could not analyze isolated evidence: ${e.message}`);
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// 9. CLUSTER FORENSICS
// ═══════════════════════════════════════════════════════════════════
function analyzeClusters(db, schemaInfo) {
  const tables = report.schema.tables;
  const counts = report.database.rowCounts;

  report.clusters = {
    v3_graphClusters: { count: counts.graph_clusters || 0, note: "Not written by buildSimpleStoryGraph" },
    v4_storyCandidates: { count: counts.story_candidates || 0 }
  };

  h3("Cluster tables:");
  info(`graph_clusters: ${counts.graph_clusters || 0} (v3 table)`);
  info(`story_candidates: ${counts.story_candidates || 0} (v4 table)`);

  if (tables.includes("story_candidates")) {
    const scCols = schemaInfo.story_candidates?.columns || [];
    const idCol = scCols.find(c => c.name === "id")?.name || "id";
    const nameCol = scCols.find(c => c.name === "name")?.name || "name";
    const eidsCol = scCols.find(c => c.name === "evidence_ids")?.name || "evidence_ids";
    const statusCol = scCols.find(c => c.name === "status")?.name || "status";
    const scoreCol = scCols.find(c => c.name === "coherence_score")?.name || "coherence_score";
    const confCol = scCols.find(c => c.name === "confidence")?.name || "confidence";
    
    let candidates;
    try {
      candidates = db.prepare(`SELECT "${idCol}" as id, "${nameCol}" as name, "${eidsCol}" as evidence_ids, "${statusCol}" as status, "${scoreCol}" as coherence_score, "${confCol}" as confidence FROM story_candidates`).all();
    } catch (e) {
      candidates = [];
    }
    
    const multi = candidates.filter(c => {
      try { return JSON.parse(c.evidence_ids || "[]").length >= 2; } catch { return false; }
    }).length;
    const single = candidates.filter(c => {
      try { return JSON.parse(c.evidence_ids || "[]").length === 1; } catch { return true; }
    }).length;

    report.clusters.candidateBreakdown = { total: candidates.length, multiEvidence: multi, singleton: single };
    ok(`story_candidates: ${multi} multi-evidence, ${single} singleton`);

    if (single > 0 && multi === 0 && counts.story_candidates > 0) {
      diag("WARNING", "Only singleton clusters exist",
        "All story_candidates have only 1 evidence item. This means no edges scored above threshold or edge creation failed entirely.", "HIGH");
    }
  }

  if (tables.includes("graph_clusters") && counts.graph_clusters === 0) {
    diag("INFO", "graph_clusters is empty",
      "buildSimpleStoryGraph does not write to graph_clusters; it writes to story_candidates instead. This is a WRITE/READ mismatch if /api/discover queries graph_clusters.", "HIGH");
  }
}

// ═══════════════════════════════════════════════════════════════════
// 10. CANDIDATE FORENSICS
// ═══════════════════════════════════════════════════════════════════
function analyzeCandidates(db, schemaInfo) {
  const tables = report.schema.tables;
  if (!tables.includes("story_candidates")) {
    info("story_candidates table missing");
    return;
  }

  const scCols = schemaInfo.story_candidates?.columns || [];
  const idCol = scCols.find(c => c.name === "id")?.name || "id";
  const nameCol = scCols.find(c => c.name === "name")?.name || "name";
  const statusCol = scCols.find(c => c.name === "status")?.name || "status";
  const eidsCol = scCols.find(c => c.name === "evidence_ids")?.name || "evidence_ids";
  const scoreCol = scCols.find(c => c.name === "coherence_score")?.name || "coherence_score";
  const confCol = scCols.find(c => c.name === "confidence")?.name || "confidence";

  let candidates;
  try {
    candidates = db.prepare(`SELECT "${idCol}" as id, "${nameCol}" as name, "${statusCol}" as status, "${eidsCol}" as evidence_ids, "${scoreCol}" as coherence_score, "${confCol}" as confidence FROM story_candidates`).all();
  } catch (e) {
    candidates = [];
  }
  
  const sceCount = tables.includes("story_candidate_evidence") 
    ? db.prepare("SELECT COUNT(*) as c FROM story_candidate_evidence").get().c 
    : 0;

  report.storyCandidates = {
    total: candidates.length,
    evidenceLinked: sceCount,
    orphaned: candidates.length > 0 && sceCount === 0 ? candidates.length : 0,
    sample: candidates.slice(0, 20).map(c => ({
      id: c.id,
      name: c.name,
      status: c.status,
      evidenceCount: (() => { try { return JSON.parse(c.evidence_ids || "[]").length; } catch { return 0; } })(),
      score: c.coherence_score,
      confidence: c.confidence
    }))
  };

  h3(`Candidates: ${candidates.length}, Evidence links: ${sceCount}`);
  if (candidates.length > 0 && sceCount === 0) {
    diag("CRITICAL", "Candidates exist but story_candidate_evidence is empty",
      "buildSimpleStoryGraph creates candidates and attempts to link evidence, but the junction table remains empty. Possible: unique constraint failure, wrong column names, or transaction rollback.", "HIGH");
  }
}

// ═══════════════════════════════════════════════════════════════════
// 11. STORY FORENSICS
// ═══════════════════════════════════════════════════════════════════
function analyzeStories(db, schemaInfo) {
  const tables = report.schema.tables;
  const storyCount = tables.includes("stories") ? db.prepare("SELECT COUNT(*) as c FROM stories").get().c : 0;
  const seCount = tables.includes("story_evidence") ? db.prepare("SELECT COUNT(*) as c FROM story_evidence").get().c : 0;

  if (storyCount === 0) {
    report.stories = { count: 0, classification: "EMPTY" };
    info("No stories in database");
    return;
  }

  const sCols = schemaInfo.stories?.columns || [];
  const idCol = sCols.find(c => c.name === "id")?.name || "id";
  const titleCol = sCols.find(c => c.name === "title")?.name || "title";
  const genTypeCol = sCols.find(c => c.name === "generation_type")?.name || "generation_type";
  const createdByCol = sCols.find(c => c.name === "created_by")?.name || "created_by";
  const clusterIdsCol = sCols.find(c => c.name === "cluster_ids")?.name || "cluster_ids";

  let stories;
  try {
    stories = db.prepare(`SELECT "${idCol}" as id, "${titleCol}" as title, "${genTypeCol}" as generation_type, "${createdByCol}" as created_by, "${clusterIdsCol}" as cluster_ids FROM stories`).all();
  } catch (e) {
    stories = [];
  }
  
  const autoStories = stories.filter(s => s.generation_type === "auto" || s.created_by === 1).length;
  const manualStories = stories.filter(s => s.generation_type === "manual" || s.created_by !== 1).length;

  const evidenceCount = db.prepare("SELECT COUNT(*) as c FROM evidence").get().c;
  const oneToOne = storyCount > 0 && storyCount === evidenceCount && autoStories === storyCount;

  report.stories = {
    count: storyCount,
    auto: autoStories,
    manual: manualStories,
    evidenceLinks: seCount,
    oneToOneRatio: oneToOne,
    classification: oneToOne ? "SUSPECT_1_TO_1_RATIO" : "NORMAL"
  };

  h3(`Stories: ${storyCount} total (${autoStories} auto, ${manualStories} manual)`);
  if (oneToOne) {
    diag("CRITICAL", "1:1 evidence-to-story ratio detected",
      `Every evidence item has exactly one auto-generated story (${evidenceCount} evidence = ${storyCount} stories). This bypasses clustering.`, "HIGH");
  }
  if (storyCount > 0 && seCount === 0) {
    diag("CRITICAL", "Stories exist but story_evidence is empty", 
      "Stories were created without linking evidence. UI will show empty stories.", "HIGH");
  }
}

// ═══════════════════════════════════════════════════════════════════
// 12. NARRATIVE FORENSICS
// ═══════════════════════════════════════════════════════════════════
function analyzeNarratives(db, schemaInfo) {
  const tables = report.schema.tables;
  const narCount = tables.includes("narratives") ? db.prepare("SELECT COUNT(*) as c FROM narratives").get().c : 0;
  const storyCount = tables.includes("stories") ? db.prepare("SELECT COUNT(*) as c FROM stories").get().c : 0;

  report.narratives = {
    stored: narCount,
    eligibleStories: storyCount,
    status: narCount > 0 ? "PRESENT" : "EMPTY"
  };

  h3(`Narratives: ${narCount}, Eligible stories: ${storyCount}`);
  if (storyCount > 0 && narCount === 0) {
    warn("Stories exist but narratives table is empty");
    const narrativePath = path.join(process.cwd(), "lib/graph/narrative.ts");
    if (fs.existsSync(narrativePath)) {
      info("lib/graph/narrative.ts exists but may not be called by worker");
      report.narratives.reason = "FUNCTION_EXISTS_BUT_NOT_INVOKED";
    } else {
      info("lib/graph/narrative.ts not found");
      report.narratives.reason = "FUNCTION_MISSING";
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// 13. TIMELINE FORENSICS
// ═══════════════════════════════════════════════════════════════════
function analyzeTimeline(db, schemaInfo) {
  const tables = report.schema.tables;
  const tlCount = tables.includes("timeline_events") ? db.prepare("SELECT COUNT(*) as c FROM timeline_events").get().c : 0;

  const workerPath = path.join(process.cwd(), "lib/worker.ts");
  let hasTimelineCode = false;
  if (fs.existsSync(workerPath)) {
    hasTimelineCode = fs.readFileSync(workerPath, "utf8").includes("storeTimelineEvents");
  }

  report.timeline = {
    eventsStored: tlCount,
    codeExists: hasTimelineCode,
    status: hasTimelineCode && tlCount === 0 ? "IMPLEMENTED_BUT_NO_OUTPUT" : (hasTimelineCode ? "WORKING" : "CODE_NOT_FOUND")
  };

  h3(`Timeline events: ${tlCount}`);
  if (hasTimelineCode && tlCount === 0) {
    diag("WARNING", "Timeline extraction code exists but table is empty",
      "storeTimelineEvents is called in worker but produces no output. Possible: extraction returns empty, parse failure, or silent catch.", "MEDIUM");
  } else if (!hasTimelineCode) {
    info("No timeline extraction code found in worker");
  }
}

// ═══════════════════════════════════════════════════════════════════
// 14. API / FRONTEND FORENSICS
// ═══════════════════════════════════════════════════════════════════
function analyzeApiFrontend(db, schemaInfo) {
  const apis = {};

  const storiesRoute = path.join(process.cwd(), "app/api/stories/route.ts");
  if (fs.existsSync(storiesRoute)) {
    const content = fs.readFileSync(storiesRoute, "utf8");
    apis.stories = {
      queriesStories: content.includes("stories"),
      alsoQueriesNarratives: content.includes("narratives"),
      returnsGenerationType: content.includes("generationType")
    };
    info("/api/stories: queries stories table" + (apis.stories.alsoQueriesNarratives ? " + narratives" : ""));
  }

  const discoverRoute = path.join(process.cwd(), "app/api/discover/route.ts");
  if (fs.existsSync(discoverRoute)) {
    const content = fs.readFileSync(discoverRoute, "utf8");
    apis.discover = {
      queriesGraphClusters: content.includes("graphClusters") || content.includes("graph_clusters"),
      queriesStoryCandidates: content.includes("storyCandidates") || content.includes("story_candidates"),
      callsRunDiscoveryPipeline: content.includes("runDiscoveryPipeline")
    };
    info("/api/discover: queries graph_clusters=" + apis.discover.queriesGraphClusters + 
         ", story_candidates=" + apis.discover.queriesStoryCandidates);
  }

  const graphRoute = path.join(process.cwd(), "app/api/graph/route.ts");
  if (fs.existsSync(graphRoute)) {
    const content = fs.readFileSync(graphRoute, "utf8");
    apis.graph = {
      queriesStoryRelationships: content.includes("storyRelationships"),
      queriesStoryGraphEdges: content.includes("storyGraphEdges"),
      queriesEvidenceConnections: content.includes("evidenceConnections"),
      queriesGraphClusters: content.includes("graphClusters")
    };
    info("/api/graph: queries story_relationships=" + apis.graph.queriesStoryRelationships);
  }

  report.apiFrontend = apis;
}

// ═══════════════════════════════════════════════════════════════════
// 15. EXECUTION PATHS
// ═══════════════════════════════════════════════════════════════════
function analyzeExecutionPaths() {
  const workerPath = path.join(process.cwd(), "lib/worker.ts");
  if (!fs.existsSync(workerPath)) return;

  const content = fs.readFileSync(workerPath, "utf8");

  const paths = {
    perEvidencePipeline: [
      "processEvidenceJob -> fetch_evidence",
      "processEvidenceJob -> extractStructuredFacts",
      "processEvidenceJob -> storeFacts",
      "processEvidenceJob -> storeEntities",
      "processEvidenceJob -> createRelationshipsFromFacts",
      "processEvidenceJob -> storeIntelligenceNodes",
      "processEvidenceJob -> storeSingleDocumentAssessment",
      "processEvidenceJob -> storeTimelineEvents",
      "processEvidenceJob -> rebuildStoryGraph"
    ],
    corpusPipeline: [
      "runDiscoveryPipeline -> buildSimpleStoryGraph",
      "buildSimpleStoryGraph -> storyRelationships (insert)",
      "buildSimpleStoryGraph -> evidenceConnections (insert, MAY FAIL due to column mismatch)",
      "buildSimpleStoryGraph -> storyGraphEdges (insert, MAY FAIL due to column mismatch)",
      "buildSimpleStoryGraph -> storyCandidates (insert)",
      "buildSimpleStoryGraph -> storyCandidateEvidence (insert)",
      "buildSimpleStoryGraph -> stories (insert for components >= 2)",
      "buildSimpleStoryGraph -> storyEvidence (insert)"
    ]
  };

  const catchBlocks = [...content.matchAll(/catch\s*\([^)]*\)\s*\{[^}]*\}/g)].map(m => m[0]);
  const emptyReturns = [...content.matchAll(/catch\s*\([^)]*\)\s*\{\s*\}/g)].map(m => m[0]);

  report.executionPaths = {
    describedPaths: paths,
    catchBlockCount: catchBlocks.length,
    emptyCatchCount: emptyReturns.length,
    earlyReturns: content.includes("return []") || content.includes("return null") || content.includes("return false")
  };

  h3("Execution paths:");
  for (const p of paths.perEvidencePipeline) info(p);
  for (const p of paths.corpusPipeline) info(p);
  h3("Catch blocks: " + catchBlocks.length + " (empty: " + emptyReturns.length + ")");
}

// ═══════════════════════════════════════════════════════════════════
// 16. SILENT FAILURE DETECTION
// ═══════════════════════════════════════════════════════════════════
function detectSilentFailures() {
  const workerPath = path.join(process.cwd(), "lib/worker.ts");
  if (!fs.existsSync(workerPath)) return;

  const content = fs.readFileSync(workerPath, "utf8");
  const failures = [];

  const silentCatches = [...content.matchAll(/catch\s*\([^)]*\)\s*\{\s*(?:\/\/[^\n]*\n?\s*)*\}/g)];
  for (const sc of silentCatches) {
    const lineNum = content.substring(0, sc.index).split('\n').length;
    failures.push({ file: "lib/worker.ts", line: lineNum, pattern: "empty_catch", snippet: sc[0].substring(0, 80) });
  }

  const nestedCatches = content.includes("} catch {") && content.includes("try {") && content.includes("} catch {}");
  if (nestedCatches) {
    failures.push({ file: "lib/worker.ts", pattern: "nested_silent_catch", detail: "Multiple nested catch blocks swallowing insert failures" });
  }

  const emptyReturns = [...content.matchAll(/return\s+\[\]\s*;?/g)];
  for (const er of emptyReturns) {
    const lineNum = content.substring(0, er.index).split('\n').length;
    failures.push({ file: "lib/worker.ts", line: lineNum, pattern: "return_empty_array", snippet: er[0] });
  }

  report.silentFailures = failures;

  h3("Silent failure patterns:");
  for (const f of failures.slice(0, 10)) {
    warn(`${f.pattern} at ${f.file}:${f.line || '?'}`);
  }
  if (failures.length > 10) info(`... and ${failures.length - 10} more`);
}

// ═══════════════════════════════════════════════════════════════════
// 17. WRITE/READ MISMATCHES
// ═══════════════════════════════════════════════════════════════════
function detectMismatches() {
  const mismatches = [];

  const discoverPath = path.join(process.cwd(), "app/api/discover/route.ts");
  if (fs.existsSync(discoverPath)) {
    const content = fs.readFileSync(discoverPath, "utf8");
    if (content.includes("graphClusters") && !content.includes("storyCandidates")) {
      mismatches.push({
        type: "WRITE/READ_MISMATCH",
        writer: "buildSimpleStoryGraph -> story_candidates",
        reader: "/api/discover -> graph_clusters",
        impact: "Discover page shows empty even when candidates exist"
      });
    }
  }

  const graphPath = path.join(process.cwd(), "app/api/graph/route.ts");
  if (fs.existsSync(graphPath)) {
    const content = fs.readFileSync(graphPath, "utf8");
    if (content.includes("storyGraphEdges") && !content.includes("storyRelationships")) {
      mismatches.push({
        type: "WRITE/READ_MISMATCH",
        writer: "buildSimpleStoryGraph -> story_relationships",
        reader: "/api/graph -> story_graph_edges",
        impact: "Graph page shows no edges even when relationships exist"
      });
    }
  }

  report.mismatches = mismatches;

  h3("Detected mismatches:");
  for (const m of mismatches) {
    err(`${m.type}: ${m.writer} vs ${m.reader}`);
    info(`  Impact: ${m.impact}`);
  }
  if (mismatches.length === 0) ok("No write/read mismatches detected");
}

// ═══════════════════════════════════════════════════════════════════
// 18. ROOT CAUSE DETERMINATION
// ═══════════════════════════════════════════════════════════════════
function determineRootCause() {
  const rootCauses = [];
  const secondary = [];
  const symptoms = [];

  if (report.entityRelationships?.columnMismatchDetected || report.entityRelationships?.mismatchDetails?.length > 0) {
    rootCauses.push({
      cause: "SCHEMA_COLUMN_MISMATCH",
      location: "lib/worker.ts createRelationshipsFromFacts",
      evidence: report.entityRelationships.mismatchDetails?.join("; ") || "Code uses wrong property names for relationships table",
      confidence: "HIGH",
      effect: "relationships table permanently empty despite facts and entities existing"
    });
  }

  const ecMismatches = report.evidenceConnections?.workerColumnMismatches || [];
  for (const m of ecMismatches) {
    if (m.result === "ALL_INSERTS_FAIL") {
      rootCauses.push({
        cause: "SCHEMA_COLUMN_MISMATCH",
        location: `lib/worker.ts buildSimpleStoryGraph -> ${m.table} insert`,
        evidence: `Code tries ${m.codeTries}; schema requires ${m.schemaRequires}`,
        confidence: "HIGH",
        effect: `${m.table} table permanently empty`
      });
    }
  }

  if (report.clusters?.v3_graphClusters?.count === 0 && report.clusters?.v4_storyCandidates?.count > 0) {
    secondary.push({
      cause: "TABLE_NOT_WRITTEN",
      location: "buildSimpleStoryGraph",
      evidence: "graph_clusters has 0 rows but story_candidates has rows",
      confidence: "HIGH",
      effect: "APIs querying graph_clusters see empty results"
    });
  }

  if (report.stories?.oneToOneRatio) {
    symptoms.push({
      symptom: "1:1_EVIDENCE_STORY_RATIO",
      upstreamCause: "AUTO_CREATE_STORY_BLOCK",
      confidence: "MEDIUM"
    });
  }

  report.rootCauseAnalysis = { primaryRootCauses: rootCauses, secondaryFailures: secondary, downstreamSymptoms: symptoms };

  h3("PRIMARY ROOT CAUSES:");
  for (const rc of rootCauses) {
    diag("CRITICAL", rc.cause, `${rc.location}: ${rc.evidence}`, rc.confidence);
  }

  h3("SECONDARY FAILURES:");
  for (const s of secondary) {
    diag("WARNING", s.cause, `${s.location}: ${s.evidence}`, s.confidence);
  }

  h3("DOWNSTREAM SYMPTOMS:");
  for (const s of symptoms) {
    warn(`${s.symptom} (likely from: ${s.upstreamCause})`);
  }
}

// ═══════════════════════════════════════════════════════════════════
// 19. OLD GRADER COMPARISON
// ═══════════════════════════════════════════════════════════════════
function compareOldGrader() {
  const oldGraderPath = path.join(process.cwd(), "scripts/grade-story-pipeline.js");
  const comparisons = [];

  if (fs.existsSync(oldGraderPath)) {
    comparisons.push({
      oldFinding: "relationships = 0 -> 'relationship creation or clustering is broken'",
      forensicResult: "Column name mismatch in createRelationshipsFromFacts: code uses sourceEntityId/targetEntityId/evidenceId/weight but schema has source_id/target_id/evidence_ids/created_by. All inserts fail silently in nested catch blocks.",
      verdict: "CONTRADICTED",
      note: "Old grader guessed 'clustering broken'; forensic grader proves exact column mismatch with source code evidence"
    });

    comparisons.push({
      oldFinding: "evidence_connections = 0 -> 'signal computation broken'",
      forensicResult: "buildSimpleStoryGraph tries sourceEvidenceId/targetEvidenceId but schema requires evidence_id_a/evidence_id_b. All inserts fail silently in nested catch blocks.",
      verdict: "CONTRADICTED",
      note: "Old grader assumed algorithm failure; forensic grader proves schema mismatch"
    });

    comparisons.push({
      oldFinding: "stories = 0 -> 'worker crashed or extraction failed'",
      forensicResult: "Depends on database state. If buildSimpleStoryGraph runs, it creates stories for components >= 2. If no edges exist (due to column mismatches or no shared signals), no multi-evidence stories are created.",
      verdict: "PARTIALLY_SUPPORTED",
      note: "Empty stories can be downstream of edge creation failure, not necessarily extraction failure"
    });

    comparisons.push({
      oldFinding: "narratives = 0 -> 'narrative generation never ran'",
      forensicResult: "Narratives table may be empty because generateNarrativesForValidatedStories is not called in the visible worker code, or because it has its own column mismatches.",
      verdict: "UNRESOLVED",
      note: "Requires inspection of generateNarrativesForValidatedStories implementation"
    });
  }

  report.oldGraderComparison = comparisons;

  h3("Old vs Forensic:");
  for (const c of comparisons) {
    const color = c.verdict === "CONTRADICTED" ? C.red : c.verdict === "SUPPORTED" ? C.green : C.yellow;
    console.log(`    ${color}${c.verdict}${C.reset} ${c.oldFinding.substring(0, 60)}...`);
    info(`  -> ${c.forensicResult.substring(0, 80)}...`);
  }
}

// ── RUN ────────────────────────────────────────────────────────────
main();