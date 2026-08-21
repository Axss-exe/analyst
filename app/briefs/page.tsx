"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search, Newspaper, ArrowRight, FileDown } from "lucide-react";

interface BriefItem {
  id: number;
  headline: string;
  storyTitle: string;
  version: number;
  generationMode: string;
  createdAt: string;
}

export default function BriefsPage() {
  const [briefs, setBriefs] = useState<BriefItem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedBriefIds, setSelectedBriefIds] = useState<number[]>([]);
  const router = useRouter();

  useEffect(() => {
    fetchBriefs();
  }, []);

  const fetchBriefs = async (q = "") => {
    setLoading(true);
    const res = await fetch(
      `/api/briefs?search=${encodeURIComponent(q)}&limit=100`,
    );
    const data = await res.json();
    setBriefs(data.briefs || []);
    setLoading(false);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchBriefs(search);
  };

  const displayedBriefIds = briefs.map((brief) => brief.id);
  const allDisplayedSelected =
    displayedBriefIds.length > 0 &&
    displayedBriefIds.every((id) => selectedBriefIds.includes(id));

  const toggleBriefSelection = (id: number, checked: boolean) => {
    setSelectedBriefIds((current) =>
      checked
        ? current.includes(id)
          ? current
          : [...current, id]
        : current.filter((selectedId) => selectedId !== id),
    );
  };

  const toggleAllDisplayed = (checked: boolean) => {
    setSelectedBriefIds((current) => {
      if (checked) {
        return Array.from(new Set([...current, ...displayedBriefIds]));
      }
      return current.filter((id) => !displayedBriefIds.includes(id));
    });
  };

  const exportSelected = async () => {
    const response = await fetch("/api/exports/briefs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: selectedBriefIds }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      window.alert(data?.error || "Failed to export briefs");
      return;
    }

    const data = await response.json();
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `rita-brief-export-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <AppShell>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Intelligence Briefs
            </h1>
            <p className="text-sm text-muted-foreground">
              Generated intelligence reports
            </p>
          </div>
        </div>

        <form onSubmit={handleSearch} className="flex gap-2">
          <Input
            placeholder="Search briefs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-md"
          />
          <Button type="submit" variant="outline" size="icon">
            <Search className="h-4 w-4" />
          </Button>
        </form>

        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {selectedBriefIds.length} selected
          </span>
          <Button
            type="button"
            variant="outline"
            disabled={selectedBriefIds.length === 0}
            onClick={exportSelected}
          >
            <FileDown className="mr-1 h-4 w-4" />
            Export Selected
          </Button>
        </div>

        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : briefs.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Newspaper className="h-12 w-12 text-muted-foreground opacity-40" />
              <p className="mt-4 text-muted-foreground">
                No briefs generated yet
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Generate a brief from a story
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[48px]">
                    <Checkbox
                      aria-label="Select all displayed briefs"
                      checked={allDisplayedSelected}
                      onCheckedChange={(checked) =>
                        toggleAllDisplayed(checked === true)
                      }
                    />
                  </TableHead>
                  <TableHead>Headline</TableHead>
                  <TableHead>Story</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="w-[60px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {briefs.map((brief) => (
                  <TableRow
                    key={brief.id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/briefs/${brief.id}`)}
                  >
                    <TableCell onClick={(event) => event.stopPropagation()}>
                      <Checkbox
                        aria-label={`Select brief ${brief.id}`}
                        checked={selectedBriefIds.includes(brief.id)}
                        onCheckedChange={(checked) =>
                          toggleBriefSelection(brief.id, checked === true)
                        }
                      />
                    </TableCell>
                    <TableCell className="font-medium max-w-xs truncate">
                      {brief.headline}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {brief.storyTitle}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">v{brief.version}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className="capitalize text-[10px]"
                      >
                        {brief.generationMode.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(brief.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
