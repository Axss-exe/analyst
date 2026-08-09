import {
  sqliteTable,
  integer,
  text,
  real,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const users = sqliteTable("users", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["admin", "analyst"] })
    .notNull()
    .default("analyst"),
  isBlocked: integer("is_blocked", { mode: "boolean" })
    .notNull()
    .default(false),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const evidence = sqliteTable(
  "evidence",
  {
    id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    content: text("content"),
    source: text("source").notNull(),
    sourceType: text("source_type").notNull(),
    publicationDate: text("publication_date"),
    collectionDate: text("collection_date")
      .notNull()
      .default(sql`(datetime('now'))`),
    confidence: real("confidence").notNull().default(0.5),
    tags: text("tags").notNull().default("[]"),
    aiMetadata: text("ai_metadata"),
    filePath: text("file_path"),
    createdBy: integer("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => ({
    evidenceCreatedByIdx: index("evidence_created_by_idx").on(t.createdBy),
    evidenceTagsIdx: index("evidence_tags_idx").on(t.tags),
  }),
);

export const stories = sqliteTable(
  "stories",
  {
    id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
    title: text("title").notNull(),
    overview: text("overview").notNull(),
    status: text("status", { enum: ["active", "archived", "closed"] })
      .notNull()
      .default("active"),
    clusterIds: text("cluster_ids").notNull().default("[]"),
    generationType: text("generation_type", { enum: ["auto", "manual"] })
      .notNull()
      .default("auto"),
    confidence: real("confidence").notNull().default(0.5),
    createdBy: integer("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => ({
    storiesStatusIdx: index("stories_status_idx").on(t.status),
    storiesCreatedByIdx: index("stories_created_by_idx").on(t.createdBy),
  }),
);

export const storyEvidence = sqliteTable(
  "story_evidence",
  {
    id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
    storyId: integer("story_id")
      .notNull()
      .references(() => stories.id, { onDelete: "cascade" }),
    evidenceId: integer("evidence_id")
      .notNull()
      .references(() => evidence.id, { onDelete: "cascade" }),
    confidence: real("confidence").notNull().default(0.5),
    relationshipType: text("relationship_type").notNull().default("related"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => ({
    storyEvidenceUniqueIdx: uniqueIndex("story_evidence_unique_idx").on(
      t.storyId,
      t.evidenceId,
    ),
    storyEvidenceStoryIdx: index("story_evidence_story_idx").on(t.storyId),
    storyEvidenceEvidenceIdx: index("story_evidence_evidence_idx").on(
      t.evidenceId,
    ),
  }),
);

export const entities = sqliteTable(
  "entities",
  {
    id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    type: text("type").notNull(),
    aliases: text("aliases").notNull().default("[]"),
    metadata: text("metadata"),
    createdBy: integer("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => ({
    entitiesTypeIdx: index("entities_type_idx").on(t.type),
    entitiesNameIdx: index("entities_name_idx").on(t.name),
  }),
);

export const relationships = sqliteTable(
  "relationships",
  {
    id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
    sourceId: integer("source_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    targetId: integer("target_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    confidence: real("confidence").notNull().default(0.5),
    evidenceIds: text("evidence_ids").notNull().default("[]"),
    createdBy: integer("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => ({
    relSourceIdx: index("rel_source_idx").on(t.sourceId),
    relTargetIdx: index("rel_target_idx").on(t.targetId),
    relTypeIdx: index("rel_type_idx").on(t.type),
  }),
);

export const timelineEvents = sqliteTable(
  "timeline_events",
  {
    id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
    date: text("date").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    evidenceId: integer("evidence_id").references(() => evidence.id, {
      onDelete: "set null",
    }),
    storyId: integer("story_id").references(() => stories.id, {
      onDelete: "set null",
    }),
    entityIds: text("entity_ids").notNull().default("[]"),
    createdBy: integer("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => ({
    timelineDateIdx: index("timeline_date_idx").on(t.date),
    timelineStoryIdx: index("timeline_story_idx").on(t.storyId),
    timelineEvidenceIdx: index("timeline_evidence_idx").on(t.evidenceId),
  }),
);

export const researchTasks = sqliteTable(
  "research_tasks",
  {
    id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
    objective: text("objective").notNull(),
    priority: text("priority", { enum: ["low", "medium", "high", "critical"] })
      .notNull()
      .default("medium"),
    ownerId: integer("owner_id")
      .notNull()
      .references(() => users.id),
    deadline: text("deadline"),
    status: text("status", {
      enum: ["open", "in_progress", "completed", "cancelled"],
    })
      .notNull()
      .default("open"),
    completionNotes: text("completion_notes"),
    createdBy: integer("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => ({
    tasksOwnerIdx: index("tasks_owner_idx").on(t.ownerId),
    tasksStatusIdx: index("tasks_status_idx").on(t.status),
    tasksPriorityIdx: index("tasks_priority_idx").on(t.priority),
  }),
);

export const generatedBriefs = sqliteTable(
  "generated_briefs",
  {
    id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
    storyId: integer("story_id")
      .notNull()
      .references(() => stories.id, { onDelete: "cascade" }),
    headline: text("headline").notNull(),
    content: text("content").notNull(),
    version: integer("version").notNull().default(1),
    generationMode: text("generation_mode", {
      enum: ["full", "partial", "since_last"],
    }).notNull(),
    evidenceIds: text("evidence_ids").notNull().default("[]"),
    templateId: integer("template_id").references(() => templates.id),
    promptVersion: text("prompt_version").notNull().default("1.0"),
    llmModel: text("llm_model").notNull(),
    createdBy: integer("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => ({
    briefsStoryIdx: index("briefs_story_idx").on(t.storyId),
    briefsCreatedIdx: index("briefs_created_idx").on(t.createdAt),
  }),
);

export const templates = sqliteTable("templates", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  type: text("type").notNull(),
  config: text("config").notNull(),
  createdBy: integer("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const notifications = sqliteTable(
  "notifications",
  {
    id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    message: text("message").notNull(),
    relatedObjectType: text("related_object_type"),
    relatedObjectId: integer("related_object_id"),
    isRead: integer("is_read", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => ({
    notifUserIdx: index("notif_user_idx").on(t.userId),
    notifReadIdx: index("notif_read_idx").on(t.isRead),
  }),
);

export const auditLog = sqliteTable(
  "audit_log",
  {
    id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: integer("target_id"),
    previousValue: text("previous_value"),
    newValue: text("new_value"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => ({
    auditUserIdx: index("audit_user_idx").on(t.userId),
    auditActionIdx: index("audit_action_idx").on(t.action),
    auditTargetIdx: index("audit_target_idx").on(t.targetType, t.targetId),
  }),
);

export const settings = sqliteTable("settings", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const evidenceEntities = sqliteTable(
  "evidence_entities",
  {
    id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
    evidenceId: integer("evidence_id")
      .notNull()
      .references(() => evidence.id, { onDelete: "cascade" }),
    entityId: integer("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => ({
    evidenceEntityUniqueIdx: uniqueIndex("evidence_entity_unique_idx").on(
      t.evidenceId,
      t.entityId,
    ),
  }),
);

export const taskEvidence = sqliteTable(
  "task_evidence",
  {
    id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
    taskId: integer("task_id")
      .notNull()
      .references(() => researchTasks.id, { onDelete: "cascade" }),
    evidenceId: integer("evidence_id")
      .notNull()
      .references(() => evidence.id, { onDelete: "cascade" }),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => ({
    taskEvidenceUniqueIdx: uniqueIndex("task_evidence_unique_idx").on(
      t.taskId,
      t.evidenceId,
    ),
  }),
);

export const taskEntities = sqliteTable(
  "task_entities",
  {
    id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
    taskId: integer("task_id")
      .notNull()
      .references(() => researchTasks.id, { onDelete: "cascade" }),
    entityId: integer("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => ({
    taskEntityUniqueIdx: uniqueIndex("task_entity_unique_idx").on(
      t.taskId,
      t.entityId,
    ),
  }),
);

// ==================== ATIS v3: Graph-First Schema ====================

export const facts = sqliteTable(
  "facts",
  {
    id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
    subject: text("subject").notNull(),
    predicate: text("predicate").notNull(),
    object: text("object").notNull(),
    evidenceId: integer("evidence_id")
      .notNull()
      .references(() => evidence.id, { onDelete: "cascade" }),
    confidence: real("confidence").notNull().default(0.5),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => ({
    factsEvidenceIdx: index("facts_evidence_idx").on(t.evidenceId),
    factsSubjectIdx: index("facts_subject_idx").on(t.subject),
  }),
);

export const evidenceConnections = sqliteTable(
  "evidence_connections",
  {
    id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
    evidenceIdA: integer("evidence_id_a")
      .notNull()
      .references(() => evidence.id, { onDelete: "cascade" }),
    evidenceIdB: integer("evidence_id_b")
      .notNull()
      .references(() => evidence.id, { onDelete: "cascade" }),
    signalType: text("signal_type").notNull(),
    strength: real("strength").notNull().default(0.5),
    reason: text("reason").notNull(),
    metadata: text("metadata"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => ({
    evidenceConnectionUniqueIdx: uniqueIndex(
      "evidence_connection_unique_idx",
    ).on(t.evidenceIdA, t.evidenceIdB, t.signalType),
    evidenceConnAIdx: index("evidence_conn_a_idx").on(t.evidenceIdA),
    evidenceConnBIdx: index("evidence_conn_b_idx").on(t.evidenceIdB),
    evidenceConnSignalIdx: index("evidence_conn_signal_idx").on(t.signalType),
  }),
);

export const graphClusters = sqliteTable(
  "graph_clusters",
  {
    id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    evidenceIds: text("evidence_ids").notNull().default("[]"),
    entityIds: text("entity_ids").notNull().default("[]"),
    evidenceCount: integer("evidence_count").notNull().default(0),
    entityCount: integer("entity_count").notNull().default(0),
    density: real("density").notNull().default(0),
    status: text("status", {
      enum: ["new", "strengthened", "merged", "stable"],
    })
      .notNull()
      .default("new"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => ({
    clusterStatusIdx: index("cluster_status_idx").on(t.status),
  }),
);

export const narratives = sqliteTable(
  "narratives",
  {
    id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
    title: text("title").notNull(),
    overview: text("overview").notNull(),
    status: text("status").notNull().default("draft"),
    clusterIds: text("cluster_ids").notNull().default("[]"),
    evidenceIds: text("evidence_ids").notNull().default("[]"),
    confidence: real("confidence").notNull().default(0.5),
    generationType: text("generation_type", { enum: ["auto", "manual"] })
      .notNull()
      .default("auto"),
    createdBy: integer("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => ({
    narrativesConfidenceIdx: index("narratives_confidence_idx").on(
      t.confidence,
    ),
    narrativesTypeIdx: index("narratives_type_idx").on(t.generationType),
  }),
);

// ==================== Jobs Table (SQLite-backed) ====================

export const jobs = sqliteTable(
  "jobs",
  {
    id: text("id").primaryKey(),
    status: text("status", {
      enum: ["queued", "running", "completed", "failed", "cancelled"],
    })
      .notNull()
      .default("queued"),
    currentStage: text("current_stage").notNull().default(""),
    progress: integer("progress", { mode: "number" }).notNull().default(0),
    stages: text("stages").notNull().default("[]"),
    result: text("result"),
    error: text("error"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => ({
    jobsStatusIdx: index("jobs_status_idx").on(t.status),
    jobsCreatedIdx: index("jobs_created_idx").on(t.createdAt),
  }),
);

export const evidenceImports = sqliteTable("evidence_imports", {
  id: integer("id").primaryKey(),
  filename: text("filename").notNull(),
  records: text("records").notNull(),
  status: text("status").notNull().default("pending"),
  totalRecords: integer("total_records").notNull().default(0),
  processedCount: integer("processed_count").notNull().default(0),
  failedCount: integer("failed_count").notNull().default(0),
  cooldownSeconds: integer("cooldown_seconds").notNull().default(300),
  currentIndex: integer("current_index").notNull().default(0),
  errorLog: text("error_log"),
  createdBy: integer("created_by"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const narrativeChecks = sqliteTable("narrative_checks", {
  id: integer("id").primaryKey(),
  narrativeId: integer("narrative_id").notNull(),
  evidenceLinkCount: integer("evidence_link_count").notNull().default(0),
  entityOverlapScore: real("entity_overlap_score"),
  textQualityScore: real("text_quality_score"),
  factSupportRatio: real("fact_support_ratio"),
  overallScore: real("overall_score"),
  issues: text("issues"),
  status: text("status").notNull().default("pending"),
  checkedAt: text("checked_at"),
  createdAt: text("created_at").notNull(),
});

// ==================== ATIS v4: Story-Bearing Graph Schema ====================

export const storyGraphEdges = sqliteTable(
  "story_graph_edges",
  {
    id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
    evidenceIdA: integer("evidence_id_a")
      .notNull()
      .references(() => evidence.id, { onDelete: "cascade" }),
    evidenceIdB: integer("evidence_id_b")
      .notNull()
      .references(() => evidence.id, { onDelete: "cascade" }),
    relationshipType: text("relationship_type").notNull(),
    weight: real("weight").notNull().default(0),
    confidence: real("confidence").notNull().default(0.5),
    explicit: integer("explicit", { mode: "boolean" }).notNull().default(true),
    explanation: text("explanation").notNull().default(""),
    sourceEvidence: text("source_evidence").notNull().default(""),
    inferred: integer("inferred", { mode: "boolean" }).notNull().default(false),
    inferenceChain: text("inference_chain").notNull().default("[]"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => ({
    storyEdgeUniqueIdx: uniqueIndex("story_edge_unique_idx").on(
      t.evidenceIdA,
      t.evidenceIdB,
      t.relationshipType,
    ),
    storyEdgeAIdx: index("story_edge_a_idx").on(t.evidenceIdA),
    storyEdgeBIdx: index("story_edge_b_idx").on(t.evidenceIdB),
    storyEdgeTypeIdx: index("story_edge_type_idx").on(t.relationshipType),
    storyEdgeWeightIdx: index("story_edge_weight_idx").on(t.weight),
  }),
);

export const contextGraphEdges = sqliteTable(
  "context_graph_edges",
  {
    id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
    evidenceIdA: integer("evidence_id_a")
      .notNull()
      .references(() => evidence.id, { onDelete: "cascade" }),
    evidenceIdB: integer("evidence_id_b")
      .notNull()
      .references(() => evidence.id, { onDelete: "cascade" }),
    relationshipType: text("relationship_type").notNull(),
    weight: real("weight").notNull().default(0),
    confidence: real("confidence").notNull().default(0.5),
    explanation: text("explanation").notNull().default(""),
    sourceEvidence: text("source_evidence").notNull().default(""),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => ({
    contextEdgeUniqueIdx: uniqueIndex("context_edge_unique_idx").on(
      t.evidenceIdA,
      t.evidenceIdB,
      t.relationshipType,
    ),
    contextEdgeAIdx: index("context_edge_a_idx").on(t.evidenceIdA),
    contextEdgeBIdx: index("context_edge_b_idx").on(t.evidenceIdB),
    contextEdgeTypeIdx: index("context_edge_type_idx").on(t.relationshipType),
  }),
);

export const storyCandidates = sqliteTable(
  "story_candidates",
  {
    id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
    name: text("name").notNull().default("Untitled Candidate"),
    description: text("description").notNull().default(""),
    evidenceIds: text("evidence_ids").notNull().default("[]"),
    seedType: text("seed_type").notNull().default("program_cluster"),
    coherenceOverall: real("coherence_overall").notNull().default(0),
    coherenceProgramIdentity: real("coherence_program_identity").notNull().default(0),
    coherenceProblemConsistency: real("coherence_problem_consistency").notNull().default(0),
    coherenceGeographic: real("coherence_geographic").notNull().default(0),
    coherenceTemporal: real("coherence_temporal").notNull().default(0),
    coherenceDensity: real("coherence_density").notNull().default(0),
    coherenceScore: real("coherence_score").notNull().default(0),
    confidence: real("confidence").notNull().default(0.5),
    dominantProgramId: integer("dominant_program_id"),
    dominantProblemId: integer("dominant_problem_id"),
    dominantTheme: text("dominant_theme"),
    causalChain: text("causal_chain").notNull().default("[]"),
    relationshipCounts: text("relationship_counts").notNull().default('{"strong":0,"medium":0,"weak":0,"total":0}'),
    diagnostics: text("diagnostics"),
    reasons: text("reasons").notNull().default("[]"),
    isValid: integer("is_valid", { mode: "boolean" }).notNull().default(false),
    rejectionReason: text("rejection_reason"),
    provenanceEdges: text("provenance_edges").notNull().default("[]"),
    status: text("status", { enum: ["pending", "validated", "rejected", "promoted", "story"] })
      .notNull()
      .default("pending"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => ({
    candidateStatusIdx: index("candidate_status_idx").on(t.status),
    candidateCoherenceIdx: index("candidate_coherence_idx").on(t.coherenceOverall),
  }),
);

// ==================== ATIS v4: Intelligence Nodes ====================

export const programs = sqliteTable("programs", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  normalizedName: text("normalized_name").notNull(),
  description: text("description"),
  type: text("type"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

export const events = sqliteTable("events", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  normalizedName: text("normalized_name").notNull(),
  description: text("description"),
  temporalInfo: text("temporal_info"),
  eventType: text("event_type"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

export const problems = sqliteTable("problems", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  normalizedName: text("normalized_name").notNull(),
  description: text("description"),
  severity: text("severity"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

export const outcomes = sqliteTable("outcomes", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  normalizedName: text("normalized_name").notNull(),
  description: text("description"),
  metric: text("metric"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

export const actors = sqliteTable("actors", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  normalizedName: text("normalized_name").notNull(),
  actorType: text("actor_type"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

// Join tables
export const evidencePrograms = sqliteTable("evidence_programs", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  evidenceId: integer("evidence_id").notNull().references(() => evidence.id, { onDelete: "cascade" }),
  programId: integer("program_id").notNull().references(() => programs.id, { onDelete: "cascade" }),
  confidence: real("confidence").notNull().default(0.5),
  explicit: integer("explicit", { mode: "boolean" }).notNull().default(true),
  reason: text("reason"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

export const evidenceEvents = sqliteTable("evidence_events", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  evidenceId: integer("evidence_id").notNull().references(() => evidence.id, { onDelete: "cascade" }),
  eventId: integer("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  confidence: real("confidence").notNull().default(0.5),
  explicit: integer("explicit", { mode: "boolean" }).notNull().default(true),
  reason: text("reason"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

export const evidenceProblems = sqliteTable("evidence_problems", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  evidenceId: integer("evidence_id").notNull().references(() => evidence.id, { onDelete: "cascade" }),
  problemId: integer("problem_id").notNull().references(() => problems.id, { onDelete: "cascade" }),
  confidence: real("confidence").notNull().default(0.5),
  explicit: integer("explicit", { mode: "boolean" }).notNull().default(true),
  reason: text("reason"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

export const evidenceOutcomes = sqliteTable("evidence_outcomes", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  evidenceId: integer("evidence_id").notNull().references(() => evidence.id, { onDelete: "cascade" }),
  outcomeId: integer("outcome_id").notNull().references(() => outcomes.id, { onDelete: "cascade" }),
  confidence: real("confidence").notNull().default(0.5),
  explicit: integer("explicit", { mode: "boolean" }).notNull().default(true),
  reason: text("reason"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

export const evidenceActors = sqliteTable("evidence_actors", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  evidenceId: integer("evidence_id").notNull().references(() => evidence.id, { onDelete: "cascade" }),
  actorId: integer("actor_id").notNull().references(() => actors.id, { onDelete: "cascade" }),
  confidence: real("confidence").notNull().default(0.5),
  explicit: integer("explicit", { mode: "boolean" }).notNull().default(true),
  reason: text("reason"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

// ==================== ATIS v4: Story Relationships (compat layer) ====================

export const storyRelationships = sqliteTable(
  "story_relationships",
  {
    id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
    sourceEvidenceId: integer("source_evidence_id")
      .notNull()
      .references(() => evidence.id, { onDelete: "cascade" }),
    targetEvidenceId: integer("target_evidence_id")
      .notNull()
      .references(() => evidence.id, { onDelete: "cascade" }),
    relationshipType: text("relationship_type").notNull(),
    weight: real("weight").notNull().default(0),
    confidence: real("confidence").notNull().default(0.5),
    explicit: integer("explicit", { mode: "boolean" }).notNull().default(true),
    reason: text("reason"),
    createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  },
  (t) => ({
    storyRelUniqueIdx: uniqueIndex("story_rel_unique_idx").on(
      t.sourceEvidenceId,
      t.targetEvidenceId,
      t.relationshipType,
    ),
    storyRelSourceIdx: index("story_rel_source_idx").on(t.sourceEvidenceId),
    storyRelTargetIdx: index("story_rel_target_idx").on(t.targetEvidenceId),
  }),
);

export const storyCandidateEvidence = sqliteTable(
  "story_candidate_evidence",
  {
    id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
    storyCandidateId: integer("story_candidate_id")
      .notNull()
      .references(() => storyCandidates.id, { onDelete: "cascade" }),
    evidenceId: integer("evidence_id")
      .notNull()
      .references(() => evidence.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    attachmentReason: text("attachment_reason"),
    createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  },
  (t) => ({
    sceUniqueIdx: uniqueIndex("sce_unique_idx").on(t.storyCandidateId, t.evidenceId),
  }),
);

export const evidenceStoryAssessment = sqliteTable("evidence_story_assessment", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  evidenceId: integer("evidence_id").notNull().references(() => evidence.id, { onDelete: "cascade" }),
  hasProblem: integer("has_problem", { mode: "boolean" }).notNull().default(false),
  hasIntervention: integer("has_intervention", { mode: "boolean" }).notNull().default(false),
  hasOutcome: integer("has_outcome", { mode: "boolean" }).notNull().default(false),
  hasProgram: integer("has_program", { mode: "boolean" }).notNull().default(false),
  hasEvent: integer("has_event", { mode: "boolean" }).notNull().default(false),
  narrativeCompletenessScore: real("narrative_completeness_score"),
  canBeSingleDocumentStory: integer("can_be_single_document_story", { mode: "boolean" }).notNull().default(false),
  assessmentReason: text("assessment_reason"),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});