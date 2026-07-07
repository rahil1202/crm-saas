import { Hono } from "hono";

import type { AppEnv } from "@/app/route";
import { requireAuth, requireTenant } from "@/middleware/auth";
import { submitBugReport } from "@/modules/feedback/controller";

export const feedbackRoutes = new Hono<AppEnv>().basePath("/feedback");
feedbackRoutes.use("*", requireAuth, requireTenant);

feedbackRoutes.post("/bug-report", submitBugReport);
