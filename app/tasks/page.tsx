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
import { Plus, Search, ClipboardList, ArrowRight, Clock } from "lucide-react";

interface TaskItem {
  id: number;
  objective: string;
  priority: string;
  status: string;
  ownerName: string;
  deadline: string | null;
  createdAt: string;
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetchTasks();
  }, []);

  const fetchTasks = async (q = "") => {
    setLoading(true);
    const res = await fetch(
      `/api/tasks?search=${encodeURIComponent(q)}&limit=100`,
    );
    const data = await res.json();
    setTasks(data.tasks || []);
    setLoading(false);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchTasks(search);
  };

  const priorityColor = (p: string) => {
    if (p === "critical") return "bg-destructive/20 text-destructive";
    if (p === "high") return "bg-amber-500/20 text-amber-400";
    if (p === "medium") return "bg-blue-500/20 text-blue-400";
    return "bg-muted text-muted-foreground";
  };

  const statusColor = (s: string) => {
    if (s === "completed") return "bg-emerald-500/20 text-emerald-400";
    if (s === "in_progress") return "bg-amber-500/20 text-amber-400";
    return "bg-muted text-muted-foreground";
  };

  return (
    <AppShell>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Research Tasks
            </h1>
            <p className="text-sm text-muted-foreground">
              Investigations and assignments
            </p>
          </div>
          <Link href="/tasks/new">
            <Button>
              <Plus className="mr-1 h-4 w-4" /> New Task
            </Button>
          </Link>
        </div>

        <form onSubmit={handleSearch} className="flex gap-2">
          <Input
            placeholder="Search tasks..."
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
        ) : tasks.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <ClipboardList className="h-12 w-12 text-muted-foreground opacity-40" />
              <p className="mt-4 text-muted-foreground">No tasks yet</p>
            </CardContent>
          </Card>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Objective</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Deadline</TableHead>
                  <TableHead className="w-[60px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tasks.map((task) => (
                  <TableRow
                    key={task.id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/tasks/${task.id}`)}
                  >
                    <TableCell className="font-medium max-w-xs truncate">
                      {task.objective}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={`capitalize ${priorityColor(task.priority)}`}
                      >
                        {task.priority}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={`capitalize ${statusColor(task.status)}`}
                      >
                        {task.status.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{task.ownerName}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {task.deadline ? (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {new Date(task.deadline).toLocaleDateString()}
                        </span>
                      ) : (
                        "—"
                      )}
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
