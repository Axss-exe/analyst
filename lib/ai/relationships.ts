/**
 * ATIS v4 — Relationship Extraction (Legacy Adapter)
 * 
 * This module preserves the v3 `extractRelationshipsFromText` signature
 * for backward compatibility while adapting its output to the v4
 * Story-Bearing Relationship format.
 * 
 * New code should use `lib/ai/relationship-extraction.ts` directly.
 */

import { generateWithAI } from "./index";
import {
  type ExtractedRelationship,
} from "@/types";
import {
  type StoryBearingRelationship,
  type RelationshipType,
  getRelationshipTypeWeight,
} from "@/lib/graph/story-types";

// ═════════════════════════════════════════════════════════════════
// 1. v3 BACKWARD-COMPATIBLE EXTRACTION
// ═════════════════════════════════════════════════════════════════

/**
 * Extract generic entity relationships from text.
 * 
 * v3 signature preserved. Returns v3 ExtractedRelationship shapes.
 * These are stored in the `facts` table and used by the v3 graph builder.
 */
export async function extractRelationshipsFromText(text: string): Promise<ExtractedRelationship[]> {
  if (!text || text.trim().length < 50) return [];

  const prompt = `Extract semantic relationships between entities mentioned in this text.

Return a JSON array of objects with:
- source: the subject entity
- target: the object entity  
- type: relationship type (funds, implements, partners_with, regulates, owns, operates, etc.)
- evidence: supporting text snippet
- confidence: 0.0–1.0

Text: ${text.slice(0, 6000)}

Return ONLY the JSON array.`;

  try {
    const response = await generateWithAI(prompt);
    const cleaned = response
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();
    const parsed = JSON.parse(cleaned);

    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((r: unknown): r is Record<string, unknown> => typeof r === "object" && r !== null)
      .map((r) => ({
        source: String(r.source || ""),
        target: String(r.target || ""),
        type: String(r.type || ""),
        evidence: r.evidence ? String(r.evidence) : undefined,
        confidence: typeof r.confidence === "number" ? Math.max(0, Math.min(1, r.confidence)) : 0.8,
      }))
      .filter((r) => r.source && r.target && r.type);
  } catch {
    return [];
  }
}

// ═════════════════════════════════════════════════════════════════
// 2. v4 ADAPTER: Convert v3 relationships to StoryBearing
// ═════════════════════════════════════════════════════════════════

/**
 * Convert v3 ExtractedRelationship objects into v4 StoryBearingRelationship
 * format for storage in the story_relationships table.
 * 
 * This bridges the v3 extraction output with the v4 graph pipeline.
 * 
 * @param relationships — v3 relationships from extractRelationshipsFromText
 * @param evidenceId — the evidence item these relationships were extracted from
 * @returns v4 StoryBearingRelationship array (intra-document only)
 */
export function adaptV3RelationshipsToV4(
  relationships: ExtractedRelationship[],
  evidenceId: number
): StoryBearingRelationship[] {
  return relationships
    .map((rel) => {
      const v4Type = mapV3TypeToV4(rel.type);
      if (!v4Type) return null;

      return {
        sourceEvidenceId: evidenceId,
        targetEvidenceId: evidenceId, // Intra-document: self-referential
        type: v4Type,
        weight: getRelationshipTypeWeight(v4Type),
        confidence: rel.confidence,
        explicit: true,
        reason: rel.evidence || `Extracted relationship: ${rel.source} → ${rel.type} → ${rel.target}`,
      };
    })
    .filter((r): r is StoryBearingRelationship => r !== null);
}

/**
 * Map v3 relationship types to the v4 taxonomy.
 * Returns null if the type cannot be mapped (generic types are dropped).
 */
function mapV3TypeToV4(v3Type: string): RelationshipType | null {
  const mapping: Record<string, RelationshipType> = {
    funds: "funds",
    finances: "funds",
    implements: "implements",
    implements_by: "implements",
    operates: "operationalizes",
    operationalizes: "operationalizes",
    causes: "causes",
    caused_by: "triggered_by",
    triggered_by: "triggered_by",
    triggers: "causes",
    produces: "produces",
    results_in: "results_in",
    leads_to: "results_in",
    addresses: "addresses_problem",
    addresses_problem: "addresses_problem",
    supports: "supports",
    evaluates: "evaluates",
    aligned_with: "aligned_with",
    part_of: "part_of_program",
    part_of_program: "part_of_program",
  };

  const normalized = v3Type.toLowerCase().trim().replace(/\s+/g, "_");
  return mapping[normalized] || null;
}

// ═════════════════════════════════════════════════════════════════
// 3. BATCH CONVERSION UTILITY
// ═════════════════════════════════════════════════════════════════

/**
 * Convert a batch of v3 facts (subject-predicate-object) into
 * candidate v4 relationships.
 * 
 * This is used by the worker pipeline to enrich the relationship
 * graph with causal language detected in v3 facts.
 */
export function factsToCandidateRelationships(
  facts: Array<{ subject: string; predicate: string; object: string; evidenceId: number; confidence: number }>
): StoryBearingRelationship[] {
  const causalPredicates: Record<string, RelationshipType> = {
    "cause": "causes",
    "causes": "causes",
    "trigger": "triggered_by",
    "triggers": "causes",
    "triggered_by": "triggered_by",
    "produce": "produces",
    "produces": "produces",
    "result_in": "results_in",
    "results_in": "results_in",
    "lead_to": "results_in",
    "leads_to": "results_in",
    "address": "addresses_problem",
    "addresses": "addresses_problem",
    "fund": "funds",
    "funds": "funds",
    "finance": "funds",
    "finances": "funds",
    "implement": "implements",
    "implements": "implements",
    "operationalize": "operationalizes",
    "operationalizes": "operationalizes",
  };

  return facts
    .map((fact) => {
      const pred = fact.predicate.toLowerCase().trim().replace(/\s+/g, "_");
      const type = causalPredicates[pred];
      if (!type) return null;

      return {
        sourceEvidenceId: fact.evidenceId,
        targetEvidenceId: fact.evidenceId,
        type,
        weight: getRelationshipTypeWeight(type),
        confidence: fact.confidence,
        explicit: true,
        reason: `Fact extraction: "${fact.subject} ${fact.predicate} ${fact.object}"`,
      };
    })
    .filter((r): r is StoryBearingRelationship => r !== null);
}
