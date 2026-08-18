"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  Loader2,
  Sparkles,
  BookOpen,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Link2,
  Plus,
  FileText,
  Users,
  Clock,
  GitBranch,
  Lightbulb,
  Target,
  Newspaper,
  ChevronDown,
  ChevronUp,
  FileOutput,
} from "lucide-react";

interface StoryData {
  story: {
    id: number;
    title: string;
    overview: string;
    status: string;
    confidence?: number;
    generationType?: string;
    createdAt: string;
    updatedAt: string;
  };
  isNarrative: boolean;
  linkedEvidence: any[];
  linkedEntities: any[];
  timelineEvents: any[];
  relationships: any[];
  researchTasks: any[];
  generatedBriefs: any[];
}

interface GapItem {
  type: string;
  severity: "critical" | "high" | "medium" | "low";
  description: string;
  details: string;
  suggestedQuestion: string;
}

interface TemplateItem {
  id: number;
  name: string;
  type: string;
}

export default function StoryDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [data, setData] = useState<StoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [reevaluating, setReevaluating] = useState(false);
  const [gaps, setGaps] = useState<GapItem[] | null>(null);
  const [gapSummary, setGapSummary] = useState<any>(null);
  const [tasksGenerated, setTasksGenerated] = useState(0);

  const [attachInput, setAttachInput] = useState("");
  const [attaching, setAttaching] = useState(false);
  const [attachResult, setAttachResult] = useState<any>(null);

  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [selectedMode, setSelectedMode] = useState<string>("full");
  const [generatingBrief, setGeneratingBrief] = useState(false);
  const [expandedBriefId, setExpandedBriefId] = useState<number | null>(null);

  const [checkResult, setCheckResult] = useState<any>(null);
  const [checking, setChecking] = useState(false);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    fetchStory();
    fetchTemplates();
  }, [id]);

  async function fetchStory() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/stories/${id}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to load story");
      }
      const d = await res.json();
      setData(d);
      if (d.isNarrative) {
        fetch(`/api/narratives/${id}/check`)
          .then((r) => r.json())
          .then((c) => {
            if (c.check) {
              c.check.issues = parseIssues(c.check.issues);
              setCheckResult(c.check);
            }
          })
          .catch(() => {});
      }
    } catch (e: any) {
      setError(e.message || "Failed to load story");
    } finally {
      setLoading(false);
    }
  }

  async function fetchTemplates() {
    try {
      const res = await fetch("/api/templates");
      if (res.ok) {
        const d = await res.json();
        setTemplates(d.templates || []);
      }
    } catch (e) {
      console.warn("Failed to fetch templates:", e);
    }
  }

  async function runReevaluate() {
    setReevaluating(true);
    setAttachResult(null);
    try {
      const res = await fetch(`/api/stories/${id}/reevaluate`, { method: "POST" });
      const d = await res.json();
      if (d.success) {
        setGaps(d.gaps || []);
        setGapSummary(d.gapSummary || null);
        setTasksGenerated(d.tasksGenerated || 0);
        await fetchStory();
      } else {
        alert(d.error || "Re-evaluation failed");
      }
    } catch (e: any) {
      alert(e.message || "Re-evaluation failed");
    } finally {
      setReevaluating(false);
    }
  }

  async function handleAttachEvidence() {
    const evidenceId = parseInt(attachInput, 10);
    if (isNaN(evidenceId)) {
      alert("Enter a valid evidence ID number");
      return;
    }
    setAttaching(true);
    setAttachResult(null);
    try {
      const res = await fetch(`/api/stories/${id}/attach-evidence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evidenceId }),
      });
      const d = await res.json();
      setAttachResult(d);
      if (d.success && !d.alreadyAttached) {
        await fetchStory();
      }
    } catch (e: any) {
      alert(e.message || "Attachment failed");
    } finally {
      setAttaching(false);
    }
  }

  async function handleGenerateBrief() {
    setGeneratingBrief(true);
    try {
      const res = await fetch("/api/briefs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storyId: parseInt(id),
          mode: selectedMode,
          templateId: selectedTemplateId ? parseInt(selectedTemplateId) : undefined,
        }),
      });
      const d = await res.json();
      if (d.success) {
        await fetchStory();
      } else {
        alert(d.error || "Brief generation failed");
      }
    } catch (e: any) {
      alert(e.message || "Brief generation failed");
    } finally {
      setGeneratingBrief(false);
    }
  }

  async function runCheck() {
    setChecking(true);
    try {
      const res = await fetch(`/api/narratives/${id}/check`, { method: "POST" });
      const d = await res.json();
      if (d.success) {
        d.issues = parseIssues(d.issues);
        setCheckResult(d);
      } else {
        alert(d.error || "Check failed");
      }
    } catch (e: any) {
      alert(e.message);
    } finally {
      setChecking(false);
    }
  }

  async function publishNarrative() {
    setPublishing(true);
    try {
      const res = await fetch(`/api/narratives/${id}/publish`, { method: "POST" });
      const d = await res.json();
      if (d.success) {
        window.location.reload();
      } else {
        alert(d.error || "Publish failed");
      }
    } catch (e: any) {
      alert(e.message);
    } finally {
      setPublishing(false);
    }
  }

  if (loading) {
    return (
      <AppShell>
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppShell>
    );
  }

  if (error || !data || !data.story) {
    return (
      <AppShell>
        <div className="mx-auto max-w-3xl py-12 text-center">
          <BookOpen className="mx-auto h-12 w-12 text-muted-foreground opacity-40" />
          <h2 className="mt-4 text-xl font-semibold">Story not found</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {error || "This story may have been deleted or not yet processed."}
          </p>
        </div>
      </AppShell>
    );
  }

  const story = data.story;
  const isNarrative = data.isNarrative || false;
  const evidenceList = data.linkedEvidence || [];
  const entityList = data.linkedEntities || [];
  const timelineList = data.timelineEvents || [];
  const relationshipList = data.relationships || [];
  const taskList = data.researchTasks || [];
  const briefList = data.generatedBriefs || [];

  const severityColors: Record<string, string> = {
    critical: "bg-red-500/10 text-red-400 border-red-500/20",
    high: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    medium: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    low: "bg-slate-500/10 text-slate-400 border-slate-500/20",
  };

  const priorityColors: Record<string, string> = {
    critical: "bg-red-500/10 text-red-400 border-red-500/20",
    high: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    medium: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    low: "bg-slate-500/10 text-slate-400 border-slate-500/20",
  };

  function parseBriefContent(content: string): any {
    try {
      return JSON.parse(content);
    } catch {
      return {
        executiveSummary: content,
        detailedNarrative: "",
        keyFindings: [],
        references: [],
      };
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-6">
        {/* ─── Header ─── */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <Badge
                variant={story.status === "active" ? "default" : "secondary"}
                className="capitalize"
              >
                {story.status || "active"}
              </Badge>
              {isNarrative && (
                <Badge className="bg-indigo-500/10 text-indigo-400 border-indigo-500/20">
                  <Sparkles className="h-3 w-3 mr-1" /> Auto-generated
                </Badge>
              )}
              {typeof story.confidence === "number" && (
                <Badge variant="outline">
                  {(story.confidence * 100).toFixed(0)}% confidence
                </Badge>
              )}
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {story.title}
            </h1>
            {story.overview ? (
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed max-w-3xl">
                {story.overview}
              </p>
            ) : null}
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {!isNarrative && (
              <Button
                variant="outline"
                size="sm"
                onClick={runReevaluate}
                disabled={reevaluating}
              >
                {reevaluating ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-1" />
                )}
                Re-evaluate
              </Button>
            )}

            {/* Generate Brief - always visible in header */}
            <div className="flex items-center gap-2">
              <select
                value={selectedMode}
                onChange={(e) => setSelectedMode(e.target.value)}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs"
              >
                <option value="full">Full</option>
                <option value="partial">Partial</option>
                <option value="since_last">Since Last</option>
              </select>
              <select
                value={selectedTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs"
              >
                <option value="">No template</option>
                {templates.map((t) => (
                  <option key={t.id} value={String(t.id)}>{t.name}</option>
                ))}
              </select>
              <Button
                size="sm"
                onClick={handleGenerateBrief}
                disabled={generatingBrief || evidenceList.length === 0}
              >
                {generatingBrief ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                ) : (
                  <Newspaper className="h-3 w-3 mr-1" />
                )}
                Brief
              </Button>
            </div>

            {isNarrative && story.status === "draft" && checkResult?.status === "passed" && (
              <Button size="sm" onClick={publishNarrative} disabled={publishing}>
                {publishing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle className="h-4 w-4 mr-1" />}
                Publish
              </Button>
            )}
          </div>
        </div>

        {/* ─── Narrative Checker ─── */}
        {isNarrative && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Target className="h-4 w-4" />
                Story Checker
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 mb-3">
                {checkResult?.status === "passed" ? (
                  <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                    <CheckCircle className="h-3 w-3 mr-1" /> Passed
                  </Badge>
                ) : checkResult?.status === "failed" ? (
                  <Badge className="bg-red-500/10 text-red-400 border-red-500/20">
                    <AlertTriangle className="h-3 w-3 mr-1" /> Failed
                  </Badge>
                ) : (
                  <Badge variant="outline">Not checked</Badge>
                )}
                <Button size="sm" variant="ghost" onClick={runCheck} disabled={checking}>
                  {checking ? <Loader2 className="h-3 w-3 animate-spin" /> : "Run Check"}
                </Button>
              </div>
              {checkResult && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <div className="rounded-md bg-muted p-2 text-center">
                    <p className="text-lg font-semibold">{checkResult.overallScore}</p>
                    <p className="text-muted-foreground">Overall Score</p>
                  </div>
                  <div className="rounded-md bg-muted p-2 text-center">
                    <p className="text-lg font-semibold">{checkResult.evidenceLinkCount}</p>
                    <p className="text-muted-foreground">Evidence Links</p>
                  </div>
                  <div className="rounded-md bg-muted p-2 text-center">
                    <p className="text-lg font-semibold">{Math.round((checkResult.entityOverlapScore || 0) * 100)}%</p>
                    <p className="text-muted-foreground">Entity Overlap</p>
                  </div>
                  <div className="rounded-md bg-muted p-2 text-center">
                    <p className="text-lg font-semibold">{Math.round((checkResult.factSupportRatio || 0) * 100)}%</p>
                    <p className="text-muted-foreground">Fact Support</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ─── Attach Evidence ─── */}
        {!isNarrative && (
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <Link2 className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Attach Evidence</span>
                <Input
                  placeholder="Evidence ID #"
                  value={attachInput}
                  onChange={(e) => setAttachInput(e.target.value)}
                  className="w-32 h-8 text-sm"
                />
                <Button
                  size="sm"
                  onClick={handleAttachEvidence}
                  disabled={attaching || !attachInput}
                >
                  {attaching ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Plus className="h-3 w-3 mr-1" />}
                  Attach
                </Button>
                {attachResult?.success && (
                  <span className="text-xs">
                    {attachResult.alreadyAttached ? (
                      <span className="text-muted-foreground">
                        Already attached (score: {(attachResult.relevanceScore * 100).toFixed(0)}%)
                      </span>
                    ) : (
                      <span className="text-emerald-400">
                        Attached ({(attachResult.relevanceScore * 100).toFixed(0)}% match)
                      </span>
                    )}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ─── Gap Results ─── */}
        {gaps && gaps.length > 0 && (
          <Card className="border-amber-500/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-amber-400" />
                Gap Analysis Results
                {tasksGenerated > 0 && (
                  <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px]">
                    {tasksGenerated} task{tasksGenerated > 1 ? "s" : ""} generated
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {gapSummary && (
                <div className="flex gap-2 text-xs">
                  {gapSummary.critical > 0 && (
                    <Badge className="bg-red-500/10 text-red-400 border-red-500/20">{gapSummary.critical} Critical</Badge>
                  )}
                  {gapSummary.high > 0 && (
                    <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20">{gapSummary.high} High</Badge>
                  )}
                  {gapSummary.medium > 0 && (
                    <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20">{gapSummary.medium} Medium</Badge>
                  )}
                  {gapSummary.low > 0 && (
                    <Badge className="bg-slate-500/10 text-slate-400 border-slate-500/20">{gapSummary.low} Low</Badge>
                  )}
                </div>
              )}
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {gaps.map((gap, i) => (
                  <div key={i} className="rounded-md border border-border bg-card p-3 text-xs">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge className={severityColors[gap.severity] || ""}>{gap.severity}</Badge>
                      <span className="font-medium capitalize">{gap.type.replace("_", " ")}</span>
                    </div>
                    <p className="text-muted-foreground">{gap.description}</p>
                    <p className="mt-1 text-indigo-400">{gap.suggestedQuestion}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ─── Tabs ─── */}
        <Tabs defaultValue="evidence">
          <TabsList className="w-full flex-wrap h-auto">
            <TabsTrigger value="evidence">
              <FileText className="h-3.5 w-3.5 mr-1" />
              Evidence ({evidenceList.length})
            </TabsTrigger>
            <TabsTrigger value="entities">
              <Users className="h-3.5 w-3.5 mr-1" />
              Entities ({entityList.length})
            </TabsTrigger>
            <TabsTrigger value="timeline">
              <Clock className="h-3.5 w-3.5 mr-1" />
              Timeline ({timelineList.length})
            </TabsTrigger>
            <TabsTrigger value="relations">
              <GitBranch className="h-3.5 w-3.5 mr-1" />
              Relations ({relationshipList.length})
            </TabsTrigger>
            <TabsTrigger value="tasks">
              <Target className="h-3.5 w-3.5 mr-1" />
              Tasks ({taskList.length})
            </TabsTrigger>
            <TabsTrigger value="briefs">
              <Newspaper className="h-3.5 w-3.5 mr-1" />
              Briefs ({briefList.length})
            </TabsTrigger>
            <TabsTrigger value="gaps">
              <Lightbulb className="h-3.5 w-3.5 mr-1" />
              Gaps
            </TabsTrigger>
          </TabsList>

          {/* Evidence */}
          <TabsContent value="evidence" className="mt-4">
            {evidenceList.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  No evidence linked to this story
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3">
                {evidenceList.map((ev: any) => (
                  <Card key={ev.id} className="hover:bg-accent/50 transition-colors">
                    <CardContent className="py-3">
                      <Link href={`/evidence/${ev.id}`} className="text-sm font-medium hover:text-primary transition-colors">
                        {ev.title || "Untitled"}
                      </Link>
                      <p className="text-xs text-muted-foreground mt-0.5">{ev.source}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Entities */}
          <TabsContent value="entities" className="mt-4">
            {entityList.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  No entities found
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3">
                {entityList.map((ent: any) => (
                  <Card key={ent.id} className="hover:bg-accent/50 transition-colors">
                    <CardContent className="py-3 flex items-center justify-between">
                      <div>
                        <Link href={`/entities/${ent.id}`} className="text-sm font-medium hover:text-primary transition-colors">
                          {ent.name || "Unknown"}
                        </Link>
                        <p className="text-xs text-muted-foreground capitalize">{ent.type || "unknown"}</p>
                      </div>
                      <Badge variant="outline" className="text-[10px] capitalize">{ent.type}</Badge>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Timeline */}
          <TabsContent value="timeline" className="mt-4">
            {timelineList.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  No timeline events
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {timelineList.map((evt: any) => (
                  <Card key={evt.id}>
                    <CardContent className="py-3">
                      <div className="flex items-center gap-2 mb-1">
                        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-xs font-medium">
                          {evt.date ? new Date(evt.date).toLocaleDateString() : "No date"}
                        </span>
                      </div>
                      <p className="text-sm font-medium">{evt.title || evt.event || "Event"}</p>
                      {evt.description ? <p className="text-xs text-muted-foreground mt-1">{evt.description}</p> : null}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Relations */}
          <TabsContent value="relations" className="mt-4">
            {relationshipList.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  No relationships found
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3">
                {relationshipList.map((rel: any) => (
                  <Card key={rel.id}>
                    <CardContent className="py-3 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{rel.sourceId ? `Entity #${rel.sourceId}` : "?"}</span>
                        <Badge variant="outline" className="text-[10px]">{rel.type || "related"}</Badge>
                        <span className="font-medium">{rel.targetId ? `Entity #${rel.targetId}` : "?"}</span>
                      </div>
                      {typeof rel.confidence === "number" && (
                        <span className="text-muted-foreground">{(rel.confidence * 100).toFixed(0)}%</span>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Tasks */}
          <TabsContent value="tasks" className="mt-4">
            {taskList.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <Target className="h-8 w-8 text-muted-foreground opacity-40 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No research tasks yet</p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                    Click "Re-evaluate" to analyze story gaps and auto-generate research tasks.
                  </p>
                  <Button size="sm" variant="outline" className="mt-3" onClick={runReevaluate} disabled={reevaluating}>
                    {reevaluating ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                    Re-evaluate
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {taskList.map((task: any) => (
                  <Card key={task.id}>
                    <CardContent className="py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{task.objective}</p>
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            <Badge className={priorityColors[task.priority] || ""}>{task.priority}</Badge>
                            <Badge variant="outline" className="text-[10px] capitalize">{task.status.replace("_", " ")}</Badge>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ─── BRIEFS TAB ─── */}
          <TabsContent value="briefs" className="mt-4 space-y-4">
            {/* Briefs List */}
            {briefList.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <Newspaper className="h-8 w-8 text-muted-foreground opacity-40 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No briefs generated yet</p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                    Select a mode and template, then click Generate to create a brief from this story's evidence.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {briefList.map((brief: any) => {
                  const parsed = parseBriefContent(brief.content);
                  const isExpanded = expandedBriefId === brief.id;
                  return (
                    <Card key={brief.id}>
                      <CardContent className="py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium">{brief.headline}</p>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <Badge variant="outline" className="text-[10px] capitalize">
                                {brief.generationMode || brief.mode || "full"}
                              </Badge>
                              <span className="text-[10px] text-muted-foreground">
                                {brief.createdAt ? new Date(brief.createdAt).toLocaleDateString() : ""}
                              </span>
                              {brief.llmModel && (
                                <span className="text-[10px] text-muted-foreground">{brief.llmModel}</span>
                              )}
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0"
                            onClick={() => setExpandedBriefId(isExpanded ? null : brief.id)}
                          >
                            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </Button>
                        </div>

                        {isExpanded && (
                          <div className="mt-3 space-y-3 text-xs border-t border-border pt-3">
                            {parsed.executiveSummary && (
                              <div>
                                <p className="font-medium text-muted-foreground mb-1">Executive Summary</p>
                                <p className="leading-relaxed">{parsed.executiveSummary}</p>
                              </div>
                            )}
                            {parsed.detailedNarrative && (
                              <div>
                                <p className="font-medium text-muted-foreground mb-1">Detailed Narrative</p>
                                <p className="leading-relaxed whitespace-pre-wrap">{parsed.detailedNarrative}</p>
                              </div>
                            )}
                            {parsed.keyFindings && parsed.keyFindings.length > 0 && (
                              <div>
                                <p className="font-medium text-muted-foreground mb-1">Key Findings</p>
                                <ul className="list-disc list-inside space-y-0.5">
                                  {parsed.keyFindings.map((kf: string, i: number) => (
                                    <li key={i}>{kf}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {parsed.references && parsed.references.length > 0 && (
                              <div>
                                <p className="font-medium text-muted-foreground mb-1">References</p>
                                <ul className="list-disc list-inside space-y-0.5">
                                  {parsed.references.map((ref: any, i: number) => (
                                    <li key={i}>{ref.title || ref} {ref.source ? `(${ref.source})` : ""}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* Gaps */}
          <TabsContent value="gaps" className="mt-4">
            {!gaps || gaps.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <Lightbulb className="h-8 w-8 text-muted-foreground opacity-40 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No gap analysis yet</p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                    Click "Re-evaluate" to analyze what this story knows and what it still needs to find out.
                  </p>
                  <Button size="sm" variant="outline" className="mt-3" onClick={runReevaluate} disabled={reevaluating}>
                    {reevaluating ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                    Re-evaluate
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {gaps.map((gap, i) => (
                  <Card key={i}>
                    <CardContent className="py-3">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className={severityColors[gap.severity] || ""}>{gap.severity}</Badge>
                        <span className="text-xs font-medium capitalize">{gap.type.replace("_", " ")}</span>
                      </div>
                      <p className="text-sm">{gap.description}</p>
                      <p className="text-xs text-muted-foreground mt-1">{gap.details}</p>
                      <p className="text-xs text-indigo-400 mt-1.5 font-medium">{gap.suggestedQuestion}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}

function parseIssues(issues: any): string[] {
  if (!issues) return [];
  if (Array.isArray(issues)) return issues;
  try {
    const parsed = JSON.parse(issues);
    return Array.isArray(parsed) ? parsed : [String(parsed)];
  } catch {
    return [String(issues)];
  }
}
