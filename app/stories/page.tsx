"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Plus, Sparkles, BookOpen, Network } from "lucide-react";

interface StoryItem {
  id: number;
  title: string;
  overview: string;
  status: string;
  updatedAt: string;
  evidenceCount: number;
  generationType: "manual" | "auto";
  confidence?: number;
  clusterIds?: number[];
}

export default function StoriesPage() {
  const [stories, setStories] = useState<StoryItem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "manual" | "auto">("all");
  const router = useRouter();

  useEffect(() => {
    fetchStories();
  }, []);

  const fetchStories = async (q = "") => {
    setLoading(true);
    const res = await fetch(
      `/api/stories?search=${encodeURIComponent(q)}&limit=100`,
    );
    const data = await res.json();
    setStories(data.stories || []);
    setLoading(false);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchStories(search);
  };

  const filtered = stories.filter((s) => {
    if (filter === "manual") return s.generationType === "manual";
    if (filter === "auto") return s.generationType === "auto";
    return true;
  });

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Stories</h1>
            <p className="text-sm text-muted-foreground">
              Intelligence narratives built from connected evidence
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/discover">
              <Button variant="outline" size="sm">
                <Network className="mr-1 h-4 w-4 text-amber-400" /> Discover
                Stories
              </Button>
            </Link>
            <Link href="/stories/new">
              <Button size="sm">
                <Plus className="mr-1 h-4 w-4" /> New Story
              </Button>
            </Link>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <form onSubmit={handleSearch} className="flex gap-2 flex-1">
            <Input
              placeholder="Search stories..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
            <Button type="submit" variant="outline" size="icon">
              <Search className="h-4 w-4" />
            </Button>
          </form>
          <Tabs
            value={filter}
            onValueChange={(v) => setFilter(v as any)}
            className="w-auto"
          >
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="manual">Manual</TabsTrigger>
              <TabsTrigger value="auto">Auto</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <BookOpen className="h-12 w-12 text-muted-foreground opacity-40 mx-auto" />
              <p className="mt-3 text-muted-foreground">No stories found</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                {filter === "auto"
                  ? "No auto-generated narratives yet. Upload evidence and run Story Discovery to generate graph-backed narratives."
                  : "Stories emerge from connected evidence. Upload evidence and run Story Discovery to automatically find narratives."}
              </p>
              <div className="flex justify-center gap-2 mt-4">
                <Link href="/discover">
                  <Button variant="outline" size="sm">
                    <Network className="mr-1 h-4 w-4" /> Discover
                  </Button>
                </Link>
                <Link href="/evidence/new">
                  <Button size="sm">
                    <Plus className="mr-1 h-4 w-4" /> Add Evidence
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline">{filtered.length} shown</Badge>
              <Badge variant="outline">
                {stories.filter((s) => s.generationType === "manual").length}{" "}
                manual
              </Badge>
              <Badge variant="outline">
                {stories.filter((s) => s.generationType === "auto").length} auto
              </Badge>
            </div>

            <div className="grid gap-3">
              {filtered.map((story) => (
                <Card
                  key={`${story.generationType}-${story.id}`}
                  className={`cursor-pointer transition-colors hover:bg-accent ${story.generationType === "auto" ? "border-l-4 border-l-indigo-500/40" : ""}`}
                  onClick={() => router.push(`/stories/${story.id}`)}
                >
                  <CardContent className="flex items-start justify-between py-4 gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h3 className="text-sm font-medium">{story.title}</h3>
                        {story.generationType === "auto" ? (
                          <Badge className="bg-indigo-500/10 text-indigo-400 border-indigo-500/20 text-[10px]">
                            <Sparkles className="h-2.5 w-2.5 mr-0.5" />{" "}
                            Graph-derived
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">
                            Manual
                          </Badge>
                        )}
                        <Badge
                          variant={
                            story.status === "active" ? "default" : "secondary"
                          }
                          className="text-[10px] capitalize"
                        >
                          {story.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {story.overview}
                      </p>
                      <div className="flex items-center gap-2 mt-2 text-[10px] text-muted-foreground">
                        <span>{story.evidenceCount} evidence</span>
                        <span>·</span>
                        <span>
                          {new Date(story.updatedAt).toLocaleDateString()}
                        </span>
                        {typeof story.confidence === "number" && (
                          <>
                            <span>·</span>
                            <span className="text-indigo-400">
                              {(story.confidence * 100).toFixed(0)}% confidence
                            </span>
                          </>
                        )}
                        {story.clusterIds && story.clusterIds.length > 0 && (
                          <>
                            <span>·</span>
                            <span>
                              {story.clusterIds.length} cluster
                              {story.clusterIds.length > 1 ? "s" : ""}
                            </span>
                          </>
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
