import { db } from "@/db/client";
import { narratives, evidence, graphClusters, entities, facts, narrativeChecks, evidenceEntities } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";

export async function checkNarrative(narrativeId: number) {
  const [narrative] = db.select().from(narratives).where(eq(narratives.id, narrativeId)).all();
  if (!narrative) throw new Error("Narrative not found");

  const issues: string[] = [];
  let evidenceLinkCount = 0;
  let entityOverlapScore = 0;
  let textQualityScore = 0;
  let factSupportRatio = 0;

  // 1. Evidence links
  let evidenceIds: number[] = [];
  if (narrative.evidenceIds) {
    try { evidenceIds = JSON.parse(narrative.evidenceIds); } catch {}
  }
  if (!evidenceIds.length && narrative.clusterIds) {
    try {
      const cIds: number[] = JSON.parse(narrative.clusterIds);
      for (const cid of cIds) {
        const [cluster] = db.select().from(graphClusters).where(eq(graphClusters.id, cid)).all();
        if (cluster?.evidenceIds) {
          evidenceIds.push(...JSON.parse(cluster.evidenceIds));
        }
      }
      evidenceIds = [...new Set(evidenceIds)];
    } catch {}
  }

  evidenceLinkCount = evidenceIds.length;
  if (evidenceLinkCount === 0) {
    issues.push("No evidence linked to this narrative");
  } else if (evidenceLinkCount < 2) {
    issues.push("Only one evidence item linked; narratives should connect multiple pieces");
  }

  // 2. Entity overlap
  let linkedEntities: any[] = [];
  if (evidenceIds.length > 0) {
    const eLinks = db
      .select()
      .from(evidenceEntities)
      .where(inArray(evidenceEntities.evidenceId, evidenceIds))
      .all();
    const entityIds = [...new Set(eLinks.map(l => l.entityId))];
    if (entityIds.length > 0) {
      linkedEntities = db
        .select()
        .from(entities)
        .where(inArray(entities.id, entityIds))
        .all();
    }
  }

  const narrativeText = `${narrative.title} ${narrative.overview || ""}`.toLowerCase();
  const matchedEntities = linkedEntities.filter(e =>
    narrativeText.includes((e.name || "").toLowerCase())
  );
  entityOverlapScore = linkedEntities.length
    ? matchedEntities.length / linkedEntities.length
    : 0;
  if (entityOverlapScore < 0.3) {
    issues.push("Few linked entities appear in the narrative text");
  }

  // 3. Text quality
  const overview = narrative.overview || "";
  const wordCount = overview.trim().split(/\s+/).filter(Boolean).length;
  textQualityScore = Math.min(wordCount / 100, 1);
  if (wordCount < 50) {
    issues.push("Narrative overview is too short (< 50 words)");
  }

  // 4. Fact support
  if (evidenceIds.length > 0) {
    const factRows = db.select().from(facts).where(inArray(facts.evidenceId, evidenceIds)).all();
    factSupportRatio = Math.min(factRows.length / evidenceIds.length, 1);
    if (factSupportRatio < 0.5) {
      issues.push("Low fact-to-evidence ratio; consider deeper extraction");
    }
  } else {
    factSupportRatio = 0;
  }

  const overall =
    evidenceLinkCount > 0
      ? (evidenceLinkCount * 0.25) + (entityOverlapScore * 0.25) + (textQualityScore * 0.25) + (factSupportRatio * 0.25)
      : 0;

  const status = issues.length === 0 ? "passed" : "failed";

  db.insert(narrativeChecks).values({
    narrativeId,
    evidenceLinkCount,
    entityOverlapScore: Math.round(entityOverlapScore * 100) / 100,
    textQualityScore: Math.round(textQualityScore * 100) / 100,
    factSupportRatio: Math.round(factSupportRatio * 100) / 100,
    overallScore: Math.round(overall * 100) / 100,
    issues: JSON.stringify(issues),
    status,
    checkedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  }).run();

  return {
    status,
    overallScore: Math.round(overall * 100) / 100,
    evidenceLinkCount,
    entityOverlapScore,
    textQualityScore,
    factSupportRatio,
    issues,
  };
}
