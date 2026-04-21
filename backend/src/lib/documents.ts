import { access, readFile, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";

import { env } from "@/lib/config";
import { AppError } from "@/lib/errors";

function sanitizeSegment(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function getDocumentStorageRoot() {
  return resolve(process.cwd(), env.FILE_STORAGE_DIR);
}

export function normalizeDocumentFolder(folder?: string | null) {
  const normalized = sanitizeSegment(folder || "general");
  return normalized || "general";
}

function encodeObjectPath(path: string) {
  return path
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function buildSupabaseHeaders(contentType?: string) {
  return {
    ...(contentType ? { "Content-Type": contentType } : {}),
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  };
}

export function resolveDocumentStorageBucket() {
  return env.SUPABASE_STORAGE_BUCKET_DOCUMENTS;
}

export function buildDocumentObjectPath(input: {
  companyId: string;
  folder: string;
  originalName: string;
  now?: Date;
}) {
  const date = input.now ?? new Date();
  const year = String(date.getUTCFullYear());
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const safeName = sanitizeSegment(input.originalName.replace(/\.[^.]+$/, "")) || "file";
  const extensionMatch = input.originalName.match(/(\.[a-zA-Z0-9]+)$/);
  const extension = extensionMatch?.[1]?.toLowerCase() ?? "";
  const storageName = `${crypto.randomUUID()}-${safeName}${extension}`;
  return [input.companyId, input.folder, year, month, storageName].join("/");
}

export async function persistDocumentFile(input: {
  companyId: string;
  folder: string;
  originalName: string;
  file: File;
}) {
  const bucket = resolveDocumentStorageBucket();
  const objectPath = buildDocumentObjectPath(input);

  const response = await fetch(`${env.SUPABASE_URL}/storage/v1/object/${encodeURIComponent(bucket)}/${encodeObjectPath(objectPath)}`, {
    method: "POST",
    headers: buildSupabaseHeaders(input.file.type || "application/octet-stream"),
    body: Buffer.from(await input.file.arrayBuffer()),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string; error?: string } | null;
    throw AppError.badRequest(payload?.message ?? payload?.error ?? "Unable to upload document to storage");
  }

  return {
    provider: "supabase" as const,
    bucket,
    objectPath,
    relativePath: objectPath,
  };
}

export function getDocumentAbsolutePath(storagePath: string) {
  return join(getDocumentStorageRoot(), storagePath);
}

export async function readDocumentFile(input: {
  storageProvider: string | null;
  storageBucket: string | null;
  storageObjectPath: string | null;
  storagePath: string;
}) {
  if (input.storageProvider === "supabase" && input.storageBucket && input.storageObjectPath) {
    const response = await fetch(
      `${env.SUPABASE_URL}/storage/v1/object/${encodeURIComponent(input.storageBucket)}/${encodeObjectPath(input.storageObjectPath)}`,
      {
        method: "GET",
        headers: buildSupabaseHeaders(),
      },
    );

    if (response.status === 404) {
      throw AppError.notFound("Stored file is missing");
    }

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string; error?: string } | null;
      throw AppError.badRequest(payload?.message ?? payload?.error ?? "Unable to read file from storage");
    }

    return Buffer.from(await response.arrayBuffer());
  }

  const absolutePath = getDocumentAbsolutePath(input.storagePath);
  try {
    await access(absolutePath);
  } catch {
    throw AppError.notFound("Stored file is missing");
  }

  return readFile(absolutePath);
}

export async function removeDocumentFile(input: {
  storageProvider: string | null;
  storageBucket: string | null;
  storageObjectPath: string | null;
  storagePath: string;
}) {
  if (input.storageProvider === "supabase" && input.storageBucket && input.storageObjectPath) {
    const response = await fetch(
      `${env.SUPABASE_URL}/storage/v1/object/${encodeURIComponent(input.storageBucket)}/${encodeObjectPath(input.storageObjectPath)}`,
      {
        method: "DELETE",
        headers: buildSupabaseHeaders(),
      },
    );

    if (!response.ok && response.status !== 404) {
      const payload = (await response.json().catch(() => null)) as { message?: string; error?: string } | null;
      throw AppError.badRequest(payload?.message ?? payload?.error ?? "Unable to remove stored file");
    }
    return;
  }

  try {
    await unlink(getDocumentAbsolutePath(input.storagePath));
  } catch {
    // File may already be missing; metadata deletion should still proceed.
  }
}
