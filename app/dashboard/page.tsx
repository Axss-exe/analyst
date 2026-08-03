"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  FileText,
  BookOpen,
  ClipboardList,
  Newspaper,
  Users,
  GitBranch,
  Plus,
  ArrowRight,
  TrendingUp,
  Clock,
} from "lucide-react";

interface DashboardStats {
  totalEvidence?: number;
  totalStories?: number;
  totalTasks?: number;
  totalBriefs?: number;
  totalEntities?: number;
  recentEvidence?: Array<{
    id: number;
    title: string;
    source: string;
    createdAt: string;
  }>;
  recentStories?: Array<{
    id: number;
    title: string;
    status: string;
    updatedAt: string;
  }>;
  recentBriefs?: Array<{ id: number; headline: string; createdAt: string }>;
  pendingTasks?: Array<{
    id: number;
    objective: string;
    priority: string;
    deadline: string | null;
  }>;
  recentActivity?: Array<{
    id: number;
    action: string;
    targetType: string;
    createdAt: string;
  }>;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/stats")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
        } else {
          setStats(data);
        }
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load dashboard data");
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <AppShell>
        <div className="flex h-96 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </AppShell>
    );
  }

  const statCards = [
    {
      label: "Evidence",
      value: stats?.totalEvidence || 0,
      icon: FileText,
      href: "/evidence",
      color: "text-blue-400",
    },
    {
      label: "Stories",
      value: stats?.totalStories || 0,
      icon: BookOpen,
      href: "/stories",
      color: "text-amber-400",
    },
    {
      label: "Tasks",
      value: stats?.totalTasks || 0,
      icon: ClipboardList,
      href: "/tasks",
      color: "text-emerald-400",
    },
    {
      label: "Briefs",
      value: stats?.totalBriefs || 0,
      icon: Newspaper,
      href: "/briefs",
      color: "text-purple-400",
    },
    {
      label: "Entities",
      value: stats?.totalEntities || 0,
      icon: Users,
      href: "/entities",
      color: "text-rose-400",
    },
  ];

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Overview of your intelligence workspace
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/evidence/new">
              <Button size="sm">
                <Plus className="mr-1 h-4 w-4" /> Add Evidence
              </Button>
            </Link>
            <Link href="/stories/new">
              <Button size="sm" variant="outline">
                <Plus className="mr-1 h-4 w-4" /> New Story
              </Button>
            </Link>
          </div>
        </div>

        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error === "Forbidden"
              ? "Admin stats are restricted. Some dashboard data may be unavailable."
              : error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {statCards.map((card) => {
            const Icon = card.icon;
            return (
              <Link key={card.label} href={card.href}>
                <Card className="transition-colors hover:bg-accent/50">
                  <CardContent className="flex items-center justify-between p-4">
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">
                        {card.label}
                      </p>
                      <p className="text-2xl font-bold">{card.value}</p>
                    </div>
                    <Icon className={`h-8 w-8 ${card.color} opacity-60`} />
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">
                Recent Evidence
              </CardTitle>
              <Link
                href="/evidence"
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </CardHeader>
            <CardContent>
              {!stats?.recentEvidence || stats.recentEvidence.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">
                  No evidence yet
                </p>
              ) : (
                <div className="space-y-2">
                  {(stats.recentEvidence || []).map((ev) => (
                    <Link
                      key={ev.id}
                      href={`/evidence/${ev.id}`}
                      className="flex items-center justify-between rounded-md p-2 transition-colors hover:bg-accent"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {ev.title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {ev.source}
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(ev.createdAt).toLocaleDateString()}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                Pending Tasks
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!stats?.pendingTasks || stats.pendingTasks.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">
                  No pending tasks
                </p>
              ) : (
                <div className="space-y-2">
                  {(stats.pendingTasks || []).map((task) => (
                    <Link
                      key={task.id}
                      href={`/tasks/${task.id}`}
                      className="flex items-start gap-2 rounded-md p-2 transition-colors hover:bg-accent"
                    >
                      <ClipboardList className="mt-0.5 h-4 w-4 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="text-sm truncate">{task.objective}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span
                            className={`text-[10px] rounded px-1.5 py-0.5 ${task.priority === "critical" ? "bg-destructive/20 text-destructive" : task.priority === "high" ? "bg-amber-500/20 text-amber-400" : "bg-muted text-muted-foreground"}`}
                          >
                            {task.priority}
                          </span>
                          {task.deadline && (
                            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                              <Clock className="h-3 w-3" />{" "}
                              {new Date(task.deadline).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">
                Recent Stories
              </CardTitle>
              <Link
                href="/stories"
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </CardHeader>
            <CardContent>
              {!stats?.recentStories || stats.recentStories.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">
                  No stories yet
                </p>
              ) : (
                <div className="space-y-2">
                  {(stats.recentStories || []).map((story) => (
                    <Link
                      key={story.id}
                      href={`/stories/${story.id}`}
                      className="flex items-center justify-between rounded-md p-2 transition-colors hover:bg-accent"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {story.title}
                        </p>
                        <span
                          className={`text-[10px] rounded px-1.5 py-0.5 ${story.status === "active" ? "bg-emerald-500/20 text-emerald-400" : "bg-muted text-muted-foreground"}`}
                        >
                          {story.status}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(story.updatedAt).toLocaleDateString()}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">
                Recent Briefs
              </CardTitle>
              <Link
                href="/briefs"
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </CardHeader>
            <CardContent>
              {!stats?.recentBriefs || stats.recentBriefs.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">
                  No briefs yet
                </p>
              ) : (
                <div className="space-y-2">
                  {(stats.recentBriefs || []).map((brief) => (
                    <Link
                      key={brief.id}
                      href={`/briefs/${brief.id}`}
                      className="flex items-center justify-between rounded-md p-2 transition-colors hover:bg-accent"
                    >
                      <p className="text-sm font-medium truncate">
                        {brief.headline}
                      </p>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(brief.createdAt).toLocaleDateString()}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!stats?.recentActivity || stats.recentActivity.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">
                No recent activity
              </p>
            ) : (
              <div className="space-y-2">
                {(stats.recentActivity || []).map((activity) => (
                  <div
                    key={activity.id}
                    className="flex items-center gap-3 rounded-md p-2"
                  >
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    <div className="flex-1">
                      <p className="text-sm">
                        <span className="font-medium">{activity.action}</span>
                        <span className="text-muted-foreground"> on </span>
                        <span className="capitalize">
                          {activity.targetType}
                        </span>
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(activity.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
