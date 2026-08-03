"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Shield,
  Users,
  FileText,
  BookOpen,
  ClipboardList,
  Newspaper,
  Activity,
  Ban,
  CheckCircle,
  ArrowLeft,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function AdminPage() {
  const [stats, setStats] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);
  const [clearSuccess, setClearSuccess] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/stats").then((r) => r.json()),
      fetch("/api/admin/users?limit=100").then((r) => r.json()),
      fetch("/api/admin/audit?limit=100").then((r) => r.json()),
    ])
      .then(([s, u, l]) => {
        setStats(s);
        setUsers(u.users || []);
        setLogs(l.logs || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [clearSuccess]);

  const handleBlock = async (id: number) => {
    await fetch(`/api/admin/users/${id}/block`, { method: "POST" });
    const res = await fetch("/api/admin/users?limit=100");
    const data = await res.json();
    setUsers(data.users || []);
  };

  const handleUnblock = async (id: number) => {
    await fetch(`/api/admin/users/${id}/unblock`, { method: "POST" });
    const res = await fetch("/api/admin/users?limit=100");
    const data = await res.json();
    setUsers(data.users || []);
  };

  const handleClearAllEvidence = async () => {
    if (
      !confirm(
        "DELETE ALL EVIDENCE?\n\nThis will permanently remove:\n- All evidence documents\n- All extracted entities\n- All timeline events\n- All relationships\n- All stories and story links\n- All generated briefs\n\nThis action cannot be undone.",
      )
    ) {
      return;
    }
    if (!confirm("Are you absolutely sure? Type 'yes' to confirm.")) {
      return;
    }

    setClearing(true);
    setClearError(null);
    setClearSuccess(null);

    try {
      const res = await fetch("/api/admin/clear-evidence", { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to clear evidence");
      }

      setClearSuccess(
        `Cleared ${data.cleared?.evidence || 0} evidence items and all derived data.`,
      );
      // Refresh stats
      const statsRes = await fetch("/api/admin/stats");
      const statsData = await statsRes.json();
      setStats(statsData);
    } catch (err: any) {
      setClearError(err.message);
    } finally {
      setClearing(false);
    }
  };

  if (loading)
    return (
      <AppShell>
        <div className="flex h-96 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </AppShell>
    );

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link href="/dashboard">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="mr-1 h-4 w-4" /> Back
              </Button>
            </Link>
            <h1 className="text-2xl font-semibold tracking-tight">
              Administration
            </h1>
          </div>
          {/* NEW: Clear All Evidence button */}
          <Button
            variant="destructive"
            size="sm"
            onClick={handleClearAllEvidence}
            disabled={clearing}
            className="flex items-center gap-2"
          >
            <Trash2 className="h-4 w-4" />
            {clearing ? "Clearing..." : "Clear All Evidence"}
          </Button>
        </div>

        {/* NEW: Feedback alerts */}
        {clearError && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{clearError}</AlertDescription>
          </Alert>
        )}
        {clearSuccess && (
          <Alert variant="default" className="border-green-500 text-green-700">
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>{clearSuccess}</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          {[
            { label: "Users", value: stats?.totalUsers || 0, icon: Users },
            {
              label: "Evidence",
              value: stats?.totalEvidence || 0,
              icon: FileText,
            },
            {
              label: "Stories",
              value: stats?.totalStories || 0,
              icon: BookOpen,
            },
            {
              label: "Tasks",
              value: stats?.totalTasks || 0,
              icon: ClipboardList,
            },
            {
              label: "Briefs",
              value: stats?.totalBriefs || 0,
              icon: Newspaper,
            },
            {
              label: "Entities",
              value: stats?.totalEntities || 0,
              icon: Activity,
            },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="text-xs text-muted-foreground uppercase">
                    {s.label}
                  </p>
                  <p className="text-2xl font-bold">{s.value}</p>
                </div>
                <s.icon className="h-6 w-6 text-muted-foreground opacity-40" />
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs defaultValue="users">
          <TabsList>
            <TabsTrigger value="users">
              <Users className="mr-1 h-3 w-3" /> Users
            </TabsTrigger>
            <TabsTrigger value="audit">
              <Activity className="mr-1 h-3 w-3" /> Audit Log
            </TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="mt-4">
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="w-[120px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.name}</TableCell>
                      <TableCell className="text-sm">{u.email}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {u.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {u.isBlocked ? (
                          <Badge variant="destructive">Blocked</Badge>
                        ) : (
                          <Badge variant="default">Active</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(u.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        {u.isBlocked ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleUnblock(u.id)}
                          >
                            <CheckCircle className="mr-1 h-3 w-3" /> Unblock
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleBlock(u.id)}
                          >
                            <Ban className="mr-1 h-3 w-3" /> Block
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="audit" className="mt-4">
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Action</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead>Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell>
                        <Badge variant="secondary" className="text-[10px]">
                          {log.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {log.targetType} #{log.targetId}
                      </TableCell>
                      <TableCell className="text-sm">{log.actorName}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(log.createdAt).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
