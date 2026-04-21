import { Hono } from "hono";

import type { AppEnv } from "@/app/route";
import {
  bulkDeleteDocuments,
  deleteDocument,
  downloadDocument,
  getDocumentById,
  getDocumentOverview,
  listDocumentAssociationOptions,
  listDocuments,
  openDocument,
  updateDocument,
  uploadDocument,
} from "@/modules/documents/controller";
import { bulkDeleteDocumentsSchema, listDocumentAssociationOptionsSchema, listDocumentsSchema, updateDocumentSchema } from "@/modules/documents/schema";
import { requireAuth, requireModuleAccess, requireTenant } from "@/middleware/auth";
import { validateJson, validateQuery } from "@/middleware/common";

export const documentRoutes = new Hono<AppEnv>().basePath("/documents");
documentRoutes.use("*", requireAuth, requireTenant, requireModuleAccess("documents"));

documentRoutes.get("/", getDocumentOverview);
documentRoutes.get("/list", validateQuery(listDocumentsSchema), listDocuments);
documentRoutes.get("/association-options", validateQuery(listDocumentAssociationOptionsSchema), listDocumentAssociationOptions);
documentRoutes.post("/upload", uploadDocument);
documentRoutes.post("/bulk-delete", validateJson(bulkDeleteDocumentsSchema), bulkDeleteDocuments);
documentRoutes.get("/:documentId", getDocumentById);
documentRoutes.patch("/:documentId", validateJson(updateDocumentSchema), updateDocument);
documentRoutes.get("/:documentId/open", openDocument);
documentRoutes.get("/:documentId/download", downloadDocument);
documentRoutes.delete("/:documentId", deleteDocument);
