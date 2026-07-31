// Barrel file for backward compatibility
// Prefer importing from sub-modules directly in API routes to minimize bundle size

export { generateWithAI, AIGenerationOptions } from "./client"
export { generateEvidenceSummary } from "./summary"
export { extractTopicsFromText, ExtractedTopics } from "./topics"
export { evaluateEvidenceSimilarity, EvidenceSimilarityResult } from "./similarity"
export { proposeStoryFromEvidence, generateBriefContent, StoryProposal } from "./stories"
export { extractEntitiesFromText, extractTimelineEvents } from "./entities"
export { evaluateStoryRelevance, evaluateSourceConfidence } from "./confidence"
