import { Hono } from "hono";

import type { AppEnv } from "@/app/route";
import {
  createSequenceHandler,
  getSequenceAnalyticsHandler,
  enrollSequenceHandler,
  getSequenceOverview,
  listSequenceEnrollments,
  listSequenceRuns,
  listSequenceSteps,
  listSequencesHandler,
} from "@/modules/sequences/controller";
import { sequenceEnrollSchema, sequenceSchema } from "@/modules/sequences/schema";
import { requireAuth, requireRole, requireTenant } from "@/middleware/auth";
import { validateJson } from "@/middleware/common";

export const sequenceRoutes = new Hono<AppEnv>();
sequenceRoutes.use("*", requireAuth, requireTenant);

sequenceRoutes.get("/sequences", getSequenceOverview);
sequenceRoutes.get("/sequences/list", listSequencesHandler);
sequenceRoutes.post("/sequences", requireRole("admin"), validateJson(sequenceSchema), createSequenceHandler);
sequenceRoutes.get("/sequences/:sequenceId/steps", listSequenceSteps);
sequenceRoutes.get("/sequences/:sequenceId/analytics", getSequenceAnalyticsHandler);
sequenceRoutes.post("/sequence-enrollments/:sequenceId", requireRole("admin"), validateJson(sequenceEnrollSchema), enrollSequenceHandler);
sequenceRoutes.get("/sequence-enrollments/:sequenceId", listSequenceEnrollments);
sequenceRoutes.get("/sequence-runs/:sequenceId", listSequenceRuns);
