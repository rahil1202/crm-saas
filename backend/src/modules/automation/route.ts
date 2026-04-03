import { Hono } from "hono";

import type { AppEnv } from "@/app/route";
import { cancelRun, createAutomation, deleteAutomation, getAutomationOverview, getRun, listAutomations, listRuns, runAutomationTest, updateAutomation } from "@/modules/automation/controller";
import { automationSchema, listAutomationRunsSchema, listAutomationsSchema, updateAutomationSchema } from "@/modules/automation/schema";
import { requireAuth, requireRole, requireTenant } from "@/middleware/auth";
import { validateJson, validateQuery } from "@/middleware/common";

export const automationRoutes = new Hono<AppEnv>().basePath("/automation");
automationRoutes.use("*", requireAuth, requireTenant);

automationRoutes.get("/", getAutomationOverview);
automationRoutes.get("/list", validateQuery(listAutomationsSchema), listAutomations);
automationRoutes.get("/runs", validateQuery(listAutomationRunsSchema), listRuns);
automationRoutes.get("/runs/:runId", getRun);
automationRoutes.post("/runs/:runId/cancel", requireRole("admin"), cancelRun);
automationRoutes.post("/", requireRole("admin"), validateJson(automationSchema), createAutomation);
automationRoutes.patch("/:automationId", requireRole("admin"), validateJson(updateAutomationSchema), updateAutomation);
automationRoutes.post("/:automationId/test-run", requireRole("admin"), runAutomationTest);
automationRoutes.delete("/:automationId", requireRole("admin"), deleteAutomation);
