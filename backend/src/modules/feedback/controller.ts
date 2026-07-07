import type { Context } from "hono";

import type { AppEnv } from "@/app/route";
import { ok } from "@/lib/api";
import { env } from "@/lib/config";
import { getEmailProviderAdapter } from "@/lib/email-runtime";
import { AppError } from "@/lib/errors";

const BUG_REPORT_RECIPIENT = "info@theonebranding.com";
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const allowedAttachmentTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);

function getStringField(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatTextBlock(value: string) {
  return escapeHtml(value).replace(/\n/g, "<br />");
}

export async function submitBugReport(c: Context<AppEnv>) {
  const user = c.get("user");
  const tenant = c.get("tenant");
  const formData = await c.req.raw.formData();

  const title = getStringField(formData, "title");
  const category = getStringField(formData, "category");
  const description = getStringField(formData, "description");
  const steps = getStringField(formData, "steps");
  const expected = getStringField(formData, "expected");
  const actual = getStringField(formData, "actual");
  const pageUrl = getStringField(formData, "pageUrl");
  const pagePath = getStringField(formData, "pagePath");
  const area = getStringField(formData, "area");
  const severity = getStringField(formData, "severity") || "medium";

  if (!title) {
    throw AppError.badRequest("Bug title is required");
  }

  if (!description) {
    throw AppError.badRequest("Bug description is required");
  }

  const fileInputs = formData.getAll("attachments").filter((item): item is File => item instanceof File && item.size > 0);
  const totalBytes = fileInputs.reduce((sum, file) => sum + file.size, 0);
  if (totalBytes > MAX_ATTACHMENT_BYTES) {
    throw AppError.badRequest("Attachments must be 10 MB or less in total");
  }

  for (const file of fileInputs) {
    if (file.type && !allowedAttachmentTypes.has(file.type)) {
      throw AppError.badRequest("Only image and video attachments are supported");
    }
  }

  const attachments = await Promise.all(
    fileInputs.map(async (file) => ({
      filename: file.name || "bug-report-attachment",
      content: Buffer.from(await file.arrayBuffer()),
      contentType: file.type || null,
    })),
  );

  const rows = [
    ["Reporter", user.email ?? user.id],
    ["Company ID", tenant.companyId],
    ["Membership ID", tenant.membershipId],
    ["Page URL", pageUrl || "Not provided"],
    ["Page path", pagePath || "Not provided"],
    ["Area", area || "Not specified"],
    ["Category", category || "Bug"],
    ["Severity", severity],
    ["Attachments", attachments.length ? `${attachments.length} file(s), ${Math.round(totalBytes / 1024)} KB total` : "None"],
    ["Request ID", c.get("requestId")],
  ];

  const html = `
    <div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.5">
      <h2 style="margin:0 0 12px">CRM Bug Report: ${escapeHtml(title)}</h2>
      <table style="border-collapse:collapse;width:100%;margin-bottom:18px">
        <tbody>
          ${rows.map(([label, value]) => `<tr><td style="border:1px solid #e2e8f0;padding:8px;font-weight:700;background:#f8fafc">${escapeHtml(label)}</td><td style="border:1px solid #e2e8f0;padding:8px">${escapeHtml(value)}</td></tr>`).join("")}
        </tbody>
      </table>
      <h3>Description</h3>
      <p>${formatTextBlock(description)}</p>
      <h3>Steps to reproduce</h3>
      <p>${steps ? formatTextBlock(steps) : "Not provided"}</p>
      <h3>Expected result</h3>
      <p>${expected ? formatTextBlock(expected) : "Not provided"}</p>
      <h3>Actual result</h3>
      <p>${actual ? formatTextBlock(actual) : "Not provided"}</p>
    </div>
  `;

  const text = [
    `CRM Bug Report: ${title}`,
    ...rows.map(([label, value]) => `${label}: ${value}`),
    "",
    `Description:\n${description}`,
    `Steps to reproduce:\n${steps || "Not provided"}`,
    `Expected result:\n${expected || "Not provided"}`,
    `Actual result:\n${actual || "Not provided"}`,
  ].join("\n");

  const provider = getEmailProviderAdapter(env.RESEND_API_KEY ? "resend" : "smtp");
  await provider.send({
    fromEmail: env.SMTP_FROM_EMAIL ?? env.RESEND_FROM_EMAIL,
    fromName: env.SMTP_FROM_NAME ?? env.RESEND_FROM_NAME ?? "CRM Bug Reports",
    toEmail: BUG_REPORT_RECIPIENT,
    toName: "The One Branding",
    subject: `[CRM Bug] ${title}`,
    html,
    text,
    attachments,
  });

  return ok(c, { sent: true });
}
