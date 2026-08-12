import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import {
  evidence,
  storyCandidates,
  storyCandidateEvidence,
  narratives,
  graphClusters,
} from "@/db/schema";
import { eq, inArray, desc, count } from "drizzle-orm";
import { runDiscoveryPipeline } from "@/lib/worker";

interface ClusterView {
  id: number;
  name: string;
  description: string | null;
  status: string;
  confidence: number;
  evidenceIds: number[];
  narrative: { id: number; title: string; overview: string } | null;
  createdAt: string;
}

export async function GET(request: NextRequest) {
  try {
    const state = await fetchLatestDiscoveryState();
    return NextResponse.json(state);
  } catch (error) {
    console.error("[api/discover] GET failed:", error);
    return NextResponse.json(
      { error: "Failed to fetch discovery state" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, description, evidenceIds = [] } = body;

    const result = await db
      .insert(storyCandidates)
      .values({
        name: title || `Manual Story ${Date.now()}`,
        description: description || null,
        status: "story",
        confidence: 0.5,
        coherenceScore: 0.5,
      })
      .run();

    const candidateId = Number(result.lastInsertRowid);

    if (evidenceIds.length > 0 && candidateId) {
      for (const eid of evidenceIds) {
        await db
          .insert(storyCandidateEvidence)
          .values({ candidateId, evidenceId: eid })
          .run();
      }
    }

    const state = await fetchLatestDiscoveryState();
    return NextResponse.json({ ...state, createdId: candidateId });
  } catch (error) {
    console.error("[api/discover] POST failed:", error);
    return NextResponse.json(
      { error: "Failed to create manual story" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    console.log("[api/discover] Triggering discovery pipeline...");
    const pipelineResult = await runDiscoveryPipeline();

    if (!pipelineResult.success) {
      return NextResponse.json(
        { error: pipelineResult.message || "Discovery pipeline failed" },
        { status: 500 }
      );
    }

    const state = await fetchLatestDiscoveryState();
    return NextResponse.json({
      ...state,
      message: pipelineResult.message,
      candidatesCreated: pipelineResult.candidatesCreated,
    });
  } catch (error: any) {
    console.error("[api/discover] PUT failed:", error);
    return NextResponse.json(
      { error: error.message || "Discovery failed" },
      { status: 500 }
    );
  }
}

async function fetchLatestDiscoveryState() {
  // Counts — .get() returns the row directly, not a Promise
  const totalEvidenceResult = await db.select({ count: count() }).from(evidence).get();
  const totalEvidence = totalEvidenceResult?.count ?? 0;

  const totalCandidatesResult = await db.select({ count: count() }).from(storyCandidates).get();
  const totalCandidates = totalCandidatesResult?.count ?? 0;

  const totalNarrativesResult = await db.select({ count: count() }).from(narratives).get();
  const totalNarratives = totalNarrativesResult?.count ?? 0;

  const totalClustersResult = await db.select({ count: count() }).from(graphClusters).get();
  const totalClusters = totalClustersResult?.count ?? 0;

  // Build cluster views
  const clusters = await buildClusterViews();

  // Compute linked vs unlinked
  const linkedEvidenceIds = new Set<number>();
  for (const c of clusters) {
    for (const eid of c.evidenceIds) {
      linkedEvidenceIds.add(eid);
    }
  }

  const unlinkedCount = totalEvidence - linkedEvidenceIds.size;
  const clusteredCount = linkedEvidenceIds.size;

  return {
    clusters,
    totalEvidence,
    totalCandidates,
    totalNarratives,
    totalClusters,
    unlinkedCount,
    clusteredCount,
  };
}

async function buildClusterViews(): Promise<ClusterView[]> {
  const candidates = await db
    .select()
    .from(storyCandidates)
    .orderBy(desc(storyCandidates.id))
    .all();

  if (candidates.length === 0) return [];

  // Fetch all narratives
  const narrativeList = await db.select().from(narratives).all();
  const narrativeMap = new Map<number, (typeof narrativeList)[0]>();
  for (const n of narrativeList) {
    try {
      const clusterIds = n.clusterIds ? JSON.parse(n.clusterIds) : [];
      if (Array.isArray(clusterIds) && clusterIds.length > 0) {
        narrativeMap.set(clusterIds[0], n);
      }
    } catch {
      // ignore parse errors
    }
  }

  // Fetch all candidate-evidence links
  const allLinks = await db.select().from(storyCandidateEvidence).all();
  const evidenceMap = new Map<number, number[]>();
  for (const link of allLinks) {
    const cid = link.candidateId;
    const eid = link.evidenceId;
    if (!evidenceMap.has(cid)) evidenceMap.set(cid, []);
    evidenceMap.get(cid)!.push(eid);
  }

  const views: ClusterView[] = candidates.map((c: any) => {
    const evidenceIds = evidenceMap.get(c.id) || [];
    const narrative = narrativeMap.get(c.id) || null;

    const safeDate = (val: any) => {
      if (!val) return new Date().toISOString();
      if (typeof val === "string") return val;
      if (val instanceof Date) return val.toISOString();
      return String(val);
    };

    return {
      id: c.id,
      name: c.name || "Unnamed Cluster",
      description: c.description || null,
      status: c.status || "candidate",
      confidence: c.confidence ?? 0.5,
      evidenceIds,
      narrative: narrative
        ? {
            id: narrative.id,
            title: narrative.title,
            overview: narrative.overview || "",
          }
        : null,
      createdAt: safeDate(c.createdAt),
    };
  });

  return views;
}
