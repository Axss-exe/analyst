export type UserRole = "admin" | "analyst"

export interface User {
  id: number
  email: string
  name: string
  role: UserRole
  isBlocked: boolean
  createdAt: string
}

export interface Evidence {
  id: number
  title: string
  summary: string
  source: string
  sourceType: string
  publicationDate: string | null
  collectionDate: string
  confidence: number
  tags: string
  aiMetadata: string | null
  createdBy: number
  createdAt: string
}

export interface Story {
  id: number
  title: string
  overview: string
  status: "active" | "archived" | "closed"
  createdBy: number
  createdAt: string
  updatedAt: string
}

export interface Entity {
  id: number
  name: string
  type: string
  aliases: string
  metadata: string | null
  createdBy: number
  createdAt: string
}

export interface Relationship {
  id: number
  sourceId: number
  targetId: number
  type: string
  confidence: number
  evidenceIds: string
  createdBy: number
  createdAt: string
}

export interface TimelineEvent {
  id: number
  date: string
  title: string
  description: string
  evidenceId: number | null
  storyId: number | null
  entityIds: string
  createdBy: number
  createdAt: string
}

export interface ResearchTask {
  id: number
  objective: string
  priority: "low" | "medium" | "high" | "critical"
  ownerId: number
  deadline: string | null
  status: "open" | "in_progress" | "completed" | "cancelled"
  completionNotes: string | null
  createdBy: number
  createdAt: string
}

export interface GeneratedBrief {
  id: number
  storyId: number
  headline: string
  content: string
  version: number
  generationMode: "full" | "partial" | "since_last"
  evidenceIds: string
  templateId: number
  promptVersion: string
  llmModel: string
  createdBy: number
  createdAt: string
}

export interface Template {
  id: number
  name: string
  type: string
  config: string
  createdBy: number
  createdAt: string
}

export interface Notification {
  id: number
  userId: number
  type: string
  title: string
  message: string
  relatedObjectType: string | null
  relatedObjectId: number | null
  isRead: boolean
  createdAt: string
}

export interface AuditLog {
  id: number
  userId: number
  action: string
  targetType: string
  targetId: number
  previousValue: string | null
  newValue: string | null
  createdAt: string
}