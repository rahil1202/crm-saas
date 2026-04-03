import { Hono } from "hono";

import type { AppEnv } from "@/app/route";
import { deleteDocument, downloadDocument, getDocumentOverview, listDocuments, uploadDocument } from "@/modules/documents/controller";
import { listDocumentsSchema } from "@/modules/documents/schema";
import { requireAuth, requireTenant } from "@/middleware/auth";
import { validateQuery } from "@/middleware/common";

export const documentRoutes = new Hono<AppEnv>().basePath("/documents");
documentRoutes.use("*", requireAuth, requireTenant);

documentRoutes.get("/", getDocumentOverview);
documentRoutes.get("/list", validateQuery(listDocumentsSchema), listDocuments);
documentRoutes.post("/upload", uploadDocument);
documentRoutes.get("/:documentId/download", downloadDocument);
documentRoutes.delete("/:documentId", deleteDocument);
