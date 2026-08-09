import { activityLogs } from "@/lib/db/schema";

export async function writeAudit(
  tx: any,
  input: {
    actorUserId?: string | null;
    actorGroupId?: string | null;
    actorRole?: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    description: string;
    beforeData?: unknown;
    afterData?: unknown;
    reason?: string | null;
  },
) {
  await tx.insert(activityLogs).values({
    actorUserId: input.actorUserId ?? null,
    actorGroupId: input.actorGroupId ?? null,
    actorRole: input.actorRole ?? null,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    description: input.description,
    beforeData: input.beforeData ?? null,
    afterData: input.afterData ?? null,
    reason: input.reason ?? null,
  });
}
