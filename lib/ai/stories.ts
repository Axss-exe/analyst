import { generateWithAI } from "./client"
import { ExtractedTopics } from "./topics"

export interface StoryProposal {
  title: string
  overview: string
  confidence: number
  evidenceIds: number[]
  sharedTopics: string[]
  sharedEntities: string[]
  sharedThemes: string[]
  reasoning: string
}

export async function proposeStoryFromEvidence(
  evidenceCluster: Array<{ id: number; title: string; summary: string; topics: ExtractedTopics; entities: string[] }>
): Promise<StoryProposal> {
  const evidenceText = evidenceCluster
    .map((e, i) => `[${i + 1}] ${e.title}\n${e.summary.slice(0, 300)}\nTopics: ${e.topics.topics.join(", ")}\nEntities: ${e.entities.join(", ")}`)
    .join("\n\n---\n\n")

  const prompt = `You are an intelligence analyst reviewing ${evidenceCluster.length} related pieces of evidence.
Your task: propose an intelligence story that connects these evidence items.

Evidence Items:
${evidenceText}

Respond in this exact JSON format:
{
  "title": "Compelling story title (5-10 words)",
  "overview": "2-3 paragraph analytical overview connecting the evidence thematically. Explain the narrative arc, key actors, and significance.",
  "sharedTopics": ["topic1", "topic2"],
  "sharedEntities": ["entity1", "entity2"],
  "sharedThemes": ["theme1", "theme2"],
  "reasoning": "Why these evidence items belong together"
}

Rules:
- Title should be specific and informative, not generic
- Overview must synthesize, not just list the evidence
- Identify the central narrative that connects all pieces
- Note any contradictions or gaps in the evidence
- Only output valid JSON`

  const response = await generateWithAI(prompt, {
    systemPrompt: "You are a senior intelligence analyst who excels at finding connections between disparate evidence and weaving them into coherent narratives.",
    temperature: 0.3,
    maxTokens: 1536,
  })

  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      return {
        title: parsed.title || "Untitled Story Proposal",
        overview: parsed.overview || "",
        confidence: 0.7,
        evidenceIds: evidenceCluster.map(e => e.id),
        sharedTopics: Array.isArray(parsed.sharedTopics) ? parsed.sharedTopics : [],
        sharedEntities: Array.isArray(parsed.sharedEntities) ? parsed.sharedEntities : [],
        sharedThemes: Array.isArray(parsed.sharedThemes) ? parsed.sharedThemes : [],
        reasoning: parsed.reasoning || "",
      }
    }
  } catch {
    // fall through
  }

  const allTopics = new Set<string>()
  const allEntities = new Set<string>()
  evidenceCluster.forEach(e => {
    e.topics.topics.forEach(t => allTopics.add(t))
    e.entities.forEach(ent => allEntities.add(ent))
  })

  return {
    title: `Story: ${evidenceCluster[0].title.slice(0, 40)}...`,
    overview: `A collection of ${evidenceCluster.length} related evidence items sharing themes: ${[...allTopics].slice(0, 5).join(", ")}.`,
    confidence: 0.5,
    evidenceIds: evidenceCluster.map(e => e.id),
    sharedTopics: [...allTopics],
    sharedEntities: [...allEntities],
    sharedThemes: [],
    reasoning: "Fallback proposal based on shared topics and entities.",
  }
}

export async function generateBriefContent(params: {
  storyTitle: string
  storyOverview: string
  evidenceItems: Array<{ title: string; summary: string; source: string }>
  mode: "full" | "partial" | "since_last"
}): Promise<{
  headline: string
  executiveSummary: string
  detailedNarrative: string
  keyFindings: string[]
  references: string[]
}> {
  const evidenceText = params.evidenceItems
    .map((e, i) => `[${i + 1}] ${e.title} - ${e.source}\n${e.summary}`)
    .join("\n\n")

  const prompt = `Generate a professional intelligence brief based on the following evidence.

Story: ${params.storyTitle}
Overview: ${params.storyOverview}
Generation Mode: ${params.mode}

Evidence:
${evidenceText}

Generate the brief in this exact JSON format:
{
  "headline": "Compelling headline summarizing the story",
  "executiveSummary": "2-3 paragraph executive summary",
  "detailedNarrative": "Detailed narrative connecting the evidence",
  "keyFindings": ["Finding 1", "Finding 2", "Finding 3"],
  "references": ["[1] Title - Source", "[2] Title - Source"]
}

Only output valid JSON. No markdown, no explanations.`

  const response = await generateWithAI(prompt, {
    systemPrompt: "You are a senior intelligence analyst writing professional briefs. Base everything on evidence. No speculation.",
    temperature: 0.3,
    maxTokens: 4096,
  })

  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0])
    }
    return {
      headline: params.storyTitle,
      executiveSummary: response.slice(0, 500),
      detailedNarrative: response,
      keyFindings: ["Evidence-based finding pending review"],
      references: params.evidenceItems.map((e, i) => `[${i + 1}] ${e.title} - ${e.source}`),
    }
  } catch {
    return {
      headline: params.storyTitle,
      executiveSummary: response.slice(0, 500),
      detailedNarrative: response,
      keyFindings: ["Evidence-based finding pending review"],
      references: params.evidenceItems.map((e, i) => `[${i + 1}] ${e.title} - ${e.source}`),
    }
  }
}
