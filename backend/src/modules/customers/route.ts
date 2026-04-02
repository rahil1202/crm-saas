import { Hono } from "hono";

import type { AppEnv } from "@/app/route";
import { createCustomer, deleteCustomer, getCustomerHistory, listCustomers, updateCustomer } from "@/modules/customers/controller";
import { createCustomerSchema, listCustomersSchema, updateCustomerSchema } from "@/modules/customers/schema";
import { requireAuth, requireTenant } from "@/middleware/auth";
import { validateJson, validateQuery } from "@/middleware/common";

export const customerRoutes = new Hono<AppEnv>().basePath("/customers");
customerRoutes.use("*", requireAuth, requireTenant);

customerRoutes.get("/", validateQuery(listCustomersSchema), listCustomers);
customerRoutes.get("/:customerId/history", getCustomerHistory);
customerRoutes.post("/", validateJson(createCustomerSchema), createCustomer);
customerRoutes.patch("/:customerId", validateJson(updateCustomerSchema), updateCustomer);
customerRoutes.delete("/:customerId", deleteCustomer);
