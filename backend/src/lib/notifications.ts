import { db } from "@/db/client";
import { notifications } from "@/db/schema";

export async function createNotification(input: {
  companyId: string;
  type: "lead" | "deal" | "task" | "campaign";
  title: string;
  message: string;
  entityId?: string | null;
  entityPath?: string | null;
  payload?: Record<string, unknown>;
}) {
  await db.insert(notifications).values({
    companyId: input.companyId,
    type: input.type,
    title: input.title,
    message: input.message,
    entityId: input.entityId ?? null,
    entityPath: input.entityPath ?? null,
    payload: input.payload ?? {},
  });
}
