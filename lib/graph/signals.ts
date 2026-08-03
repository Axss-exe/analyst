import { db } from "@/db/client";
import { facts, timelineEvents } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import type { EvidenceGraph, EvidenceNode } from "./types";
import type { ConnectionSignal } from "@/types";

interface LoadedFact {
  evidenceId: number;
  subject: string;
  predicate: string;
  object: string;
}

interface LoadedEvent {
  evidenceId: number;
  title: string;
  date: string;
}

export async function computeSignals(
  graph: EvidenceGraph,
): Promise<ConnectionSignal[]> {
  const evidenceIds = Array.from(graph.evidenceNodes.keys());
  if (evidenceIds.length < 2) return [];

  const factsByEvidence = await loadFactsByEvidence(evidenceIds);
  const eventsByEvidence = await loadEventsByEvidence(evidenceIds);

  const signals: ConnectionSignal[] = [];

  for (let i = 0; i < evidenceIds.length; i++) {
    for (let j = i + 1; j < evidenceIds.length; j++) {
      const a = evidenceIds[i];
      const b = evidenceIds[j];
      const nodeA = graph.evidenceNodes.get(a)!;
      const nodeB = graph.evidenceNodes.get(b)!;

      const pairSignals = computePairSignals(
        nodeA,
        nodeB,
        graph,
        factsByEvidence,
        eventsByEvidence,
      );
      if (pairSignals.length > 0) {
        signals.push(...pairSignals);
        const key = pairKey(a, b);
        graph.signalMatrix.set(key, pairSignals);
      }
    }
  }

  return signals;
}

export async function computeSignalsForEvidence(
  graph: EvidenceGraph,
  evidenceId: number,
): Promise<ConnectionSignal[]> {
  const node = graph.evidenceNodes.get(evidenceId);
  if (!node) return [];

  const otherIds = Array.from(graph.evidenceNodes.keys()).filter(
    (id) => id !== evidenceId,
  );
  if (otherIds.length === 0) return [];

  const factsByEvidence = await loadFactsByEvidence([evidenceId, ...otherIds]);
  const eventsByEvidence = await loadEventsByEvidence([
    evidenceId,
    ...otherIds,
  ]);

  const signals: ConnectionSignal[] = [];

  for (const otherId of otherIds) {
    const otherNode = graph.evidenceNodes.get(otherId)!;
    const pairSignals = computePairSignals(
      node,
      otherNode,
      graph,
      factsByEvidence,
      eventsByEvidence,
    );
    if (pairSignals.length > 0) {
      signals.push(...pairSignals);
      const key = pairKey(evidenceId, otherId);
      const existing = graph.signalMatrix.get(key) || [];
      graph.signalMatrix.set(key, [...existing, ...pairSignals]);
    }
  }

  return signals;
}

function computePairSignals(
  a: EvidenceNode,
  b: EvidenceNode,
  graph: EvidenceGraph,
  factsByEvidence: Map<number, LoadedFact[]>,
  eventsByEvidence: Map<number, LoadedEvent[]>,
): ConnectionSignal[] {
  const signals: ConnectionSignal[] = [];

  // --- 1. shared_entities ---
  const sharedEntIds = intersect(a.entityIds, b.entityIds);
  if (sharedEntIds.length > 0) {
    const names = sharedEntIds
      .map((id) => graph.entityNodes.get(id)?.name || String(id))
      .filter(Boolean);
    signals.push({
      evidenceIdA: a.id,
      evidenceIdB: b.id,
      signalType: "shared_entities",
      strength: Math.min(1, sharedEntIds.length * 0.25 + 0.3),
      reason: `Both evidence items mention ${joinNames(names)}`,
    });
  }

  // --- 2. shared_people (entity type === "person") ---
  const aPeople = entityNamesByType(a.entityIds, graph, ["person"]);
  const bPeople = entityNamesByType(b.entityIds, graph, ["person"]);
  const sharedPeople = intersect(aPeople, bPeople);
  if (sharedPeople.length > 0) {
    signals.push({
      evidenceIdA: a.id,
      evidenceIdB: b.id,
      signalType: "shared_people",
      strength: Math.min(1, sharedPeople.length * 0.3 + 0.3),
      reason: `Both evidence items reference ${joinNames(sharedPeople)}`,
    });
  }

  // --- 3. shared_organizations ---
  const aOrgs = entityNamesByType(a.entityIds, graph, [
    "organization",
    "company",
    "government",
    "bank",
    "investor",
    "project",
  ]);
  const bOrgs = entityNamesByType(b.entityIds, graph, [
    "organization",
    "company",
    "government",
    "bank",
    "investor",
    "project",
  ]);
  const sharedOrgs = intersect(aOrgs, bOrgs);
  if (sharedOrgs.length > 0) {
    signals.push({
      evidenceIdA: a.id,
      evidenceIdB: b.id,
      signalType: "shared_organizations",
      strength: Math.min(1, sharedOrgs.length * 0.25 + 0.3),
      reason: `Both evidence items involve ${joinNames(sharedOrgs)}`,
    });
  }

  // --- 4. shared_locations ---
  const sharedLocs = intersect(a.locations, b.locations);
  if (sharedLocs.length > 0) {
    signals.push({
      evidenceIdA: a.id,
      evidenceIdB: b.id,
      signalType: "shared_locations",
      strength: Math.min(1, sharedLocs.length * 0.3 + 0.2),
      reason: `Both evidence items concern ${joinNames(sharedLocs)}`,
    });
  }

  // --- 5. shared_legislation (entities of type "legislation" + facts) ---
  const aLegEntities = entityNamesByType(a.entityIds, graph, ["legislation"]);
  const bLegEntities = entityNamesByType(b.entityIds, graph, ["legislation"]);
  const aLegFacts = legislationFromFacts(factsByEvidence.get(a.id) || []);
  const bLegFacts = legislationFromFacts(factsByEvidence.get(b.id) || []);
  const sharedLeg = intersect(
    [...aLegEntities, ...aLegFacts],
    [...bLegEntities, ...bLegFacts],
  );
  if (sharedLeg.length > 0) {
    signals.push({
      evidenceIdA: a.id,
      evidenceIdB: b.id,
      signalType: "shared_legislation",
      strength: Math.min(1, sharedLeg.length * 0.3 + 0.4),
      reason: `Both evidence items reference legislation: ${joinNames(sharedLeg)}`,
    });
  }

  // --- 6. shared_events (timeline events) ---
  const aEvents = eventsByEvidence.get(a.id) || [];
  const bEvents = eventsByEvidence.get(b.id) || [];
  const sharedEventTitles = intersect(
    aEvents.map((e) => e.title),
    bEvents.map((e) => e.title),
  );
  if (sharedEventTitles.length > 0) {
    signals.push({
      evidenceIdA: a.id,
      evidenceIdB: b.id,
      signalType: "shared_events",
      strength: Math.min(1, sharedEventTitles.length * 0.3 + 0.3),
      reason: `Both evidence items describe ${joinNames(sharedEventTitles)}`,
    });
  }

  // --- 7. temporal_proximity ---
  const dateA = parseDate(a.createdAt);
  const dateB = parseDate(b.createdAt);
  if (dateA && dateB) {
    const daysDiff =
      Math.abs(dateA.getTime() - dateB.getTime()) / (1000 * 60 * 60 * 24);
    if (daysDiff <= 730) {
      const strength = Math.max(0, 1 - daysDiff / 730);
      signals.push({
        evidenceIdA: a.id,
        evidenceIdB: b.id,
        signalType: "temporal_proximity",
        strength: Math.round(strength * 100) / 100,
        reason: `Evidence items published ${Math.round(daysDiff)} days apart`,
      });
    }
  }

  // --- 8. cause_effect_language (from facts) ---
  const aFacts = factsByEvidence.get(a.id) || [];
  const bFacts = factsByEvidence.get(b.id) || [];
  const aCausal = causalFacts(aFacts);
  const bCausal = causalFacts(bFacts);
  if (aCausal.length > 0 && bCausal.length > 0) {
    const aSubjects = new Set(aCausal.map((f) => f.subject));
    const bSubjects = new Set(bCausal.map((f) => f.subject));
    const sharedSubjects = intersect(
      Array.from(aSubjects),
      Array.from(bSubjects),
    );
    if (sharedSubjects.length > 0) {
      signals.push({
        evidenceIdA: a.id,
        evidenceIdB: b.id,
        signalType: "cause_effect_language",
        strength: 0.6,
        reason: `Both evidence items describe causal relationships involving ${joinNames(sharedSubjects)}`,
      });
    }
  }

  // --- 9. economic_indicator (from facts) ---
  const aIndicators = economicFacts(aFacts);
  const bIndicators = economicFacts(bFacts);
  const sharedIndicators = intersect(aIndicators, bIndicators);
  if (sharedIndicators.length > 0) {
    signals.push({
      evidenceIdA: a.id,
      evidenceIdB: b.id,
      signalType: "economic_indicator",
      strength: Math.min(1, sharedIndicators.length * 0.3 + 0.4),
      reason: `Both evidence items reference economic indicators: ${joinNames(sharedIndicators)}`,
    });
  }

  // --- 10. semantic_overlap (shared topics) ---
  const sharedTopics = intersect(a.topics, b.topics);
  if (sharedTopics.length > 0) {
    signals.push({
      evidenceIdA: a.id,
      evidenceIdB: b.id,
      signalType: "semantic_overlap",
      strength: Math.min(1, sharedTopics.length * 0.2 + 0.2),
      reason: `Shared thematic topics: ${joinNames(sharedTopics)}`,
    });
  }

  return signals;
}

// ==================== Helpers ====================

async function loadFactsByEvidence(
  evidenceIds: number[],
): Promise<Map<number, LoadedFact[]>> {
  if (evidenceIds.length === 0) return new Map();
  const rows = db
    .select()
    .from(facts)
    .where(inArray(facts.evidenceId, evidenceIds))
    .all();
  const map = new Map<number, LoadedFact[]>();
  for (const row of rows) {
    const list = map.get(row.evidenceId) || [];
    list.push({
      evidenceId: row.evidenceId,
      subject: row.subject,
      predicate: row.predicate,
      object: row.object,
    });
    map.set(row.evidenceId, list);
  }
  return map;
}

async function loadEventsByEvidence(
  evidenceIds: number[],
): Promise<Map<number, LoadedEvent[]>> {
  if (evidenceIds.length === 0) return new Map();
  const rows = db
    .select()
    .from(timelineEvents)
    .where(inArray(timelineEvents.evidenceId, evidenceIds))
    .all();
  const map = new Map<number, LoadedEvent[]>();
  for (const row of rows) {
    const list = map.get(row.evidenceId!) || [];
    list.push({
      evidenceId: row.evidenceId!,
      title: row.title,
      date: row.date,
    });
    map.set(row.evidenceId!, list);
  }
  return map;
}

function pairKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function intersect<T>(a: T[], b: T[]): T[] {
  const setB = new Set(b);
  return [...new Set(a)].filter((x) => setB.has(x));
}

function entityNamesByType(
  entityIds: number[],
  graph: EvidenceGraph,
  types: string[],
): string[] {
  const names: string[] = [];
  for (const id of entityIds) {
    const ent = graph.entityNodes.get(id);
    if (ent && types.includes(ent.type)) {
      names.push(ent.name);
    }
  }
  return names;
}

function legislationFromFacts(factsList: LoadedFact[]): string[] {
  return factsList
    .filter(
      (f) =>
        f.predicate.toLowerCase().includes("legislation") ||
        f.predicate.toLowerCase().includes("act") ||
        f.predicate.toLowerCase().includes("bill") ||
        f.predicate.toLowerCase().includes("regulation") ||
        f.predicate.toLowerCase().includes("law"),
    )
    .map((f) => f.object)
    .filter(Boolean);
}

function causalFacts(factsList: LoadedFact[]): LoadedFact[] {
  return factsList.filter(
    (f) =>
      f.predicate.toLowerCase().includes("cause") ||
      f.predicate.toLowerCase().includes("lead") ||
      f.predicate.toLowerCase().includes("result") ||
      f.predicate.toLowerCase().includes("trigger") ||
      f.predicate.toLowerCase().includes("due to"),
  );
}

function economicFacts(factsList: LoadedFact[]): string[] {
  return factsList
    .filter(
      (f) =>
        f.predicate.toLowerCase().includes("indicator") ||
        f.predicate.toLowerCase().includes("gdp") ||
        f.predicate.toLowerCase().includes("inflation") ||
        f.predicate.toLowerCase().includes("trade") ||
        f.predicate.toLowerCase().includes("growth") ||
        f.predicate.toLowerCase().includes("revenue") ||
        f.predicate.toLowerCase().includes("budget"),
    )
    .map((f) => `${f.subject}: ${f.object}`)
    .filter(Boolean);
}

function joinNames(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

function parseDate(str: string): Date | null {
  if (!str) return null;
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}
