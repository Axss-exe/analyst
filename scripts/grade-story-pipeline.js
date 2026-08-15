/**
 * ATIS Story Pipeline Grader & Bug Diagnostic
 * ============================================
 * Evaluates the entire story creation pipeline from evidence ingestion
 * through clustering, graph building, and narrative generation.
 * 
 * Run: node scripts/grade-story-pipeline.js
 */

const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

// ── CONFIG ─────────────────────────────────────────────────────────
const DB_PATH = process.env.DATABASE_URL?.replace("file:", "") || 
  path.join(process.cwd(), "atis.db");

const GRADE_WEIGHTS = {
  ingestion: 15,
  extraction: 20,
  clustering: 20,
  graph: 15,
  narratives: 15,
  frontend: 15,
};

// ── UTILITIES ──────────────────────────────────────────────────────
class Colors {
  static reset = "\x1b[0m";
  static bold = "\x1b[1m";
  static dim = "\x1b[2m";
  static red = "\x1b[31m";
  static green = "\x1b[32m";
  static yellow = "\x1b[33m";
  static blue = "\x1b[34m";
  static magenta = "\x1b[35m";
  static cyan = "\x1b[36m";
  static gray = "\x1b[90m";
}

function print(title, detail = "", color = Colors.cyan) {
  console.log(`${color}${Colors.bold}${title}${Colors.reset} ${detail}`);
}

function printBug(title, detail, severity = "critical") {
  const color = severity === "critical" ? Colors.red : severity === "warning" ? Colors.yellow : Colors.gray;
  const icon = severity === "critical" ? "🐛" : severity === "warning" ? "⚠️" : "ℹ️";
  console.log(`  ${icon} ${color}${Colors.bold}${title}${Colors.reset}`);
  if (detail) console.log(`     ${Colors.gray}${detail}${Colors.reset}`);
}

function printFix(title, code = "") {
  console.log(`  💡 ${Colors.green}${Colors.bold}FIX:${Colors.reset} ${title}`);
  if (code) console.log(`     ${Colors.gray}${code}${Colors.reset}`);
}

function gradeLabel(score, max) {
  const pct = (score / max) * 100;
  if (pct >= 90) return { label: "A", color: Colors.green };
  if (pct >= 75) return { label: "B", color: Colors.cyan };
  if (pct >= 60) return { label: "C", color: Colors.yellow };
  if (pct >= 40) return { label: "D", color: Colors.magenta };
  return { label: "F", color: Colors.red };
}

// ── SCHEMA INSPECTOR ───────────────────────────────────────────────
function inspectSchema(db) {
  const tables = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
  ).all().map(r => r.name);

  const colSchema = {};
  for (const table of tables) {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all();
    colSchema[table] = cols.map(c => ({ name: c.name, type: c.type, notnull: c.notnull }));
  }
  return { tables, colSchema };
}

function detectVersion(tables) {
  const hasV3 = tables.includes("facts") && tables.includes("graph_clusters");
  const hasV4 = tables.includes("story_candidates");
  const hasV2 = tables.includes("stories") && !hasV3 && !hasV4;

  if (hasV3 && hasV4) return "hybrid-v3-v4";
  if (hasV4) return "v4";
  if (hasV3) return "v3";
  if (hasV2) return "v2";
  return "unknown";
}

// ── PIPELINE STAGE CHECKERS ────────────────────────────────────────

function checkIngestion(db, tables, colSchema) {
  print("\n📥 STAGE 1: EVIDENCE INGESTION", "", Colors.blue);
  const score = { current: 0, max: GRADE_WEIGHTS.ingestion };
  const bugs = [];
  const fixes = [];

  const evidence = db.prepare("SELECT * FROM evidence ORDER BY id DESC LIMIT 100").all();
  const evidenceCount = evidence.length;

  console.log(`  Total evidence items: ${evidenceCount}`);

  if (evidenceCount === 0) {
    bugs.push({
      severity: "critical",
      title: "NO EVIDENCE FOUND",
      detail: "The evidence table is empty. Nothing can be graded.",
      fix: "Upload evidence via /evidence/new or import CSV."
    });
    return { score: 0, max: score.max, bugs, fixes, evidenceCount: 0 };
  }

  score.current += 5;

  const emptyContent = evidence.filter(e => !e.content || e.content.length < 50);
  if (emptyContent.length > 0) {
    bugs.push({
      severity: "critical",
      title: `${emptyContent.length} evidence items have empty or very short content`,
      detail: "The LLM extraction stage needs substantial text to extract entities and facts.",
      fix: "Ensure evidence.content is populated with full document text, not just summaries."
    });
  } else {
    score.current += 5;
    console.log(`  ✅ All ${evidenceCount} items have content`);
  }

  const hasJobsTable = tables.includes("jobs");
  if (hasJobsTable) {
    const jobs = db.prepare("SELECT status, COUNT(*) as count FROM jobs GROUP BY status").all();
    const failedJobs = jobs.find(j => j.status === "failed");
    const pendingJobs = jobs.find(j => j.status === "pending");

    if (failedJobs) {
      bugs.push({
        severity: "critical",
        title: `${failedJobs.count} worker jobs FAILED`,
        detail: "Evidence was uploaded but the background worker crashed during processing.",
        fix: "Check server logs for [worker] errors. Common causes: Cerebras API timeout, JSON parse failure in extraction.ts, or missing DB columns."
      });
    }
    if (pendingJobs && pendingJobs.count > 0) {
      bugs.push({
        severity: "warning",
        title: `${pendingJobs.count} jobs still pending`,
        detail: "Worker may be stuck, crashed, or never started.",
        fix: "Restart the server. If jobs stay pending, check lib/worker.ts — the worker loop may not be calling processNextJob()."
      });
    }
    if (!failedJobs && !pendingJobs) {
      score.current += 5;
      console.log(`  ✅ All worker jobs completed successfully`);
    }
  } else {
    score.current += 5;
    console.log(`  ℹ️  No jobs table (worker may use in-memory queue)`);
  }

  return { score: score.current, max: score.max, bugs, fixes, evidenceCount };
}

function checkExtraction(db, tables, colSchema, version) {
  print("\n🔬 STAGE 2: STRUCTURED EXTRACTION", `(${version})`, Colors.blue);
  const score = { current: 0, max: GRADE_WEIGHTS.extraction };
  const bugs = [];
  const fixes = [];

  const entityCount = db.prepare("SELECT COUNT(*) as c FROM entities").get().c;
  console.log(`  Entities extracted: ${entityCount}`);

  if (entityCount === 0) {
    bugs.push({
      severity: "critical",
      title: "ZERO entities extracted",
      detail: "The LLM extraction stage returned no entities. This kills the entire downstream pipeline (clustering, graph, stories).",
      fix: "In lib/ai/extraction.ts, check that safeParseJSON handles braces in string values. The regex /\{[\s\S]*?\}/ is greedy and breaks on 'Ministry of {something}'. Replace with a proper JSON extractor that finds outermost braces."
    });
  } else if (entityCount < 10) {
    bugs.push({
      severity: "warning",
      title: `Only ${entityCount} entities found — suspiciously low`,
      detail: "With 5 rich documents you should see 30-80+ entities.",
      fix: "Check the extraction prompt in lib/ai/extraction.ts. Ensure it explicitly asks for organizations, people, locations, projects, and legislation."
    });
    score.current += 5;
  } else {
    score.current += 8;
    console.log(`  ✅ Healthy entity extraction`);
  }

  const hasFacts = tables.includes("facts");
  const factCount = hasFacts ? db.prepare("SELECT COUNT(*) as c FROM facts").get().c : 0;
  console.log(`  Facts extracted: ${factCount}`);

  if (hasFacts && factCount === 0) {
    bugs.push({
      severity: "critical",
      title: "facts table is empty",
      detail: "The unified extraction prompt in lib/ai/extraction.ts is not producing facts, or the worker is not storing them.",
      fix: "In lib/worker.ts, after extractStructuredFacts(), ensure db.insert(facts).values(fact).run() is called. Check that the extraction response actually contains a 'facts' array."
    });
  } else if (hasFacts && factCount > 0) {
    score.current += 6;
    console.log(`  ✅ Facts table populated`);
  }

  const hasEvidenceEntities = tables.includes("evidence_entities");
  if (hasEvidenceEntities) {
    const linkCount = db.prepare("SELECT COUNT(*) as c FROM evidence_entities").get().c;
    console.log(`  Evidence→Entity links: ${linkCount}`);
    if (linkCount === 0 && entityCount > 0) {
      bugs.push({
        severity: "critical",
        title: "Entities exist but evidence_entities junction is EMPTY",
        detail: "The worker extracted entities but never linked them to evidence. Clustering and graph building need these links.",
        fix: "In lib/worker.ts store_entities stage, after inserting entities, insert into evidence_entities(evidenceId, entityId)."
      });
    } else if (linkCount > 0) {
      score.current += 6;
      console.log(`  ✅ Evidence linked to entities`);
    }
  }

  return { score: score.current, max: score.max, bugs, fixes, entityCount, factCount };
}

function checkClustering(db, tables, colSchema, version, evidenceCount) {
  print("\n🧩 STAGE 3: CLUSTERING", `(${version})`, Colors.blue);
  const score = { current: 0, max: GRADE_WEIGHTS.clustering };
  const bugs = [];
  const fixes = [];

  let clusterCount = 0;
  let candidateCount = 0;
  let singletonClusters = 0;
  let multiEvidenceClusters = 0;

  if (version === "v3" || version === "hybrid-v3-v4") {
    const clusters = db.prepare("SELECT * FROM graph_clusters").all();
    clusterCount = clusters.length;
    singletonClusters = clusters.filter(c => c.evidenceCount === 1).length;
    multiEvidenceClusters = clusters.filter(c => c.evidenceCount >= 2).length;
    console.log(`  graph_clusters: ${clusterCount} (multi-evidence: ${multiEvidenceClusters}, singletons: ${singletonClusters})`);
  }

  if (version === "v4" || version === "hybrid-v3-v4") {
    const candidates = db.prepare("SELECT * FROM story_candidates").all();
    candidateCount = candidates.length;
    console.log(`  story_candidates: ${candidateCount}`);
  }

  if (evidenceCount > 0 && clusterCount > 0 && clusterCount === evidenceCount) {
    bugs.push({
      severity: "critical",
      title: "1:1 EVIDENCE-TO-CLUSTER RATIO DETECTED",
      detail: `Every evidence item became its own cluster (${evidenceCount} evidence = ${clusterCount} clusters). This defeats the entire purpose of cross-document analysis.`,
      fix: "In lib/worker.ts buildSimpleStoryGraph (v4) or lib/graph/cluster.ts (v3), the clustering threshold is too high OR the similarity function is broken. Lower the Jaccard threshold to 0.20-0.30. Ensure evidence_entities links exist so similarity can be computed."
    });
    fixes.push({
      title: "Fix clustering threshold",
      code: `// In lib/worker.ts or lib/graph/cluster.ts
const SIMILARITY_THRESHOLD = 0.25; // was 0.50 or higher
// Also verify evidence_entities has data before computing similarity`
    });
  } else if (multiEvidenceClusters === 0 && evidenceCount >= 2) {
    bugs.push({
      severity: "critical",
      title: "NO MULTI-EVIDENCE CLUSTERS",
      detail: "All clusters contain only 1 evidence item. Documents are not being grouped by shared entities/programs.",
      fix: "Check that evidence_entities and evidence_programs junction tables are populated. If empty, clustering has nothing to compare. Also check the similarity computation — it may always return 0."
    });
  } else if (multiEvidenceClusters > 0) {
    score.current += 10;
    console.log(`  ✅ ${multiEvidenceClusters} meaningful clusters with 2+ evidence`);
  }

  if (tables.includes("evidence_connections")) {
    const connCount = db.prepare("SELECT COUNT(*) as c FROM evidence_connections").get().c;
    console.log(`  evidence_connections (signals): ${connCount}`);
    if (connCount === 0 && evidenceCount >= 2) {
      bugs.push({
        severity: "critical",
        title: "evidence_connections is EMPTY",
        detail: "The signal computation stage in lib/graph/signals.ts found no connections between any evidence pairs.",
        fix: "In lib/graph/signals.ts, check that computeAllSignals() iterates over all evidence pairs. Verify that entity overlap, shared programs, and temporal proximity signals are actually being computed."
      });
    } else if (connCount > 0) {
      score.current += 5;
      console.log(`  ✅ Connection signals computed`);
    }
  }

  if (tables.includes("story_evidence")) {
    const seCount = db.prepare("SELECT COUNT(*) as c FROM story_evidence").get().c;
    console.log(`  story_evidence links: ${seCount}`);
    if (seCount === 0 && candidateCount > 0) {
      bugs.push({
        severity: "critical",
        title: "story_evidence junction table is EMPTY",
        detail: "Stories/candidates exist but no evidence is linked to them. The UI will show empty stories.",
        fix: "In lib/worker.ts, after creating a story or candidate, insert into story_evidence(story_id, evidence_id). The AUTO-CREATE STORY block in processEvidenceJob was creating stories without links — remove it and only create stories inside buildSimpleStoryGraph with proper linking."
      });
    } else if (seCount > 0) {
      score.current += 5;
      console.log(`  ✅ Stories linked to evidence`);
    }
  }

  return { score: score.current, max: score.max, bugs, fixes, clusterCount, multiEvidenceClusters };
}

function checkGraph(db, tables, colSchema, version) {
  print("\n🕸️ STAGE 4: GRAPH & RELATIONSHIPS", `(${version})`, Colors.blue);
  const score = { current: 0, max: GRADE_WEIGHTS.graph };
  const bugs = [];
  const fixes = [];

  const hasRelationships = tables.includes("relationships");
  let relCount = 0;
  if (hasRelationships) {
    relCount = db.prepare("SELECT COUNT(*) as c FROM relationships").get().c;
    console.log(`  Entity relationships: ${relCount}`);
    if (relCount === 0) {
      bugs.push({
        severity: "critical",
        title: "relationships table is EMPTY",
        detail: "No entity-to-entity relationships exist. The graph visualization will show isolated nodes with no edges.",
        fix: "In lib/worker.ts, add a stage after store_entities that creates relationships from facts. For each fact (subject, predicate, object), look up entity IDs and insert into relationships(sourceId, targetId, type, evidenceId)."
      });
      fixes.push({
        title: "Add relationship creation from facts",
        code: `// In lib/worker.ts, after store_entities:
for (const fact of extraction.facts) {
  const subj = entities.find(e => e.name === fact.subject);
  const obj = entities.find(e => e.name === fact.object);
  if (subj && obj) {
    db.insert(relationships).values({
      sourceId: subj.id, targetId: obj.id,
      type: fact.predicate, evidenceId
    }).run();
  }
}`
      });
    } else {
      score.current += 5;
      console.log(`  ✅ Entity relationships exist`);
    }
  }

  const hasStoryRels = tables.includes("story_relationships");
  let storyRelCount = 0;
  if (hasStoryRels) {
    storyRelCount = db.prepare("SELECT COUNT(*) as c FROM story_relationships").get().c;
    console.log(`  Story relationships: ${storyRelCount}`);
    if (storyRelCount > 0) score.current += 3;
  }

  const hasGraphEdges = tables.includes("story_graph_edges");
  let graphEdgeCount = 0;
  if (hasGraphEdges) {
    graphEdgeCount = db.prepare("SELECT COUNT(*) as c FROM story_graph_edges").get().c;
    console.log(`  story_graph_edges: ${graphEdgeCount}`);
    if (graphEdgeCount === 0 && storyRelCount > 0) {
      bugs.push({
        severity: "warning",
        title: "story_graph_edges is EMPTY but story_relationships has data",
        detail: "The graph builder found story relationships but never copied them to the visualization table.",
        fix: "In lib/worker.ts buildSimpleStoryGraph, after creating story_relationships, also insert into story_graph_edges(source, target, label, weight)."
      });
    } else if (graphEdgeCount > 0) {
      score.current += 4;
      console.log(`  ✅ Graph edges for visualization`);
    }
  }

  const hasEvidenceConns = tables.includes("evidence_connections");
  let evidenceConnCount = 0;
  if (hasEvidenceConns) {
    evidenceConnCount = db.prepare("SELECT COUNT(*) as c FROM evidence_connections").get().c;
    console.log(`  evidence_connections: ${evidenceConnCount}`);
    if (evidenceConnCount > 0) {
      score.current += 3;
      console.log(`  ✅ Cross-document connections exist`);
    }
  }

  return { score: score.current, max: score.max, bugs, fixes, relCount, graphEdgeCount, evidenceConnCount };
}

function checkNarratives(db, tables, colSchema, version) {
  print("\n📖 STAGE 5: NARRATIVE GENERATION", `(${version})`, Colors.blue);
  const score = { current: 0, max: GRADE_WEIGHTS.narratives };
  const bugs = [];
  const fixes = [];

  const hasNarratives = tables.includes("narratives");
  let narrativeCount = 0;
  let orphanedNarratives = 0;

  if (hasNarratives) {
    const narratives = db.prepare("SELECT * FROM narratives").all();
    narrativeCount = narratives.length;
    console.log(`  Auto-narratives: ${narrativeCount}`);

    if (tables.includes("graph_clusters")) {
      const clusterIds = db.prepare("SELECT id FROM graph_clusters").all().map(r => r.id);
      orphanedNarratives = narratives.filter(n => {
        let clusterIdsArr = [];
        try {
          clusterIdsArr = n.clusterIds ? JSON.parse(n.clusterIds) : [];
        } catch { clusterIdsArr = []; }
        return clusterIdsArr.length === 0 || !clusterIdsArr.some(id => clusterIds.includes(id));
      }).length;
      if (orphanedNarratives > 0) {
        bugs.push({
          severity: "warning",
          title: `${orphanedNarratives} narratives are orphaned (no valid cluster links)`,
          detail: "Narratives were generated but don't reference existing clusters.",
          fix: "In lib/graph/narrative.ts or lib/ai/stories.ts, ensure narratives.clusterIds is populated with actual graph_clusters.id values, not candidate IDs."
        });
      }
    }

    if (narrativeCount === 0) {
      bugs.push({
        severity: "critical",
        title: "narratives table is EMPTY",
        detail: "The narrative generation stage never ran or failed silently. The /discover page will show clusters but no auto-generated stories.",
        fix: "In lib/worker.ts, after buildSimpleStoryGraph, call generateNarrativesForValidatedStories(). If that function depends on @/lib/ai/stories which doesn't exist, add a fallback that builds a narrative from cluster name + evidence titles."
      });
      fixes.push({
        title: "Add narrative fallback",
        code: `// In lib/worker.ts, replace narrative generation with:
const narrative = {
  title: cluster.name,
  overview: cluster.description,
  clusterIds: [cluster.id],
  evidenceIds: cluster.evidenceIds,
  confidence: cluster.density,
  status: "auto"
};
db.insert(narratives).values(narrative).run();`
      });
    } else {
      score.current += 10;
      console.log(`  ✅ Auto-narratives generated`);
    }
  } else {
    bugs.push({
      severity: "critical",
      title: "narratives table does not exist",
      detail: "Run 'npx drizzle-kit push' to create the v3 schema.",
      fix: "npx drizzle-kit push"
    });
  }

  const hasStories = tables.includes("stories");
  let autoStoryCount = 0;
  let manualStoryCount = 0;

  if (hasStories) {
    const stories = db.prepare("SELECT * FROM stories").all();
    autoStoryCount = stories.filter(s => s.generationType === "auto" || s.createdBy === null).length;
    manualStoryCount = stories.filter(s => s.generationType === "manual" || s.createdBy !== null).length;
    console.log(`  stories table: ${stories.length} total (${autoStoryCount} auto, ${manualStoryCount} manual)`);

    const evidenceCount = db.prepare("SELECT COUNT(*) as c FROM evidence").get().c;
    if (evidenceCount > 0 && stories.length === evidenceCount && autoStoryCount === evidenceCount) {
      bugs.push({
        severity: "critical",
        title: "1:1 EVIDENCE-TO-STORY RATIO IN stories TABLE",
        detail: "The AUTO-CREATE STORY block in processEvidenceJob creates one story per evidence item. This bypasses clustering entirely.",
        fix: "REMOVE the AUTO-CREATE STORY block from the end of processEvidenceJob(). Stories should ONLY be created inside buildSimpleStoryGraph() when 2+ evidence items cluster together. Single evidence should remain as candidates only."
      });
      fixes.push({
        title: "Delete auto-story block",
        code: `// DELETE this entire block from processEvidenceJob():
// ── AUTO-CREATE STORY ─────────────────────────────
// const narrativeTitle = evidenceRow?.title || ...
// const existingStory = ...
// if (!existingStory) { db.insert(stories)... }`
      });
    } else if (autoStoryCount > 0) {
      score.current += 5;
      console.log(`  ✅ Auto-stories exist in stories table`);
    }
  }

  return { score: score.current, max: score.max, bugs, fixes, narrativeCount, autoStoryCount, manualStoryCount };
}

function checkFrontend(db, tables, colSchema, version) {
  print("\n🖥️ STAGE 6: FRONTEND INTEGRITY", `(${version})`, Colors.blue);
  const score = { current: 0, max: GRADE_WEIGHTS.frontend };
  const bugs = [];
  const fixes = [];

  const apiRoutes = [
    "app/api/stories/route.ts",
    "app/api/graph/route.ts",
    "app/api/discover/route.ts",
    "app/api/evidence/route.ts"
  ];

  const missingRoutes = apiRoutes.filter(r => !fs.existsSync(path.join(process.cwd(), r)));
  if (missingRoutes.length > 0) {
    bugs.push({
      severity: "critical",
      title: `Missing API routes: ${missingRoutes.map(r => r.split('/').pop()).join(', ')}`,
      detail: "Frontend pages call these endpoints. If missing, the UI will show empty states or 404 errors.",
      fix: "Ensure all v3 API routes are in place. Check the repo for app/api/*/route.ts files."
    });
  } else {
    score.current += 5;
    console.log(`  ✅ All critical API routes present`);
  }

  const hasStoriesRoute = fs.existsSync(path.join(process.cwd(), "app/api/stories/route.ts"));
  if (hasStoriesRoute) {
    const routeContent = fs.readFileSync(path.join(process.cwd(), "app/api/stories/route.ts"), "utf8");
    const hasGenerationType = routeContent.includes("generationType");

    if (!hasGenerationType) {
      bugs.push({
        severity: "warning",
        title: "/api/stories does not return generationType field",
        detail: "The stories page UI shows 'Graph-derived' and 'Manual' badges based on generationType. Without this field, all stories look identical.",
        fix: "In app/api/stories/route.ts, SELECT generationType from stories table and include it in the response JSON."
      });
    } else {
      score.current += 5;
      console.log(`  ✅ Stories API returns generationType`);
    }

    const hasAutoInQuery = routeContent.includes("auto") || routeContent.includes("generationType");
    if (!hasAutoInQuery) {
      bugs.push({
        severity: "warning",
        title: "/api/stories may not include auto-generated stories",
        detail: "The route might filter to manual stories only, hiding all graph-derived narratives.",
        fix: "Ensure the stories route queries both manual and auto stories."
      });
    }
  }

  const hasDiscoverRoute = fs.existsSync(path.join(process.cwd(), "app/api/discover/route.ts"));
  if (hasDiscoverRoute) {
    const routeContent = fs.readFileSync(path.join(process.cwd(), "app/api/discover/route.ts"), "utf8");
    if (!routeContent.includes("graph_clusters") && !routeContent.includes("graphClusters")) {
      bugs.push({
        severity: "critical",
        title: "/api/discover does NOT query graph_clusters",
        detail: "The discover page will always show 'No story clusters found yet' even when clusters exist in the DB.",
        fix: "Rewrite app/api/discover/route.ts to query graph_clusters and narratives tables instead of computing document similarity on-the-fly."
      });
    } else {
      score.current += 5;
      console.log(`  ✅ Discover API queries graph clusters`);
    }
  }

  return { score: score.current, max: score.max, bugs, fixes };
}

function checkTimeline(db, tables, colSchema) {
  print("\n📅 BONUS: TIMELINE EXTRACTION", "", Colors.gray);
  const bugs = [];

  const hasTimeline = tables.includes("timeline_events");
  if (hasTimeline) {
    const count = db.prepare("SELECT COUNT(*) as c FROM timeline_events").get().c;
    console.log(`  Timeline events: ${count}`);
    if (count === 0) {
      bugs.push({
        severity: "warning",
        title: "timeline_events is empty",
        detail: "The worker has no timeline extraction stage. Dates like 'Dec 2028' and 'Q1 2027' in evidence text are ignored.",
        fix: "Add a timeline extraction stage to lib/worker.ts after store_assessment. Use regex to find date patterns, or add an LLM prompt that extracts temporal events."
      });
    }
  }
  return { bugs };
}

// ── MAIN ───────────────────────────────────────────────────────────
function main() {
  console.log(`${Colors.cyan}${Colors.bold}
╔══════════════════════════════════════════════════════════════════╗
║     ATIS STORY PIPELINE — GRADER & BUG DIAGNOSTIC                ║
║     Evaluates evidence → clusters → stories → narratives         ║
╚══════════════════════════════════════════════════════════════════╝${Colors.reset}
`);

  if (!fs.existsSync(DB_PATH)) {
    console.log(`${Colors.red}${Colors.bold}FATAL: Database not found at ${DB_PATH}${Colors.reset}`);
    console.log(`Set DATABASE_URL or ensure atis.db exists in the project root.`);
    process.exit(1);
  }

  const db = new Database(DB_PATH);

  const { tables, colSchema } = inspectSchema(db);
  const version = detectVersion(tables);

  print("DATABASE", `${path.basename(DB_PATH)} | Schema version: ${version}`, Colors.magenta);
  console.log(`  Tables found: ${tables.length} (${tables.slice(0, 10).join(", ")}${tables.length > 10 ? "..." : ""})`);

  const ingestion = checkIngestion(db, tables, colSchema);
  const extraction = checkExtraction(db, tables, colSchema, version);
  const clustering = checkClustering(db, tables, colSchema, version, ingestion.evidenceCount);
  const graph = checkGraph(db, tables, colSchema, version);
  const narratives = checkNarratives(db, tables, colSchema, version);
  const frontend = checkFrontend(db, tables, colSchema, version);
  const timeline = checkTimeline(db, tables, colSchema);

  const allBugs = [
    ...ingestion.bugs, ...extraction.bugs, ...clustering.bugs,
    ...graph.bugs, ...narratives.bugs, ...frontend.bugs, ...timeline.bugs
  ];
  const allFixes = [
    ...ingestion.fixes, ...extraction.fixes, ...clustering.fixes,
    ...graph.fixes, ...narratives.fixes, ...frontend.fixes
  ];

  print("\n══════════════════════════════════════════════════════════════════", "", Colors.bold);
  print("SCOREBOARD", "", Colors.bold);
  print("══════════════════════════════════════════════════════════════════", "", Colors.bold);

  const results = [
    { name: "Evidence Ingestion", score: ingestion.score, max: ingestion.max },
    { name: "Structured Extraction", score: extraction.score, max: extraction.max },
    { name: "Clustering", score: clustering.score, max: clustering.max },
    { name: "Graph & Relationships", score: graph.score, max: graph.max },
    { name: "Narrative Generation", score: narratives.score, max: narratives.max },
    { name: "Frontend Integration", score: frontend.score, max: frontend.max },
  ];

  let totalScore = 0;
  let totalMax = 0;

  for (const r of results) {
    const g = gradeLabel(r.score, r.max);
    const bar = "█".repeat(Math.round((r.score / r.max) * 20)).padEnd(20, "░");
    console.log(`  ${r.name.padEnd(24)} ${bar} ${g.color}${g.label}${Colors.reset}  ${r.score}/${r.max}`);
    totalScore += r.score;
    totalMax += r.max;
  }

  const overall = gradeLabel(totalScore, totalMax);
  const overallPct = ((totalScore / totalMax) * 100).toFixed(1);

  print("\n──────────────────────────────────────────────────────────────────", "", Colors.bold);
  console.log(`  ${Colors.bold}OVERALL SCORE:${Colors.reset} ${overall.color}${overallPct}% (${overall.label})${Colors.reset}`);
  print("──────────────────────────────────────────────────────────────────", "", Colors.bold);

  if (allBugs.length > 0) {
    const critical = allBugs.filter(b => b.severity === "critical");
    const warnings = allBugs.filter(b => b.severity === "warning");

    print(`\n🐛 BUG REPORT: ${critical.length} critical, ${warnings.length} warnings`, "", Colors.red);

    if (critical.length > 0) {
      print("\n  CRITICAL BUGS (fix these first):", "", Colors.red);
      for (const bug of critical) {
        printBug(bug.title, bug.detail, "critical");
      }
    }

    if (warnings.length > 0) {
      print("\n  WARNINGS:", "", Colors.yellow);
      for (const bug of warnings) {
        printBug(bug.title, bug.detail, "warning");
      }
    }
  } else {
    print("\n✅ NO BUGS DETECTED", "", Colors.green);
  }

  if (allFixes.length > 0) {
    print("\n💡 FIX RECIPES", "", Colors.green);
    for (const fix of allFixes) {
      printFix(fix.title, fix.code);
    }
  }

  print("\n🔍 PIPELINE FLOW DIAGNOSTIC", "", Colors.cyan);

  const flow = [];
  flow.push(ingestion.evidenceCount > 0 ? "✅ Evidence uploaded" : "❌ No evidence");
  flow.push(extraction.entityCount > 0 ? `✅ ${extraction.entityCount} entities extracted` : "❌ No entities");
  flow.push(extraction.factCount > 0 ? `✅ ${extraction.factCount} facts extracted` : "❌ No facts");
  flow.push(clustering.multiEvidenceClusters > 0 ? `✅ ${clustering.multiEvidenceClusters} multi-evidence clusters` : "❌ No clusters");
  flow.push(graph.relCount > 0 ? `✅ ${graph.relCount} relationships` : "❌ No relationships");
  flow.push(narratives.narrativeCount > 0 ? `✅ ${narratives.narrativeCount} narratives` : "❌ No narratives");
  flow.push(narratives.autoStoryCount > 0 ? `✅ ${narratives.autoStoryCount} auto-stories` : "❌ No auto-stories");

  console.log("  " + flow.join(" → "));

  const firstBroken = flow.findIndex(s => s.startsWith("❌"));
  if (firstBroken >= 0) {
    const stageNames = ["Ingestion", "Entity Extraction", "Fact Extraction", "Clustering", "Relationships", "Narratives", "Story Creation"];
    print(`\n🎯 FIRST BROKEN STAGE: ${stageNames[firstBroken]}`, "", Colors.red);
    console.log(`  Everything upstream of this stage works. Fix this stage first, then re-run this grader.`);
  }

  print("\n📋 RECOMMENDATION", "", Colors.magenta);
  if (overall.label === "F" || overall.label === "D") {
    console.log(`  ${Colors.red}The story pipeline is critically broken.${Colors.reset}`);
    console.log(`  Start with the FIRST BROKEN STAGE identified above. Do not attempt to fix downstream stages until upstream stages work.`);
    console.log(`  Most likely root cause: The AUTO-CREATE STORY block in lib/worker.ts is creating 1:1 evidence-to-story mappings, bypassing all clustering logic.`);
  } else if (overall.label === "C") {
    console.log(`  ${Colors.yellow}Core pipeline works but clustering/graph is weak.${Colors.reset}`);
    console.log(`  Focus on: lowering similarity thresholds, ensuring evidence_entities is populated, and checking that buildSimpleStoryGraph creates story_evidence links.`);
  } else if (overall.label === "B") {
    console.log(`  ${Colors.cyan}Good pipeline with minor gaps.${Colors.reset}`);
    console.log(`  Focus on: timeline extraction, narrative quality, and frontend polish.`);
  } else {
    console.log(`  ${Colors.green}Excellent! The story pipeline is production-ready.${Colors.reset}`);
  }

  print("\n✅ VERIFICATION CHECKLIST (run after fixes)", "", Colors.green);
  console.log(`  [ ] Clear all evidence via Admin panel`);
  console.log(`  [ ] Re-upload the 5 test CSV documents`);
  console.log(`  [ ] Wait for worker to finish (check /api/debug)`);
  console.log(`  [ ] Visit /discover — should show 2-3 clusters with 2+ evidence each`);
  console.log(`  [ ] Visit /stories — should show auto-generated stories with evidence counts > 1`);
  console.log(`  [ ] Visit /graph — should show connected nodes with edges`);
  console.log(`  [ ] Run: node scripts/grade-story-pipeline.js — target score: B+ or higher`);

  db.close();

  const hasCritical = allBugs.some(b => b.severity === "critical");
  process.exit(hasCritical ? 1 : 0);
}

main();
