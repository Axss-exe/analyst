"use client";

import { useEffect, useState, useCallback } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Upload, Play, Pause, XCircle, RefreshCw, FileUp } from "lucide-react";

interface ImportJob {
  id: number;
  filename: string;
  status: string;
  totalRecords: number;
  processedCount: number;
  failedCount: number;
  cooldownSeconds: number;
  currentIndex: number;
  errorLog: string;
  createdAt: string;
}

export default function BulkImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [cooldown, setCooldown] = useState(300);
  const [uploading, setUploading] = useState(false);
  const [imports, setImports] = useState<ImportJob[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchImports = useCallback(async () => {
    try {
      const res = await fetch("/api/evidence/import");
      const data = await res.json();
      if (data.imports) setImports(data.imports);
    } catch (e) {
      console.error("Failed to fetch imports", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchImports();
    const interval = setInterval(fetchImports, 5000);
    return () => clearInterval(interval);
  }, [fetchImports]);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    form.append("cooldownSeconds", String(cooldown));
    form.append("userId", "1");

    try {
      const res = await fetch("/api/evidence/import", { method: "POST", body: form });
      const data = await res.json();
      if (data.success) {
        setFile(null);
        fetchImports();
      } else {
        alert(data.error || "Upload failed");
      }
    } catch (e: any) {
      alert(e.message);
    } finally {
      setUploading(false);
    }
  }

  async function controlImport(id: number, action: "start" | "pause" | "cancel") {
    try {
      const res = await fetch(`/api/evidence/import/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!data.success) alert(data.error || "Action failed");
      fetchImports();
    } catch (e: any) {
      alert(e.message);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Bulk Evidence Import</h1>
          <p className="text-muted-foreground">
            Upload a CSV and process items one-by-one with a configurable cooldown.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileUp className="h-5 w-5" /> Upload CSV
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUpload} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-sm font-medium">CSV File</label>
                  <Input
                    type="file"
                    accept=".csv"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Columns: title, source, sourceType, content, url, date
                  </p>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Cooldown (seconds)</label>
                  <Input
                    type="number"
                    min={10}
                    value={cooldown}
                    onChange={(e) => setCooldown(parseInt(e.target.value) || 300)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Minimum 10s. Default 5 minutes (300s).
                  </p>
                </div>
              </div>
              <Button type="submit" disabled={!file || uploading}>
                {uploading ? (
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-2 h-4 w-4" />
                )}
                {uploading ? "Uploading..." : "Upload & Stage"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Import Jobs</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-muted-foreground">Loading...</p>
            ) : imports.length === 0 ? (
              <p className="text-muted-foreground">No imports yet.</p>
            ) : (
              <div className="space-y-4">
                {imports.map((imp) => {
                  const pct =
                    imp.totalRecords > 0
                      ? Math.round((imp.processedCount / imp.totalRecords) * 100)
                      : 0;
                  return (
                    <div key={imp.id} className="rounded-lg border p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{imp.filename}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(imp.createdAt).toLocaleString()}
                          </p>
                        </div>
                        <Badge
                          variant={
                            imp.status === "completed"
                              ? "default"
                              : imp.status === "error"
                              ? "destructive"
                              : "outline"
                          }
                        >
                          {imp.status}
                        </Badge>
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>
                            {imp.processedCount} / {imp.totalRecords} processed
                          </span>
                          <span>{imp.failedCount} failed</span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full bg-primary transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {imp.status === "pending" && (
                          <Button size="sm" onClick={() => controlImport(imp.id, "start")}>
                            <Play className="mr-1 h-3 w-3" /> Start
                          </Button>
                        )}
                        {imp.status === "processing" && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => controlImport(imp.id, "pause")}
                            >
                              <Pause className="mr-1 h-3 w-3" /> Pause
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => controlImport(imp.id, "cancel")}
                            >
                              <XCircle className="mr-1 h-3 w-3" /> Cancel
                            </Button>
                          </>
                        )}
                        {imp.status === "paused" && (
                          <>
                            <Button size="sm" onClick={() => controlImport(imp.id, "start")}>
                              <Play className="mr-1 h-3 w-3" /> Resume
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => controlImport(imp.id, "cancel")}
                            >
                              <XCircle className="mr-1 h-3 w-3" /> Cancel
                            </Button>
                          </>
                        )}
                        <span className="ml-auto text-xs text-muted-foreground">
                          Cooldown: {imp.cooldownSeconds}s
                        </span>
                      </div>

                      {imp.errorLog && imp.errorLog !== "[]" && (
                        <details className="text-xs">
                          <summary className="cursor-pointer text-red-500 font-medium">
                            View errors
                          </summary>
                          <pre className="mt-2 max-h-32 overflow-auto rounded bg-muted p-2 text-xs">
                            {JSON.stringify(JSON.parse(imp.errorLog), null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
