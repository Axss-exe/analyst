"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
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
import { Plus, Search, Users, ArrowRight } from "lucide-react";

interface EntityItem {
  id: number;
  name: string;
  type: string;
  aliases: string;
  createdAt: string;
}

const typeColors: Record<string, string> = {
  person: "bg-blue-500/20 text-blue-400",
  organization: "bg-purple-500/20 text-purple-400",
  company: "bg-emerald-500/20 text-emerald-400",
  government: "bg-amber-500/20 text-amber-400",
  project: "bg-rose-500/20 text-rose-400",
  location: "bg-cyan-500/20 text-cyan-400",
  mineral: "bg-slate-500/20 text-slate-400",
  legislation: "bg-orange-500/20 text-orange-400",
  bank: "bg-indigo-500/20 text-indigo-400",
  investor: "bg-pink-500/20 text-pink-400",
  mine: "bg-stone-500/20 text-stone-400",
  infrastructure: "bg-teal-500/20 text-teal-400",
};

export default function EntitiesPage() {
  const [entities, setEntities] = useState<EntityItem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetchEntities();
  }, []);

  const fetchEntities = async (q = "") => {
    setLoading(true);
    const res = await fetch(
      `/api/entities?search=${encodeURIComponent(q)}&limit=500`,
    );
    const data = await res.json();
    setEntities(data.entities || []);
    setLoading(false);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchEntities(search);
  };

  return (
    <AppShell>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Entities</h1>
            <p className="text-sm text-muted-foreground">
              People, organizations, locations, and more
            </p>
          </div>
          <Link href="/entities/new">
            <Button>
              <Plus className="mr-1 h-4 w-4" /> New Entity
            </Button>
          </Link>
        </div>

        <form onSubmit={handleSearch} className="flex gap-2">
          <Input
            placeholder="Search entities..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-md"
          />
          <Button type="submit" variant="outline" size="icon">
            <Search className="h-4 w-4" />
          </Button>
        </form>

        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : entities.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Users className="h-12 w-12 text-muted-foreground opacity-40" />
              <p className="mt-4 text-muted-foreground">No entities yet</p>
            </CardContent>
          </Card>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Aliases</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-[60px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entities.map((ent) => (
                  <TableRow
                    key={ent.id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/entities/${ent.id}`)}
                  >
                    <TableCell className="font-medium">{ent.name}</TableCell>
                    <TableCell>
                      <Badge
                        className={`capitalize ${typeColors[ent.type] || "bg-muted text-muted-foreground"}`}
                      >
                        {ent.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-xs truncate">
                      {ent.aliases}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(ent.createdAt).toLocaleDateString()}
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
