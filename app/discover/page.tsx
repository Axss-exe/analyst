"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

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

interface DiscoveryState {
  clusters: ClusterView[];
  totalEvidence: number;
  totalCandidates: number;
  totalNarratives: number;
  totalClusters: number;
  unlinkedCount: number;
  clusteredCount: number;
}

export default function DiscoverPage() {
  const [clusters, setClusters] = useState<ClusterView[]>([]);
  const [totalEvidence, setTotalEvidence] = useState(0);
  const [totalCandidates, setTotalCandidates] = useState(0);
  const [totalNarratives, setTotalNarratives] = useState(0);
  const [unlinkedCount, setUnlinkedCount] = useState(0);
  const [clusteredCount, setClusteredCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadState = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/discover");
      if (!res.ok) throw new Error((await res.json()).error || `HTTP ${res.status}`);
      const data: DiscoveryState = await res.json();
      setClusters(data.clusters || []);
      setTotalEvidence(data.totalEvidence ?? 0);
      setTotalCandidates(data.totalCandidates ?? 0);
      setTotalNarratives(data.totalNarratives ?? 0);
      setUnlinkedCount(data.unlinkedCount ?? 0);
      setClusteredCount(data.clusteredCount ?? 0);
    } catch (err: any) {
      setError(err.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  const runDiscovery = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/discover", { method: "PUT" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setClusters(data.clusters || []);
      setTotalEvidence(data.totalEvidence ?? 0);
      setTotalCandidates(data.totalCandidates ?? 0);
      setTotalNarratives(data.totalNarratives ?? 0);
      setUnlinkedCount(data.unlinkedCount ?? 0);
      setClusteredCount(data.clusteredCount ?? 0);
    } catch (err: any) {
      setError(err.message || "Discovery failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadState(); }, [loadState]);

  const safeFixed = (n: any, d = 1) => {
    const v = typeof n === "number" && !isNaN(n) ? n : 0;
    return v.toFixed(d);
  };

  const pct = (part: number, whole: number) => {
    return whole > 0 ? safeFixed((part / whole) * 100, 1) : "0.0";
  };

  const StatCard = ({ label, value, subtext, color = "blue" }: { label: string; value: string | number; subtext?: string; color?: string }) => {
    const colorMap: Record<string, string> = {
      blue: "bg-blue-50 border-blue-200 text-blue-900",
      green: "bg-emerald-50 border-emerald-200 text-emerald-900",
      amber: "bg-amber-50 border-amber-200 text-amber-900",
      slate: "bg-slate-50 border-slate-200 text-slate-900",
    };
    return (
      <div className={`rounded-xl border p-5 ${colorMap[color] || colorMap.blue}`}>
        <div className="text-sm font-medium opacity-70 uppercase tracking-wide">{label}</div>
        <div className="text-3xl font-bold mt-1">{value}</div>
        {subtext && <div className="text-sm mt-1 opacity-60">{subtext}</div>}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Discovery</h1>
              <p className="text-sm text-gray-500 mt-1">
                Automatically discover stories and narratives from your evidence
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={loadState}
                disabled={loading}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition"
              >
                {loading ? "Loading..." : "Refresh"}
              </button>
              <button
                onClick={runDiscovery}
                disabled={loading}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition shadow-sm"
              >
                {loading ? "Running..." : "Run Discovery"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
          <StatCard label="Evidence" value={totalEvidence} color="slate" />
          <StatCard label="Candidates" value={totalCandidates} color="blue" />
          <StatCard label="Narratives" value={totalNarratives} color="green" />
          <StatCard label="Linked" value={clusteredCount} subtext={`${pct(clusteredCount, totalEvidence)}% of evidence`} color="green" />
          <StatCard label="Unlinked" value={unlinkedCount} subtext={`${pct(unlinkedCount, totalEvidence)}% of evidence`} color="amber" />
          <StatCard label="Clusters" value={clusters.length} color="blue" />
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* Clusters */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            Discovered Clusters
            <span className="ml-2 text-sm font-normal text-gray-500">({clusters.length})</span>
          </h2>
        </div>

        {clusters.length === 0 && !loading && (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <div className="text-gray-400 text-4xl mb-3">🔍</div>
            <h3 className="text-lg font-medium text-gray-900">No clusters found</h3>
            <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">
              Upload evidence documents and click "Run Discovery" to automatically identify stories and relationships.
            </p>
          </div>
        )}

        <div className="space-y-4">
          {clusters.map((cluster) => {
            const confidence = typeof cluster.confidence === "number" && !isNaN(cluster.confidence) ? cluster.confidence : 0;
            const evidenceCount = Array.isArray(cluster.evidenceIds) ? cluster.evidenceIds.length : 0;
            const statusColor =
              cluster.status === "validated" ? "bg-green-100 text-green-800 border-green-200" :
              cluster.status === "story" ? "bg-blue-100 text-blue-800 border-blue-200" :
              cluster.status === "rejected" ? "bg-red-100 text-red-800 border-red-200" :
              "bg-gray-100 text-gray-700 border-gray-200";

            return (
              <div key={cluster.id} className="bg-white rounded-xl border border-gray-200 hover:shadow-md transition-shadow">
                <div className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base font-semibold text-gray-900 truncate">{cluster.name}</h3>
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${statusColor}`}>
                          {cluster.status || "candidate"}
                        </span>
                      </div>

                      {cluster.description && (
                        <p className="text-sm text-gray-600 mt-1.5 line-clamp-2">{cluster.description}</p>
                      )}

                      <div className="flex items-center gap-4 mt-3 text-sm text-gray-500">
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                          Confidence: {safeFixed(confidence, 2)}
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                          {evidenceCount} evidence
                        </span>
                      </div>
                    </div>
                  </div>

                  {cluster.narrative && (
                    <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-100">
                      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Narrative</div>
                      <div className="text-sm font-medium text-gray-900">{cluster.narrative.title}</div>
                      {cluster.narrative.overview && (
                        <p className="text-sm text-gray-600 mt-1 line-clamp-3">{cluster.narrative.overview}</p>
                      )}
                    </div>
                  )}

                  {evidenceCount > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {cluster.evidenceIds.slice(0, 8).map((eid) => (
                        <Link
                          key={eid}
                          href={`/evidence/${eid}`}
                          className="text-xs px-2.5 py-1 bg-blue-50 text-blue-700 rounded-md hover:bg-blue-100 border border-blue-100 transition"
                        >
                          E{eid}
                        </Link>
                      ))}
                      {evidenceCount > 8 && (
                        <span className="text-xs text-gray-400 px-1 py-1">+{evidenceCount - 8} more</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
