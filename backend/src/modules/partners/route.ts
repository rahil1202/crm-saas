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
import { requireAuth, requireModuleAccess, requireTenant } from "@/middleware/auth";
import { validateJson, validateQuery } from "@/middleware/common";

export const partnerRoutes = new Hono<AppEnv>().basePath("/partners");
partnerRoutes.use("*", requireAuth, requireTenant, requireModuleAccess("partners"));

partnerRoutes.get("/", validateQuery(listPartnersSchema), listPartners);
partnerRoutes.get("/users", validateQuery(listPartnerUsersSchema), listPartnerUsers);
partnerRoutes.post("/", validateJson(partnerSchema), createPartner);
partnerRoutes.post("/users", validateJson(partnerUserSchema), createPartnerUser);
partnerRoutes.patch("/:partnerId", validateJson(updatePartnerSchema), updatePartner);
partnerRoutes.patch("/users/:partnerUserId", validateJson(updatePartnerUserSchema), updatePartnerUser);
partnerRoutes.delete("/:partnerId", deletePartner);
partnerRoutes.delete("/users/:partnerUserId", deletePartnerUser);
