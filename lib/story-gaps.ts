/**
 * ATIS Story Continuity — Gap Analyzer
 *
 * Determines what a story already knows vs. what it lacks by inspecting:
 * - Causal chain completeness (problem → intervention → outcome)
 * - Claim support (single-source / low-confidence facts)
 * - Missing entity relationships
 * - Temporal gaps
 * - Actor role clarity
 * - Quantitative metrics for outcomes
 */
import { db } from "@/db";
import {
  stories,
  storyEvidence,
  evidence,
  facts,
  entities,
  evidenceEntities,
  relationships,
  timelineEvents,
  evidenceStoryAssessment,
  evidencePrograms,
  evidenceProblems,
  evidenceOutcomes,
  evidenceActors,
  evidenceEvents,
  programs,
  problems,
  outcomes,
  actors,
  events,
} from "@/db/schema";
import { eq, inArray, sql } from "drizzle-orm";

export type GapType =
  | "causal_chain"
  | "unsupported_claim"
  | "missing_relationship"
  | "temporal_gap"
  | "actor_gap"
  | "metric_gap"
  | "geographic_gap";

export type GapSeverity = "critical" | "high" | "medium" | "low";

export interface StoryGap {
  type: GapType;
  severity: GapSeverity;
  description: string;
  details: string;
  suggestedQuestion: string;
}

export interface GapAnalysis {
  storyId: number;
  evidenceCount: number;
  gaps: StoryGap[];
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
}

/**
 * Analyze a story for knowledge gaps.
 */
export async function analyzeStoryGaps(storyId: number): Promise<GapAnalysis> {
  const gaps: StoryGap[] = [];

  // ── Load story evidence ──
  const links = db
    .select({ evidenceId: storyEvidence.evidenceId })
    .from(storyEvidence)
    .where(eq(storyEvidence.storyId, storyId))
    .all();
  const evidenceIds = links.map((l) => l.evidenceId);

  if (evidenceIds.length === 0) {
    return {
      storyId,
      evidenceCount: 0,
      gaps: [
        {
          type: "causal_chain",
          severity: "critical",
          description: "Story has no evidence attached",
          details: "Cannot perform gap analysis on an empty story.",
          suggestedQuestion: "Upload evidence relevant to this story.",
        },
      ],
      summary: { critical: 1, high: 0, medium: 0, low: 0 },
    };
  }

  // ── Load facts & assessments ──
  const factRows = db
    .select()
    .from(facts)
    .where(inArray(facts.evidenceId, evidenceIds))
    .all();

  const assessments = db
    .select()
    .from(evidenceStoryAssessment)
    .where(inArray(evidenceStoryAssessment.evidenceId, evidenceIds))
    .all();

  // ── Causal chain analysis ──
  const hasProblem = assessments.some((a) => a.hasProblem);
  const hasIntervention = assessments.some((a) => a.hasIntervention);
  const hasOutcome = assessments.some((a) => a.hasOutcome);
  const hasProgram = assessments.some((a) => a.hasProgram);
  const hasEvent = assessments.some((a) => a.hasEvent);

  if (hasProblem && !hasIntervention) {
    gaps.push({
      type: "causal_chain",
      severity: "critical",
      description: "Problem identified but no intervention documented",
      details:
        "The narrative contains problem statements, but lacks evidence of actions, policies, or programs implemented to address them.",
      suggestedQuestion:
        "What interventions, policies, or programs have been implemented to address the identified problem?",
    });
  }

  if (hasIntervention && !hasOutcome) {
    gaps.push({
      type: "causal_chain",
      severity: "high",
      description: "Interventions documented but outcomes are missing",
      details:
        "There are documented actions or programs, but no measurable results, effects, or impact assessments.",
      suggestedQuestion:
        "What were the measurable outcomes or effects of the documented interventions?",
    });
  }

  if (hasProgram && !hasProblem) {
    gaps.push({
      type: "causal_chain",
      severity: "medium",
      description: "Programs exist but problem definition is unclear",
      details:
        "Programs or initiatives are described without clear articulation of the specific problem or need they address.",
      suggestedQuestion:
        "What specific problem or need does this program address?",
    });
  }

  if (!hasEvent && evidenceIds.length >= 2) {
    gaps.push({
      type: "causal_chain",
      severity: "low",
      description: "No specific events documented in the timeline",
      details:
        "The story lacks discrete, dated events that would anchor the narrative chronologically.",
      suggestedQuestion:
        "What are the key milestone events with specific dates in this story?",
    });
  }

  // ── Unsupported claims analysis ──
  const subjectCounts: Record<string, number> = {};
  const subjectConfidence: Record<string, number> = {};
  for (const fact of factRows) {
    const key = fact.subject.toLowerCase().trim();
    subjectCounts[key] = (subjectCounts[key] || 0) + 1;
    subjectConfidence[key] = Math.min(
      subjectConfidence[key] ?? 1,
      fact.confidence ?? 0.5,
    );
  }

  for (const [subject, count] of Object.entries(subjectCounts)) {
    if (count === 1 && (subjectConfidence[subject] ?? 1) < 0.65) {
      const fact = factRows.find(
        (f) => f.subject.toLowerCase().trim() === subject,
      );
      gaps.push({
        type: "unsupported_claim",
        severity: "medium",
        description: `Low-confidence claim about "${subject}" supported by only one source`,
        details: `Fact: ${fact?.subject} ${fact?.predicate} ${fact?.object} (confidence: ${fact?.confidence ?? 0.5}). This claim needs corroboration.`,
        suggestedQuestion: `Can the claim about "${subject}" be corroborated by additional independent sources?`,
      });
    }
  }

  // ── Missing relationships between co-occurring entities ──
  const entityLinks = db
    .select({ entityId: evidenceEntities.entityId })
    .from(evidenceEntities)
    .where(inArray(evidenceEntities.evidenceId, evidenceIds))
    .all();
  const entityIds = [...new Set(entityLinks.map((e) => e.entityId))];

  if (entityIds.length >= 2) {
    const existingRels = db
      .select()
      .from(relationships)
      .where(
        sql`${relationships.sourceId} IN (${entityIds.join(",")}) AND ${relationships.targetId} IN (${entityIds.join(",")})`,
      )
      .all();

    const coveredPairs = new Set<string>();
    for (const rel of existingRels) {
      const pair = `${Math.min(rel.sourceId, rel.targetId)}-${Math.max(rel.sourceId, rel.targetId)}`;
      coveredPairs.add(pair);
    }

    let missingCount = 0;
    for (let i = 0; i < entityIds.length && missingCount < 5; i++) {
      for (let j = i + 1; j < entityIds.length && missingCount < 5; j++) {
        const pair = `${Math.min(entityIds[i], entityIds[j])}-${Math.max(entityIds[i], entityIds[j])}`;
        if (!coveredPairs.has(pair)) {
          missingCount++;
          const entA = db
            .select({ name: entities.name })
            .from(entities)
            .where(eq(entities.id, entityIds[i]))
            .get();
          const entB = db
            .select({ name: entities.name })
            .from(entities)
            .where(eq(entities.id, entityIds[j]))
            .get();
          gaps.push({
            type: "missing_relationship",
            severity: "medium",
            description: `No documented relationship between ${entA?.name || "Entity A"} and ${entB?.name || "Entity B"}`,
            details:
              "Both entities appear in story evidence but no explicit connection has been extracted. This may indicate an unexplored causal or operational link.",
            suggestedQuestion: `What is the relationship between ${entA?.name || "Entity A"} and ${entB?.name || "Entity B"}?`,
          });
        }
      }
    }
  }

  // ── Temporal gaps ──
  const timelineRows = db
    .select()
    .from(timelineEvents)
    .where(inArray(timelineEvents.evidenceId, evidenceIds))
    .all();

  if (timelineRows.length >= 2) {
    const dates = timelineRows
      .map((t) => new Date(t.date).getTime())
      .filter((d) => !isNaN(d))
      .sort((a, b) => a - b);

    let maxGap = 0;
    let maxGapStart = "";
    let maxGapEnd = "";

    for (let i = 1; i < dates.length; i++) {
      const gapMs = dates[i] - dates[i - 1];
      const days = gapMs / (1000 * 60 * 60 * 24);
      if (days > maxGap) {
        maxGap = days;
        maxGapStart = new Date(dates[i - 1]).toISOString().split("T")[0];
        maxGapEnd = new Date(dates[i]).toISOString().split("T")[0];
      }
    }

    if (maxGap > 365) {
      gaps.push({
        type: "temporal_gap",
        severity: maxGap > 730 ? "high" : "medium",
        description: `Significant temporal gap of ${Math.round(maxGap)} days`,
        details: `No documented events between ${maxGapStart} and ${maxGapEnd}. This may indicate missing transitional evidence or a lull in activity.`,
        suggestedQuestion: `What happened between ${maxGapStart} and ${maxGapEnd} that connects these events?`,
      });
    }
  }

  // ── Actor role clarity gaps ──
  const actorLinks = db
    .select({ actorId: evidenceActors.actorId })
    .from(evidenceActors)
    .where(inArray(evidenceActors.evidenceId, evidenceIds))
    .all();
  const programLinks = db
    .select({ programId: evidencePrograms.programId })
    .from(evidencePrograms)
    .where(inArray(evidencePrograms.evidenceId, evidenceIds))
    .all();

  if (actorLinks.length > 0 && programLinks.length > 0) {
    const actorIds = [...new Set(actorLinks.map((a) => a.actorId))];
    for (const actorId of actorIds.slice(0, 3)) {
      const actor = db
        .select({ name: actors.name })
        .from(actors)
        .where(eq(actors.id, actorId))
        .get();
      gaps.push({
        type: "actor_gap",
        severity: "low",
        description: `Actor "${actor?.name || "Unknown"}" role needs clarification`,
        details:
          "The actor appears in evidence but their specific role, influence, authority, or actions within the story context need explicit documentation.",
        suggestedQuestion: `What specific role, authority, or actions does ${actor?.name || "this actor"} have in the programs or events described?`,
      });
    }
  }

  // ── Metric / quantitative gaps ──
  const outcomeLinks = db
    .select({ outcomeId: evidenceOutcomes.outcomeId })
    .from(evidenceOutcomes)
    .where(inArray(evidenceOutcomes.evidenceId, evidenceIds))
    .all();

  if (outcomeLinks.length > 0) {
    const hasMetrics = factRows.some((f) => {
      const p = f.predicate.toLowerCase();
      const o = f.object.toLowerCase();
      return (
        p.includes("increased") ||
        p.includes("decreased") ||
        p.includes("percent") ||
        p.includes("million") ||
        p.includes("billion") ||
        p.includes("usd") ||
        p.includes("ton") ||
        o.includes("%") ||
        /\d+/.test(o)
      );
    });

    if (!hasMetrics) {
      gaps.push({
        type: "metric_gap",
        severity: "high",
        description: "Outcomes lack quantitative metrics",
        details:
          "The story references outcomes or effects, but lacks specific numbers, percentages, monetary values, or other measurable indicators to substantiate claims.",
        suggestedQuestion:
          "What quantitative metrics, measurements, or statistics demonstrate the stated outcomes?",
      });
    }
  }

  // ── Geographic coherence gap ──
  const locationFacts = factRows.filter((f) =>
    f.predicate.toLowerCase().includes("located in") ||
    f.predicate.toLowerCase().includes("operates in") ||
    f.predicate.toLowerCase().includes("based in"),
  );
  const locations = new Set(locationFacts.map((f) => f.object.toLowerCase().trim()));
  if (locations.size >= 2 && !hasOutcome) {
    gaps.push({
      type: "geographic_gap",
      severity: "low",
      description: `Multiple geographic locations (${locations.size}) but no outcome linkage`,
      details: `Locations detected: ${[...locations].slice(0, 5).join(", ")}. The geographic scope is broad but it is unclear how activities in different locations connect to outcomes.`,
      suggestedQuestion:
        "How do activities across these different geographic locations connect to produce the observed or claimed outcomes?",
    });
  }

  // ── Build summary ──
  const summary = {
    critical: gaps.filter((g) => g.severity === "critical").length,
    high: gaps.filter((g) => g.severity === "high").length,
    medium: gaps.filter((g) => g.severity === "medium").length,
    low: gaps.filter((g) => g.severity === "low").length,
  };

  return { storyId, evidenceCount: evidenceIds.length, gaps, summary };
}
