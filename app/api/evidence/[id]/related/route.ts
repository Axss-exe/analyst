import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { evidence, storyRelationships } from "@/db/schema";
import { eq, or } from "drizzle-orm";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      return NextResponse.json(
        { error: "Invalid evidence ID" },
        { status: 400 }
      );
    }

    // Find all relationships where this evidence is source or target
    const relationships = await db
      .select()
      .from(storyRelationships)
      .where(
        or(
          eq(storyRelationships.sourceEvidenceId, id),
          eq(storyRelationships.targetEvidenceId, id)
        )
      )
      .all();

    if (relationships.length === 0) {
      return NextResponse.json({ related: [] });
    }

    // Collect related evidence IDs
    const relatedIds = new Set<number>();
    for (const rel of relationships) {
      if (rel.sourceEvidenceId !== id) relatedIds.add(rel.sourceEvidenceId);
      if (rel.targetEvidenceId !== id) relatedIds.add(rel.targetEvidenceId);
    }

    // Fetch related evidence details
    const allEvidence = await db
      .select({
        id: evidence.id,
        title: evidence.title,
        source: evidence.source,
        sourceType: evidence.sourceType,
        publicationDate: evidence.publicationDate,
      })
      .from(evidence)
      .all();

    const evidenceMap = new Map(allEvidence.map((e) => [e.id, e]));

    const related = Array.from(relatedIds).map((rid) => {
      const rel = relationships.find(
        (r) => r.sourceEvidenceId === rid || r.targetEvidenceId === rid
      );
      const ev = evidenceMap.get(rid);
      return {
        id: rid,
        title: ev?.title || `Evidence ${rid}`,
        source: ev?.source || null,
        sourceType: ev?.sourceType || null,
        date: ev?.publicationDate || null,
        relationshipType: rel?.relationshipType || "related",
        weight: rel?.weight ?? 0,
        confidence: rel?.confidence ?? 0,
        reason: rel?.reason || null,
      };
    });

    // Sort by weight descending
    related.sort((a, b) => b.weight - a.weight);

    return NextResponse.json({ related });
  } catch (error) {
    console.error(`[api/evidence/${params.id}/related] GET failed:`, error);
    return NextResponse.json(
      { error: "Failed to fetch related evidence" },
      { status: 500 }
    );
  }
}
