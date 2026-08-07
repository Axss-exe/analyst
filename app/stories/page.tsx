/**
 * ATIS v4 — /stories
 * 
 * Displays all stories with v4 provenance metadata:
 *   - Dominant program, problem, and theme
 *   - Causal chain visualization
 *   - Relationship count breakdown (strong/medium/weak)
 *   - Coherence diagnostics
 *   - Why-documents-belong explanations
 *   - Filter by validation status
 * 
 * v3 features preserved: manual/auto distinction, confidence badges.
 */

"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  type StoriesResponse,
  type StoryItemV4,
} from "@/types";
import {
  BookOpen,
  Sparkles,
  User,
  BarChart3,
  ArrowRight,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Filter,
} from "lucide-react";

export default function StoriesPage() {
  const [data, setData] = useState<StoriesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedStory, setExpandedStory] = useState<number | null>(null);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    fetch(`/api/stories?filter=${filter}`)
      .then((res) => res.json())
      .then((json: StoriesResponse) => {
        setData(json);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [filter]);

  if (loading) return <StoriesSkeleton />;
  if (error) return <StoriesError message={error} />;
  if (!data || data.stories.length === 0) return <StoriesEmpty />;

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Stories</h1>
            <p className="text-muted-foreground mt-1">
              {data.total} stories ({data.manualCount} manual, {data.autoCount} auto-discovered)
            </p>
          </div>
        </div>

        {/* Filter Tabs */}
        <Tabs value={filter} onValueChange={setFilter} className="space-y-4">
          <TabsList>
            <TabsTrigger value="all">All ({data.total})</TabsTrigger>
            <TabsTrigger value="manual">Manual ({data.manualCount})</TabsTrigger>
            <TabsTrigger value="auto">Auto ({data.autoCount})</TabsTrigger>
            <TabsTrigger value="validated">Validated</TabsTrigger>
            <TabsTrigger value="rejected">Rejected</TabsTrigger>
          </TabsList>

          <TabsContent value={filter} className="space-y-4">
            {data.stories.map((story) => (
              <StoryCard
                key={story.id}
                story={story}
                isExpanded={expandedStory === story.id}
                onToggle={() =>
                  setExpandedStory(expandedStory === story.id ? null : story.id)
                }
              />
            ))}
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}

// ═════════════════════════════════════════════════════════════════
// STORY CARD
// ═════════════════════════════════════════════════════════════════

function StoryCard({
  story,
  isExpanded,
  onToggle,
}: {
  story: StoryItemV4;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const isManual = story.generationType === "manual";
  const isValidated = story.status === "validated";
  const isRejected = story.status === "rejected";

  const statusColor = isManual
    ? "bg-blue-100 text-blue-800 border-blue-300"
    : isValidated
      ? "bg-green-100 text-green-800 border-green-300"
      : isRejected
        ? "bg-red-100 text-red-800 border-red-300"
        : "bg-amber-100 text-amber-800 border-amber-300";

  return (
    <Card className={`border-l-4 ${
      isManual
        ? "border-l-blue-500"
        : isValidated
          ? "border-l-green-500"
          : isRejected
            ? "border-l-red-400"
            : "border-l-amber-500"
    }`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-lg">{story.title}</CardTitle>
              <span className={`text-xs px-2 py-0.5 rounded-full border ${statusColor}`}>
                {story.status}
              </span>
              <Badge variant={isManual ? "default" : "secondary"} className="text-xs">
                {isManual ? (
                  <><User className="h-3 w-3 mr-1" /> Manual</>
                ) : (
                  <><Sparkles className="h-3 w-3 mr-1" /> Auto</>
                )}
              </Badge>
            </div>
            <CardDescription className="max-w-3xl">
              {story.overview}
            </CardDescription>
          </div>
          <button
            onClick={onToggle}
            className="p-1 hover:bg-slate-100 rounded-md transition-colors ml-2"
          >
            {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          </button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Top Row: Scores & Counts */}
        <div className="flex flex-wrap items-center gap-3 text-sm">
          {story.confidence !== undefined && (
            <ScoreBadge
              label="Confidence"
              value={story.confidence}
              color={story.confidence > 0.7 ? "green" : story.confidence > 0.4 ? "amber" : "red"}
            />
          )}
          <Badge variant="outline" className="font-mono">
            <BookOpen className="h-3 w-3 mr-1" />
            {story.evidenceCount} evidence
          </Badge>
          {story.clusterIds && story.clusterIds.length > 0 && (
            <Badge variant="outline" className="font-mono">
              {story.clusterIds.length} cluster{story.clusterIds.length > 1 ? "s" : ""}
            </Badge>
          )}
        </div>

        {/* v4 Metadata Row */}
        {(story.dominantProgram || story.dominantProblem || story.dominantTheme) && (
          <div className="flex flex-wrap gap-2 text-xs">
            {story.dominantProgram && (
              <span className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-md border border-blue-200">
                Program: {story.dominantProgram}
              </span>
            )}
            {story.dominantProblem && (
              <span className="px-2.5 py-1 bg-red-50 text-red-700 rounded-md border border-red-200">
                Problem: {story.dominantProblem}
              </span>
            )}
            {story.dominantTheme && (
              <span className="px-2.5 py-1 bg-purple-50 text-purple-700 rounded-md border border-purple-200">
                Theme: {story.dominantTheme}
              </span>
            )}
          </div>
        )}

        {/* Relationship Counts */}
        {story.relationshipCounts && (
          <div className="flex gap-2 text-xs">
            <span className="px-2 py-1 bg-green-50 text-green-700 rounded flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" />
              {story.relationshipCounts.strong} strong
            </span>
            <span className="px-2 py-1 bg-amber-50 text-amber-700 rounded flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              {story.relationshipCounts.medium} medium
            </span>
            <span className="px-2 py-1 bg-slate-50 text-slate-600 rounded flex items-center gap-1">
              <Filter className="h-3 w-3" />
              {story.relationshipCounts.weak} weak
            </span>
          </div>
        )}

        {/* Expanded Details */}
        {isExpanded && (
          <div className="space-y-4 pt-3 border-t">
            {/* Causal Chain */}
            {story.causalChain && story.causalChain.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <ArrowRight className="h-4 w-4 text-blue-600" />
                  Causal Chain
                </h4>
                <div className="flex flex-wrap items-center gap-2 text-sm bg-slate-50 rounded-lg p-3">
                  {story.causalChain.map((link, i) => (
                    <span key={i} className="flex items-center gap-2">
                      <Badge variant="secondary" className="font-mono text-xs">
                        E{link.from}
                      </Badge>
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                        {link.relationshipType}
                      </span>
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                      <Badge variant="secondary" className="font-mono text-xs">
                        E{link.to}
                      </Badge>
                      {i < story.causalChain!.length - 1 && (
                        <span className="text-muted-foreground mx-1">|</span>
                      )}
                    </span>
                  ))}
                </div>
                {story.causalChain.map((link, i) => (
                  link.description && (
                    <p key={`desc-${i}`} className="text-xs text-muted-foreground mt-1 ml-2">
                      {link.description}
                    </p>
                  )
                ))}
              </div>
            )}

            {/* Diagnostics */}
            {story.diagnostics && (
              <div>
                <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Coherence Diagnostics
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <DiagnosticBar label="Program Identity" value={story.diagnostics.programIdentityScore} />
                  <DiagnosticBar label="Causal Continuity" value={story.diagnostics.causalContinuityScore} />
                  <DiagnosticBar label="Problem Consistency" value={story.diagnostics.problemConsistencyScore} />
                  <DiagnosticBar label="Event Continuity" value={story.diagnostics.eventContinuityScore} />
                  <DiagnosticBar label="Outcome Consistency" value={story.diagnostics.outcomeConsistencyScore} />
                  <DiagnosticBar label="Temporal Coherence" value={story.diagnostics.temporalCoherenceScore} />
                  <DiagnosticBar label="Evidence Density" value={story.diagnostics.evidenceDensityScore} />
                </div>
                {/* Penalties */}
                {[
                  { label: "Generic Location", value: story.diagnostics.genericLocationPenalty },
                  { label: "Generic Actor", value: story.diagnostics.genericActorPenalty },
                  { label: "Unrelated Sector", value: story.diagnostics.unrelatedSectorPenalty },
                  { label: "Contradictory Program", value: story.diagnostics.contradictoryProgramPenalty },
                ].some((p) => p.value > 0) && (
                  <div className="mt-2 text-xs text-red-600">
                    Penalties:{" "}
                    {[
                      { label: "Generic Location", value: story.diagnostics.genericLocationPenalty },
                      { label: "Generic Actor", value: story.diagnostics.genericActorPenalty },
                      { label: "Unrelated Sector", value: story.diagnostics.unrelatedSectorPenalty },
                      { label: "Contradictory Program", value: story.diagnostics.contradictoryProgramPenalty },
                    ]
                      .filter((p) => p.value > 0)
                      .map((p) => `${p.label} (${(p.value * 100).toFixed(0)}%)`)
                      .join(", ")}
                  </div>
                )}
              </div>
            )}

            {/* Why Documents Belong */}
            {story.whyDocumentsBelong && story.whyDocumentsBelong.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  Why These Documents Belong Together
                </h4>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {story.whyDocumentsBelong.map((reason, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-green-500 mt-0.5">•</span>
                      {reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Why Nearby Documents Rejected */}
            {story.whyNearbyDocumentsRejected && story.whyNearbyDocumentsRejected.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-red-600" />
                  Why Nearby Documents Were Rejected
                </h4>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {story.whyNearbyDocumentsRejected.map((reason, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-red-400 mt-0.5">•</span>
                      {reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Reasons */}
            {story.reasons && story.reasons.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold mb-2">Discovery Reasons</h4>
                <div className="flex flex-wrap gap-1.5">
                  {story.reasons.map((reason, i) => (
                    <span
                      key={i}
                      className="text-xs bg-slate-100 text-slate-700 px-2 py-1 rounded"
                    >
                      {reason}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ═════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═════════════════════════════════════════════════════════════════

function ScoreBadge({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: "green" | "amber" | "red";
}) {
  const colorMap = {
    green: "bg-green-50 text-green-700 border-green-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    red: "bg-red-50 text-red-700 border-red-200",
  };

  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-sm ${colorMap[color]}`}>
      <span className="font-medium">{label}:</span>
      <span className="font-bold font-mono">{(value * 100).toFixed(0)}%</span>
    </div>
  );
}

function DiagnosticBar({ label, value }: { label: string; value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 70 ? "bg-green-500" : pct >= 40 ? "bg-amber-500" : "bg-red-500";

  return (
    <div className="bg-slate-50 rounded p-2">
      <div className="text-xs text-muted-foreground mb-1 truncate">{label}</div>
      <div className="font-mono font-bold text-sm">{pct}%</div>
      <div className="w-full bg-slate-200 rounded-full h-1.5 mt-1">
        <div className={`${color} h-1.5 rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function StoriesSkeleton() {
  return (
    <AppShell>
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-4 w-96" />
        <Skeleton className="h-8 w-80" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
    </AppShell>
  );
}

function StoriesError({ message }: { message: string }) {
  return (
    <AppShell>
      <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <BookOpen className="h-12 w-12 text-red-500" />
        <h2 className="text-xl font-semibold">Failed to load stories</h2>
        <p className="text-muted-foreground">{message}</p>
      </div>
    </AppShell>
  );
}

function StoriesEmpty() {
  return (
    <AppShell>
      <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <BookOpen className="h-12 w-12 text-slate-400" />
        <h2 className="text-xl font-semibold">No stories yet</h2>
        <p className="text-muted-foreground">
          Add evidence and run discovery to generate stories.
        </p>
      </div>
    </AppShell>
  );
}
