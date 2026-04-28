import { Hono } from "hono";

import type { AppEnv } from "@/app/route";
import {
  addOutreachListMembers,
  createOutreachAccount,
  createOutreachContact,
  createOutreachList,
  deleteOutreachAccount,
  deleteOutreachContact,
  getOutreachDashboard,
  importOutreachFromCsv,
  listOutreachAccounts,
  listOutreachContacts,
  listOutreachLists,
  previewOutreachTemplate,
  runOutreachNow,
  seedOutreachExamples,
  sendOutreachListTemplate,
  sendOutreachTemplate,
  updateOutreachAccount,
  updateOutreachContact,
} from "@/modules/outreach/controller";
import {
  addOutreachListMembersSchema,
  createOutreachAccountSchema,
  createOutreachContactSchema,
  createOutreachListSchema,
  importOutreachCsvSchema,
  listOutreachAccountsQuerySchema,
  listOutreachContactsQuerySchema,
  outreachDashboardQuerySchema,
  outreachListSendSchema,
  seedOutreachExamplesSchema,
  outreachTemplatePreviewSchema,
  outreachTemplateSendSchema,
  updateOutreachAccountSchema,
  updateOutreachContactSchema,
} from "@/modules/outreach/schema";
import { requireAuth, requireModuleAccess, requireTenant } from "@/middleware/auth";
import { validateJson, validateQuery } from "@/middleware/common";

export const outreachRoutes = new Hono<AppEnv>().basePath("/outreach");
outreachRoutes.use("*", requireAuth, requireTenant, requireModuleAccess("outreach"));

outreachRoutes.get("/dashboard", validateQuery(outreachDashboardQuerySchema), getOutreachDashboard);
outreachRoutes.get("/accounts", validateQuery(listOutreachAccountsQuerySchema), listOutreachAccounts);
outreachRoutes.get("/contacts", validateQuery(listOutreachContactsQuerySchema), listOutreachContacts);
outreachRoutes.post("/accounts", validateJson(createOutreachAccountSchema), createOutreachAccount);
outreachRoutes.patch("/accounts/:accountId", validateJson(updateOutreachAccountSchema), updateOutreachAccount);
outreachRoutes.delete("/accounts/:accountId", deleteOutreachAccount);
outreachRoutes.post("/contacts", validateJson(createOutreachContactSchema), createOutreachContact);
outreachRoutes.patch("/contacts/:contactId", validateJson(updateOutreachContactSchema), updateOutreachContact);
outreachRoutes.delete("/contacts/:contactId", deleteOutreachContact);
outreachRoutes.get("/lists", listOutreachLists);
outreachRoutes.post("/lists", validateJson(createOutreachListSchema), createOutreachList);
outreachRoutes.post("/lists/:listId/members", validateJson(addOutreachListMembersSchema), addOutreachListMembers);
outreachRoutes.post("/import-csv", validateJson(importOutreachCsvSchema), importOutreachFromCsv);
outreachRoutes.post("/examples", validateJson(seedOutreachExamplesSchema), seedOutreachExamples);
outreachRoutes.post("/templates/preview", validateJson(outreachTemplatePreviewSchema), previewOutreachTemplate);
outreachRoutes.post("/templates/send", validateJson(outreachTemplateSendSchema), sendOutreachTemplate);
outreachRoutes.post("/templates/send-list", validateJson(outreachListSendSchema), sendOutreachListTemplate);
outreachRoutes.post("/run-now", runOutreachNow);
