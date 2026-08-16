"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Loader2 } from "lucide-react";

export default function NewTaskPage() {
  const router = useRouter();
  const [objective, setObjective] = useState("");
  const [priority, setPriority] = useState("medium");
  const [ownerId, setOwnerId] = useState("");
  const [deadline, setDeadline] = useState("");
  const [users, setUsers] = useState<Array<{ id: number; name: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [storyContext, setStoryContext] = useState<any>(null);
  const searchParams = useSearchParams();
  const storyId = searchParams.get("storyId");

  useEffect(() => {
    if (storyId) {
      fetch(`/api/stories/${storyId}`)
        .then((r) => r.json())
        .then((d) => setStoryContext(d.story || null))
        .catch(() => {});
    }
  }, [storyId]);

  useEffect(() => {
    fetch("/api/admin/users")
      .then((r) => r.json())
      .then((d) => setUsers(d.users || []))
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      // If linked to a story, fetch its evidence to auto-attach
      let evidenceIds: number[] = [];
      let entityIds: number[] = [];
      if (storyId) {
        try {
          const storyRes = await fetch(`/api/stories/${storyId}`);
          const storyData = await storyRes.json();
          evidenceIds = (storyData.evidence || []).map((e: any) => e.id);
          // Collect unique entities from evidence
          const allEntities = new Set<number>();
          for (const ev of storyData.evidence || []) {
            if (ev.entities) {
              for (const ent of ev.entities) allEntities.add(ent.id);
            }
          }
          entityIds = Array.from(allEntities);
        } catch {
          // ignore fetch errors
        }
      }

      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          objective,
          priority,
          ownerId: parseInt(ownerId),
          deadline: deadline || null,
          evidenceIds: evidenceIds.length > 0 ? evidenceIds : undefined,
          entityIds: entityIds.length > 0 ? entityIds : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed");
        setLoading(false);
        return;
      }
      router.push(`/tasks/${data.task.id}`);
    } catch {
      setError("Network error");
      setLoading(false);
    }
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6">
        <Link href="/tasks">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-1 h-4 w-4" /> Back
          </Button>
        </Link>
        {storyContext && (
          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="py-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Linked Story</p>
              <p className="font-medium">{storyContext.title}</p>
              <p className="text-xs text-muted-foreground line-clamp-2">{storyContext.overview}</p>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader>
            <CardTitle>Create Research Task</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Objective *</Label>
                <Textarea
                  value={objective}
                  onChange={(e) => setObjective(e.target.value)}
                  rows={3}
                  required
                  placeholder="What needs to be investigated?"
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Priority</Label>
                  <Select value={priority} onValueChange={setPriority}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["low", "medium", "high", "critical"].map((p) => (
                        <SelectItem key={p} value={p} className="capitalize">
                          {p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Owner *</Label>
                  <Select value={ownerId} onValueChange={setOwnerId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select owner" />
                    </SelectTrigger>
                    <SelectContent>
                      {users.map((u) => (
                        <SelectItem key={u.id} value={String(u.id)}>
                          {u.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Deadline</Label>
                  <Input
                    type="date"
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                  />
                </div>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="flex justify-end gap-2">
                <Link href="/tasks">
                  <Button type="button" variant="outline">
                    Cancel
                  </Button>
                </Link>
                <Button type="submit" disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" />{" "}
                      Saving...
                    </>
                  ) : (
                    "Create Task"
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
