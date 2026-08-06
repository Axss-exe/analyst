import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { evidenceImports } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values: string[] = [];
    let current = "";
    let inQuotes = false;
    for (const char of lines[i]) {
      if (char === '"' && !inQuotes) {
        inQuotes = true;
      } else if (char === '"' && inQuotes) {
        inQuotes = false;
      } else if (char === "," && !inQuotes) {
        values.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => row[h] = values[idx] || "");
    rows.push(row);
  }
  return rows;
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file") as File | null;
    const cooldown = parseInt(form.get("cooldownSeconds") as string) || 300;
    const userId = parseInt(form.get("userId") as string) || 0;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const text = await file.text();
    const rows = parseCSV(text);

    if (rows.length === 0) {
      return NextResponse.json({ error: "CSV is empty or malformed" }, { status: 400 });
    }

    const records = rows.map(r => ({
      title: r.title || r.Title || "",
      source: r.source || r.Source || "",
      sourceType: r.sourceType || r.source_type || r.Type || "document",
      content: r.content || r.Content || r.text || r.Text || "",
      url: r.url || r.URL || r.link || null,
      date: r.date || r.Date || new Date().toISOString().split("T")[0],
    }));

    const result = db.insert(evidenceImports).values({
      filename: file.name,
      records: JSON.stringify(records),
      status: "pending",
      totalRecords: records.length,
      processedCount: 0,
      failedCount: 0,
      cooldownSeconds: cooldown,
      currentIndex: 0,
      errorLog: "[]",
      createdBy: userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }).run();

    const id = Number(result.lastInsertRowid);

    return NextResponse.json({
      success: true,
      importId: id,
      totalRecords: records.length,
      cooldownSeconds: cooldown,
    });
  } catch (err: any) {
    console.error("[import] Upload error:", err);
    return NextResponse.json({ error: err?.message || "Upload failed" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const rows = db.select().from(evidenceImports).orderBy(desc(evidenceImports.createdAt)).all();
    return NextResponse.json({ imports: rows });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}
