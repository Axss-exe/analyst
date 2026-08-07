/**
 * ATIS v4 — Unified Structured Extraction
 * 
 * Single-pass LLM extraction that produces:
 *   - v3: entities, facts, relationships, timeline, topics
 *   - v4: programs, events, problems, outcomes, actors
 * 
 * This replaces the v3 extraction.ts while preserving backward
 * compatibility with existing consumers.
 * 
 * The LLM receives ONE prompt and returns ONE JSON object
 * containing all extraction layers.
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
  buildIntelligenceExtractionPrompt,
  type RawIntelligenceExtraction,
  type SingleDocumentAssessment,
} from "./programs";

// ═════════════════════════════════════════════════════════════════
// 1. UNIFIED EXTRACTION RESULT
// ═════════════════════════════════════════════════════════════════

/**
 * The complete output of the v4 unified extraction pipeline.
 * 
 * Backward-compatible: the `structured` field contains the v3
 * extraction shape. The `intelligence` field contains v4 nodes.
 */
export interface UnifiedExtractionResult {
  /** v3-compatible structured extraction */
  structured: StructuredExtraction;
  /** v4 intelligence nodes */
  intelligence: StructuredIntelligence;
  /** v4 single-document story assessment */
  singleDocumentAssessment: SingleDocumentAssessment;
  /** Overall confidence across all extraction layers */
  confidence: number;
  /** Raw LLM response for debugging */
  raw?: string;
}

// ═════════════════════════════════════════════════════════════════
// 2. PROMPT SCHEMA
// ═════════════════════════════════════════════════════════════════

const UNIFIED_EXTRACTION_SCHEMA = {
  type: "object",
  required: ["entities", "facts", "relationships", "programs", "events", "problems", "outcomes", "actors"],
  properties: {
    entities: {
      type: "array",
      description: "Named entities mentioned in the text: people, organizations, locations, minerals, legislation, etc.",
      items: {
        type: "object",
        required: ["name", "type"],
        properties: {
          name: { type: "string" },
          type: { type: "string", description: "Entity type: person, organization, company, government, location, mineral, legislation, bank, investor, mine, infrastructure, project, etc." },
          mentions: { type: "number", description: "Approximate number of mentions" },
          context: { type: "string", description: "Surrounding sentence or clause" },
        },
      },
    },
    facts: {
      type: "array",
      description: "Atomic factual statements extracted as subject-predicate-object triples.",
      items: {
        type: "object",
        required: ["subject", "predicate", "object"],
        properties: {
          subject: { type: "string" },
          predicate: { type: "string" },
          object: { type: "string" },
          confidence: { type: "number", description: "Confidence 0.0–1.0" },
        },
      },
    },
    relationships: {
      type: "array",
      description: "Semantic relationships between entities.",
      items: {
        type: "object",
        required: ["source", "target", "type"],
        properties: {
          source: { type: "string" },
          target: { type: "string" },
          type: { type: "string", description: "Relationship type: funds, implements, partners_with, regulates, owns, operates, etc." },
          evidence: { type: "string", description: "Supporting text snippet" },
          confidence: { type: "number" },
        },
      },
    },
    timeline: {
      type: "array",
      description: "Chronological events mentioned in the text.",
      items: {
        type: "object",
        required: ["date", "description"],
        properties: {
          date: { type: "string", description: "Date in YYYY-MM-DD format or free text if exact date unknown" },
          description: { type: "string" },
          entityNames: { type: "array", items: { type: "string" } },
        },
      },
    },
    topics: {
      type: "array",
      description: "Key topics or themes (3–7 items).",
      items: { type: "string" },
    },
    // ── v4 intelligence nodes ──────────────────────────────────
    programs: {
      type: "array",
      description:
        "Named interventions, initiatives, projects, facilities, policy mechanisms, financing programs, or structured institutional initiatives. Be specific. Include acronyms.",
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
      description:
        "Specific things that happened or are scheduled: approvals, launches, awards, handovers, cyclones, releases, completions. Include dates when available.",
      items: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string" },
          eventType: { type: "string", enum: ["approval", "launch", "award", "completion", "occurrence", "release", "trigger", "other"] },
          temporalInfo: { type: "string", description: "Date or time reference" },
          description: { type: "string" },
        },
      },
    },
    problems: {
      type: "array",
      description:
        "Conditions, constraints, risks, crises, deficiencies, or challenges that interventions address. Be specific.",
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
      description:
        "Measurable or stated results. Include specific metrics when present.",
      items: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string" },
          metric: { type: "string", description: "Specific measurement" },
          description: { type: "string" },
        },
      },
    },
    actors: {
      type: "array",
      description:
        "Organizations, government bodies, persons, funders, contractors, regulators, implementers. Include stated roles.",
      items: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string" },
          actorType: { type: "string", enum: ["organization", "government", "person", "funder", "contractor", "regulator", "implementer", "other"] },
          description: { type: "string", description: "Role or context" },
        },
      },
    },
  },
} as const;

// ═════════════════════════════════════════════════════════════════
// 3. PROMPT BUILDER
// ═════════════════════════════════════════════════════════════════

function buildExtractionPrompt(text: string): string {
  return `You are an intelligence analyst extracting structured information from a source document.

Analyze the following text and return a single JSON object matching the schema below.

## Extraction Rules

1. **Be specific, not generic.**
   - GOOD program: "Zimbabwe Emergency Food Production Project (ZEFPP)"
   - BAD program: "agricultural project"
   - GOOD problem: "food insecurity caused by global supply shocks"
   - BAD problem: "development challenge"
   - GOOD outcome: "188,000 households reached with agricultural inputs"
   - BAD outcome: "positive impact"

2. **Preserve acronyms.** If a program is referred to as both full name and acronym, include the acronym in the name field.

3. **Temporal anchors.** For events, include any date, quarter, or year mentioned.

4. **Metrics.** For outcomes, capture specific numbers, percentages, or measurements.

5. **Actor roles.** For actors, note whether they are funder, implementer, regulator, contractor, etc.

6. **Confidence.** For facts and relationships, assign a confidence score 0.0–1.0 based on explicitness in the text.

7. **No hallucination.** Only extract what is explicitly stated or strongly implied by the text. If uncertain, omit.

## Text to Analyze

${text.slice(0, 12000)}

## Required JSON Schema

${JSON.stringify(UNIFIED_EXTRACTION_SCHEMA, null, 2)}

Return ONLY the JSON object. No markdown, no commentary.`;
}

// ═════════════════════════════════════════════════════════════════
// 4. PARSING & VALIDATION
// ═════════════════════════════════════════════════════════════════

function safeParseJSON<T>(text: string): T | null {
  try {
    // Strip markdown code fences if present
    const cleaned = text
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();
    return JSON.parse(cleaned) as T;
  } catch {
    return null;
  }
}

function validateExtraction(raw: unknown): {
  valid: boolean;
  entities: ExtractedEntity[];
  facts: Fact[];
  relationships: ExtractedRelationship[];
  timeline: TimelineEvent[];
  topics: string[];
  intelligence: RawIntelligenceExtraction;
} {
  const empty = {
    valid: false,
    entities: [] as ExtractedEntity[],
    facts: [] as Fact[],
    relationships: [] as ExtractedRelationship[],
    timeline: [] as TimelineEvent[],
    topics: [] as string[],
    intelligence: {
      programs: [],
      events: [],
      problems: [],
      outcomes: [],
      actors: [],
    } as RawIntelligenceExtraction,
  };

  if (!raw || typeof raw !== "object") return empty;
  const obj = raw as Record<string, unknown>;

  // Extract entities
  const entities: ExtractedEntity[] = Array.isArray(obj.entities)
    ? obj.entities
        .filter((e): e is Record<string, unknown> => typeof e === "object" && e !== null)
        .map((e) => ({
          name: String(e.name || ""),
          type: String(e.type || "unknown"),
          mentions: typeof e.mentions === "number" ? e.mentions : 1,
          context: e.context ? String(e.context) : undefined,
        }))
        .filter((e) => e.name.length > 0)
    : [];

  // Extract facts
  const facts: Fact[] = Array.isArray(obj.facts)
    ? obj.facts
        .filter((f): f is Record<string, unknown> => typeof f === "object" && f !== null)
        .map((f) => ({
          subject: String(f.subject || ""),
          predicate: String(f.predicate || ""),
          object: String(f.object || ""),
          evidenceId: 0, // Set by caller
          confidence: typeof f.confidence === "number" ? Math.max(0, Math.min(1, f.confidence)) : 0.8,
        }))
        .filter((f) => f.subject && f.predicate && f.object)
    : [];

  // Extract relationships
  const relationships: ExtractedRelationship[] = Array.isArray(obj.relationships)
    ? obj.relationships
        .filter((r): r is Record<string, unknown> => typeof r === "object" && r !== null)
        .map((r) => ({
          source: String(r.source || ""),
          target: String(r.target || ""),
          type: String(r.type || ""),
          evidence: r.evidence ? String(r.evidence) : undefined,
          confidence: typeof r.confidence === "number" ? Math.max(0, Math.min(1, r.confidence)) : 0.8,
        }))
        .filter((r) => r.source && r.target && r.type)
    : [];

  // Extract timeline
  const timeline: TimelineEvent[] = Array.isArray(obj.timeline)
    ? obj.timeline
        .filter((t): t is Record<string, unknown> => typeof t === "object" && t !== null)
        .map((t) => ({
          date: String(t.date || ""),
          description: String(t.description || ""),
          entityNames: Array.isArray(t.entityNames)
            ? t.entityNames.filter((n): n is string => typeof n === "string")
            : undefined,
        }))
        .filter((t) => t.date && t.description)
    : [];

  // Extract topics
  const topics: string[] = Array.isArray(obj.topics)
    ? obj.topics.filter((t): t is string => typeof t === "string" && t.length > 0)
    : [];

  // Extract v4 intelligence nodes
  const intelligence: RawIntelligenceExtraction = {
    programs: Array.isArray(obj.programs)
      ? obj.programs
          .filter((p): p is Record<string, unknown> => typeof p === "object" && p !== null)
          .map((p) => ({
            name: String(p.name || ""),
            type: p.type ? String(p.type) : undefined,
            description: p.description ? String(p.description) : undefined,
          }))
          .filter((p) => p.name.length > 0)
      : [],
    events: Array.isArray(obj.events)
      ? obj.events
          .filter((e): e is Record<string, unknown> => typeof e === "object" && e !== null)
          .map((e) => ({
            name: String(e.name || ""),
            eventType: e.eventType ? String(e.eventType) : undefined,
            temporalInfo: e.temporalInfo ? String(e.temporalInfo) : undefined,
            description: e.description ? String(e.description) : undefined,
          }))
          .filter((e) => e.name.length > 0)
      : [],
    problems: Array.isArray(obj.problems)
      ? obj.problems
          .filter((p): p is Record<string, unknown> => typeof p === "object" && p !== null)
          .map((p) => ({
            name: String(p.name || ""),
            severity: p.severity ? String(p.severity) : undefined,
            description: p.description ? String(p.description) : undefined,
          }))
          .filter((p) => p.name.length > 0)
      : [],
    outcomes: Array.isArray(obj.outcomes)
      ? obj.outcomes
          .filter((o): o is Record<string, unknown> => typeof o === "object" && o !== null)
          .map((o) => ({
            name: String(o.name || ""),
            metric: o.metric ? String(o.metric) : undefined,
            description: o.description ? String(o.description) : undefined,
          }))
          .filter((o) => o.name.length > 0)
      : [],
    actors: Array.isArray(obj.actors)
      ? obj.actors
          .filter((a): a is Record<string, unknown> => typeof a === "object" && a !== null)
          .map((a) => ({
            name: String(a.name || ""),
            actorType: a.actorType ? String(a.actorType) : undefined,
            description: a.description ? String(a.description) : undefined,
          }))
          .filter((a) => a.name.length > 0)
      : [],
  };

  const hasContent =
    entities.length > 0 ||
    facts.length > 0 ||
    relationships.length > 0 ||
    intelligence.programs.length > 0 ||
    intelligence.events.length > 0 ||
    intelligence.problems.length > 0 ||
    intelligence.outcomes.length > 0 ||
    intelligence.actors.length > 0;

  return {
    valid: hasContent,
    entities,
    facts,
    relationships,
    timeline,
    topics,
    intelligence,
  };
}

// ═════════════════════════════════════════════════════════════════
// 5. MAIN EXTRACTION FUNCTION
// ═════════════════════════════════════════════════════════════════

/**
 * Extract structured intelligence from evidence text in a single LLM call.
 * 
 * @param text — The evidence text to analyze
 * @param evidenceId — The database ID of the evidence item (for provenance)
 * @returns Unified extraction result with v3 and v4 data
 */
export async function extractStructuredFacts(
  text: string,
  evidenceId: number
): Promise<UnifiedExtractionResult> {
  if (!text || text.trim().length === 0) {
    return {
      structured: {
        entities: [],
        facts: [],
        relationships: [],
        timeline: [],
        topics: [],
        confidence: 0,
      },
      intelligence: {
        evidenceId,
        programs: [],
        events: [],
        problems: [],
        outcomes: [],
        actors: [],
        relationships: [],
        extractionConfidence: 0,
      },
      singleDocumentAssessment: {
        hasProblem: false,
        hasIntervention: false,
        hasOutcome: false,
        hasProgram: false,
        hasEvent: false,
        narrativeCompletenessScore: 0,
        canBeSingleDocumentStory: false,
        assessmentReason: "Empty text",
      },
      confidence: 0,
    };
  }

  const prompt = buildExtractionPrompt(text);
  const rawResponse = await generateWithAI(prompt);
  const parsed = safeParseJSON<Record<string, unknown>>(rawResponse);

  if (!parsed) {
    // Retry once with a simpler prompt if JSON parsing failed
    const retryPrompt = `${prompt}\n\nIMPORTANT: Your response must be ONLY valid JSON. No markdown, no explanations.`;
    const retryResponse = await generateWithAI(retryPrompt);
    const retryParsed = safeParseJSON<Record<string, unknown>>(retryResponse);
    if (!retryParsed) {
      throw new Error(`Failed to parse extraction JSON for evidence ${evidenceId}`);
    }
    return buildResult(retryParsed, evidenceId, retryResponse);
  }

  return buildResult(parsed, evidenceId, rawResponse);
}

/**
 * Build the final result from parsed JSON.
 */
function buildResult(
  parsed: Record<string, unknown>,
  evidenceId: number,
  rawResponse: string
): UnifiedExtractionResult {
  const validated = validateExtraction(parsed);

  // Attach evidenceId to facts for provenance
  const factsWithProvenance = validated.facts.map((f) => ({ ...f, evidenceId }));

  // Normalize intelligence nodes
  const normalized = normalizeIntelligenceExtraction(validated.intelligence, evidenceId);

  // Build v3 structured extraction
  const structured: StructuredExtraction = {
    entities: validated.entities,
    facts: factsWithProvenance,
    relationships: validated.relationships,
    timeline: validated.timeline,
    topics: validated.topics,
    confidence: validated.valid ? 0.85 : 0.3,
  };

  // Build v4 structured intelligence
  const intelligence: StructuredIntelligence = {
    evidenceId,
    programs: normalized.programs,
    events: normalized.events,
    problems: normalized.problems,
    outcomes: normalized.outcomes,
    actors: normalized.actors,
    relationships: [], // Populated by relationship extraction layer (TURN 4)
    extractionConfidence: structured.confidence,
  };

  // Assess single-document story potential
  const singleDocumentAssessment = assessSingleDocumentStory(normalized);

  // Overall confidence is average of structured and intelligence confidence
  const intelligenceConfidence =
    (normalized.programs.length +
      normalized.events.length +
      normalized.problems.length +
      normalized.outcomes.length +
      normalized.actors.length) > 0
      ? 0.8
      : 0.4;

  const overallConfidence = parseFloat(
    ((structured.confidence + intelligenceConfidence) / 2).toFixed(3)
  );

  return {
    structured,
    intelligence,
    singleDocumentAssessment,
    confidence: overallConfidence,
    raw: rawResponse.slice(0, 5000), // Truncate for storage
  };
}

// ═════════════════════════════════════════════════════════════════
// 6. BACKWARD-COMPATIBLE WRAPPER
// ═════════════════════════════════════════════════════════════════

/**
 * v3-compatible wrapper that returns only the structured extraction.
 * Existing consumers can continue using this signature.
 */
export async function extractFacts(text: string): Promise<StructuredExtraction> {
  const result = await extractStructuredFacts(text, 0);
  return result.structured;
}
