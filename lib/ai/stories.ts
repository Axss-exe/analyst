import { generateWithAI } from "./client";
import type { ExtractedTopics } from "./topics";
import type {
  GraphCluster,
  HiddenPath,
  BridgeNode,
  Contradiction,
  ConnectionSignal,
} from "@/types";

export interface StoryProposal {
  title: string;
  overview: string;
  confidence: number;
  evidenceIds: number[];
  sharedTopics: string[];
  sharedEntities: string[];
  sharedThemes: string[];
  reasoning: string;
}

export interface StoryRegenerationEvidence {
  id: number;
  title: string;
  source: string;
  content: string;
  summary: string;
  facts: Array<{ subject: string; predicate: string; object: string; confidence: number }>;
  entities: Array<{ name: string; type: string }>;
  relationships: Array<{ source: string; target: string; type: string; confidence: number }>;
  timelineEvents: Array<{ date: string; title: string; description: string }>;
  events: Array<{ name: string; description: string | null; temporalInfo: string | null }>;
  programs: Array<{ name: string; description: string | null }>;
  problems: Array<{ name: string; description: string | null; severity: string | null }>;
  outcomes: Array<{ name: string; description: string | null; metric: string | null }>;
  actors: Array<{ name: string; actorType: string | null }>;
  assessment: {
    hasProblem: boolean;
    hasIntervention: boolean;
    hasOutcome: boolean;
    hasProgram: boolean;
    hasEvent: boolean;
    narrativeCompletenessScore: number | null;
    assessmentReason: string | null;
  } | null;
}

export async function regenerateStoryFromEvidence(
  storyTitle: string,
  storyOverview: string,
  evidenceItems: StoryRegenerationEvidence[],
): Promise<Pick<StoryProposal, "title" | "overview" | "confidence">> {
  const evidenceText = evidenceItems
    .map((e, i) => {
      const facts = e.facts.length > 0
        ? e.facts.map((f) => `${f.subject} ${f.predicate} ${f.object} (${f.confidence.toFixed(2)})`).join("; ")
        : "None";
      const entities = e.entities.length > 0
        ? e.entities.map((entity) => `${entity.name} [${entity.type}]`).join(", ")
        : "None";
      const relationships = e.relationships.length > 0
        ? e.relationships.map((r) => `${r.source} -${r.type}-> ${r.target} (${r.confidence.toFixed(2)})`).join("; ")
        : "None";
      const timeline = e.timelineEvents.length > 0
        ? e.timelineEvents.map((event) => `${event.date}: ${event.title} - ${event.description}`).join("; ")
        : "None";
      const intelligence = [
        ...e.programs.map((program) => `Program: ${program.name}${program.description ? ` (${program.description})` : ""}`),
        ...e.events.map((event) => `Event: ${event.name}${event.description ? ` (${event.description})` : ""}${event.temporalInfo ? ` [${event.temporalInfo}]` : ""}`),
        ...e.problems.map((problem) => `Problem: ${problem.name}${problem.description ? ` (${problem.description})` : ""}${problem.severity ? ` [${problem.severity}]` : ""}`),
        ...e.outcomes.map((outcome) => `Outcome: ${outcome.name}${outcome.description ? ` (${outcome.description})` : ""}${outcome.metric ? ` [metric: ${outcome.metric}]` : ""}`),
        ...e.actors.map((actor) => `Actor: ${actor.name}${actor.actorType ? ` [${actor.actorType}]` : ""}`),
      ].join("; ") || "None";
      const assessment = e.assessment
        ? `problem=${e.assessment.hasProblem}, intervention=${e.assessment.hasIntervention}, outcome=${e.assessment.hasOutcome}, program=${e.assessment.hasProgram}, event=${e.assessment.hasEvent}, completeness=${e.assessment.narrativeCompletenessScore ?? "unknown"}, reason=${e.assessment.assessmentReason || "none"}`
        : "None";

      const card = `[${i + 1}] ${e.title}
    Source: ${e.source}
    Evidence summary: ${e.summary.slice(0, 500)}
    Content excerpt: ${e.content.slice(0, 700)}
    Facts: ${facts}
    Entities: ${entities}
    Relationships: ${relationships}
    Timeline: ${timeline}
    Extracted intelligence: ${intelligence}
    Assessment: ${assessment}`;

      return card.length > 2400 ? `${card.slice(0, 2390)}...` : card;
    })
    .join("\n\n---\n\n");

  const prompt = `You are re-evaluating an existing intelligence story using its authoritative current evidence set.

Existing story title: ${storyTitle}
Existing story overview: ${storyOverview}

CURRENT AUTHORITATIVE EVIDENCE (${evidenceItems.length} items):
${evidenceText}

Reassess the story using all current evidence, including newly attached evidence. Incorporate corroboration and contradictions. Do not invent facts or connections not supported by the evidence. Synthesize the evidence into one coherent story rather than summarizing documents individually. Confidence must reflect the strength, consistency, and completeness of the evidence.

Respond with only valid JSON in this exact format:
{
  "title": "Updated specific intelligence story title",
  "overview": "A synthesized analytical overview explaining the narrative arc, actors, chronology, significance, corroboration, contradictions, and remaining uncertainty.",
  "confidence": 0.0
}`;

  const response = await generateWithAI(prompt, {
    systemPrompt:
      "You are a senior intelligence analyst reassessing an existing story. Use only the supplied evidence and extracted intelligence.",
    temperature: 0.2,
    maxTokens: 2048,
  });

  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Story regeneration returned invalid JSON");
  }

  let parsed: any;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    throw new Error("Story regeneration returned invalid JSON");
  }

  const title = typeof parsed.title === "string" ? parsed.title.trim() : "";
  const overview = typeof parsed.overview === "string" ? parsed.overview.trim() : "";
  const confidence = typeof parsed.confidence === "number" ? parsed.confidence : NaN;
  if (!title || !overview || !Number.isFinite(confidence)) {
    throw new Error("Story regeneration response is missing title, overview, or confidence");
  }

  return {
    title,
    overview,
    confidence: Math.max(0, Math.min(1, confidence)),
  };
}

export async function proposeStoryFromEvidence(
  evidenceCluster: Array<{
    id: number;
    title: string;
    summary: string;
    topics: ExtractedTopics;
    entities: string[];
  }>,
): Promise<StoryProposal> {
  const evidenceText = evidenceCluster
    .map(
      (e, i) =>
        `[${i + 1}] ${e.title}\n${e.summary.slice(0, 300)}\nTopics: ${e.topics.topics.join(", ")}\nEntities: ${e.entities.join(", ")}`,
    )
    .join("\n\n---\n\n");

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
- Only output valid JSON`;

  const response = await generateWithAI(prompt, {
    systemPrompt:
      "You are a senior intelligence analyst who excels at finding connections between disparate evidence and weaving them into coherent narratives.",
    temperature: 0.3,
    maxTokens: 1536,
  });

  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        title: parsed.title || "Untitled Story Proposal",
        overview: parsed.overview || "",
        confidence: 0.7,
        evidenceIds: evidenceCluster.map((e) => e.id),
        sharedTopics: Array.isArray(parsed.sharedTopics)
          ? parsed.sharedTopics
          : [],
        sharedEntities: Array.isArray(parsed.sharedEntities)
          ? parsed.sharedEntities
          : [],
        sharedThemes: Array.isArray(parsed.sharedThemes)
          ? parsed.sharedThemes
          : [],
        reasoning: parsed.reasoning || "",
      };
    }
  } catch {
    // fall through
  }

  const allTopics = new Set<string>();
  const allEntities = new Set<string>();
  evidenceCluster.forEach((e) => {
    e.topics.topics.forEach((t) => allTopics.add(t));
    e.entities.forEach((ent) => allEntities.add(ent));
  });

  return {
    title: `Story: ${evidenceCluster[0].title.slice(0, 40)}...`,
    overview: `A collection of ${evidenceCluster.length} related evidence items sharing themes: ${[...allTopics].slice(0, 5).join(", ")}.`,
    confidence: 0.5,
    evidenceIds: evidenceCluster.map((e) => e.id),
    sharedTopics: [...allTopics],
    sharedEntities: [...allEntities],
    sharedThemes: [],
    reasoning: "Fallback proposal based on shared topics and entities.",
  };
}

export async function generateBriefContent(params: {
  storyTitle: string;
  storyOverview: string;
  evidenceItems: Array<{ title: string; summary: string; source: string }>;
  mode: "full" | "partial" | "since_last";
}): Promise<{
  headline: string;
  executiveSummary: string;
  detailedNarrative: string;
  keyFindings: string[];
  references: string[];
}> {
  const evidenceText = params.evidenceItems
    .map((e, i) => `[${i + 1}] ${e.title} - ${e.source}\n${e.summary}`)
    .join("\n\n");

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

Only output valid JSON. No markdown, no explanations.`;

  const response = await generateWithAI(prompt, {
    systemPrompt:
      "You are a senior intelligence analyst writing professional briefs. Base everything on evidence. No speculation.",
    temperature: 0.3,
    maxTokens: 4096,
  });

  try {
    // Try to extract JSON from markdown code blocks first
    let jsonText = response;

    const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonText = codeBlockMatch[1].trim();
    } else {
      // Fallback: find the outermost JSON object
      const firstBrace = response.indexOf("{");
      const lastBrace = response.lastIndexOf("}");
      if (firstBrace >= 0 && lastBrace > firstBrace) {
        jsonText = response.slice(firstBrace, lastBrace + 1);
      }
    }

    // Clean common LLM artifacts
    jsonText = jsonText
      .replace(/^[^{]*/, "")   // Remove leading text before {
      .replace(/[^}]*$/, "")   // Remove trailing text after }
      .replace(/^\s*\/\/.*$/gm, "")  // Remove line comments
      .trim();

    const parsed = JSON.parse(jsonText);

    // Validate required fields
    return {
      headline: parsed.headline || params.storyTitle,
      executiveSummary: parsed.executiveSummary || parsed.summary || response.slice(0, 500),
      detailedNarrative: parsed.detailedNarrative || parsed.narrative || response,
      keyFindings: Array.isArray(parsed.keyFindings) ? parsed.keyFindings : ["Evidence-based finding pending review"],
      references: Array.isArray(parsed.references) ? parsed.references : params.evidenceItems.map((e, i) => `[${i + 1}] ${e.title} - ${e.source}`),
    };
  } catch (parseErr: any) {
    console.error("[generateBriefContent] JSON parse failed:", parseErr.message);
    console.error("[generateBriefContent] Raw response:", response.slice(0, 1000));

    // Graceful fallback: structure the raw response
    const lines = response.split("\n").filter((l) => l.trim());
    const headline = lines.find((l) => l.length < 120 && !l.startsWith("{")) || params.storyTitle;

    return {
      headline: headline,
      executiveSummary: response.slice(0, 800),
      detailedNarrative: response,
      keyFindings: ["Evidence-based finding pending review — raw response attached"],
      references: params.evidenceItems.map((e, i) => `[${i + 1}] ${e.title} - ${e.source}`),
    };
  }
}

// ==================== ATIS v3: Graph-Backed Narrative ====================

export interface NarrativeInput {
  cluster: GraphCluster;
  hiddenPaths: HiddenPath[];
  bridgeNodes: BridgeNode[];
  signals: ConnectionSignal[];
  contradictions: Contradiction[];
  evidenceSummaries: Array<{ id: number; title: string; summary: string }>;
}

export async function generateNarrativeFromCluster(
  input: NarrativeInput,
): Promise<{
  title: string;
  overview: string;
  intelligenceBrief: string;
  keyFindings: string[];
  anomalies: string[];
}> {
  const cluster = input.cluster;
  const evidenceText = input.evidenceSummaries
    .map((e, i) => `[${i + 1}] ${e.title}\n${e.summary.slice(0, 400)}`)
    .join("\n\n---\n\n");

  const hiddenPathsText =
    input.hiddenPaths.length > 0
      ? input.hiddenPaths.map((p, i) => `${i + 1}. ${p.explanation}`).join("\n")
      : "None detected.";

  const bridgeNodesText =
    input.bridgeNodes.length > 0
      ? input.bridgeNodes
          .slice(0, 10)
          .map(
            (b, i) =>
              `${i + 1}. ${b.entityName} (connects ${b.connectedEvidenceIds.length} evidence items)`,
          )
          .join("\n")
      : "None detected.";

  const signalsText =
    input.signals.length > 0
      ? summarizeSignals(input.signals)
      : "No inter-evidence signals computed.";

  const contradictionsText =
    input.contradictions.length > 0
      ? input.contradictions
          .map(
            (c, i) =>
              `${i + 1}. About "${c.subject}": "${c.claimA}" vs "${c.claimB}"`,
          )
          .join("\n")
      : "None detected.";

  const prompt = `You are a senior intelligence analyst. The graph reasoning system has identified a cluster of related evidence. Your job is to narrate what the graph discovered — NOT to independently analyze the raw text.

GRAPH CLUSTER DATA:
- Cluster name: ${cluster.name}
- Cluster description: ${cluster.description}
- Evidence items: ${cluster.evidenceIds.length}
- Connection density: ${cluster.density}
- Dominant entities: ${cluster.entityIds.length}

EVIDENCE SUMMARIES:
${evidenceText}

HIDDEN PATHS (indirect connections through intermediate evidence/entities):
${hiddenPathsText}

BRIDGE NODES (entities that connect otherwise distant evidence):
${bridgeNodesText}

CONNECTION SIGNALS (explainable reasons evidence items are linked):
${signalsText}

CONTRADICTIONS (conflicting claims about the same subject):
${contradictionsText}

Respond in this exact JSON format:
{
  "title": "Compelling narrative title (5-10 words)",
  "overview": "2-3 paragraph analytical overview. Explain the narrative arc, key actors, geographic/temporal scope, and significance. Reference graph discoveries explicitly.",
  "intelligenceBrief": "1-2 paragraph executive brief suitable for decision-makers",
  "keyFindings": ["Finding 1", "Finding 2", "Finding 3"],
  "anomalies": ["Any contradictions, gaps, or unusual patterns detected by the graph"]
}

Rules:
- The graph performed the reasoning. You narrate its discoveries.
- Cite specific hidden paths, bridge nodes, and connection signals where relevant.
- Flag contradictions as analytical opportunities, not errors.
- Only output valid JSON. No markdown, no explanations outside JSON.`;

  const response = await generateWithAI(prompt, {
    systemPrompt:
      "You are a senior intelligence analyst narrating graph-backed discoveries. Base everything on the graph data provided. Do not invent connections not supported by the graph.",
    temperature: 0.3,
    maxTokens: 2048,
  });

  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        title: parsed.title || `Narrative: ${cluster.name}`,
        overview: parsed.overview || cluster.description,
        intelligenceBrief: parsed.intelligenceBrief || "",
        keyFindings: Array.isArray(parsed.keyFindings)
          ? parsed.keyFindings
          : [],
        anomalies: Array.isArray(parsed.anomalies) ? parsed.anomalies : [],
      };
    }
  } catch {
    // fall through
  }

  return {
    title: `Narrative: ${cluster.name}`,
    overview: cluster.description,
    intelligenceBrief: `Cluster of ${cluster.evidenceIds.length} evidence items with density ${cluster.density}. ${input.hiddenPaths.length} hidden paths and ${input.contradictions.length} contradictions detected.`,
    keyFindings: [
      `${cluster.evidenceIds.length} evidence items connected by graph signals`,
      `${input.hiddenPaths.length} indirect connections discovered`,
      `${input.contradictions.length} contradictions flagged for review`,
    ],
    anomalies:
      input.contradictions.length > 0
        ? [
            `${input.contradictions.length} conflicting claims detected in cluster`,
          ]
        : [],
  };
}

function summarizeSignals(signals: ConnectionSignal[]): string {
  const byType: Map<string, { count: number; examples: string[] }> = new Map();

  for (const s of signals) {
    const entry = byType.get(s.signalType) || { count: 0, examples: [] };
    entry.count++;
    if (entry.examples.length < 3) entry.examples.push(s.reason);
    byType.set(s.signalType, entry);
  }

  return Array.from(byType.entries())
    .map(
      ([type, data]) =>
        `- ${type}: ${data.count} signal(s). Examples: ${data.examples.join("; ")}`,
    )
    .join("\n");
}
