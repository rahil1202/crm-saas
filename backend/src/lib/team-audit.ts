import { db } from "@/db/client";
import { teamMemberAudits } from "@/db/schema";

type TeamAuditInput = {
  companyId: string;
  eventType: string;
  summary: string;
  actorUserId?: string | null;
  membershipId?: string | null;
  targetUserId?: string | null;
  inviteId?: string | null;
  metadata?: Record<string, unknown>;
};

export async function recordTeamAudit(input: TeamAuditInput) {
  await db.insert(teamMemberAudits).values({
    companyId: input.companyId,
    eventType: input.eventType,
    summary: input.summary,
    actorUserId: input.actorUserId ?? null,
    membershipId: input.membershipId ?? null,
    targetUserId: input.targetUserId ?? null,
    inviteId: input.inviteId ?? null,
    metadata: input.metadata ?? {},
  });
}
