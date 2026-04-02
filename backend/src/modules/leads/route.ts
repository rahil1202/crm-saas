import { Hono } from "hono";

import type { AppEnv } from "@/app/route";
import {
  bulkUpdateLeads,
  convertLead,
  createLead,
  createLeadTimeline,
  deleteLead,
  getLeadTimeline,
  getLeadsBoard,
  importLeadsFromCsv,
  listLeads,
  updateLead,
} from "@/modules/leads/controller";
import {
  boardLeadsQuerySchema,
  bulkUpdateLeadSchema,
  createLeadSchema,
  createLeadTimelineSchema,
  convertLeadSchema,
  importLeadCsvSchema,
  leadTimelineQuerySchema,
  listLeadsQuerySchema,
  updateLeadSchema,
} from "@/modules/leads/schema";
import { requireAuth, requireTenant } from "@/middleware/auth";
import { validateJson, validateQuery } from "@/middleware/common";

export const leadRoutes = new Hono<AppEnv>().basePath("/leads");
leadRoutes.use("*", requireAuth, requireTenant);

leadRoutes.get("/", validateQuery(listLeadsQuerySchema), listLeads);
leadRoutes.get("/board", validateQuery(boardLeadsQuerySchema), getLeadsBoard);
leadRoutes.post("/", validateJson(createLeadSchema), createLead);
leadRoutes.post("/bulk-update", validateJson(bulkUpdateLeadSchema), bulkUpdateLeads);
leadRoutes.post("/import-csv", validateJson(importLeadCsvSchema), importLeadsFromCsv);
leadRoutes.patch("/:leadId", validateJson(updateLeadSchema), updateLead);
leadRoutes.get("/:leadId/timeline", validateQuery(leadTimelineQuerySchema), getLeadTimeline);
leadRoutes.post("/:leadId/timeline", validateJson(createLeadTimelineSchema), createLeadTimeline);
leadRoutes.delete("/:leadId", deleteLead);
leadRoutes.post("/:leadId/convert", validateJson(convertLeadSchema), convertLead);
