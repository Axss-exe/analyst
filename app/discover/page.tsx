"use client";

import { useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Sparkles,
  GitBranch,
  Users,
  FileText,
  CheckCircle,
  Network,
} from "lucide-react";

interface ClusterView {
  id: number;
  name: string;
  description: string;
  density: number;
  status: "new" | "strengthened" | "merged" | "stable";
  evidenceCount: number;
  entityCount: number;
  evidenceIds: number[];
  entityIds: number[];
  narrative: { title: string; overview: string; confidence: number } | null;
}

export default function DiscoverPage() {
  const [clusters, setClusters] = useState<ClusterView[]>([]);
  const [unlinkedCount, setUnlinkedCount] = useState(0);
  const [clusteredCount, setClusteredCount] = useState(0);
  const [totalNarratives, setTotalNarratives] = useState(0);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState<number | null>(null);
  const [created, setCreated] = useState<number[]>([]);

  const runDiscovery = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/discover");
      const data = await res.json();
      if (res.ok) {
        setClusters(data.clusters || []);
        setUnlinkedCount(data.unlinkedCount || 0);
        setClusteredCount(data.clusteredCount || 0);
        setTotalNarratives(data.totalNarratives || 0);
      }
    } catch {
      alert("Discovery failed");
    }
    setLoading(false);
  };

  const createStory = async (cluster: ClusterView, index: number) => {
    setCreating(index);
    try {
      const res = await fetch("/api/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: cluster.narrative?.title || cluster.name,
          overview: cluster.narrative?.overview || cluster.description,
          evidenceIds: cluster.evidenceIds,
        }),
      });
      if (res.ok) {
        setCreated((prev) => [...prev, index]);
      } else {
        alert("Failed to create story");
      }
    } catch {
      alert("Network error");
    }
    setCreating(null);
  };

  const statusColors: Record<string, string> = {
    new: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    strengthened: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    merged: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    stable: "bg-slate-500/10 text-slate-400 border-slate-500/20",
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <Network className="h-6 w-6 text-indigo-400" />
              Story Discovery
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Graph-driven discovery: clusters, hidden paths, and emerging
              narratives
            </p>
          </div>
          <Button onClick={runDiscovery} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-1 h-4 w-4 animate-spin" /> Analyzing...
              </>
            ) : (
              <>
                <Sparkles className="mr-1 h-4 w-4" /> Run Discovery
              </>
            )}
          </Button>
        </div>

        {clusters.length === 0 && !loading && (
          <Card>
            <CardContent className="py-12 text-center">
              <GitBranch className="h-12 w-12 text-muted-foreground opacity-40 mx-auto" />
              <p className="mt-3 text-muted-foreground">
                No story clusters found yet
              </p>
              <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
                Upload evidence with full text content. The graph reasoning
                system will extract atomic facts, compute connection signals,
                and discover emerging clusters.
              </p>
              <div className="flex justify-center gap-2 mt-4">
                <Link href="/evidence/new">
                  <Button size="sm">
                    <FileText className="mr-1 h-4 w-4" /> Add Evidence
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        )}

        {clusters.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="outline">{unlinkedCount} unlinked</Badge>
              <Badge variant="outline">{clusteredCount} clustered</Badge>
              <Badge variant="outline">{clusters.length} clusters</Badge>
              <Badge variant="outline">{totalNarratives} narratives</Badge>
            </div>

            <div className="grid gap-4">
              {clusters.map((cluster, idx) => (
                <Card
                  key={cluster.id}
                  className={created.includes(idx) ? "opacity-60" : ""}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <CardTitle className="text-base">
                            {cluster.name}
                          </CardTitle>
                          <Badge className={statusColors[cluster.status] || ""}>
                            {cluster.status}
                          </Badge>
                          {cluster.narrative && (
                            <Badge className="bg-indigo-500/10 text-indigo-400 border-indigo-500/20">
                              <Sparkles className="h-2.5 w-2.5 mr-0.5" />{" "}
                              Narrative
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {cluster.description}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                        <Badge variant="outline">
                          {cluster.evidenceCount} evidence
                        </Badge>
                        <Badge variant="outline">
                          <Users className="h-2.5 w-2.5 mr-0.5" />
                          {cluster.entityCount} entities
                        </Badge>
                        <Badge variant="outline">
                          density {cluster.density.toFixed(2)}
                        </Badge>
                        {created.includes(idx) ? (
                          <Badge className="bg-emerald-500/20 text-emerald-400">
                            <CheckCircle className="h-3 w-3 mr-1" /> Created
                          </Badge>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => createStory(cluster, idx)}
                            disabled={creating === idx}
                          >
                            {creating === idx ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              "Create Story"
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {cluster.narrative && (
                      <div className="rounded-md bg-indigo-500/5 border border-indigo-500/10 p-3">
                        <p className="text-xs font-semibold text-indigo-400 mb-1">
                          Auto-Generated Narrative
                        </p>
                        <p className="text-sm font-medium">
                          {cluster.narrative.title}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                          {cluster.narrative.overview}
                        </p>
                        <Badge variant="outline" className="mt-2 text-[10px]">
                          confidence{" "}
                          {(cluster.narrative.confidence * 100).toFixed(0)}%
                        </Badge>
                      </div>
                    )}

                    <div className="rounded-md bg-muted/50 p-3">
                      <p className="text-xs font-medium mb-1">
                        Why this cluster exists:
                      </p>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {cluster.description}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                      <span>Evidence:</span>
                      <div className="flex flex-wrap gap-1">
                        {cluster.evidenceIds.slice(0, 8).map((id) => (
                          <Link
                            key={id}
                            href={`/evidence/${id}`}
                            className="hover:text-primary transition-colors underline underline-offset-2"
                          >
                            #{id}
                          </Link>
                        ))}
                        {cluster.evidenceIds.length > 8 && (
                          <span>+{cluster.evidenceIds.length - 8} more</span>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
