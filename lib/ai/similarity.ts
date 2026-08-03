import { generateWithAI } from "./client";
import { ExtractedTopics } from "./topics";

export interface EvidenceSimilarityResult {
  score: number;
  sharedTopics: string[];
  sharedEntities: string[];
  sharedThemes: string[];
  temporalProximity: number;
  reasoning: string;
}

export async function evaluateEvidenceSimilarity(
  evidenceA: {
    title: string;
    summary: string;
    topics: ExtractedTopics;
    entities: string[];
    publicationDate?: string | null;
  },
  evidenceB: {
    title: string;
    summary: string;
    topics: ExtractedTopics;
    entities: string[];
    publicationDate?: string | null;
  },
): Promise<EvidenceSimilarityResult> {
  const prompt = `Compare two pieces of intelligence evidence and assess their similarity.

Evidence A: "${evidenceA.title}"
Summary: ${evidenceA.summary.slice(0, 500)}
Topics: ${evidenceA.topics.topics.join(", ")}
Entities: ${evidenceA.entities.join(", ")}

Evidence B: "${evidenceB.title}"
Summary: ${evidenceB.summary.slice(0, 500)}
Topics: ${evidenceB.topics.topics.join(", ")}
Entities: ${evidenceB.entities.join(", ")}

Respond in this exact JSON format:
{
  "score": 0.75,
  "sharedTopics": ["topic1"],
  "sharedEntities": ["entity1"],
  "sharedThemes": ["theme1"],
  "temporalProximity": 0.8,
  "reasoning": "Brief explanation of why they are similar or different"
}

Score from 0.0 to 1.0:
- 0.0-0.2: Unrelated
- 0.2-0.4: Tangentially related
- 0.4-0.6: Moderately related
- 0.6-0.8: Strongly related
- 0.8-1.0: Very strongly related

Only output valid JSON.`;

  const response = await generateWithAI(prompt, {
    systemPrompt:
      "You are an intelligence comparison engine. Be conservative. High scores require strong thematic and entity overlap.",
    temperature: 0.1,
    maxTokens: 512,
  });

  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        score: Math.max(0, Math.min(1, parsed.score || 0)),
        sharedTopics: Array.isArray(parsed.sharedTopics)
          ? parsed.sharedTopics
          : [],
        sharedEntities: Array.isArray(parsed.sharedEntities)
          ? parsed.sharedEntities
          : [],
        sharedThemes: Array.isArray(parsed.sharedThemes)
          ? parsed.sharedThemes
          : [],
        temporalProximity: Math.max(
          0,
          Math.min(1, parsed.temporalProximity || 0),
        ),
        reasoning: parsed.reasoning || "",
      };
    }
  } catch {
    // fall through
  }

  const aTopics = new Set(evidenceA.topics.topics.map((t) => t.toLowerCase()));
  const bTopics = new Set(evidenceB.topics.topics.map((t) => t.toLowerCase()));
  const sharedT = [...aTopics].filter((t) => bTopics.has(t));

  const aEnts = new Set(evidenceA.entities.map((e) => e.toLowerCase()));
  const bEnts = new Set(evidenceB.entities.map((e) => e.toLowerCase()));
  const sharedE = [...aEnts].filter((e) => bEnts.has(e));

  const topicScore = Math.min(1, sharedT.length / 3);
  const entityScore = Math.min(1, sharedE.length / 2);
  const fallbackScore = topicScore * 0.5 + entityScore * 0.5;

  return {
    score: fallbackScore,
    sharedTopics: sharedT,
    sharedEntities: sharedE,
    sharedThemes: [],
    temporalProximity: 0.5,
    reasoning: `Fallback similarity: ${sharedT.length} shared topics, ${sharedE.length} shared entities`,
  };
}

export async function evaluateStoryRelevance(
  evidenceSummary: string,
  storyTitle: string,
  storyOverview: string,
): Promise<{ score: number; reasoning: string }> {
  const prompt = `Evaluate how relevant this new evidence is to an existing intelligence story.

Story: ${storyTitle}
Story Overview: ${storyOverview}

New Evidence Summary: ${evidenceSummary}

Rate relevance from 0.0 to 1.0 where:
- 0.0: Completely unrelated
- 0.3: Tangentially related
- 0.5: Moderately relevant
- 0.7: Strongly relevant
- 1.0: Directly confirms or contradicts the story

Respond in this JSON format only:
{ "score": 0.75, "reasoning": "Brief explanation of relevance" }`;

  const response = await generateWithAI(prompt, {
    systemPrompt:
      "You are an intelligence matching system. Be conservative with scores. Only high scores for direct relevance.",
    temperature: 0.1,
    maxTokens: 512,
  });

  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        score: Math.max(0, Math.min(1, parsed.score || 0)),
        reasoning: parsed.reasoning || "",
      };
    }
  } catch {
    // fall through
  }

  return { score: 0.3, reasoning: "Unable to evaluate automatically" };
}
