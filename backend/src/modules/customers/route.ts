import { Hono } from "hono";

import type { AppEnv } from "@/app/route";
import {
  createCustomer,
  deleteCustomer,
  getCustomerHistory,
  importCustomers,
  importCustomersFromCsv,
  listCustomers,
  previewCustomerImport,
  updateCustomer,
} from "@/modules/customers/controller";
import { createCustomerSchema, importCustomerCsvSchema, listCustomersSchema, updateCustomerSchema } from "@/modules/customers/schema";
import { requireAuth, requireModuleAccess, requireTenant } from "@/middleware/auth";
import { validateJson, validateQuery } from "@/middleware/common";

export const customerRoutes = new Hono<AppEnv>().basePath("/customers");
customerRoutes.use("*", requireAuth, requireTenant, requireModuleAccess("contacts"));

customerRoutes.get("/", validateQuery(listCustomersSchema), listCustomers);
customerRoutes.get("/:customerId/history", getCustomerHistory);
customerRoutes.post("/", validateJson(createCustomerSchema), createCustomer);
customerRoutes.post("/import-csv", validateJson(importCustomerCsvSchema), importCustomersFromCsv);
customerRoutes.post("/import-preview", previewCustomerImport);
customerRoutes.post("/import", importCustomers);
customerRoutes.patch("/:customerId", validateJson(updateCustomerSchema), updateCustomer);
customerRoutes.delete("/:customerId", deleteCustomer);
