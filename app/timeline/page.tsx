"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Clock, Calendar, ArrowRight } from "lucide-react";

interface TimelineEvent {
  id: number;
  date: string;
  title: string;
  description: string;
  evidenceId: number | null;
  storyId: number | null;
}

export default function TimelinePage() {
  const searchParams = useSearchParams();
  const storyId = searchParams.get("storyId");
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchEvents();
  }, [storyId]);

  const fetchEvents = async () => {
    setLoading(true);
    let url = "/api/timeline?limit=500";
    if (storyId) url += `&storyId=${storyId}`;
    if (fromDate) url += `&from=${fromDate}`;
    if (toDate) url += `&to=${toDate}`;
    const res = await fetch(url);
    const data = await res.json();
    setEvents(data.events || []);
    setLoading(false);
  };

  const handleFilter = (e: React.FormEvent) => {
    e.preventDefault();
    fetchEvents();
  };

  return (
    <AppShell>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Timeline</h1>
            <p className="text-sm text-muted-foreground">
              Chronological view of intelligence events
            </p>
          </div>
        </div>

        <form onSubmit={handleFilter} className="flex items-end gap-2">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">From</label>
            <Input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">To</label>
            <Input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </div>
          <Button type="submit" variant="outline">
            Filter
          </Button>
        </form>

        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : events.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Clock className="h-12 w-12 text-muted-foreground opacity-40" />
              <p className="mt-4 text-muted-foreground">No timeline events</p>
            </CardContent>
          </Card>
        ) : (
          <div className="relative border-l border-border ml-4 space-y-6">
            {events.map((evt) => (
              <div key={evt.id} className="relative pl-6">
                <div className="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full bg-primary" />
                <Card>
                  <CardContent className="py-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-sm font-medium">
                        {new Date(evt.date).toLocaleDateString(undefined, {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        })}
                      </span>
                    </div>
                    <p className="text-base font-medium">{evt.title}</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {evt.description}
                    </p>
                    <div className="flex gap-2 mt-3">
                      {evt.evidenceId && (
                        <Link href={`/evidence/${evt.evidenceId}`}>
                          <Badge
                            variant="outline"
                            className="text-[10px] cursor-pointer hover:bg-accent"
                          >
                            Evidence #{evt.evidenceId}
                          </Badge>
                        </Link>
                      )}
                      {evt.storyId && (
                        <Link href={`/stories/${evt.storyId}`}>
                          <Badge
                            variant="outline"
                            className="text-[10px] cursor-pointer hover:bg-accent"
                          >
                            Story #{evt.storyId}
                          </Badge>
                        </Link>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
