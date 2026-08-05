"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft,
  FileText,
  Users,
  GitBranch,
  Calendar,
  CheckCircle,
} from "lucide-react";

export default function StoryDetailPage() {
  const { id } = useParams() as { id: string };
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/stories/${id}`)
      .then(async (r) => {
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          throw new Error(err.error || "Not found");
        }
        return r.json();
      })
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message || "Failed to load story");
        setLoading(false);
      });
  }, [id]);

  if (loading)
    return (
      <AppShell>
        <div className="flex h-96 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </AppShell>
    );

  if (error || !data || !data.story)
    return (
      <AppShell>
        <div className="mx-auto max-w-4xl pt-12 text-center">
          <h1 className="text-xl font-semibold">Story not found</h1>
          <p className="mt-2 text-muted-foreground">
            {error || "This story may have been deleted or not yet processed."}
          </p>
          <Link href="/stories" className="mt-6 inline-block">
            <Button variant="outline">
              <ArrowLeft className="mr-1 h-4 w-4" /> Back to Stories
            </Button>
          </Link>
        </div>
      </AppShell>
    );

  const story = data.story;
  const evidenceList = data.linkedEvidence || [];
  const entityList = data.linkedEntities || [];
  const timelineList = data.timelineEvents || [];
  const relationshipList = data.relationships || [];
  const taskList = data.researchTasks || [];
  const briefList = data.generatedBriefs || [];

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/stories">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-1 h-4 w-4" /> Back
            </Button>
          </Link>
          <Badge variant="outline" className="capitalize">
            {story.status || "active"}
          </Badge>
        </div>

        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {story.title}
          </h1>
          {story.overview ? (
            <p className="mt-2 text-muted-foreground">{story.overview}</p>
          ) : null}
        </div>

        <Tabs defaultValue="evidence">
          <TabsList>
            <TabsTrigger value="evidence">
              <FileText className="mr-1 h-3 w-3" /> Evidence (
              {evidenceList.length})
            </TabsTrigger>
            <TabsTrigger value="entities">
              <Users className="mr-1 h-3 w-3" /> Entities ({entityList.length})
            </TabsTrigger>
            <TabsTrigger value="timeline">
              <Calendar className="mr-1 h-3 w-3" /> Timeline (
              {timelineList.length})
            </TabsTrigger>
            <TabsTrigger value="relationships">
              <GitBranch className="mr-1 h-3 w-3" /> Relations (
              {relationshipList.length})
            </TabsTrigger>
            {taskList.length > 0 && (
              <TabsTrigger value="tasks">
                <CheckCircle className="mr-1 h-3 w-3" /> Tasks (
                {taskList.length})
              </TabsTrigger>
            )}
          </TabsList>

          {/* Evidence Tab */}
          <TabsContent value="evidence" className="mt-4">
            {evidenceList.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No evidence linked to this story
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {evidenceList.map((ev: any) => (
                  <Link key={ev.id} href={`/evidence/${ev.id}`}>
                    <Card className="transition-colors hover:bg-accent">
                      <CardContent className="py-3">
                        <p className="text-sm font-medium">
                          {ev.title || "Untitled"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {ev.source}
                        </p>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Entities Tab */}
          <TabsContent value="entities" className="mt-4">
            {entityList.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No entities found
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {entityList.map((ent: any) => (
                  <Link key={ent.id} href={`/entities/${ent.id}`}>
                    <Card className="transition-colors hover:bg-accent">
                      <CardContent className="py-3">
                        <p className="text-sm font-medium">
                          {ent.name || "Unknown"}
                        </p>
                        <Badge variant="outline" className="mt-1 text-[10px]">
                          {ent.type || "unknown"}
                        </Badge>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Timeline Tab */}
          <TabsContent value="timeline" className="mt-4">
            {timelineList.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No timeline events
                </CardContent>
              </Card>
            ) : (
              <div className="relative ml-4 space-y-4 border-l border-border">
                {timelineList.map((evt: any) => (
                  <div key={evt.id} className="relative pl-6">
                    <div className="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full bg-primary" />
                    <Card>
                      <CardContent className="py-3">
                        <span className="text-xs text-muted-foreground">
                          {evt.date
                            ? new Date(evt.date).toLocaleDateString()
                            : "No date"}
                        </span>
                        <p className="mt-0.5 text-sm font-medium">
                          {evt.title || evt.event || "Event"}
                        </p>
                        {evt.description ? (
                          <p className="text-xs text-muted-foreground">
                            {evt.description}
                          </p>
                        ) : null}
                      </CardContent>
                    </Card>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Relationships Tab */}
          <TabsContent value="relationships" className="mt-4">
            {relationshipList.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No relationships found
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {relationshipList.map((rel: any) => (
                  <Card key={rel.id}>
                    <CardContent className="flex items-center gap-3 py-3">
                      <span className="text-sm font-medium">
                        {rel.sourceId ? `Entity #${rel.sourceId}` : "?"}
                      </span>
                      <Badge variant="outline" className="text-[10px]">
                        {rel.type || "related"}
                      </Badge>
                      <span className="text-xs text-muted-foreground">→</span>
                      <span className="text-sm font-medium">
                        {rel.targetId ? `Entity #${rel.targetId}` : "?"}
                      </span>
                      {typeof rel.confidence === "number" ? (
                        <span className="ml-auto text-xs text-muted-foreground">
                          {(rel.confidence * 100).toFixed(0)}%
                        </span>
                      ) : null}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Tasks Tab */}
          {taskList.length > 0 && (
            <TabsContent value="tasks" className="mt-4">
              <div className="space-y-2">
                {taskList.map((task: any) => (
                  <Card key={task.id}>
                    <CardContent className="py-3">
                      <p className="text-sm font-medium">
                        {task.title || "Task"}
                      </p>
                      <Badge
                        variant={
                          task.status === "completed" ? "default" : "outline"
                        }
                        className="mt-1 text-[10px]"
                      >
                        {task.status || "pending"}
                      </Badge>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>
          )}
        </Tabs>
      </div>
    </AppShell>
  );
}
