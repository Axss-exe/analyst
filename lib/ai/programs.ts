/**
 * ATIS v4 — Intelligence Node Extraction
 * 
 * Extracts structured intelligence nodes from evidence text:
 *   - Programs (interventions, initiatives, projects, facilities, policies, financing)
 *   - Events (things that happened or are scheduled)
 *   - Problems (conditions, risks, crises, deficiencies)
 *   - Outcomes (measurable or stated results)
 *   - Actors (organizations, persons, funders, contractors, regulators)
 * 
 * This module is called by the unified extraction pipeline (lib/ai/extraction.ts)
 * as part of the single-pass LLM call. It does NOT make its own LLM call.
 * 
 * The extraction output is normalized and deduplicated before storage.
 */

import {
  type Program,
  type Event,
  type Problem,
  type Outcome,
  type Actor,
  type IntelligenceNodeType,
} from "@/lib/graph/story-types";

// ═════════════════════════════════════════════════════════════════
// 1. NORMALIZATION
// ═════════════════════════════════════════════════════════════════

/**
 * Normalize a name for deterministic matching.
 * 
 * Rules:
 *  - Lowercase
 *  - Remove punctuation except alphanumeric, spaces, hyphens
 *  - Collapse multiple spaces
 *  - Strip common prefixes/suffixes that don't change identity
 *  - Preserve acronyms (all-caps words)
 */
export function normalizeName(name: string): string {
  if (!name || typeof name !== "string") return "";

  let normalized = name
    .toLowerCase()
    .trim()
    // Remove possessives
    .replace(/\'s\b/g, "")
    // Standardize punctuation to space
    .replace(/[^a-z0-9\-\s]/g, " ")
    // Collapse whitespace
    .replace(/\s+/g, " ")
    .trim();

  // Strip common noise words from the end
  const noiseSuffixes = [
    " project", " program", " initiative", " facility",
    " policy", " mechanism", " framework", " strategy",
    " in zimbabwe", " in africa", " for zimbabwe", " for africa",
  ];
  for (const suffix of noiseSuffixes) {
    if (normalized.endsWith(suffix)) {
      normalized = normalized.slice(0, -suffix.length).trim();
    }
  }

  return normalized;
}

/**
 * Normalize an acronym. Preserves all-caps form.
 */
export function normalizeAcronym(name: string): string {
  const cleaned = name.replace(/[^A-Z0-9]/g, "");
  return cleaned;
}

/**
 * Check if two normalized names represent the same entity.
 * Uses exact match, acronym match, or substantial overlap.
 */
export function namesMatch(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;

  // Acronym match: "ZEFPP" matches "Zimbabwe Emergency Food Production Project"
  const acronymA = normalizeAcronym(a);
  const acronymB = normalizeAcronym(b);
  if (acronymA && acronymB && acronymA === acronymB) return true;

  // Substring match for longer names
  if (na.length > 10 && nb.length > 10) {
    if (na.includes(nb) || nb.includes(na)) return true;
  }

  // Word overlap for multi-word names
  const wordsA = new Set(na.split(" "));
  const wordsB = nb.split(" ");
  const overlap = wordsB.filter((w) => wordsA.has(w)).length;
  const minLen = Math.min(wordsA.size, wordsB.length);
  if (minLen >= 3 && overlap >= minLen * 0.7) return true;

  return false;
}

// ═════════════════════════════════════════════════════════════════
// 2. EXTRACTION SCHEMA (for LLM prompt)
// ═════════════════════════════════════════════════════════════════

/**
 * JSON schema fragment for the LLM extraction prompt.
 * This is embedded into the unified extraction prompt.
 */
export const INTELLIGENCE_EXTRACTION_SCHEMA = {
  programs: {
    type: "array",
    description:
      "Named interventions, initiatives, projects, facilities, policy mechanisms, financing programs, or structured institutional initiatives mentioned in the text. Include acronyms when present. Be specific — 'agricultural project' is too generic; 'Zimbabwe Emergency Food Production Project (ZEFPP)' is specific.",
    items: {
      type: "object",
      properties: {
        name: { type: "string", description: "Full name of the program, including acronym in parentheses if present" },
        type: { type: "string", enum: ["project", "initiative", "facility", "policy", "financing", "program", "other"] },
        description: { type: "string", description: "Brief description of what the program does" },
      },
      required: ["name"],
    },
  },
  events: {
    type: "array",
    description:
      "Specific things that happened or are scheduled to happen: board approvals, program launches, contract awards, equipment handovers, cyclones, report releases, tender publications, project completions. Include temporal information when available.",
    items: {
      type: "object",
      properties: {
        name: { type: "string", description: "Name or description of the event" },
        eventType: { type: "string", enum: ["approval", "launch", "award", "completion", "occurrence", "release", "trigger", "other"] },
        temporalInfo: { type: "string", description: "Date or time reference (ISO date if available, otherwise free text)" },
        description: { type: "string" },
      },
      required: ["name"],
    },
  },
  problems: {
    type: "array",
    description:
      "Conditions, constraints, risks, crises, deficiencies, or challenges that an intervention attempts to address. Be specific about the problem domain.",
    items: {
      type: "object",
      properties: {
        name: { type: "string", description: "Name of the problem" },
        severity: { type: "string", enum: ["critical", "high", "medium", "low"] },
        description: { type: "string" },
      },
      required: ["name"],
    },
  },
  outcomes: {
    type: "array",
    description:
      "Measurable or stated results: households reached, yield improvements, roadmaps produced, risk maps created, equipment installed. Include specific metrics when present.",
    items: {
      type: "object",
      properties: {
        name: { type: "string", description: "Description of the outcome" },
        metric: { type: "string", description: "Specific measurement if available (e.g. '188,000 households', '4.5 MT/ha')" },
        description: { type: "string" },
      },
      required: ["name"],
    },
  },
  actors: {
    type: "array",
    description:
      "Organizations, government bodies, persons, implementers, funders, contractors, regulators, or other participants. Include their role if stated.",
    items: {
      type: "object",
      properties: {
        name: { type: "string", description: "Name of the actor" },
        actorType: { type: "string", enum: ["organization", "government", "person", "funder", "contractor", "regulator", "implementer", "other"] },
        description: { type: "string", description: "Role or context" },
      },
      required: ["name"],
    },
  },
} as const;

// ═════════════════════════════════════════════════════════════════
// 3. EXTRACTION RESULT TYPE
// ═════════════════════════════════════════════════════════════════

export interface RawIntelligenceExtraction {
  programs: Array<{
    name: string;
    type?: string;
    description?: string;
  }>;
  events: Array<{
    name: string;
    eventType?: string;
    temporalInfo?: string;
    description?: string;
  }>;
  problems: Array<{
    name: string;
    severity?: string;
    description?: string;
  }>;
  outcomes: Array<{
    name: string;
    metric?: string;
    description?: string;
  }>;
  actors: Array<{
    name: string;
    actorType?: string;
    description?: string;
  }>;
}

// ═════════════════════════════════════════════════════════════════
// 4. NORMALIZATION & DEDUPLICATION
// ═════════════════════════════════════════════════════════════════

/**
 * Deduplicate extracted items by normalized name.
 * Keeps the first occurrence (usually the most complete mention).
 */
function deduplicateByName<T extends { name: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const key = normalizeName(item.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

/**
 * Validate and normalize a raw extraction into typed intelligence nodes.
 * 
 * This is a pure function — no database access, no LLM calls.
 */
export function normalizeIntelligenceExtraction(
  raw: RawIntelligenceExtraction,
  evidenceId: number
): {
  programs: Program[];
  events: Event[];
  problems: Problem[];
  outcomes: Outcome[];
  actors: Actor[];
} {
  const programs = deduplicateByName(raw.programs || []).map((p, idx) => ({
    id: -(evidenceId * 1000 + idx + 1), // Temporary negative IDs; replaced by DB on insert
    name: p.name.trim(),
    normalizedName: normalizeName(p.name),
    description: p.description?.trim() || undefined,
    type: isValidProgramType(p.type) ? p.type : undefined,
  }));

  const events = deduplicateByName(raw.events || []).map((e, idx) => ({
    id: -(evidenceId * 1000 + idx + 1),
    name: e.name.trim(),
    normalizedName: normalizeName(e.name),
    description: e.description?.trim() || undefined,
    temporalInfo: e.temporalInfo?.trim() || undefined,
    eventType: isValidEventType(e.eventType) ? e.eventType : undefined,
  }));

  const problems = deduplicateByName(raw.problems || []).map((p, idx) => ({
    id: -(evidenceId * 1000 + idx + 1),
    name: p.name.trim(),
    normalizedName: normalizeName(p.name),
    description: p.description?.trim() || undefined,
    severity: isValidSeverity(p.severity) ? p.severity : undefined,
  }));

  const outcomes = deduplicateByName(raw.outcomes || []).map((o, idx) => ({
    id: -(evidenceId * 1000 + idx + 1),
    name: o.name.trim(),
    normalizedName: normalizeName(o.name),
    description: o.description?.trim() || undefined,
    metric: o.metric?.trim() || undefined,
  }));

  const actors = deduplicateByName(raw.actors || []).map((a, idx) => ({
    id: -(evidenceId * 1000 + idx + 1),
    name: a.name.trim(),
    normalizedName: normalizeName(a.name),
    actorType: isValidActorType(a.actorType) ? a.actorType : undefined,
  }));

  return { programs, events, problems, outcomes, actors };
}

// ── Type Guards ─────────────────────────────────────────────────

function isValidProgramType(t: string | undefined): t is Program["type"] {
  if (!t) return false;
  return ["project", "initiative", "facility", "policy", "financing", "program", "other"].includes(t);
}

function isValidEventType(t: string | undefined): t is Event["eventType"] {
  if (!t) return false;
  return ["approval", "launch", "award", "completion", "occurrence", "release", "trigger", "other"].includes(t);
}

function isValidSeverity(s: string | undefined): s is Problem["severity"] {
  if (!s) return false;
  return ["critical", "high", "medium", "low"].includes(s);
}

function isValidActorType(t: string | undefined): t is Actor["actorType"] {
  if (!t) return false;
  return ["organization", "government", "person", "funder", "contractor", "regulator", "implementer", "other"].includes(t);
}

// ═════════════════════════════════════════════════════════════════
// 5. SINGLE-DOCUMENT STORY ASSESSMENT
// ═════════════════════════════════════════════════════════════════

/**
 * Assess whether a single evidence item contains a complete
 * problem → intervention → outcome narrative structure.
 * 
 * This is a pure, deterministic function used for single-document
 * story detection (requirement §11).
 */
export interface SingleDocumentAssessment {
  hasProblem: boolean;
  hasIntervention: boolean;
  hasOutcome: boolean;
  hasProgram: boolean;
  hasEvent: boolean;
  narrativeCompletenessScore: number;
  canBeSingleDocumentStory: boolean;
  assessmentReason: string;
}

export function assessSingleDocumentStory(
  intelligence: {
    programs: Program[];
    events: Event[];
    problems: Problem[];
    outcomes: Outcome[];
    actors: Actor[];
  },
  config?: { singleDocumentMinimumScore?: number }
): SingleDocumentAssessment {
  const hasProblem = intelligence.problems.length > 0;
  const hasProgram = intelligence.programs.length > 0;
  const hasEvent = intelligence.events.length > 0;
  const hasOutcome = intelligence.outcomes.length > 0;

  // Intervention can be a program OR an event OR a specific actor action
  const hasIntervention = hasProgram || hasEvent || intelligence.actors.length >= 2;

  // Completeness scoring: require at least problem + intervention + outcome
  let score = 0;
  if (hasProblem) score += 0.25;
  if (hasIntervention) score += 0.25;
  if (hasOutcome) score += 0.25;
  if (hasProgram) score += 0.15;
  if (hasEvent) score += 0.10;

  const minScore = config?.singleDocumentMinimumScore ?? 0.60;
  const canBeSingleDocumentStory = score >= minScore && hasProblem && hasIntervention && hasOutcome;

  const reasons: string[] = [];
  if (hasProblem) reasons.push("identifies a problem");
  if (hasProgram) reasons.push("names a specific program");
  if (hasEvent) reasons.push("describes an event");
  if (hasOutcome) reasons.push("states an outcome");
  if (!hasProblem) reasons.push("missing problem statement");
  if (!hasIntervention) reasons.push("missing intervention/program");
  if (!hasOutcome) reasons.push("missing outcome");

  return {
    hasProblem,
    hasIntervention,
    hasOutcome,
    hasProgram,
    hasEvent,
    narrativeCompletenessScore: parseFloat(score.toFixed(3)),
    canBeSingleDocumentStory,
    assessmentReason: reasons.join("; "),
  };
}

// ═════════════════════════════════════════════════════════════════
// 6. PROMPT BUILDER
// ═════════════════════════════════════════════════════════════════

/**
 * Build the intelligence extraction section of the unified LLM prompt.
 * This is injected into the main extraction prompt in lib/ai/extraction.ts.
 */
export function buildIntelligenceExtractionPrompt(): string {
  return `## Intelligence Node Extraction

Extract the following structured intelligence from the evidence text.
Be specific and concrete. Avoid generic labels.

### Programs
Named interventions, initiatives, projects, facilities, policy mechanisms, financing programs, or structured institutional initiatives.
- GOOD: "Zimbabwe Emergency Food Production Project (ZEFPP)"
- BAD: "agricultural project" (too generic)
- Include acronyms in parentheses when present in the text.

### Events
Specific things that happened or are scheduled: board approvals, launches, awards, handovers, cyclones, report releases, tender publications, completions.
- Include temporal information (dates, quarters, years) when available.

### Problems
Conditions, risks, crises, deficiencies, or challenges addressed by interventions.
- GOOD: "food insecurity caused by global supply shocks"
- BAD: "development challenge" (too generic)

### Outcomes
Measurable or stated results.
- GOOD: "188,000 households reached with inputs"
- BAD: "positive impact" (too generic)
- Include specific metrics when present.

### Actors
Organizations, government bodies, persons, funders, contractors, regulators, implementers.
- Include their stated role (funder, implementer, regulator, etc.).

Return ONLY valid JSON matching this schema:
${JSON.stringify(INTELLIGENCE_EXTRACTION_SCHEMA, null, 2)}`;
}
