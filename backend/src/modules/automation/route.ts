import { Hono } from "hono";

import { getAutomationOverview } from "@/modules/automation/controller";

export const automationRoutes = new Hono().basePath("/automation");

automationRoutes.get("/", getAutomationOverview);
