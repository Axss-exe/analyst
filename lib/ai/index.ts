/**
 * ATIS v4 — AI Layer Barrel Exports
 * 
 * Central export point for all AI-related modules.
 * 
 * v3 exports preserved.
 * v4 exports added.
 */

// ── v3: Core AI generation ──────────────────────────────────────
export { generateWithAI } from "./generate";

// ── v3: Entity extraction ───────────────────────────────────────
export {
  extractEntitiesFromText,
  extractTimelineEvents,
} from "./entities";

// ── v3: Topic extraction ────────────────────────────────────────
export { extractTopicsFromText } from "./topics";

// ── v3: Confidence scoring ──────────────────────────────────────
export { calculateConfidence } from "./confidence";

// ── v3: Story generation ────────────────────────────────────────
export {
  generateStoryFromEvidence,
  generateNarrativeFromCluster,
} from "./stories";

// ── v3: Relationship extraction (legacy signature) ──────────────
export { extractRelationshipsFromText } from "./relationships";

// ── v4: Unified extraction (replaces v3 single-pass) ────────────
export {
  extractStructuredFacts,
  extractFacts, // v3 backward-compatible wrapper
  type UnifiedExtractionResult,
} from "./extraction";

// ── v4: Intelligence node extraction ────────────────────────────
export {
  normalizeName,
  normalizeAcronym,
  namesMatch,
  normalizeIntelligenceExtraction,
  assessSingleDocumentStory,
  buildIntelligenceExtractionPrompt,
  INTELLIGENCE_EXTRACTION_SCHEMA,
  type RawIntelligenceExtraction,
  type SingleDocumentAssessment,
} from "./programs";

// ── v4: Typed relationship extraction (TURN 4) ──────────────────
export {
  extractStoryBearingRelationships,
  buildRelationshipExtractionPrompt,
  type RawRelationshipExtraction,
} from "./relationship-extraction";
