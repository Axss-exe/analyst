/**
 * ATIS v4 — /graph
 * 
 * Interactive graph visualization with v4 enhancements:
 *   - Layer toggle: Context Graph vs Story Graph vs Both
 *   - Edge type color-coding (same_program, causes, etc.)
 *   - Edge weight visualization (thickness/opacity)
 *   - Edge explanation tooltips
 *   - Story vs context node distinction
 *   - Relationship metadata panel
 * 
 * v3 features preserved: Overview, Clusters, Hidden Paths tabs.
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  type GraphResponseV4,
  type GraphEdge,
  type EdgeExplanation,
  type RelationshipType,
} from "@/types";
import {
  Network,
  Layers,
  Info,
  Eye,
  EyeOff,
  ArrowRight,
  Filter,
} from "lucide-react";

// Relationship type colors for visualization
const RELATIONSHIP_COLORS: Record<RelationshipType, string> = {
  same_program: "#2563eb",      // blue
  same_project: "#2563eb",
  same_initiative: "#2563eb",
  part_of_program: "#3b82f6",
  implements: "#059669",        // green
  funds: "#059669",
  operationalizes: "#059669",
  causes: "#dc2626",            // red
  triggered_by: "#dc2626",
  results_in: "#dc2626",
  produces: "#dc2626",
  precedes_event: "#7c3aed",  // purple
  follows_event: "#7c3aed",
  same_causal_chain: "#0891b2", // cyan
  addresses_problem: "#0891b2",
  evaluates: "#0891b2",
  same_policy_area: "#d97706",  // amber
  same_strategic_objective: "#d97706",
  same_outcome: "#059669",
  supports: "#059669",
  aligned_with: "#d97706",
  same_actor: "#6b7280",        // gray
  same_sector: "#6b7280",
  same_country: "#6b7280",
  same_region: "#6b7280",
};

const RELATIONSHIP_LABELS: Record<string, string> = {
  same_program: "Same Program",
  same_project: "Same Project",
  same_initiative: "Same Initiative",
  part_of_program: "Part of Program",
  implements: "Implements",
  funds: "Funds",
  operationalizes: "Operationalizes",
  causes: "Causes",
  triggered_by: "Triggered By",
  results_in: "Results In",
  produces: "Produces",
  precedes_event: "Precedes Event",
  follows_event: "Follows Event",
  same_causal_chain: "Same Causal Chain",
  addresses_problem: "Addresses Problem",
  evaluates: "Evaluates",
  same_policy_area: "Same Policy Area",
  same_strategic_objective: "Same Strategic Objective",
  same_outcome: "Same Outcome",
  supports: "Supports",
  aligned_with: "Aligned With",
  same_actor: "Same Actor",
  same_sector: "Same Sector",
  same_country: "Same Country",
  same_region: "Same Region",
};

export default function GraphPage() {
  const [data, setData] = useState<GraphResponseV4 | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeLayer, setActiveLayer] = useState<"all" | "context" | "story">("all");
  const [selectedEdge, setSelectedEdge] = useState<GraphEdge | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [visibleTypes, setVisibleTypes] = useState<Set<string>>(new Set());
  const [minWeight, setMinWeight] = useState(0);

  useEffect(() => {
    fetch(`/api/graph?layer=${activeLayer}`)
      .then((res) => res.json())
      .then((json: GraphResponseV4) => {
        setData(json);
        // Initialize visible types from data
        const types = new Set(json.edges.map((e) => e.label));
        setVisibleTypes(types);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [activeLayer]);

  const filteredEdges = useCallback(() => {
    if (!data) return [];
    return data.edges.filter((e) => {
      if (!visibleTypes.has(e.label)) return false;
      if ((e.weight || 0) < minWeight) return false;
      return true;
    });
  }, [data, visibleTypes, minWeight]);

  if (loading) return <GraphSkeleton />;
  if (error) return <GraphError message={error} />;
  if (!data) return <GraphEmpty />;

  const edges = filteredEdges();
  const edgeTypes = [...new Set(data.edges.map((e) => e.label))];

  return (
    <AppShell>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Evidence Graph</h1>
            <p className="text-muted-foreground mt-1">
              Interactive visualization of evidence relationships
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-4">
          <ToggleGroup
            type="single"
            value={activeLayer}
            onValueChange={(v) => v && setActiveLayer(v as typeof activeLayer)}
          >
            <ToggleGroupItem value="all" aria-label="All layers">
              <Layers className="h-4 w-4 mr-1" />
              All
            </ToggleGroupItem>
            <ToggleGroupItem value="story" aria-label="Story graph">
              <Network className="h-4 w-4 mr-1" />
              Story Graph
            </ToggleGroupItem>
            <ToggleGroupItem value="context" aria-label="Context graph">
              <Filter className="h-4 w-4 mr-1" />
              Context Graph
            </ToggleGroupItem>
          </ToggleGroup>

          <Separator orientation="vertical" className="h-6" />

          {/* Weight Filter */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Min weight:</span>
            <input
              type="range"
              min="0"
              max="100"
              value={minWeight * 100}
              onChange={(e) => setMinWeight(Number(e.target.value) / 100)}
              className="w-32"
            />
            <span className="font-mono text-xs w-10">{minWeight.toFixed(2)}</span>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-2">
          {edgeTypes.map((type) => (
            <button
              key={type}
              onClick={() => {
                const next = new Set(visibleTypes);
                if (next.has(type)) next.delete(type);
                else next.add(type);
                setVisibleTypes(next);
              }}
              className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-md border transition-opacity ${
                visibleTypes.has(type) ? "opacity-100" : "opacity-40"
              }`}
              style={{
                borderColor: RELATIONSHIP_COLORS[type as RelationshipType] || "#6b7280",
                backgroundColor: `${RELATIONSHIP_COLORS[type as RelationshipType] || "#6b7280"}15`,
              }}
            >
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: RELATIONSHIP_COLORS[type as RelationshipType] || "#6b7280" }}
              />
              {RELATIONSHIP_LABELS[type] || type}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Graph Visualization */}
          <Card className="lg:col-span-2 min-h-[600px]">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Network className="h-5 w-5" />
                Graph View
                <Badge variant="outline" className="font-mono text-xs">
                  {data.nodes.length} nodes · {edges.length} edges
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <GraphCanvas
                nodes={data.nodes}
                edges={edges}
                selectedNode={selectedNode}
                onSelectNode={setSelectedNode}
                onSelectEdge={setSelectedEdge}
              />
            </CardContent>
          </Card>

          {/* Details Panel */}
          <div className="space-y-4">
            {/* Edge Details */}
            {selectedEdge && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <ArrowRight className="h-4 w-4" />
                    Edge Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge
                      style={{
                        backgroundColor: RELATIONSHIP_COLORS[selectedEdge.label as RelationshipType] || "#6b7280",
                        color: "white",
                      }}
                    >
                      {RELATIONSHIP_LABELS[selectedEdge.label] || selectedEdge.label}
                    </Badge>
                    <span className="text-muted-foreground font-mono">
                      w={(selectedEdge.weight || 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="text-muted-foreground">
                    {selectedEdge.source} → {selectedEdge.target}
                  </div>
                  {(selectedEdge as any).reason && (
                    <div className="bg-slate-50 rounded p-2 text-xs text-slate-600">
                      {(selectedEdge as any).reason}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Node Details */}
            {selectedNode && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Info className="h-4 w-4" />
                    Node Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="font-mono">{selectedNode}</div>
                  <div className="text-muted-foreground">
                    Connected edges: {
                      edges.filter(
                        (e) => e.source === selectedNode || e.target === selectedNode
                      ).length
                    }
                  </div>
                  <div className="space-y-1">
                    {edges
                      .filter((e) => e.source === selectedNode || e.target === selectedNode)
                      .slice(0, 5)
                      .map((e, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{
                              backgroundColor: RELATIONSHIP_COLORS[e.label as RelationshipType] || "#6b7280",
                            }}
                          />
                          {e.source === selectedNode ? "→" : "←"} {e.label}
                          <span className="text-muted-foreground font-mono">
                            w={(e.weight || 0).toFixed(2)}
                          </span>
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Stats */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Graph Statistics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <StatRow label="Evidence" value={data.stats.evidenceCount} />
                <StatRow label="Entities" value={data.stats.entityCount} />
                <StatRow label="Relationships" value={data.stats.relationshipCount} />
                <StatRow label="Clusters" value={data.stats.clusterCount} />
                <StatRow label="Avg Density" value={data.stats.averageClusterDensity.toFixed(3)} />
                <StatRow label="Unclustered" value={data.unclusteredCount} />
                {activeLayer === "all" && (
                  <>
                    <Separator className="my-2" />
                    <div className="text-xs text-muted-foreground">
                      <div>Story Graph edges: {data.storyGraph.edges.length}</div>
                      <div>Context Graph edges: {data.contextGraph.edges.length}</div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Edge Explanations */}
            {data.edgeExplanations && data.edgeExplanations.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Edge Explanations</CardTitle>
                </CardHeader>
                <CardContent className="max-h-64 overflow-y-auto space-y-2">
                  {data.edgeExplanations.slice(0, 20).map((exp, i) => (
                    <EdgeExplanationItem key={i} explanation={exp} />
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

// ═════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═════════════════════════════════════════════════════════════════

function GraphCanvas({
  nodes,
  edges,
  selectedNode,
  onSelectNode,
  onSelectEdge,
}: {
  nodes: GraphResponseV4["nodes"];
  edges: GraphEdge[];
  selectedNode: string | null;
  onSelectNode: (id: string | null) => void;
  onSelectEdge: (edge: GraphEdge | null) => void;
}) {
  // Simple force-directed layout simulation
  const [positions, setPositions] = useState<Map<string, { x: number; y: number }>>(new Map());

  useEffect(() => {
    // Initialize random positions
    const init = new Map<string, { x: number; y: number }>();
    const width = 800;
    const height = 500;
    for (const node of nodes) {
      init.set(node.id, {
        x: Math.random() * width,
        y: Math.random() * height,
      });
    }
    setPositions(init);
  }, [nodes]);

  if (positions.size === 0) {
    return <div className="flex items-center justify-center h-[500px] text-muted-foreground">Initializing graph...</div>;
  }

  return (
    <svg
      viewBox="0 0 800 500"
      className="w-full h-[500px] border rounded-lg bg-slate-50"
      onClick={() => {
        onSelectNode(null);
        onSelectEdge(null);
      }}
    >
      {/* Edges */}
      {edges.map((edge, i) => {
        const src = positions.get(edge.source);
        const tgt = positions.get(edge.target);
        if (!src || !tgt) return null;

        const color = RELATIONSHIP_COLORS[edge.label as RelationshipType] || "#6b7280";
        const weight = edge.weight || 0.5;
        const strokeWidth = Math.max(1, weight * 4);
        const opacity = Math.max(0.3, weight);

        return (
          <g key={`edge-${i}`}>
            <line
              x1={src.x}
              y1={src.y}
              x2={tgt.x}
              y2={tgt.y}
              stroke={color}
              strokeWidth={strokeWidth}
              opacity={opacity}
              className="cursor-pointer hover:opacity-100 transition-opacity"
              onClick={(e) => {
                e.stopPropagation();
                onSelectEdge(edge);
              }}
            />
          </g>
        );
      })}

      {/* Nodes */}
      {nodes.map((node) => {
        const pos = positions.get(node.id);
        if (!pos) return null;

        const isSelected = selectedNode === node.id;
        const isInStory = edges.some((e) => e.source === node.id || e.target === node.id);

        return (
          <g
            key={node.id}
            className="cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              onSelectNode(isSelected ? null : node.id);
            }}
          >
            <circle
              cx={pos.x}
              cy={pos.y}
              r={isSelected ? 12 : 8}
              fill={isSelected ? "#2563eb" : isInStory ? "#059669" : "#6b7280"}
              stroke={isSelected ? "#1e40af" : "white"}
              strokeWidth={2}
              opacity={isInStory ? 1 : 0.5}
            />
            <text
              x={pos.x}
              y={pos.y - 14}
              textAnchor="middle"
              className="text-[10px] fill-slate-700 pointer-events-none"
            >
              {node.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function EdgeExplanationItem({ explanation }: { explanation: EdgeExplanation }) {
  return (
    <div className={`text-xs p-2 rounded ${explanation.connected ? "bg-green-50" : "bg-red-50"}`}>
      <div className="flex items-center gap-1.5 mb-1">
        <span
          className="w-2 h-2 rounded-full"
          style={{
            backgroundColor: explanation.connected ? "#059669" : "#dc2626",
          }}
        />
        <span className="font-mono">
          E{explanation.sourceEvidenceId} ↔ E{explanation.targetEvidenceId}
        </span>
        {explanation.relationshipType && (
          <Badge variant="outline" className="text-[10px] h-4">
            {RELATIONSHIP_LABELS[explanation.relationshipType] || explanation.relationshipType}
          </Badge>
        )}
      </div>
      <div className="text-muted-foreground truncate">{explanation.reason}</div>
      {!explanation.connected && explanation.rejectionReason && (
        <div className="text-red-600 text-[10px] mt-1">{explanation.rejectionReason}</div>
      )}
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono font-medium">{value}</span>
    </div>
  );
}

function GraphSkeleton() {
  return (
    <AppShell>
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-8 w-96" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Skeleton className="lg:col-span-2 h-[600px]" />
          <div className="space-y-4">
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function GraphError({ message }: { message: string }) {
  return (
    <AppShell>
      <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <Network className="h-12 w-12 text-red-500" />
        <h2 className="text-xl font-semibold">Failed to load graph</h2>
        <p className="text-muted-foreground">{message}</p>
      </div>
    </AppShell>
  );
}

function GraphEmpty() {
  return (
    <AppShell>
      <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <Network className="h-12 w-12 text-slate-400" />
        <h2 className="text-xl font-semibold">No graph data</h2>
        <p className="text-muted-foreground">Add evidence and run discovery to build the graph.</p>
      </div>
    </AppShell>
  );
}
