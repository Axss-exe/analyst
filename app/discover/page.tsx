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

  const loadExistingState = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/discover");
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data: DiscoveryState = await res.json();
      setClusters(data.clusters || []);
      setTotalEvidence(data.totalEvidence ?? 0);
      setTotalCandidates(data.totalCandidates ?? 0);
      setTotalNarratives(data.totalNarratives ?? 0);
      setUnlinkedCount(data.unlinkedCount ?? 0);
      setClusteredCount(data.clusteredCount ?? 0);
    } catch (err: any) {
      setError(err.message || "Failed to load discovery state");
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
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
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

  useEffect(() => {
    loadExistingState();
  }, [loadExistingState]);

  const safeNum = (n: any): number => {
    if (typeof n === "number" && !isNaN(n)) return n;
    return 0;
  };

  const safeFixed = (n: any, digits = 1): string => {
    const val = safeNum(n);
    return val.toFixed(digits);
  };

  const pct = (part: number, whole: number): string => {
    if (whole <= 0) return "0.0";
    return safeFixed((part / whole) * 100, 1);
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Discovery</h1>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border rounded-lg p-4">
          <div className="text-sm text-gray-500">Total Evidence</div>
          <div className="text-2xl font-semibold">{totalEvidence}</div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="text-sm text-gray-500">Candidates</div>
          <div className="text-2xl font-semibold">{totalCandidates}</div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="text-sm text-gray-500">Narratives</div>
          <div className="text-2xl font-semibold">{totalNarratives}</div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="text-sm text-gray-500">Linked / Unlinked</div>
          <div className="text-2xl font-semibold">
            {clusteredCount} / {unlinkedCount}
          </div>
          <div className="text-xs text-gray-400">
            {pct(clusteredCount, totalEvidence)}% linked
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 mb-6">
        <button
          onClick={runDiscovery}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Running..." : "Run Discovery"}
        </button>
        <button
          onClick={loadExistingState}
          disabled={loading}
          className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 disabled:opacity-50"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded border border-red-200">
          {error}
        </div>
      )}

      {/* Clusters */}
      <h2 className="text-lg font-semibold mb-3">
        Clusters ({clusters.length})
      </h2>

      {clusters.length === 0 && !loading && (
        <div className="text-gray-500 italic">
          No clusters found. Click "Run Discovery" to analyze evidence.
        </div>
      )}

      <div className="space-y-4">
        {clusters.map((cluster) => {
          const confidence = safeNum(cluster.confidence);
          const evidenceCount = Array.isArray(cluster.evidenceIds)
            ? cluster.evidenceIds.length
            : 0;

          return (
            <div
              key={cluster.id}
              className="bg-white border rounded-lg p-4 hover:shadow-md transition"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-lg">{cluster.name}</h3>
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${
                        cluster.status === "validated"
                          ? "bg-green-100 text-green-700"
                          : cluster.status === "story"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {cluster.status || "candidate"}
                    </span>
                  </div>

                  {cluster.description && (
                    <p className="text-gray-600 text-sm mt-1">
                      {cluster.description}
                    </p>
                  )}

                  <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                    <span>Confidence: {safeFixed(confidence, 2)}</span>
                    <span>{evidenceCount} evidence items</span>
                  </div>

                  {cluster.narrative && (
                    <div className="mt-3 p-3 bg-gray-50 rounded">
                      <div className="text-sm font-medium text-gray-700">
                        Narrative
                      </div>
                      <div className="text-sm text-gray-600 mt-0.5">
                        {cluster.narrative.title}
                      </div>
                      {cluster.narrative.overview && (
                        <p className="text-sm text-gray-500 mt-1 line-clamp-3">
                          {cluster.narrative.overview}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {evidenceCount > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {cluster.evidenceIds.slice(0, 10).map((eid) => (
                    <Link
                      key={eid}
                      href={`/evidence/${eid}`}
                      className="text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded hover:bg-blue-100"
                    >
                      E{eid}
                    </Link>
                  ))}
                  {evidenceCount > 10 && (
                    <span className="text-xs text-gray-400">
                      +{evidenceCount - 10} more
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
