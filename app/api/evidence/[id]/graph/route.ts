import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db/client"
import { evidence, evidenceEntities, entities, relationships } from "@/db/schema"
import { eq, or, inArray } from "drizzle-orm"
import { requireAuth } from "@/lib/auth"

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireAuth()
    const evidenceId = parseInt(params.id)
    if (isNaN(evidenceId)) {
      return NextResponse.json({ error: "Invalid evidence ID" }, { status: 400 })
    }

    // Verify evidence exists
    const item = db.select({ id: evidence.id }).from(evidence).where(eq(evidence.id, evidenceId)).get()
    if (!item) {
      return NextResponse.json({ error: "Evidence not found" }, { status: 404 })
    }

    // Get entities linked to this evidence
    const linkedEntityRows = db.select({ entityId: evidenceEntities.entityId })
      .from(evidenceEntities)
      .where(eq(evidenceEntities.evidenceId, evidenceId))
      .all()
    const linkedEntityIds = linkedEntityRows.map(r => r.entityId)

    if (linkedEntityIds.length === 0) {
      return NextResponse.json({ nodes: [], edges: [] })
    }

    // Get all relationships where at least one endpoint is linked to this evidence
    const relRows = db.select({
      id: relationships.id,
      sourceId: relationships.sourceId,
      targetId: relationships.targetId,
      type: relationships.type,
      confidence: relationships.confidence,
    }).from(relationships)
      .where(or(
        inArray(relationships.sourceId, linkedEntityIds),
        inArray(relationships.targetId, linkedEntityIds)
      ))
      .all()

    // Collect all entity IDs involved (both linked and related via relationships)
    const allEntityIds = new Set<number>(linkedEntityIds)
    relRows.forEach(r => {
      allEntityIds.add(r.sourceId)
      allEntityIds.add(r.targetId)
    })

    // Fetch all involved entities
    const allEntities = db.select({
      id: entities.id,
      name: entities.name,
      type: entities.type,
    }).from(entities)
      .where(inArray(entities.id, [...allEntityIds]))
      .all()

    const isDirectlyLinked = new Set(linkedEntityIds)

    const nodes = allEntities.map((e) => ({
      id: String(e.id),
      label: e.name,
      type: e.type,
      isDirect: isDirectlyLinked.has(e.id),
    }))

    const edges = relRows.map((r) => ({
      id: String(r.id),
      source: String(r.sourceId),
      target: String(r.targetId),
      label: r.type,
      confidence: r.confidence,
    }))

    return NextResponse.json({ nodes, edges })
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    console.error("Evidence graph error:", error)
    return NextResponse.json({ error: "Failed to fetch graph data" }, { status: 500 })
  }
}
