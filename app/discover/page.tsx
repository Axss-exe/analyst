/**
 * ATIS v4 — /discover
 * 
 * Displays discovered stories with v4 intelligence:
 *   - Story candidates with coherence scores and confidence badges
 *   - Seed vs context evidence breakdown
 *   - Rejected candidates with rejection reasons
 *   - Single-document stories
 *   - Pipeline diagnostics
 *   - Edge explanations per candidate
 * 
 * v3 cluster display preserved in a separate tab.
 */

"use client";

import { useState, useEffect } from "react";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  type DiscoverResponseV4,
  type StoryCandidate,
} from "@/types";
import {
  BookOpen,
  CheckCircle2,
  XCircle,
  FileText,
  Sparkles,
  BarChart3,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

export default function DiscoverPage() {
  const [data, setData] = useState<DiscoverResponseV4 | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedCandidate, setExpandedCandidate] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/discover")
      .then((res) => res.json())
      .then((json: DiscoverResponseV4) => {
        setData(json);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  if (loading) return <DiscoverSkeleton />;
  if (error) return <DiscoverError message={error} />;
  if (!data) return <DiscoverEmpty />;

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Discover Stories</h1>
          <p className="text-muted-foreground mt-1">
            Auto-discovered narrative clusters with coherence validation
          </p>
        </div>

        {/* Diagnostics Bar */}
        <DiagnosticsBar diagnostics={data.diagnostics} />

        <Tabs defaultValue="candidates" className="space-y-4">
          <TabsList>
            <TabsTrigger value="candidates">
              <Sparkles className="h-4 w-4 mr-2" />
              Story Candidates ({data.storyCandidates.length})
            </TabsTrigger>
            <TabsTrigger value="single">
              <FileText className="h-4 w-4 mr-2" />
              Single-Document ({data.singleDocumentStories.length})
            </TabsTrigger>
            <TabsTrigger value="rejected">
              <XCircle className="h-4 w-4 mr-2" />
              Rejected ({data.rejectedCandidates.length})
            </TabsTrigger>
            <TabsTrigger value="legacy">
              <BookOpen className="h-4 w-4 mr-2" />
              Legacy Clusters ({data.clusters.length})
            </TabsTrigger>
          </TabsList>

          {/* Story Candidates */}
          <TabsContent value="candidates" className="space-y-4">
            {data.storyCandidates.length === 0 ? (
              <EmptyState message="No story candidates found. Add more evidence with specific program references." />
            ) : (
              data.storyCandidates.map((candidate) => (
                <StoryCandidateCard
                  key={candidate.id}
                  candidate={candidate}
                  isExpanded={expandedCandidate === candidate.id}
                  onToggle={() =>
                    setExpandedCandidate(expandedCandidate === candidate.id ? null : candidate.id!)
                  }
                />
              ))
            )}
          </TabsContent>

          {/* Single-Document Stories */}
          <TabsContent value="single" className="space-y-4">
            {data.singleDocumentStories.length === 0 ? (
              <EmptyState message="No single-document stories found. Documents need complete problem→intervention→outcome structure." />
            ) : (
              data.singleDocumentStories.map((story) => (
                <StoryCandidateCard
                  key={story.id}
                  candidate={story}
                  isExpanded={expandedCandidate === story.id}
                  onToggle={() =>
                    setExpandedCandidate(expandedCandidate === story.id ? null : story.id!)
                  }
                  singleDoc
                />
              ))
            )}
          </TabsContent>

          {/* Rejected Candidates */}
          <TabsContent value="rejected" className="space-y-4">
            {data.rejectedCandidates.length === 0 ? (
              <EmptyState message="No rejected candidates. All discovered clusters passed coherence validation." />
            ) : (
              data.rejectedCandidates.map((candidate) => (
                <RejectedCandidateCard key={candidate.id} candidate={candidate} />
              ))
            )}
          </TabsContent>

          {/* Legacy Clusters (v3) */}
          <TabsContent value="legacy" className="space-y-4">
            {data.clusters.length === 0 ? (
              <EmptyState message="No legacy clusters found." />
            ) : (
              data.clusters.map((cluster) => (
                <Card key={cluster.id}>
                  <CardHeader>
                    <CardTitle className="text-lg">{cluster.name}</CardTitle>
                    <CardDescription>{cluster.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex gap-2 flex-wrap">
                      <Badge variant="secondary">Density: {cluster.density.toFixed(2)}</Badge>
                      <Badge variant="outline">{cluster.evidenceCount} evidence</Badge>
                      <Badge variant="outline">{cluster.entityCount} entities</Badge>
                      <Badge variant={cluster.status === "stable" ? "default" : "secondary"}>
                        {cluster.status}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}

// ═════════════════════════════════════════════════════════════════
// COMPONENTS
// ═════════════════════════════════════════════════════════════════

function StoryCandidateCard({
  candidate,
  isExpanded,
  onToggle,
  singleDoc = false,
}: {
  candidate: StoryCandidate;
  isExpanded: boolean;
  onToggle: () => void;
  singleDoc?: boolean;
}) {
  const statusColor =
    candidate.status === "validated"
      ? "bg-green-100 text-green-800 border-green-300"
      : candidate.status === "candidate"
        ? "bg-amber-100 text-amber-800 border-amber-300"
        : "bg-slate-100 text-slate-800 border-slate-300";

  return (
    <Card className={`border-l-4 ${singleDoc ? "border-l-purple-500" : candidate.status === "validated" ? "border-l-green-500" : "border-l-amber-500"}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg flex items-center gap-2">
              {candidate.name}
              <span className={`text-xs px-2 py-0.5 rounded-full border ${statusColor}`}>
                {candidate.status}
              </span>
              {singleDoc && (
                <Badge variant="outline" className="text-purple-600 border-purple-300">
                  Single-Document
                </Badge>
              )}
            </CardTitle>
            <CardDescription className="max-w-2xl">
              {candidate.description}
            </CardDescription>
          </div>
          <button
            onClick={onToggle}
            className="p-1 hover:bg-slate-100 rounded-md transition-colors"
          >
            {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          </button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Score Bar */}
        <div className="flex items-center gap-4 text-sm">
          <ScoreBadge label="Coherence" value={candidate.coherenceScore} color="blue" />
          <ScoreBadge label="Confidence" value={candidate.confidence} color="emerald" />
          <Badge variant="outline" className="font-mono">
            {candidate.evidenceIds.length} docs
            {candidate.seedEvidenceIds.length > 0 && (
              <span className="text-muted-foreground ml-1">
                ({candidate.seedEvidenceIds.length} seed
                {candidate.contextEvidenceIds.length > 0 && ` + ${candidate.contextEvidenceIds.length} context`})
              </span>
            )}
          </Badge>
        </div>

        {/* Relationship Counts */}
        {candidate.relationshipCounts && (
          <div className="flex gap-2 text-xs">
            <span className="px-2 py-1 bg-green-50 text-green-700 rounded">
              {candidate.relationshipCounts.strong} strong
            </span>
            <span className="px-2 py-1 bg-amber-50 text-amber-700 rounded">
              {candidate.relationshipCounts.medium} medium
            </span>
            <span className="px-2 py-1 bg-slate-50 text-slate-600 rounded">
              {candidate.relationshipCounts.weak} weak
            </span>
          </div>
        )}

        {/* Dominant Theme */}
        {candidate.dominantTheme && (
          <div className="text-sm">
            <span className="text-muted-foreground">Theme:</span>{" "}
            <span className="font-medium">{candidate.dominantTheme}</span>
          </div>
        )}

        {/* Expanded Details */}
        {isExpanded && (
          <div className="space-y-4 pt-2 border-t">
            {/* Reasons */}
            <div>
              <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                Why These Documents Belong Together
              </h4>
              <ul className="space-y-1 text-sm text-muted-foreground">
                {candidate.reasons?.map((reason, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-slate-400 mt-1">•</span>
                    {reason}
                  </li>
                )) || <li>No specific reasons recorded.</li>}
              </ul>
            </div>

            {/* Causal Chain */}
            {candidate.causalChain && candidate.causalChain.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold mb-2">Causal Chain</h4>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  {candidate.causalChain.map((link, i) => (
                    <span key={i} className="flex items-center gap-2">
                      <Badge variant="secondary" className="font-mono text-xs">
                        E{link.from}
                      </Badge>
                      <span className="text-muted-foreground">→</span>
                      <span className="text-xs bg-slate-100 px-2 py-1 rounded">
                        {link.relationshipType}
                      </span>
                      <span className="text-muted-foreground">→</span>
                      <Badge variant="secondary" className="font-mono text-xs">
                        E{link.to}
                      </Badge>
                      {i < candidate.causalChain!.length - 1 && (
                        <span className="text-muted-foreground mx-1">|</span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Diagnostics */}
            {candidate.diagnostics && (
              <DiagnosticsPanel diagnostics={candidate.diagnostics} />
            )}

            {/* Evidence IDs */}
            <div>
              <h4 className="text-sm font-semibold mb-2">Evidence</h4>
              <div className="flex flex-wrap gap-1">
                {candidate.evidenceIds.map((eid) => (
                  <Badge
                    key={eid}
                    variant={candidate.seedEvidenceIds.includes(eid) ? "default" : "outline"}
                    className="text-xs font-mono"
                  >
                    E{eid}
                    {candidate.seedEvidenceIds.includes(eid) && " (seed)"}
                    {candidate.contextEvidenceIds.includes(eid) && " (context)"}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RejectedCandidateCard({ candidate }: { candidate: StoryCandidate }) {
  return (
    <Card className="border-l-4 border-l-red-400 opacity-75">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          {candidate.name}
          <span className="text-xs px-2 py-0.5 rounded-full border bg-red-100 text-red-800 border-red-300">
            rejected
          </span>
        </CardTitle>
        <CardDescription>{candidate.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-4 text-sm">
          <ScoreBadge label="Coherence" value={candidate.coherenceScore} color="red" />
          <ScoreBadge label="Confidence" value={candidate.confidence} color="red" />
          <Badge variant="outline" className="font-mono">
            {candidate.evidenceIds.length} docs
          </Badge>
        </div>

        {/* Rejection Reasons */}
        {candidate.diagnostics && (
          <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm">
            <h4 className="font-semibold text-red-800 mb-1 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Rejection Reasons
            </h4>
            <ul className="space-y-1 text-red-700">
              {candidate.diagnostics.genericLocationPenalty > 0.5 && (
                <li>• Held together primarily by shared location</li>
              )}
              {candidate.diagnostics.genericActorPenalty > 0.5 && (
                <li>• Held together primarily by shared generic actor</li>
              )}
              {candidate.diagnostics.unrelatedSectorPenalty > 0.3 && (
                <li>• Documents concern unrelated sectors</li>
              )}
              {candidate.diagnostics.contradictoryProgramPenalty > 0.3 && (
                <li>• Contradictory program references</li>
              )}
              {candidate.coherenceScore < 0.3 && (
                <li>• Coherence score too low ({candidate.coherenceScore.toFixed(2)})</li>
              )}
              {candidate.confidence < 0.25 && (
                <li>• Confidence too low ({candidate.confidence.toFixed(2)})</li>
              )}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DiagnosticsBar({
  diagnostics,
}: {
  diagnostics: DiscoverResponseV4["diagnostics"];
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      <StatCard label="Relationships" value={diagnostics.totalRelationshipsEvaluated} icon={BarChart3} />
      <StatCard label="Story Edges" value={diagnostics.storyGraphEdges} icon={CheckCircle2} color="green" />
      <StatCard label="Context Edges" value={diagnostics.contextGraphEdges} icon={BookOpen} color="blue" />
      <StatCard label="Seeds Found" value={diagnostics.seedsFound} icon={Sparkles} color="amber" />
      <StatCard label="Expansions" value={diagnostics.expansionsPerformed} icon={FileText} color="purple" />
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  color = "slate",
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  color?: "slate" | "green" | "blue" | "amber" | "purple";
}) {
  const colorMap = {
    slate: "bg-slate-50 text-slate-700",
    green: "bg-green-50 text-green-700",
    blue: "bg-blue-50 text-blue-700",
    amber: "bg-amber-50 text-amber-700",
    purple: "bg-purple-50 text-purple-700",
  };

  return (
    <div className={`rounded-lg p-3 ${colorMap[color]}`}>
      <div className="flex items-center gap-2 text-xs font-medium opacity-70 mb-1">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="text-2xl font-bold">{value.toLocaleString()}</div>
    </div>
  );
}

function ScoreBadge({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: "blue" | "emerald" | "red";
}) {
  const colorMap = {
    blue: "bg-blue-50 text-blue-700 border-blue-200",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    red: "bg-red-50 text-red-700 border-red-200",
  };

  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-sm ${colorMap[color]}`}>
      <span className="font-medium">{label}:</span>
      <span className="font-bold font-mono">{(value * 100).toFixed(0)}%</span>
    </div>
  );
}

function DiagnosticsPanel({
  diagnostics,
}: {
  diagnostics: NonNullable<StoryCandidate["diagnostics"]>;
}) {
  const scores = [
    { label: "Program Identity", value: diagnostics.programIdentityScore },
    { label: "Causal Continuity", value: diagnostics.causalContinuityScore },
    { label: "Problem Consistency", value: diagnostics.problemConsistencyScore },
    { label: "Event Continuity", value: diagnostics.eventContinuityScore },
    { label: "Outcome Consistency", value: diagnostics.outcomeConsistencyScore },
    { label: "Temporal Coherence", value: diagnostics.temporalCoherenceScore },
    { label: "Evidence Density", value: diagnostics.evidenceDensityScore },
  ];

  const penalties = [
    { label: "Generic Location", value: diagnostics.genericLocationPenalty },
    { label: "Generic Actor", value: diagnostics.genericActorPenalty },
    { label: "Unrelated Sector", value: diagnostics.unrelatedSectorPenalty },
    { label: "Contradictory Program", value: diagnostics.contradictoryProgramPenalty },
  ];

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold flex items-center gap-2">
        <BarChart3 className="h-4 w-4" />
        Coherence Diagnostics
      </h4>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
        {scores.map((s) => (
          <div key={s.label} className="bg-slate-50 rounded p-2">
            <div className="text-muted-foreground mb-1">{s.label}</div>
            <div className="font-mono font-bold">{(s.value * 100).toFixed(0)}%</div>
            <div className="w-full bg-slate-200 rounded-full h-1.5 mt-1">
              <div
                className="bg-blue-500 h-1.5 rounded-full transition-all"
                style={{ width: `${s.value * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      {penalties.some((p) => p.value > 0) && (
        <div className="text-xs">
          <span className="text-muted-foreground">Penalties:</span>{" "}
          {penalties
            .filter((p) => p.value > 0)
            .map((p) => `${p.label} (${(p.value * 100).toFixed(0)}%)`)
            .join(", ")}
        </div>
      )}
    </div>
  );
}

function DiscoverSkeleton() {
  return (
    <AppShell>
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-4 w-96" />
        <div className="grid grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
        <Skeleton className="h-8 w-96" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-40" />
        ))}
      </div>
    </AppShell>
  );
}

function DiscoverError({ message }: { message: string }) {
  return (
    <AppShell>
      <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <AlertTriangle className="h-12 w-12 text-red-500" />
        <h2 className="text-xl font-semibold">Failed to load discovery data</h2>
        <p className="text-muted-foreground">{message}</p>
      </div>
    </AppShell>
  );
}

function DiscoverEmpty() {
  return (
    <AppShell>
      <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <BookOpen className="h-12 w-12 text-slate-400" />
        <h2 className="text-xl font-semibold">No data available</h2>
        <p className="text-muted-foreground">Add evidence to begin story discovery.</p>
      </div>
    </AppShell>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center py-12 border-2 border-dashed rounded-lg">
      <FileText className="h-8 w-8 text-slate-400 mx-auto mb-3" />
      <p className="text-muted-foreground">{message}</p>
    </div>
  );
}
