import { and, eq, gt, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import { db } from "@/db/client";
import { companies, companyInvites, companyMemberships, profiles, stores } from "@/db/schema";
import { ok } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { requireAuth, requireRole, requireTenant } from "@/middleware/auth";
import { validateJson } from "@/middleware/common";
import type { AppEnv } from "@/app/router";

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["owner", "admin", "member"]).default("member"),
  storeId: z.string().uuid().nullable().optional(),
  expiresInDays: z.number().int().min(1).max(30).default(7),
});

const acceptInviteSchema = z.object({
  token: z.string().min(1),
});

export const authRoutes = new Hono<AppEnv>().basePath("/auth");

authRoutes.get("/me", requireAuth, async (c) => {
  const user = c.get("user");

  const memberships = await db
    .select({
      membershipId: companyMemberships.id,
      companyId: companyMemberships.companyId,
      role: companyMemberships.role,
      status: companyMemberships.status,
      storeId: companyMemberships.storeId,
      companyName: companies.name,
      storeName: stores.name,
    })
    .from(companyMemberships)
    .innerJoin(companies, eq(companies.id, companyMemberships.companyId))
    .leftJoin(stores, eq(stores.id, companyMemberships.storeId))
    .where(
      and(
        eq(companyMemberships.userId, user.id),
        eq(companyMemberships.status, "active"),
        isNull(companyMemberships.deletedAt),
        isNull(companies.deletedAt),
      ),
    );

  return ok(c, {
    user,
    memberships,
  });
});

authRoutes.post("/invite", requireAuth, requireTenant, requireRole("admin"), validateJson(inviteSchema), async (c) => {
  const body = c.get("validatedBody") as z.infer<typeof inviteSchema>;
  const user = c.get("user");
  const tenant = c.get("tenant");

  const existing = await db
    .select({ id: companyInvites.id })
    .from(companyInvites)
    .where(
      and(
        eq(companyInvites.companyId, tenant.companyId),
        eq(companyInvites.email, body.email),
        eq(companyInvites.status, "pending"),
        gt(companyInvites.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    throw AppError.conflict("There is already an active invite for this email");
  }

  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + body.expiresInDays * 24 * 60 * 60 * 1000);

  const [createdInvite] = await db
    .insert(companyInvites)
    .values({
      companyId: tenant.companyId,
      email: body.email,
      role: body.role,
      storeId: body.storeId ?? null,
      token,
      invitedBy: user.id,
      expiresAt,
    })
    .returning();

  return ok(
    c,
    {
      inviteId: createdInvite.id,
      token: createdInvite.token,
      expiresAt: createdInvite.expiresAt,
      role: createdInvite.role,
      email: createdInvite.email,
    },
    201,
  );
});

authRoutes.post("/accept-invite", requireAuth, validateJson(acceptInviteSchema), async (c) => {
  const body = c.get("validatedBody") as z.infer<typeof acceptInviteSchema>;
  const user = c.get("user");

  const [invite] = await db
    .select()
    .from(companyInvites)
    .where(and(eq(companyInvites.token, body.token), eq(companyInvites.status, "pending"), gt(companyInvites.expiresAt, new Date())))
    .limit(1);

  if (!invite) {
    throw AppError.notFound("Invite token is invalid or expired");
  }

  if (user.email && user.email.toLowerCase() !== invite.email.toLowerCase()) {
    throw AppError.forbidden("Invite email does not match authenticated user");
  }

  if (user.email) {
    await db
      .insert(profiles)
      .values({
        id: user.id,
        email: user.email,
      })
      .onConflictDoUpdate({
        target: profiles.id,
        set: {
          email: user.email,
          updatedAt: new Date(),
        },
      });
  }

  await db
    .insert(companyMemberships)
    .values({
      companyId: invite.companyId,
      userId: user.id,
      role: invite.role,
      storeId: invite.storeId,
      status: "active",
    })
    .onConflictDoUpdate({
      target: [companyMemberships.companyId, companyMemberships.userId],
      set: {
        role: invite.role,
        status: "active",
        storeId: invite.storeId,
        updatedAt: new Date(),
        deletedAt: null,
      },
    });

  await db
    .update(companyInvites)
    .set({
      status: "accepted",
      acceptedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(companyInvites.id, invite.id));

  return ok(c, {
    accepted: true,
    companyId: invite.companyId,
    role: invite.role,
  });
});
