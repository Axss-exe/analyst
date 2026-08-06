"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Plus, Upload, FileText, Search } from "lucide-react";

export default function EvidenceListPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    fetch("/api/evidence")
      .then((r) => r.json())
      .then((d) => {
        setItems(d.evidence || d.items || d || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filtered = items.filter((ev: any) =>
    (ev.title || "").toLowerCase().includes(query.toLowerCase()) ||
    (ev.source || "").toLowerCase().includes(query.toLowerCase())
  );

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Evidence</h1>
            <p className="text-muted-foreground">
              {items.length} item{items.length !== 1 ? "s" : ""} in the database
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/evidence/import">
              <Button variant="outline">
                <Upload className="mr-2 h-4 w-4" />
                Bulk Import
              </Button>
            </Link>
            <Link href="/evidence/new">
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Add Evidence
              </Button>
            </Link>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search evidence..."
            className="pl-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="h-10 w-10 text-muted-foreground" />
              <p className="mt-4 text-muted-foreground">No evidence found.</p>
              <div className="mt-4 flex gap-2">
                <Link href="/evidence/import">
                  <Button variant="outline" size="sm">
                    <Upload className="mr-2 h-4 w-4" />
                    Bulk Import
                  </Button>
                </Link>
                <Link href="/evidence/new">
                  <Button size="sm">
                    <Plus className="mr-2 h-4 w-4" />
                    Add First Item
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {filtered.map((ev: any) => (
              <Link key={ev.id} href={`/evidence/${ev.id}`}>
                <Card className="transition-colors hover:bg-accent">
                  <CardContent className="flex items-center justify-between py-4">
                    <div>
                      <p className="font-medium">{ev.title || "Untitled"}</p>
                      <p className="text-sm text-muted-foreground">{ev.source}</p>
                    </div>
                    <Badge variant="outline" className="capitalize">
                      {ev.sourceType || "document"}
                    </Badge>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
