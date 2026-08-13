/**
 * ATIS v4 — Split Extraction (v3 + v4 in separate calls)
 * 
 * Long documents exceed 4096 output tokens when all 10 arrays
 * are requested in one schema. This splits into:
 *   - Call 1: v3 (entities, facts, relationships, timeline, topics)
 *   - Call 2: v4 intelligence (programs, events, problems, outcomes, actors)
 * 
 * Each call gets 8000 output tokens, eliminating truncation.
 */

import { generateWithAI } from "./index";
import {
  type StructuredExtraction,
  type ExtractedEntity,
  type Fact,
  type ExtractedRelationship,
  type TimelineEvent,
} from "@/types";
import {
  type Program,
  type Event,
  type Problem,
  type Outcome,
  type Actor,
  type StructuredIntelligence,
} from "@/lib/graph/story-types";
import {
  normalizeIntelligenceExtraction,
  assessSingleDocumentStory,
  type RawIntelligenceExtraction,
  type SingleDocumentAssessment,
} from "./programs";

export interface UnifiedExtractionResult {
  structured: StructuredExtraction;
  intelligence: StructuredIntelligence;
  singleDocumentAssessment: SingleDocumentAssessment;
  confidence: number;
  raw?: string;
}

// ═════════════════════════════════════════════════════════════════
// PROMPT SCHEMAS (split)
// ═════════════════════════════════════════════════════════════════

const V3_SCHEMA = {
  type: "object",
  required: ["entities", "facts", "relationships", "timeline", "topics"],
  properties: {
    entities: {
      type: "array",
      items: {
        type: "object",
        required: ["name", "type"],
        properties: {
          name: { type: "string" },
          type: { type: "string" },
          mentions: { type: "number" },
          context: { type: "string" },
        },
      },
    },
    facts: {
      type: "array",
      items: {
        type: "object",
        required: ["subject", "predicate", "object"],
        properties: {
          subject: { type: "string" },
          predicate: { type: "string" },
          object: { type: "string" },
          confidence: { type: "number" },
        },
      },
    },
    relationships: {
      type: "array",
      items: {
        type: "object",
        required: ["source", "target", "type"],
        properties: {
          source: { type: "string" },
          target: { type: "string" },
          type: { type: "string" },
          evidence: { type: "string" },
          confidence: { type: "number" },
        },
      },
    },
    timeline: {
      type: "array",
      items: {
        type: "object",
        required: ["date", "description"],
        properties: {
          date: { type: "string" },
          description: { type: "string" },
          entityNames: { type: "array", items: { type: "string" } },
        },
      },
    },
    topics: { type: "array", items: { type: "string" } },
  },
} as const;

const V4_SCHEMA = {
  type: "object",
  required: ["programs", "events", "problems", "outcomes", "actors"],
  properties: {
    programs: {
      type: "array",
      items: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string" },
          type: { type: "string", enum: ["project", "initiative", "facility", "policy", "financing", "program", "other"] },
          description: { type: "string" },
        },
      },
    },
    events: {
      type: "array",
      items: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string" },
          eventType: { type: "string", enum: ["approval", "launch", "award", "completion", "occurrence", "release", "trigger", "other"] },
          temporalInfo: { type: "string" },
          description: { type: "string" },
        },
      },
    },
    problems: {
      type: "array",
      items: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string" },
          severity: { type: "string", enum: ["critical", "high", "medium", "low"] },
          description: { type: "string" },
        },
      },
    },
    outcomes: {
      type: "array",
      items: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string" },
          metric: { type: "string" },
          description: { type: "string" },
        },
      },
    },
    actors: {
      type: "array",
      items: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string" },
          actorType: { type: "string", enum: ["organization", "government", "person", "funder", "contractor", "regulator", "implementer", "other"] },
          description: { type: "string" },
        },
      },
    },
  },
} as const;

// ═════════════════════════════════════════════════════════════════
// PROMPT BUILDERS
// ═════════════════════════════════════════════════════════════════

function buildV3Prompt(text: string, title: string): string {
  return `Extract structured v3 data from this document.

Title: ${title}

${text.slice(0, 12000)}

Return ONLY JSON matching this schema:
${JSON.stringify(V3_SCHEMA, null, 2)}

Rules:
- Be specific. Include names, numbers, dates.
- "entities" must include all organizations, people, locations, programs mentioned.
- "facts" are subject-predicate-object triples.
- "timeline" includes any dated events.
- "topics" are 3-7 thematic keywords.
- Return ONLY JSON. No markdown, no commentary.`;
}

function buildV4Prompt(text: string, title: string): string {
  return `Extract v4 intelligence nodes from this document.

Title: ${title}

${text.slice(0, 12000)}

Return ONLY JSON matching this schema:
${JSON.stringify(V4_SCHEMA, null, 2)}

Rules:
- "programs": named initiatives, projects, facilities, financing mechanisms. Be specific.
- "events": specific occurrences (approvals, launches, grants, releases). Include dates.
- "problems": concrete challenges, risks, deficiencies. Include severity if stated.
- "outcomes": measurable results with specific metrics.
- "actors": organizations, governments, persons with their roles.
- Never return empty arrays unless the text truly has no information.
- Return ONLY JSON. No markdown, no commentary.`;
}

// ═════════════════════════════════════════════════════════════════
// PARSING
// ═════════════════════════════════════════════════════════════════

function safeParseJSON<T>(text: string): T | null {
  try {
    const cleaned = text
      .replace(/^\s*```json\s*/i, "")
      .replace(/^\s*```\s*/i, "")
      .replace(/\s*```\s*$/i, "")
      .trim();
    return JSON.parse(cleaned) as T;
  } catch {
    try {
      const match = text.match(/\{[\s\S]*?\}/);
      if (match) return JSON.parse(match[0]) as T;
    } catch {
      // nothing
    }
    return null;
  }
}

// ═════════════════════════════════════════════════════════════════
// VALIDATION
// ═════════════════════════════════════════════════════════════════

function validateV3(raw: unknown) {
  const empty = {
    entities: [] as ExtractedEntity[],
    facts: [] as Fact[],
    relationships: [] as ExtractedRelationship[],
    timeline: [] as TimelineEvent[],
    topics: [] as string[],
  };
  if (!raw || typeof raw !== "object") return empty;
  const obj = raw as Record<string, unknown>;

  return {
    entities: Array.isArray(obj.entities)
      ? obj.entities.filter((e): e is Record<string, unknown> => typeof e === "object" && e !== null)
          .map((e) => ({ name: String(e.name || ""), type: String(e.type || "unknown"), mentions: typeof e.mentions === "number" ? e.mentions : 1, context: e.context ? String(e.context) : undefined }))
          .filter((e) => e.name.length > 0)
      : [],
    facts: Array.isArray(obj.facts)
      ? obj.facts.filter((f): f is Record<string, unknown> => typeof f === "object" && f !== null)
          .map((f) => ({ subject: String(f.subject || ""), predicate: String(f.predicate || ""), object: String(f.object || ""), evidenceId: 0, confidence: typeof f.confidence === "number" ? Math.max(0, Math.min(1, f.confidence)) : 0.8 }))
          .filter((f) => f.subject && f.predicate && f.object)
      : [],
    relationships: Array.isArray(obj.relationships)
      ? obj.relationships.filter((r): r is Record<string, unknown> => typeof r === "object" && r !== null)
          .map((r) => ({ source: String(r.source || ""), target: String(r.target || ""), type: String(r.type || ""), evidence: r.evidence ? String(r.evidence) : undefined, confidence: typeof r.confidence === "number" ? Math.max(0, Math.min(1, r.confidence)) : 0.8 }))
          .filter((r) => r.source && r.target && r.type)
      : [],
    timeline: Array.isArray(obj.timeline)
      ? obj.timeline.filter((t): t is Record<string, unknown> => typeof t === "object" && t !== null)
          .map((t) => ({ date: String(t.date || ""), description: String(t.description || ""), entityNames: Array.isArray(t.entityNames) ? t.entityNames.filter((n): n is string => typeof n === "string") : undefined }))
          .filter((t) => t.date && t.description)
      : [],
    topics: Array.isArray(obj.topics) ? obj.topics.filter((t): t is string => typeof t === "string" && t.length > 0) : [],
  };
}

function validateV4(raw: unknown): RawIntelligenceExtraction {
  const empty = { programs: [], events: [], problems: [], outcomes: [], actors: [] };
  if (!raw || typeof raw !== "object") return empty;
  const obj = raw as Record<string, unknown>;

  return {
    programs: Array.isArray(obj.programs)
      ? obj.programs.filter((p): p is Record<string, unknown> => typeof p === "object" && p !== null)
          .map((p) => ({ name: String(p.name || ""), type: p.type ? String(p.type) : undefined, description: p.description ? String(p.description) : undefined }))
          .filter((p) => p.name.length > 0)
      : [],
    events: Array.isArray(obj.events)
      ? obj.events.filter((e): e is Record<string, unknown> => typeof e === "object" && e !== null)
          .map((e) => ({ name: String(e.name || ""), eventType: e.eventType ? String(e.eventType) : undefined, temporalInfo: e.temporalInfo ? String(e.temporalInfo) : undefined, description: e.description ? String(e.description) : undefined }))
          .filter((e) => e.name.length > 0)
      : [],
    problems: Array.isArray(obj.problems)
      ? obj.problems.filter((p): p is Record<string, unknown> => typeof p === "object" && p !== null)
          .map((p) => ({ name: String(p.name || ""), severity: p.severity ? String(p.severity) : undefined, description: p.description ? String(p.description) : undefined }))
          .filter((p) => p.name.length > 0)
      : [],
    outcomes: Array.isArray(obj.outcomes)
      ? obj.outcomes.filter((o): o is Record<string, unknown> => typeof o === "object" && o !== null)
          .map((o) => ({ name: String(o.name || ""), metric: o.metric ? String(o.metric) : undefined, description: o.description ? String(o.description) : undefined }))
          .filter((o) => o.name.length > 0)
      : [],
    actors: Array.isArray(obj.actors)
      ? obj.actors.filter((a): a is Record<string, unknown> => typeof a === "object" && a !== null)
          .map((a) => ({ name: String(a.name || ""), actorType: a.actorType ? String(a.actorType) : undefined, description: a.description ? String(a.description) : undefined }))
          .filter((a) => a.name.length > 0)
      : [],
  };
}

// ═════════════════════════════════════════════════════════════════
// MAIN EXTRACTION (TWO CALLS)
// ═════════════════════════════════════════════════════════════════

export async function extractStructuredFacts(
  text: string,
  evidenceId: number
): Promise<UnifiedExtractionResult> {
  if (!text || text.trim().length === 0) {
    return emptyResult(evidenceId, "Empty text");
  }

  // ── CALL 1: v3 extraction ───────────────────────────────────
  let v3Raw: string;
  try {
    v3Raw = await generateWithAI(buildV3Prompt(text, `Evidence ${evidenceId}`), { maxTokens: 8000, temperature: 0.2 });
  } catch (err: any) {
    console.error(`[extraction] E${evidenceId}: v3 LLM call failed —`, err.message);
    throw new Error(`v3 extraction failed for E${evidenceId}: ${err.message}`);
  }

  const v3Parsed = safeParseJSON<Record<string, unknown>>(v3Raw);
  if (!v3Parsed) {
    console.error(`[extraction] E${evidenceId}: v3 JSON parse failed. Raw (first 600):`, v3Raw.slice(0, 600));
    throw new Error(`v3 JSON parse failed for E${evidenceId}`);
  }
  const v3 = validateV3(v3Parsed);

  // ── CALL 2: v4 extraction ───────────────────────────────────
  let v4Raw: string;
  try {
    v4Raw = await generateWithAI(buildV4Prompt(text, `Evidence ${evidenceId}`), { maxTokens: 8000, temperature: 0.2 });
  } catch (err: any) {
    console.error(`[extraction] E${evidenceId}: v4 LLM call failed —`, err.message);
    // v4 is non-fatal — continue with empty intelligence
    v4Raw = "{}";
  }

  const v4Parsed = safeParseJSON<Record<string, unknown>>(v4Raw);
  const v4 = v4Parsed ? validateV4(v4Parsed) : { programs: [], events: [], problems: [], outcomes: [], actors: [] };

  if (!v4Parsed && v4Raw !== "{}") {
    console.warn(`[extraction] E${evidenceId}: v4 JSON parse failed. Raw (first 600):`, v4Raw.slice(0, 600));
  }

  // ── BUILD RESULT ────────────────────────────────────────────
  const factsWithProvenance = v3.facts.map((f) => ({ ...f, evidenceId }));
  const normalized = normalizeIntelligenceExtraction(v4, evidenceId);

  const structured: StructuredExtraction = {
    entities: v3.entities,
    facts: factsWithProvenance,
    relationships: v3.relationships,
    timeline: v3.timeline,
    topics: v3.topics,
    confidence: (v3.entities.length + v3.facts.length) > 0 ? 0.85 : 0.3,
  };

  const intelligence: StructuredIntelligence = {
    evidenceId,
    programs: normalized.programs,
    events: normalized.events,
    problems: normalized.problems,
    outcomes: normalized.outcomes,
    actors: normalized.actors,
    relationships: [],
    extractionConfidence: structured.confidence,
  };

  const singleDocumentAssessment = assessSingleDocumentStory(normalized);

  const intelligenceConfidence =
    (normalized.programs.length + normalized.events.length + normalized.problems.length + normalized.outcomes.length + normalized.actors.length) > 0
      ? 0.8 : 0.4;

  const overallConfidence = parseFloat(((structured.confidence + intelligenceConfidence) / 2).toFixed(3));

  console.log(`[extraction] E${evidenceId}: v3={entities:${v3.entities.length},facts:${v3.facts.length}} v4={programs:${v4.programs.length},events:${v4.events.length},problems:${v4.problems.length},outcomes:${v4.outcomes.length},actors:${v4.actors.length}}`);

  return {
    structured,
    intelligence,
    singleDocumentAssessment,
    confidence: overallConfidence,
    raw: v3Raw.slice(0, 2500) + "\n---\n" + v4Raw.slice(0, 2500),
  };
}

function emptyResult(evidenceId: number, reason: string): UnifiedExtractionResult {
  return {
    structured: { entities: [], facts: [], relationships: [], timeline: [], topics: [], confidence: 0 },
    intelligence: { evidenceId, programs: [], events: [], problems: [], outcomes: [], actors: [], relationships: [], extractionConfidence: 0 },
    singleDocumentAssessment: { hasProblem: false, hasIntervention: false, hasOutcome: false, hasProgram: false, hasEvent: false, narrativeCompletenessScore: 0, canBeSingleDocumentStory: false, assessmentReason: reason },
    confidence: 0,
  };
}

export async function extractFacts(text: string): Promise<StructuredExtraction> {
  const result = await extractStructuredFacts(text, 0);
  return result.structured;
}
