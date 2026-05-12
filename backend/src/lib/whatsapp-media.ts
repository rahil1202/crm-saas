import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import crypto from "node:crypto";

import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db/client";
import { messageAttachments } from "@/db/schema";
import { env } from "@/lib/config";
import { AppError } from "@/lib/errors";

/**
 * WhatsApp CRM — media handling service.
 *
 * Accepts media uploaded from the inbox UI (drag-drop or picker), persists it
 * to Supabase Storage (or the local filesystem in dev), and inserts a row in
 * `message_attachments` that the controller ties to the outbound message.
 *
 * Supported types map to the official WhatsApp Cloud API media types:
 *   image  → image/jpeg, image/png, image/webp
 *   audio  → audio/aac, audio/mp4, audio/mpeg, audio/amr, audio/ogg, audio/opus
 *   video  → video/mp4, video/3gpp
 *   document → any mime type
 *   sticker → image/webp (animated or static)
 */

export type WhatsappMediaType = "image" | "audio" | "video" | "document" | "sticker";

export interface PersistedMedia {
  provider: "supabase" | "local";
  bucket: string | null;
  objectPath: string;
}

const SUPABASE_BUCKET = "whatsapp-media";

function sanitizeName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "file";
}

export function inferMediaTypeFromMime(mime: string): WhatsappMediaType {
  if (mime.startsWith("image/")) {
    if (mime === "image/webp") return "sticker";
    return "image";
  }
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  return "document";
}

function buildObjectPath(companyId: string, originalName: string) {
  const date = new Date();
  const year = String(date.getUTCFullYear());
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const base = sanitizeName(originalName.replace(/\.[^.]+$/, ""));
  const extensionMatch = originalName.match(/(\.[a-zA-Z0-9]+)$/);
  const extension = extensionMatch?.[1]?.toLowerCase() ?? "";
  const unique = crypto.randomUUID();
  return [companyId, "whatsapp", year, month, day, `${unique}-${base}${extension}`].join("/");
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

async function uploadToSupabase(objectPath: string, buffer: Buffer, contentType?: string) {
  const response = await fetch(
    `${env.SUPABASE_URL}/storage/v1/object/${encodeURIComponent(SUPABASE_BUCKET)}/${encodeObjectPath(objectPath)}`,
    {
      method: "POST",
      headers: buildSupabaseHeaders(contentType ?? "application/octet-stream"),
      body: buffer,
    },
  );
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw AppError.conflict(`Unable to upload WhatsApp media to Supabase Storage: ${response.status}`, text);
  }
}

async function ensureLocalDir(path: string) {
  await mkdir(path, { recursive: true });
}

async function uploadLocal(objectPath: string, buffer: Buffer) {
  const root = resolve(process.cwd(), env.FILE_STORAGE_DIR, "whatsapp-media");
  const fullPath = join(root, objectPath);
  const dir = fullPath.substring(0, fullPath.lastIndexOf("/"));
  await ensureLocalDir(dir);
  await writeFile(fullPath, buffer);
}

async function downloadFromSupabase(objectPath: string) {
  const response = await fetch(
    `${env.SUPABASE_URL}/storage/v1/object/${encodeURIComponent(SUPABASE_BUCKET)}/${encodeObjectPath(objectPath)}`,
    {
      method: "GET",
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    },
  );
  if (!response.ok) {
    throw AppError.notFound("WhatsApp media asset not found");
  }
  return Buffer.from(await response.arrayBuffer());
}

async function downloadFromLocal(objectPath: string) {
  const root = resolve(process.cwd(), env.FILE_STORAGE_DIR, "whatsapp-media");
  const fullPath = join(root, objectPath);
  try {
    await access(fullPath);
    return await readFile(fullPath);
  } catch {
    throw AppError.notFound("WhatsApp media asset not found");
  }
}

export async function persistWhatsappMedia(input: {
  companyId: string;
  file: File;
  preferSupabase?: boolean;
}): Promise<PersistedMedia> {
  const preferSupabase = input.preferSupabase ?? env.SUPABASE_SERVICE_ROLE_KEY !== "dev-service-role-key";
  const objectPath = buildObjectPath(input.companyId, input.file.name);
  const buffer = Buffer.from(await input.file.arrayBuffer());

  if (preferSupabase) {
    await uploadToSupabase(objectPath, buffer, input.file.type);
    return { provider: "supabase", bucket: SUPABASE_BUCKET, objectPath };
  }

  await uploadLocal(objectPath, buffer);
  return { provider: "local", bucket: null, objectPath };
}

export async function readWhatsappMedia(attachmentId: string, companyId: string) {
  const [row] = await db
    .select()
    .from(messageAttachments)
    .where(
      and(
        eq(messageAttachments.id, attachmentId),
        eq(messageAttachments.companyId, companyId),
        isNull(messageAttachments.deletedAt),
      ),
    )
    .limit(1);
  if (!row) {
    throw AppError.notFound("WhatsApp media not found");
  }
  const data = row.storageProvider === "supabase" ? await downloadFromSupabase(row.storageObjectPath) : await downloadFromLocal(row.storageObjectPath);
  return { row, data };
}
