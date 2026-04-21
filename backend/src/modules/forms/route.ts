import { Hono } from "hono";

import type { AppEnv } from "@/app/route";
import {
  createForm,
  deleteForm,
  exportResponses,
  getFormDetail,
  listForms,
  listResponses,
  publishForm,
  unpublishForm,
  updateForm,
} from "@/modules/forms/controller";
import { createFormSchema, listFormResponsesSchema, listFormsSchema, updateFormSchema } from "@/modules/forms/schema";
import { requireAuth, requireModuleAccess, requireTenant } from "@/middleware/auth";
import { validateJson, validateQuery } from "@/middleware/common";
import { enforceBodyLimit, rateLimit } from "@/middleware/security";
import { bodyLimits, routePolicies } from "@/lib/security";

export const formRoutes = new Hono<AppEnv>().basePath("/forms");
formRoutes.use("*", requireAuth, requireTenant, requireModuleAccess("forms"));

formRoutes.get("/", validateQuery(listFormsSchema), listForms);
formRoutes.post("/", rateLimit(routePolicies.tenantWrite), enforceBodyLimit(bodyLimits.tenantDefault), validateJson(createFormSchema), createForm);
formRoutes.get("/:formId", getFormDetail);
formRoutes.patch("/:formId", rateLimit(routePolicies.tenantWrite), enforceBodyLimit(bodyLimits.tenantDefault), validateJson(updateFormSchema), updateForm);
formRoutes.post("/:formId/publish", rateLimit(routePolicies.tenantWrite), publishForm);
formRoutes.post("/:formId/unpublish", rateLimit(routePolicies.tenantWrite), unpublishForm);
formRoutes.delete("/:formId", rateLimit(routePolicies.tenantWrite), deleteForm);
formRoutes.get("/:formId/responses", validateQuery(listFormResponsesSchema), listResponses);
formRoutes.get("/:formId/export", exportResponses);
