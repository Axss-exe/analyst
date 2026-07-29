import { NextResponse } from "next/server"
import { db } from "@/db/client"
import { entities, relationships } from "@/db/schema"
import { requireAuth } from "@/lib/auth"

export async function GET() {
  try {
    const user = await requireAuth()

    const allEntities = db.select().from(entities).all()
    const allRelationships = db.select().from(relationships).all()

    const nodes = allEntities.map((e) => ({
      id: String(e.id),
      label: e.name,
      type: e.type,
      data: e,
    }))

    const edges = allRelationships.map((r) => ({
      id: String(r.id),
      source: String(r.sourceId),
      target: String(r.targetId),
      label: r.type,
      confidence: r.confidence,
    }))

    return NextResponse.json({ nodes, edges })
  } catch (error: any) {
    if (error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("Graph error:", error)
    return NextResponse.json({ error: "Failed to fetch graph data" }, { status: 500 })
  }
}
