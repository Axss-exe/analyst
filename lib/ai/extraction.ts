/**
 * ATIS v4 — Unified Structured Extraction
 * 
 * Single-pass LLM extraction that produces:
 *   - v3: entities, facts, relationships, timeline, topics
 *   - v4: programs, events, problems, outcomes, actors
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

export interface UnifiedExtractionResult {
  structured: StructuredExtraction;
  intelligence: StructuredIntelligence;
  singleDocumentAssessment: SingleDocumentAssessment;
  confidence: number;
  raw?: string;
}

// ═════════════════════════════════════════════════════════════════
// PROMPT SCHEMA
// ═════════════════════════════════════════════════════════════════

const UNIFIED_EXTRACTION_SCHEMA = {
  type: "object",
  required: ["entities", "facts", "relationships", "programs", "events", "problems", "outcomes", "actors"],
  properties: {
    entities: {
      type: "array",
      description: "Named entities: people, organizations, locations, minerals, legislation, etc.",
      items: {
        type: "object",
        required: ["name", "type"],
        properties: {
          name: { type: "string" },
          type: { type: "string", description: "person, organization, government, location, mineral, legislation, bank, investor, project, etc." },
          mentions: { type: "number" },
          context: { type: "string" },
        },
      },
    },
    facts: {
      type: "array",
      description: "Atomic factual statements as subject-predicate-object triples.",
      items: {
        type: "object",
        required: ["subject", "predicate", "object"],
        properties: {
          subject: { type: "string" },
          predicate: { type: "string" },
          object: { type: "string" },
          confidence: { type: "number", description: "0.0–1.0" },
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
          type: { type: "string" },
          evidence: { type: "string" },
          confidence: { type: "number" },
        },
      },
    },
    timeline: {
      type: "array",
      description: "Chronological events.",
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
    topics: {
      type: "array",
      description: "Key themes (3–7 items).",
      items: { type: "string" },
    },
    programs: {
      type: "array",
      description: "Named interventions, initiatives, projects, facilities, policy mechanisms, financing programs. Be specific. Include acronyms.",
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
      description: "Specific things that happened: approvals, launches, awards, grants, releases, completions. Include dates.",
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
      description: "Conditions, constraints, risks, crises, deficiencies, or challenges.",
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
      description: "Measurable or stated results. Include specific metrics.",
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
      description: "Organizations, government bodies, persons, funders, contractors, regulators, implementers. Include roles.",
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
// FEW-SHOT EXAMPLES (critical for gpt-oss-120b)
// ═════════════════════════════════════════════════════════════════

const FEW_SHOT_EXAMPLES = `## Examples of Correct Extraction

### Input:
"African Development Fund grants $4.3 million to strengthen integration of Natural Capital into decision-making in 13 African Countries"

### Output:
{
  "entities": [
    { "name": "African Development Fund", "type": "organization", "mentions": 1, "context": "grants $4.3 million" },
    { "name": "Natural Capital", "type": "program", "mentions": 1, "context": "integration into decision-making" }
  ],
  "facts": [
    { "subject": "African Development Fund", "predicate": "grants", "object": "$4.3 million", "confidence": 0.95 }
  ],
  "relationships": [],
  "timeline": [],
  "topics": ["natural capital", "development finance", "decision-making"],
  "programs": [
    { "name": "African Development Fund", "type": "financing", "description": "Grant facility providing development financing" },
    { "name": "Natural Capital Integration Program", "type": "program", "description": "Initiative to integrate natural capital into decision-making across 13 African countries" }
  ],
  "events": [
    { "name": "$4.3 million grant approval", "eventType": "award", "temporalInfo": "2026", "description": "African Development Fund approved $4.3 million grant for natural capital integration" }
  ],
  "problems": [
    { "name": "natural capital excluded from decision-making", "severity": "high", "description": "Natural capital not integrated into policy and investment decisions" }
  ],
  "outcomes": [
    { "name": "$4.3 million disbursed for natural capital", "metric": "$4.3 million", "description": "Funding allocated to strengthen natural capital integration" }
  ],
  "actors": [
    { "name": "African Development Fund", "actorType": "funder", "description": "Provided $4.3 million grant" },
    { "name": "13 African Countries", "actorType": "government", "description": "Beneficiaries of natural capital integration program" }
  ]
}

### Input:
"Regional Economic Outlook 2026: Southern Africa Must Mobilise Development Finance at Scale to Close Annual $55 Billion Financing Gap"

### Output:
{
  "entities": [
    { "name": "Southern Africa", "type": "location", "mentions": 1 },
    { "name": "$55 Billion Financing Gap", "type": "metric", "mentions": 1 }
  ],
  "facts": [
    { "subject": "Southern Africa", "predicate": "has", "object": "$55 billion annual financing gap", "confidence": 0.9 }
  ],
  "relationships": [],
  "timeline": [
    { "date": "2026", "description": "Regional Economic Outlook published", "entityNames": ["Southern Africa"] }
  ],
  "topics": ["development finance", "financing gap", "economic outlook"],
  "programs": [
    { "name": "Regional Economic Outlook 2026", "type": "program", "description": "Annual economic assessment and forecast for Southern Africa" }
  ],
  "events": [
    { "name": "Regional Economic Outlook 2026 release", "eventType": "release", "temporalInfo": "2026", "description": "Publication of regional economic outlook report" }
  ],
  "problems": [
    { "name": "$55 billion annual financing gap", "severity": "critical", "description": "Southern Africa faces a $55 billion annual shortfall in development financing" },
    { "name": "insufficient development finance mobilization", "severity": "critical", "description": "Development finance not mobilized at scale needed" }
  ],
  "outcomes": [
    { "name": "mobilize development finance at scale", "metric": "scale", "description": "Objective to close financing gap through scaled mobilization" }
  ],
  "actors": [
    { "name": "African Development Bank", "actorType": "organization", "description": "Publisher of Regional Economic Outlook" },
    { "name": "Southern Africa", "actorType": "government", "description": "Region requiring development finance mobilization" }
  ]
}`;

// ═════════════════════════════════════════════════════════════════
// PROMPT BUILDER
// ═════════════════════════════════════════════════════════════════

function buildExtractionPrompt(text: string): string {
  return `You are an intelligence analyst extracting structured information from a source document.

Analyze the following text and return a single JSON object matching the schema below.

## Extraction Rules

1. **Be specific, not generic.** Extract named programs, specific dollar amounts, and concrete actors.
   - GOOD program: "Zimbabwe Emergency Food Production Project (ZEFPP)"
   - BAD program: "agricultural project"
   - GOOD problem: "$55 billion annual financing gap"
   - BAD problem: "development challenge"

2. **Extract from titles AND content.** The title often contains the most specific information.

3. **Never return empty arrays unless the text is truly blank.** If the document mentions an organization, put it in actors. If it mentions a funding amount, put it in outcomes or events.

4. **Preserve acronyms.** Include them in the name field.

5. **Temporal anchors.** For events, include any date, quarter, or year.

6. **Metrics.** For outcomes, capture specific numbers, percentages, or measurements.

7. **Actor roles.** Note whether they are funder, implementer, regulator, contractor, etc.

8. **Confidence.** For facts and relationships, assign a confidence score 0.0–1.0.

9. **No hallucination.** Only extract what is explicitly stated or strongly implied.

${FEW_SHOT_EXAMPLES}

## Text to Analyze

${text.slice(0, 12000)}

## Required JSON Schema

${JSON.stringify(UNIFIED_EXTRACTION_SCHEMA, null, 2)}

Return ONLY the JSON object. No markdown, no commentary. Every field must be present as an array (can be empty ONLY if there is genuinely no information).`;
}

// ═════════════════════════════════════════════════════════════════
// PARSING & VALIDATION
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
      const objectMatch = text.match(/\{[\s\S]*?\}/);
      const arrayMatch = text.match(/\[[\s\S]*?\]/);
      if (objectMatch && arrayMatch) {
        const objIndex = text.indexOf(objectMatch[0]);
        const arrIndex = text.indexOf(arrayMatch[0]);
        const first = objIndex < arrIndex ? objectMatch[0] : arrayMatch[0];
        return JSON.parse(first) as T;
      } else if (objectMatch) {
        return JSON.parse(objectMatch[0]) as T;
      } else if (arrayMatch) {
        return JSON.parse(arrayMatch[0]) as T;
      }
    } catch {
      // Nothing worked
    }
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

  const facts: Fact[] = Array.isArray(obj.facts)
    ? obj.facts
        .filter((f): f is Record<string, unknown> => typeof f === "object" && f !== null)
        .map((f) => ({
          subject: String(f.subject || ""),
          predicate: String(f.predicate || ""),
          object: String(f.object || ""),
          evidenceId: 0,
          confidence: typeof f.confidence === "number" ? Math.max(0, Math.min(1, f.confidence)) : 0.8,
        }))
        .filter((f) => f.subject && f.predicate && f.object)
    : [];

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

  const topics: string[] = Array.isArray(obj.topics)
    ? obj.topics.filter((t): t is string => typeof t === "string" && t.length > 0)
    : [];

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
// MAIN EXTRACTION FUNCTION
// ═════════════════════════════════════════════════════════════════

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

  let rawResponse: string;
  try {
    rawResponse = await generateWithAI(prompt);
  } catch (err: any) {
    console.error(`[extraction] LLM call failed for evidence ${evidenceId}:`, err.message);
    throw new Error(`Extraction LLM failed for E${evidenceId}: ${err.message}`);
  }

  const parsed = safeParseJSON<Record<string, unknown>>(rawResponse);

  if (!parsed) {
    console.error(`[extraction] JSON parse failed for evidence ${evidenceId}. Raw response (first 1200 chars):`);
    console.error(rawResponse.slice(0, 1200));

    const retryPrompt = `${prompt}\n\nCRITICAL: Return ONLY valid JSON. No explanations, no markdown, no preamble.`;

    let retryResponse: string;
    try {
      retryResponse = await generateWithAI(retryPrompt);
    } catch (err: any) {
      console.error(`[extraction] Retry LLM call failed for evidence ${evidenceId}:`, err.message);
      throw new Error(`Extraction retry failed for E${evidenceId}: ${err.message}`);
    }

    const retryParsed = safeParseJSON<Record<string, unknown>>(retryResponse);
    if (!retryParsed) {
      console.error(`[extraction] Retry JSON parse also failed. Raw response (first 1200 chars):`);
      console.error(retryResponse.slice(0, 1200));
      throw new Error(`Failed to parse extraction JSON for evidence ${evidenceId} after retry`);
    }
    return buildResult(retryParsed, evidenceId, retryResponse);
  }

  return buildResult(parsed, evidenceId, rawResponse);
}

function buildResult(
  parsed: Record<string, unknown>,
  evidenceId: number,
  rawResponse: string
): UnifiedExtractionResult {
  const validated = validateExtraction(parsed);

  // ── DIAGNOSTIC LOGGING ──────────────────────────────────────
  // Log raw response whenever v4 intelligence is unexpectedly empty
  const v4Total =
    validated.intelligence.programs.length +
    validated.intelligence.events.length +
    validated.intelligence.problems.length +
    validated.intelligence.outcomes.length +
    validated.intelligence.actors.length;

  if (v4Total === 0 && validated.entities.length > 0) {
    // v3 found something but v4 found nothing — suspicious
    console.warn(
      `[extraction] WARNING E${evidenceId}: v3 found ${validated.entities.length} entities/${validated.facts.length} facts but v4 intelligence is completely empty. Raw response (first 800 chars):`
    );
    console.warn(rawResponse.slice(0, 800));
  } else if (v4Total === 0 && validated.entities.length === 0) {
    console.warn(
      `[extraction] WARNING E${evidenceId}: Completely empty extraction. Text length was checked. Raw response (first 800 chars):`
    );
    console.warn(rawResponse.slice(0, 800));
  }
  // ────────────────────────────────────────────────────────────

  const factsWithProvenance = validated.facts.map((f) => ({ ...f, evidenceId }));
  const normalized = normalizeIntelligenceExtraction(validated.intelligence, evidenceId);

  const structured: StructuredExtraction = {
    entities: validated.entities,
    facts: factsWithProvenance,
    relationships: validated.relationships,
    timeline: validated.timeline,
    topics: validated.topics,
    confidence: validated.valid ? 0.85 : 0.3,
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
    raw: rawResponse.slice(0, 5000),
  };
}

export async function extractFacts(text: string): Promise<StructuredExtraction> {
  const result = await extractStructuredFacts(text, 0);
  return result.structured;
}
