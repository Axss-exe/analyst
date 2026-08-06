import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { evidenceImports } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  startBulkImport,
  pauseBulkImport,
  cancelBulkImport,
  getBulkImportStatus,
} from "@/lib/bulk-processor";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id);
    const status = getBulkImportStatus(id);
    if (!status) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ import: status });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id);
    const body = await request.json();
    const action = body.action as "start" | "pause" | "cancel";

    if (action === "start") {
      const res = startBulkImport(id);
      return NextResponse.json(res);
    }
    if (action === "pause") {
      const res = pauseBulkImport(id);
      return NextResponse.json(res);
    }
    if (action === "cancel") {
      const res = cancelBulkImport(id);
      return NextResponse.json(res);
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}
