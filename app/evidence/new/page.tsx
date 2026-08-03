"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AIProgressModal } from "@/components/ai-progress-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, Upload, Sparkles, Calendar } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function NewEvidencePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    title: "",
    source: "",
    sourceType: "",
    publicationDate: "",
    content: "",
    summary: "",
    tags: "",
    confidence: "",
    autoConfidence: true,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setModalOpen(true);

    try {
      const res = await fetch("/api/evidence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formData.title,
          source: formData.source,
          sourceType: formData.sourceType,
          publicationDate: formData.publicationDate || undefined,
          content: formData.content,
          summary: formData.summary || undefined,
          tags: formData.tags
            ? formData.tags.split(",").map((t) => t.trim())
            : [],
          confidence: formData.confidence
            ? parseFloat(formData.confidence)
            : undefined,
          autoConfidence: formData.autoConfidence,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to create evidence");
      }

      setJobId(data.jobId);
      console.log("Evidence saved, job:", data.jobId);
    } catch (err: any) {
      setError(err.message);
      setModalOpen(false);
      setLoading(false);
    }
  };

  const handleComplete = () => {
    setModalOpen(false);
    setLoading(false);
    router.push("/evidence");
    router.refresh();
  };

  const wordCount = formData.content.trim().split(/\s+/).filter(Boolean).length;
  const pageEstimate = Math.ceil(wordCount / 500);
  const tokenEstimate = Math.ceil(wordCount * 1.4);

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Upload New Evidence</h1>
        <div className="text-sm text-muted-foreground">
          {wordCount > 0 && (
            <span>
              ~{pageEstimate} pages · ~{tokenEstimate.toLocaleString()} tokens
            </span>
          )}
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Upload className="w-5 h-5" />
              Document Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) =>
                  setFormData({ ...formData, title: e.target.value })
                }
                placeholder="e.g., DRC Mining Contract Review 2024"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="source">Source *</Label>
                <Input
                  id="source"
                  value={formData.source}
                  onChange={(e) =>
                    setFormData({ ...formData, source: e.target.value })
                  }
                  placeholder="e.g., Ministry of Mines"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sourceType">Source Type *</Label>
                <Select
                  value={formData.sourceType}
                  onValueChange={(v) =>
                    setFormData({ ...formData, sourceType: v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select type..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="government">
                      Government Document
                    </SelectItem>
                    <SelectItem value="report">Report</SelectItem>
                    <SelectItem value="news">News Article</SelectItem>
                    <SelectItem value="website">Website</SelectItem>
                    <SelectItem value="pdf">PDF Document</SelectItem>
                    <SelectItem value="word">Word Document</SelectItem>
                    <SelectItem value="analyst_note">Analyst Note</SelectItem>
                    <SelectItem value="image">Image / Scan</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* NEW: Publication Date field */}
            <div className="space-y-2">
              <Label
                htmlFor="publicationDate"
                className="flex items-center gap-2"
              >
                <Calendar className="w-4 h-4" />
                Publication Date
              </Label>
              <Input
                id="publicationDate"
                type="date"
                value={formData.publicationDate}
                onChange={(e) =>
                  setFormData({ ...formData, publicationDate: e.target.value })
                }
              />
              <p className="text-xs text-muted-foreground">
                When was this document originally published? Used for timeline
                extraction and sorting.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="content">Document Content *</Label>
              <Textarea
                id="content"
                value={formData.content}
                onChange={(e) =>
                  setFormData({ ...formData, content: e.target.value })
                }
                placeholder="Paste the full document text here..."
                rows={12}
                required
              />
              <p className="text-xs text-muted-foreground">
                Supports documents up to 600+ pages. AI processing happens in
                the background with rate-limited Cerebras API calls.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Sparkles className="w-5 h-5" />
              AI Processing Options
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="autoConfidence"
                checked={formData.autoConfidence}
                onChange={(e) =>
                  setFormData({ ...formData, autoConfidence: e.target.checked })
                }
                className="rounded border-gray-300"
              />
              <Label
                htmlFor="autoConfidence"
                className="font-normal cursor-pointer"
              >
                Auto-evaluate source confidence using AI
              </Label>
            </div>

            {!formData.autoConfidence && (
              <div className="space-y-2">
                <Label htmlFor="confidence">
                  Manual Confidence (0.0 - 1.0)
                </Label>
                <Input
                  id="confidence"
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={formData.confidence}
                  onChange={(e) =>
                    setFormData({ ...formData, confidence: e.target.value })
                  }
                  placeholder="0.75"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="summary">
                Manual Summary (optional — leave blank for AI generation)
              </Label>
              <Textarea
                id="summary"
                value={formData.summary}
                onChange={(e) =>
                  setFormData({ ...formData, summary: e.target.value })
                }
                placeholder="If you already have a summary, paste it here. Otherwise AI will generate one."
                rows={4}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tags">Tags (comma-separated)</Label>
              <Input
                id="tags"
                value={formData.tags}
                onChange={(e) =>
                  setFormData({ ...formData, tags: e.target.value })
                }
                placeholder="mining, DRC, cobalt, contract"
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-4">
          <Button type="submit" disabled={loading} className="flex-1">
            {loading ? "Uploading..." : "Upload Evidence"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/evidence")}
            disabled={loading}
          >
            Cancel
          </Button>
        </div>
      </form>

      <AIProgressModal
        jobId={jobId}
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setLoading(false);
        }}
        onComplete={handleComplete}
      />
    </div>
  );
}
