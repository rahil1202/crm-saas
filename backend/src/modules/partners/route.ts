import { Hono } from "hono";

import type { AppEnv } from "@/app/route";
import {
  createPartner,
  createPartnerUser,
  deletePartner,
  deletePartnerUser,
  listPartners,
  listPartnerUsers,
  updatePartner,
  updatePartnerUser,
} from "@/modules/partners/controller";
import {
  listPartnersSchema,
  listPartnerUsersSchema,
  partnerSchema,
  partnerUserSchema,
  updatePartnerSchema,
  updatePartnerUserSchema,
} from "@/modules/partners/schema";
import { requireAuth, requireRole, requireTenant } from "@/middleware/auth";
import { validateJson, validateQuery } from "@/middleware/common";

export const partnerRoutes = new Hono<AppEnv>().basePath("/partners");
partnerRoutes.use("*", requireAuth, requireTenant);

partnerRoutes.get("/", validateQuery(listPartnersSchema), listPartners);
partnerRoutes.get("/users", requireRole("admin"), validateQuery(listPartnerUsersSchema), listPartnerUsers);
partnerRoutes.post("/", requireRole("admin"), validateJson(partnerSchema), createPartner);
partnerRoutes.post("/users", requireRole("admin"), validateJson(partnerUserSchema), createPartnerUser);
partnerRoutes.patch("/:partnerId", requireRole("admin"), validateJson(updatePartnerSchema), updatePartner);
partnerRoutes.patch("/users/:partnerUserId", requireRole("admin"), validateJson(updatePartnerUserSchema), updatePartnerUser);
partnerRoutes.delete("/:partnerId", requireRole("admin"), deletePartner);
partnerRoutes.delete("/users/:partnerUserId", requireRole("admin"), deletePartnerUser);
