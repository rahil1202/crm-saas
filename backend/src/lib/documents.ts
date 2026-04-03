import { mkdir, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { env } from "@/lib/config";

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

export async function persistDocumentFile(input: {
  companyId: string;
  folder: string;
  originalName: string;
  file: File;
}) {
  const date = new Date();
  const year = String(date.getUTCFullYear());
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const safeName = sanitizeSegment(input.originalName.replace(/\.[^.]+$/, "")) || "file";
  const extensionMatch = input.originalName.match(/(\.[a-zA-Z0-9]+)$/);
  const extension = extensionMatch?.[1]?.toLowerCase() ?? "";
  const storageName = `${crypto.randomUUID()}-${safeName}${extension}`;
  const relativePath = join(input.companyId, input.folder, year, month, storageName);
  const absolutePath = join(getDocumentStorageRoot(), relativePath);

  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, Buffer.from(await input.file.arrayBuffer()));

  return {
    relativePath,
    absolutePath,
  };
}

export function getDocumentAbsolutePath(storagePath: string) {
  return join(getDocumentStorageRoot(), storagePath);
}

export async function removeDocumentFile(storagePath: string) {
  try {
    await unlink(getDocumentAbsolutePath(storagePath));
  } catch {
    // File may already be missing; metadata deletion should still proceed.
  }
}
