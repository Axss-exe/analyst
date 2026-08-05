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
} from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const id = parseInt(params.id);

    // Try stories table first
    let [story] = db.select().from(stories).where(eq(stories.id, id)).all();

    // If not found, try narratives table (auto-generated stories)
    let isNarrative = false;
    if (!story) {
      const [narrative] = db
        .select()
        .from(narratives)
        .where(eq(narratives.id, id))
        .all();
      if (narrative) {
        isNarrative = true;
        story = {
          id: narrative.id,
          title: narrative.title,
          overview: narrative.overview || "",
          status: "active",
          createdBy: narrative.createdBy,
          createdAt: narrative.createdAt,
          updatedAt: narrative.createdAt,
        } as any;
      }
    }

    if (!story) {
      return NextResponse.json({ error: "Story not found" }, { status: 404 });
    }

    // ─── Linked Evidence ───
    let evidenceList: any[] = [];
    if (isNarrative) {
      const [narrative] = db
        .select()
        .from(narratives)
        .where(eq(narratives.id, id))
        .all();
      const evidenceIds = narrative?.evidenceIds
        ? JSON.parse(narrative.evidenceIds)
        : [];
      for (const eid of evidenceIds) {
        const rows = db
          .select()
          .from(evidence)
          .where(eq(evidence.id, eid))
          .all();
        evidenceList.push(...rows);
      }
    } else {
      const links = db
        .select()
        .from(storyEvidence)
        .where(eq(storyEvidence.storyId, id))
        .all();
      for (const link of links) {
        const [ev] = db
          .select()
          .from(evidence)
          .where(eq(evidence.id, link.evidenceId))
          .all();
        if (ev) evidenceList.push({ ...ev, junction: link });
      }
    }

    // ─── Timeline Events (from linked evidence) ───
    let timelineList: any[] = [];
    if (evidenceList.length > 0) {
      for (const ev of evidenceList) {
        const rows = db
          .select()
          .from(timelineEvents)
          .where(eq(timelineEvents.evidenceId, ev.id))
          .all();
        timelineList.push(...rows);
      }
      // Deduplicate by id
      const seen = new Set<number>();
      timelineList = timelineList.filter((t) => {
        if (seen.has(t.id)) return false;
        seen.add(t.id);
        return true;
      });
    }

    // ─── Linked Entities (from linked evidence) ───
    let entityList: any[] = [];
    if (evidenceList.length > 0) {
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
    }

    // ─── Relationships (from linked evidence) ───
    let relationshipList: any[] = [];
    if (evidenceList.length > 0) {
      for (const ev of evidenceList) {
        const rows = db
          .select()
          .from(relationships)
          .where(eq(relationships.evidenceIds, JSON.stringify([ev.id])))
          .all();
        relationshipList.push(...rows);
      }
      const seen = new Set<number>();
      relationshipList = relationshipList.filter((r) => {
        if (seen.has(r.id)) return false;
        seen.add(r.id);
        return true;
      });
    }

    // ─── Research Tasks & Briefs (manual stories only) ───
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
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const id = parseInt(params.id);
    const body = await request.json();

    // Only update manual stories, not auto-generated narratives
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
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const id = parseInt(params.id);

    db.delete(storyEvidence).where(eq(storyEvidence.storyId, id)).run();
    db.delete(researchTasks).where(eq(researchTasks.storyId, id)).run();
    db.delete(generatedBriefs).where(eq(generatedBriefs.storyId, id)).run();
    db.delete(stories).where(eq(stories.id, id)).run();

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Delete story error:", error);
    return NextResponse.json(
      { error: "Failed to delete story" },
      { status: 500 },
    );
  }
}
