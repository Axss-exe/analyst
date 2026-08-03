"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, FileText, Users, GitBranch, Calendar } from "lucide-react";

export default function EntityDetailPage() {
  const { id } = useParams() as { id: string };
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/entities/${id}`)
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  if (loading)
    return (
      <AppShell>
        <div className="flex h-96 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </AppShell>
    );
  if (!data)
    return (
      <AppShell>
        <div className="flex h-96 items-center justify-center text-muted-foreground">
          Entity not found
        </div>
      </AppShell>
    );

  const ent = data.entity;
  const aliases = (() => {
    try {
      return JSON.parse(ent.aliases);
    } catch {
      return [];
    }
  })();
  const metadata = (() => {
    try {
      return ent.metadata ? JSON.parse(ent.metadata) : {};
    } catch {
      return {};
    }
  })();

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl space-y-6">
        <Link href="/entities">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-1 h-4 w-4" /> Back
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{ent.name}</h1>
          <Badge className="mt-2 capitalize">{ent.type}</Badge>
          {aliases.length > 0 && (
            <p className="mt-2 text-sm text-muted-foreground">
              Also known as: {aliases.join(", ")}
            </p>
          )}
        </div>

        <Tabs defaultValue="evidence">
          <TabsList>
            <TabsTrigger value="evidence">
              <FileText className="mr-1 h-3 w-3" /> Evidence (
              {data.evidence.length})
            </TabsTrigger>
            <TabsTrigger value="relationships">
              <GitBranch className="mr-1 h-3 w-3" /> Relationships (
              {data.relationships.length})
            </TabsTrigger>
            <TabsTrigger value="timeline">
              <Calendar className="mr-1 h-3 w-3" /> Timeline (
              {data.timelineEvents.length})
            </TabsTrigger>
            <TabsTrigger value="metadata">Metadata</TabsTrigger>
          </TabsList>

          <TabsContent value="evidence" className="mt-4">
            {data.evidence.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No linked evidence
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {data.evidence.map((ev: any) => (
                  <Link key={ev.id} href={`/evidence/${ev.id}`}>
                    <Card className="transition-colors hover:bg-accent">
                      <CardContent className="py-3">
                        <p className="text-sm font-medium">{ev.title}</p>
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

          <TabsContent value="relationships" className="mt-4">
            {data.relationships.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No relationships
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {data.relationships.map((rel: any) => (
                  <Card key={rel.id}>
                    <CardContent className="flex items-center gap-3 py-3">
                      <Link
                        href={`/entities/${rel.sourceId}`}
                        className="text-sm font-medium hover:text-primary"
                      >
                        Entity #{rel.sourceId}
                      </Link>
                      <Badge variant="outline" className="text-[10px]">
                        {rel.type}
                      </Badge>
                      <span className="text-xs text-muted-foreground">→</span>
                      <Link
                        href={`/entities/${rel.targetId}`}
                        className="text-sm font-medium hover:text-primary"
                      >
                        Entity #{rel.targetId}
                      </Link>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {(rel.confidence * 100).toFixed(0)}%
                      </span>
                    </CardContent>
                  </Card>
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
              <CardContent className="pt-6">
                <pre className="text-xs text-muted-foreground overflow-auto">
                  {JSON.stringify(metadata, null, 2)}
                </pre>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
