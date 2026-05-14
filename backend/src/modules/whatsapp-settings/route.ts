import { Hono } from "hono";

import type { AppEnv } from "@/app/route";
import { requireAuth, requireModuleAccess, requireRole, requireTenant } from "@/middleware/auth";
import { validateJson } from "@/middleware/common";
import { getSettings, updateSettings } from "@/modules/whatsapp-settings/controller";
import { updateSettingsSchema } from "@/modules/whatsapp-settings/schema";

export const whatsappSettingsRoutes = new Hono<AppEnv>();
whatsappSettingsRoutes.use("*", requireAuth, requireTenant);

whatsappSettingsRoutes.get("/whatsapp/settings", requireModuleAccess("whatsapp-settings"), getSettings);
whatsappSettingsRoutes.patch("/whatsapp/settings", requireModuleAccess("whatsapp-settings"), requireRole("admin"), validateJson(updateSettingsSchema), updateSettings);
