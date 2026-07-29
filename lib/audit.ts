import { db } from "@/db/client"
import { auditLog } from "@/db/schema"

export async function logAction(params: {
  userId: number
  action: string
  targetType: string
  targetId?: number
  previousValue?: string
  newValue?: string
}) {
  await db.insert(auditLog).values({
    userId: params.userId,
    action: params.action,
    targetType: params.targetType,
    targetId: params.targetId,
    previousValue: params.previousValue,
    newValue: params.newValue,
  })
}
