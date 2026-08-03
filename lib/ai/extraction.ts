import { generateWithAI } from "./client";
import { estimateTokens } from "./token-counter";
import type { StructuredExtraction } from "@/types";

function extractJsonObject(response: string): Record<string, unknown> | null {
  // 1. Markdown code block
  const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch {
      /* fall through */
    }
  }

  // 2. Raw object
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch {
      /* fall through */
    }
  }

  // 3. First { to last }
  const start = response.indexOf("{");
  const end = response.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    try {
      return JSON.parse(response.slice(start, end + 1));
    } catch {
      /* fall through */
    }
  }

  // 4. Balanced brace scan
  let depth = 0;
  let objStart = -1;
  for (let i = 0; i < response.length; i++) {
    if (response[i] === "{") {
      if (depth === 0) objStart = i;
      depth++;
    } else if (response[i] === "}") {
      depth--;
      if (depth === 0 && objStart !== -1) {
        try {
          return JSON.parse(response.slice(objStart, i + 1));
        } catch {
          /* continue */
        }
      }
    }
  }

  return null;
}

function safeStringArray(val: unknown): string[] {
  if (Array.isArray(val))
    return val.filter((v): v is string => typeof v === "string");
  return [];
}

function safeObjectArray(val: unknown): Record<string, unknown>[] {
  if (Array.isArray(val))
    return val.filter(
      (v): v is Record<string, unknown> => v !== null && typeof v === "object",
    );
  return [];
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export async function extractStructuredFacts(
  text: string,
): Promise<StructuredExtraction> {
  // REDUCED from 30000 to 15000 chars to fit in 4096 output tokens
  const sample = text.slice(0, 15000);
  const tokens = estimateTokens(sample);
  console.log(
    `[extraction] Processing sample of ${tokens} tokens (limit 15000 chars)`,
  );

  const prompt = `Extract structured intelligence from this text. Output ONLY compact JSON (no markdown, no explanations).

TEXT:
${sample}

JSON schema:
{
  "entities": [{"name":"","type":"person|organization|company|government|project|location|minerals|legislation|bank|investor|mine|infrastructure","aliases":[]}],
  "events": [{"date":"YYYY-MM-DD","title":"","description":"","entityNames":[]}],
  "relationships": [{"source":"","target":"","type":"","description":""}],
  "dates": [""], "locations": [""], "legislation": [""],
  "people": [""], "organizations": [""], "topics": [""],
  "claims": [{"claim":"","subject":"","confidence":0.5}],
  "numbers": [{"value":"","unit":"","context":""}],
  "economicIndicators": [{"indicator":"","value":"","period":""}],
  "causeEffectPairs": [{"cause":"","effect":""}],
  "summary": "2-3 paragraph analytical summary",
  "confidence": 0.5
}

Rules: Every entity needs name+type. Every event needs date+title+description+entityNames. Keep arrays concise. Summary must be original prose, not copied.`;

  const response = await generateWithAI(prompt, {
    systemPrompt:
      "You are a structured intelligence extraction system. Output ONLY valid compact JSON. No markdown fences. No trailing text.",
    temperature: 0.1,
    maxTokens: 4096,
  });

  const parsed = extractJsonObject(response);
  if (!parsed) {
    console.warn(
      "[extraction] Failed to parse LLM response:",
      response.slice(0, 300),
    );
    return createEmptyExtraction();
  }

  const entitiesRaw = safeObjectArray(parsed.entities);
  const entities = entitiesRaw
    .filter(
      (e) =>
        typeof e.name === "string" &&
        e.name.trim().length > 0 &&
        typeof e.type === "string" &&
        e.type.trim().length > 0,
    )
    .map((e) => ({
      name: String(e.name).trim(),
      type: String(e.type).trim().toLowerCase(),
      aliases: safeStringArray(e.aliases),
    }));

  const eventsRaw = safeObjectArray(parsed.events);
  const events = eventsRaw
    .filter(
      (e) =>
        typeof e.date === "string" &&
        e.date.trim().length > 0 &&
        typeof e.title === "string" &&
        e.title.trim().length > 0,
    )
    .map((e) => ({
      date: String(e.date).trim(),
      title: String(e.title).trim(),
      description: String(e.description || "").trim(),
      entityNames: safeStringArray(e.entityNames),
    }));

  const relationshipsRaw = safeObjectArray(parsed.relationships);
  const relationships = relationshipsRaw
    .filter(
      (r) =>
        typeof r.source === "string" &&
        r.source.trim().length > 0 &&
        typeof r.target === "string" &&
        r.target.trim().length > 0,
    )
    .map((r) => ({
      source: String(r.source).trim(),
      target: String(r.target).trim(),
      type: String(r.type || "related").trim(),
      description: String(r.description || "").trim(),
    }));

  const claimsRaw = safeObjectArray(parsed.claims);
  const claims = claimsRaw
    .filter((c) => typeof c.claim === "string" && c.claim.trim().length > 0)
    .map((c) => ({
      claim: String(c.claim).trim(),
      subject: String(c.subject || "").trim(),
      confidence: clamp(Number(c.confidence) || 0.5, 0, 1),
    }));

  const numbersRaw = safeObjectArray(parsed.numbers);
  const numbers = numbersRaw
    .filter((n) => typeof n.value === "string" && n.value.trim().length > 0)
    .map((n) => ({
      value: String(n.value).trim(),
      unit: String(n.unit || "").trim(),
      context: String(n.context || "").trim(),
    }));

  const indicatorsRaw = safeObjectArray(parsed.economicIndicators);
  const economicIndicators = indicatorsRaw
    .filter(
      (i) => typeof i.indicator === "string" && i.indicator.trim().length > 0,
    )
    .map((i) => ({
      indicator: String(i.indicator).trim(),
      value: String(i.value || "").trim(),
      period: String(i.period || "").trim(),
    }));

  const causeEffectRaw = safeObjectArray(parsed.causeEffectPairs);
  const causeEffectPairs = causeEffectRaw
    .filter(
      (p) =>
        typeof p.cause === "string" &&
        p.cause.trim().length > 0 &&
        typeof p.effect === "string" &&
        p.effect.trim().length > 0,
    )
    .map((p) => ({
      cause: String(p.cause).trim(),
      effect: String(p.effect).trim(),
    }));

  return {
    entities,
    events,
    relationships,
    dates: safeStringArray(parsed.dates),
    locations: safeStringArray(parsed.locations),
    legislation: safeStringArray(parsed.legislation),
    people: safeStringArray(parsed.people),
    organizations: safeStringArray(parsed.organizations),
    topics: safeStringArray(parsed.topics),
    claims,
    numbers,
    economicIndicators,
    causeEffectPairs,
    summary: typeof parsed.summary === "string" ? parsed.summary.trim() : "",
    confidence: clamp(Number(parsed.confidence) || 0.5, 0, 1),
  };
}

function createEmptyExtraction(): StructuredExtraction {
  return {
    entities: [],
    events: [],
    relationships: [],
    dates: [],
    locations: [],
    legislation: [],
    people: [],
    organizations: [],
    topics: [],
    claims: [],
    numbers: [],
    economicIndicators: [],
    causeEffectPairs: [],
    summary: "",
    confidence: 0,
  };
}
