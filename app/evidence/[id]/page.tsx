"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Link2, Users, Clock, Info, GitBranch } from "lucide-react";

interface EvidenceDetail {
  evidence: any;
  linkedStories: Array<any>;
  linkedEntities: Array<any>;
  timelineEvents: Array<any>;
  relatedEvidence?: Array<any>;
  relatedStats?: any;
}

export default function EvidenceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [data, setData] = useState<EvidenceDetail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setError("");
        const [detailRes, relatedRes] = await Promise.all([
          fetch(`/api/evidence/${id}`),
          fetch(`/api/evidence/${id}/related`).catch(() => null),
        ]);

        const d = await detailRes.json();

        if (!detailRes.ok || d.error) {
          setError(d.error || "Failed to load evidence");
          setData(null);
          setLoading(false);
          return;
        }

        if (!d.evidence || typeof d.evidence !== "object") {
          setError("Invalid evidence data received");
          setData(null);
          setLoading(false);
          return;
        }

        let relatedData: any = null;
        if (relatedRes && relatedRes.ok) {
          relatedData = await relatedRes.json();
        }

        setData({
          evidence: d.evidence,
          linkedStories: d.linkedStories || [],
          linkedEntities: d.linkedEntities || [],
          timelineEvents: d.timelineEvents || [],
          relatedEvidence: relatedData?.related || [],
          relatedStats: relatedData?.stats || null,
        });
        setLoading(false);
      } catch {
        setError("Network error loading evidence");
        setData(null);
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  const getTags = (tagsStr: string) => {
    try {
      return JSON.parse(tagsStr);
    } catch {
      return [];
    }
  };

  const getMetadata = (metaStr: string | null) => {
    try {
      return metaStr ? JSON.parse(metaStr) : {};
    } catch {
      return {};
    }
  };

  const handleDelete = async () => {
    if (!confirm("Delete this evidence? This action cannot be undone.")) return;
    try {
      const res = await fetch(`/api/evidence/${id}`, { method: "DELETE" });
      if (res.ok) router.push("/evidence");
      else alert("Failed to delete evidence");
    } catch {
      alert("Network error deleting evidence");
    }
  };

  if (loading) {
    return (
      <AppShell>
        <div className="flex h-96 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </AppShell>
    );
  }

  if (error || !data) {
    return (
      <AppShell>
        <div className="flex h-96 flex-col items-center justify-center gap-4">
          <p className="text-muted-foreground">
            {error || "Evidence not found"}
          </p>
          <Link href="/evidence">
            <Button variant="outline">Back to Evidence</Button>
          </Link>
        </div>
      </AppShell>
    );
  }

  const ev = data.evidence;
  const meta = getMetadata(ev.aiMetadata);

  const getRelationBadge = (types: string[]) => {
    if (types.includes("same_story"))
      return (
        <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
          Same Story
        </Badge>
      );
    if (types.includes("shared_entities"))
      return (
        <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
          Shared Entities
        </Badge>
      );
    if (types.includes("topic_overlap"))
      return (
        <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">
          Topic Match
        </Badge>
      );
    return <Badge variant="outline">Related</Badge>;
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link href="/evidence">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="mr-1 h-4 w-4" /> Back
              </Button>
            </Link>
          </div>
          <Button size="sm" variant="destructive" onClick={handleDelete}>
            Delete
          </Button>
        </div>

        <div>
          <h1 className="text-2xl font-semibold">{ev.title}</h1>
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <Badge variant="outline">{ev.sourceType}</Badge>
            {/* FIX: Clickable source link */}
            <a
              href={ev.source}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 hover:underline break-all"
            >
              {ev.source}
            </a>
            {ev.publicationDate && (
              <span className="text-xs text-muted-foreground">
                {new Date(ev.publicationDate).toLocaleDateString()}
              </span>
            )}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <span className="text-sm font-medium">Confidence</span>
            <div className="h-2 w-24 rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${ev.confidence * 100}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground">
              {(ev.confidence * 100).toFixed(0)}%
            </span>
          </div>
          {meta.confidenceEvaluation && (
            <div className="mt-2 rounded-md bg-muted p-3 text-sm">
              <p className="font-medium">AI Confidence Assessment</p>
              <p className="text-muted-foreground text-xs mt-1">
                {meta.confidenceEvaluation.reasoning}
              </p>
              {meta.confidenceEvaluation.factors?.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {meta.confidenceEvaluation.factors.map(
                    (f: string, i: number) => (
                      <li key={i}>• {f}</li>
                    ),
                  )}
                </ul>
              )}
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-1">
            {getTags(ev.tags).map((tag: string) => (
              <Badge key={tag} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
          {meta.topics?.topics?.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {meta.topics.topics.map((t: string, i: number) => (
                <Badge
                  key={i}
                  variant="outline"
                  className="text-[10px] bg-primary/5"
                >
                  {t}
                </Badge>
              ))}
            </div>
          )}
        </div>

        <Tabs defaultValue="summary">
          <TabsList>
            <TabsTrigger value="summary">Summary</TabsTrigger>
            <TabsTrigger value="related">
              <GitBranch className="mr-1 h-3 w-3" /> Related Evidence (
              {data.relatedEvidence?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="stories">
              Linked Stories ({data.linkedStories.length})
            </TabsTrigger>
            <TabsTrigger value="entities">
              Entities ({data.linkedEntities.length})
            </TabsTrigger>
            <TabsTrigger value="timeline">
              Timeline ({data.timelineEvents.length})
            </TabsTrigger>
            <TabsTrigger value="metadata">AI Metadata</TabsTrigger>
          </TabsList>

          <TabsContent value="summary" className="mt-4">
            <Card>
              <CardContent className="py-4">
                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                  {ev.summary}
                </p>
                {meta.summaryMethod === "fallback_too_large" && (
                  <p className="mt-3 text-xs text-amber-600 bg-amber-50 p-2 rounded">
                    This document was too large for automatic summarization.
                    Please edit the summary manually.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="related" className="mt-4">
            {!data.relatedEvidence || data.relatedEvidence.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  <GitBranch className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p>No related evidence found yet</p>
                  <p className="text-xs mt-1">
                    Related evidence appears when other items share entities,
                    topics, or stories with this evidence.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {data.relatedEvidence.map((rel: any) => (
                  <Card
                    key={rel.id}
                    className="hover:bg-accent/30 transition-colors"
                  >
                    <CardContent className="py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Link
                              href={`/evidence/${rel.id}`}
                              className="text-sm font-medium hover:text-primary"
                            >
                              {rel.title}
                            </Link>
                            {getRelationBadge(rel.relationTypes)}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {rel.source} |{" "}
                            {(rel.relationScore * 100).toFixed(0)}% match
                          </p>
                          {rel.sharedTopics?.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {rel.sharedTopics.map((t: string, i: number) => (
                                <span
                                  key={i}
                                  className="text-[10px] bg-muted px-1.5 py-0.5 rounded"
                                >
                                  {t}
                                </span>
                              ))}
                            </div>
                          )}
                          {rel.sharedEntityCount > 0 && (
                            <p className="text-[10px] text-muted-foreground mt-1">
                              {rel.sharedEntityCount} shared entities
                            </p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="stories" className="mt-4">
            {data.linkedStories.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  <p>Not linked to any stories</p>
                  <Link href="/discover">
                    <Button variant="outline" size="sm" className="mt-3">
                      Run Story Discovery
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {data.linkedStories.map((link: any) => (
                  <Card key={link.storyId}>
                    <CardContent className="py-3 flex items-center justify-between">
                      <div>
                        <Link
                          href={`/stories/${link.storyId}`}
                          className="text-sm font-medium hover:text-primary"
                        >
                          Story #{link.storyId}
                        </Link>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Confidence: {(link.confidence * 100).toFixed(0)}% |{" "}
                          {link.relationshipType}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="entities" className="mt-4">
            {data.linkedEntities.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No entities extracted
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {data.linkedEntities.map((ent: any) => (
                  <Link key={ent.id} href={`/entities/${ent.id}`}>
                    <Card className="hover:bg-accent transition-colors">
                      <CardContent className="py-3">
                        <p className="text-sm font-medium">{ent.name}</p>
                        <Badge
                          variant="outline"
                          className="text-[10px] capitalize mt-1"
                        >
                          {ent.type}
                        </Badge>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="timeline" className="mt-4">
            {data.timelineEvents.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No timeline events
                </CardContent>
              </Card>
            ) : (
              <div className="relative border-l border-border ml-4 space-y-4">
                {data.timelineEvents.map((evt: any) => (
                  <div key={evt.id} className="relative pl-6">
                    <div className="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full bg-primary" />
                    <Card>
                      <CardContent className="py-3">
                        <span className="text-xs text-muted-foreground">
                          {new Date(evt.date).toLocaleDateString()}
                        </span>
                        <p className="text-sm font-medium mt-0.5">
                          {evt.title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {evt.description}
                        </p>
                      </CardContent>
                    </Card>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="metadata" className="mt-4">
            <Card>
              <CardContent className="py-4">
                <pre className="text-xs bg-muted p-3 rounded-md overflow-auto">
                  {JSON.stringify(meta, null, 2)}
                </pre>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
