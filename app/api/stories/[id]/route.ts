import { NextResponse } from "next/server";
import { db } from "@/db/client";
import {
  stories,
  narratives,
  evidence,
  storyEvidence,
  evidenceEntities,
  timelineEvents,
  entities,
  relationships,
  researchTasks,
  generatedBriefs,
  graphClusters,
} from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id);

    let [story] = db
      .select()
      .from(stories)
      .where(eq(stories.id, id))
      .all();

    let isNarrative = false;
    let narrativeRecord: any = null;

    if (!story) {
      const [narrative] = db
        .select()
        .from(narratives)
        .where(eq(narratives.id, id))
        .all();
      if (narrative) {
        isNarrative = true;
        narrativeRecord = narrative;
        story = {
          id: narrative.id,
          title: narrative.title,
          overview: narrative.overview || "",
          status: narrative.status || "draft",
          createdBy: narrative.createdBy,
          createdAt: narrative.createdAt,
          updatedAt: narrative.createdAt,
        } as any;
      }
    }

    if (!story) {
      return NextResponse.json(
        { error: "Story not found" },
        { status: 404 }
      );
    }

    // ─── Resolve Evidence IDs ───
    let evidenceIds: number[] = [];

    if (isNarrative && narrativeRecord) {
      if (narrativeRecord.evidenceIds) {
        try {
          evidenceIds = JSON.parse(narrativeRecord.evidenceIds);
        } catch { /* ignore */ }
      }

      if (evidenceIds.length === 0 && narrativeRecord.clusterIds) {
        try {
          const clusterIds: number[] = JSON.parse(narrativeRecord.clusterIds);
          for (const cid of clusterIds) {
            const [cluster] = db
              .select()
              .from(graphClusters)
              .where(eq(graphClusters.id, cid))
              .all();
            if (cluster?.evidenceIds) {
              evidenceIds.push(...JSON.parse(cluster.evidenceIds));
            }
          }
          evidenceIds = [...new Set(evidenceIds)];
        } catch { /* ignore */ }
      }
    } else {
      const links = db
        .select()
        .from(storyEvidence)
        .where(eq(storyEvidence.storyId, id))
        .all();
      for (const link of links) {
        evidenceIds.push(link.evidenceId);
      }
    }

    // ─── Fetch Evidence ───
    let evidenceList: any[] = [];
    for (const eid of evidenceIds) {
      const rows = db
        .select()
        .from(evidence)
        .where(eq(evidence.id, eid))
        .all();
      evidenceList.push(...rows);
    }

    // ─── Timeline Events ───
    let timelineList: any[] = [];
    for (const ev of evidenceList) {
      const rows = db
        .select()
        .from(timelineEvents)
        .where(eq(timelineEvents.evidenceId, ev.id))
        .all();
      timelineList.push(...rows);
    }
    const seenTl = new Set<number>();
    timelineList = timelineList.filter((t) => {
      if (seenTl.has(t.id)) return false;
      seenTl.add(t.id);
      return true;
    });

    // ─── Entities ───
    let entityList: any[] = [];
    for (const ev of evidenceList) {
      const links = db
        .select()
        .from(evidenceEntities)
        .where(eq(evidenceEntities.evidenceId, ev.id))
        .all();
      for (const link of links) {
        const [ent] = db
          .select()
          .from(entities)
          .where(eq(entities.id, link.entityId))
          .all();
        if (ent && !entityList.find((e) => e.id === ent.id)) {
          entityList.push(ent);
        }
      }
    }

    // ─── Relationships ───
    let relationshipList: any[] = [];
    for (const ev of evidenceList) {
      const rows = db
        .select()
        .from(relationships)
        .where(
          eq(relationships.evidenceIds, JSON.stringify([ev.id]))
        )
        .all();
      relationshipList.push(...rows);
    }
    const seenRel = new Set<number>();
    relationshipList = relationshipList.filter((r) => {
      if (seenRel.has(r.id)) return false;
      seenRel.add(r.id);
      return true;
    });

    // ─── Tasks & Briefs (manual only) ───
    let taskList: any[] = [];
    let briefList: any[] = [];
    if (!isNarrative) {
      taskList = db
        .select()
        .from(researchTasks)
        .where(eq(researchTasks.storyId, id))
        .all();
      briefList = db
        .select()
        .from(generatedBriefs)
        .where(eq(generatedBriefs.storyId, id))
        .all();
    }

    return NextResponse.json({
      story,
      isNarrative,
      linkedEvidence: evidenceList,
      linkedEntities: entityList,
      timelineEvents: timelineList,
      relationships: relationshipList,
      researchTasks: taskList,
      generatedBriefs: briefList,
    });
  } catch (error: any) {
    console.error("Get story error:", error);
    return NextResponse.json(
      { error: "Failed to fetch story" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id);
    const body = await request.json();

    db.update(stories)
      .set({
        ...body,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(stories.id, id))
      .run();

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Patch story error:", error);
    return NextResponse.json(
      { error: "Failed to update story" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id);

    db.delete(storyEvidence)
      .where(eq(storyEvidence.storyId, id))
      .run();
    db.delete(researchTasks)
      .where(eq(researchTasks.storyId, id))
      .run();
    db.delete(generatedBriefs)
      .where(eq(generatedBriefs.storyId, id))
      .run();
    db.delete(stories)
      .where(eq(stories.id, id))
      .run();

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Delete story error:", error);
    return NextResponse.json(
      { error: "Failed to delete story" },
      { status: 500 }
    );
  }
}
