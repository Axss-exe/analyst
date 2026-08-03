import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { evidence, evidenceConnections } from "@/db/schema";
import { eq, or, desc } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";

export async function GET(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const user = await requireAuth();
    const id = parseInt(params.id);

    // FIX: Query evidenceConnections to find actually connected evidence
    const connections = db
      .select()
      .from(evidenceConnections)
      .where(
        or(
          eq(evidenceConnections.evidenceIdA, id),
          eq(evidenceConnections.evidenceIdB, id),
        ),
      )
      .orderBy(desc(evidenceConnections.strength))
      .all();

    if (connections.length === 0) {
      return NextResponse.json({ related: [] });
    }

    // Collect related evidence IDs
    const relatedIds = connections
      .map((c) => (c.evidenceIdA === id ? c.evidenceIdB : c.evidenceIdA))
      .filter((v, i, a) => a.indexOf(v) === i);

    if (relatedIds.length === 0) {
      return NextResponse.json({ related: [] });
    }

    // Fetch related evidence records
    const relatedEvidence = db
      .select()
      .from(evidence)
      .where(or(...relatedIds.map((rid) => eq(evidence.id, rid))))
      .all();

    // Map connection metadata onto each related item
    const result = relatedEvidence.map((rel) => {
      const conn = connections.find(
        (c) =>
          (c.evidenceIdA === id && c.evidenceIdB === rel.id) ||
          (c.evidenceIdB === id && c.evidenceIdA === rel.id),
      );
      return {
        ...rel,
        connection: conn
          ? {
              signalType: conn.signalType,
              strength: conn.strength,
              reason: conn.reason,
            }
          : null,
      };
    });

    return NextResponse.json({ related: result });
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Get related evidence error:", error);
    return NextResponse.json(
      { error: "Failed to fetch related evidence" },
      { status: 500 },
    );
  }
}
