import { Hono } from "hono";

import type { AppEnv } from "@/app/route";
import { createPartner, deletePartner, listPartners, updatePartner } from "@/modules/partners/controller";
import { listPartnersSchema, partnerSchema, updatePartnerSchema } from "@/modules/partners/schema";
import { requireAuth, requireRole, requireTenant } from "@/middleware/auth";
import { validateJson, validateQuery } from "@/middleware/common";

export const partnerRoutes = new Hono<AppEnv>().basePath("/partners");
partnerRoutes.use("*", requireAuth, requireTenant);

partnerRoutes.get("/", validateQuery(listPartnersSchema), listPartners);
partnerRoutes.post("/", requireRole("admin"), validateJson(partnerSchema), createPartner);
partnerRoutes.patch("/:partnerId", requireRole("admin"), validateJson(updatePartnerSchema), updatePartner);
partnerRoutes.delete("/:partnerId", requireRole("admin"), deletePartner);
