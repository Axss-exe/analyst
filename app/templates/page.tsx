"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Palette } from "lucide-react";

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/templates")
      .then((r) => r.json())
      .then((d) => {
        setTemplates(d.templates || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const getConfig = (c: string) => {
    try {
      return JSON.parse(c);
    } catch {
      return {};
    }
  };

  return (
    <AppShell>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Templates</h1>
          <p className="text-sm text-muted-foreground">
            Brief presentation templates
          </p>
        </div>

        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map((t) => {
              const cfg = getConfig(t.config);
              return (
                <Card key={t.id} className="overflow-hidden">
                  <div
                    className="h-2"
                    style={{ backgroundColor: cfg.primaryColor || "#2563eb" }}
                  />
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{t.name}</CardTitle>
                    <Badge
                      variant="outline"
                      className="capitalize text-[10px] w-fit"
                    >
                      {t.type}
                    </Badge>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-1 text-xs text-muted-foreground">
                      <p>Font: {cfg.font || "Inter"}</p>
                      <p>Watermark: {cfg.watermark ? "Yes" : "No"}</p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
