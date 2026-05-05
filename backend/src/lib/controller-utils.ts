import { AppError } from "@/lib/errors";

type CountValue = number | bigint | string | null | undefined;

function toNumber(value: CountValue) {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "bigint") {
    return Number(value);
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function assertNonEmptyUpdate(body: Record<string, unknown>, message = "At least one field is required for update") {
  if (Object.keys(body).length === 0) {
    throw AppError.badRequest(message);
  }
}

export function paginationMeta(totalRows: Array<{ count: CountValue }>, query: { limit: number; offset: number }) {
  return {
    total: toNumber(totalRows[0]?.count),
    limit: query.limit,
    offset: query.offset,
  };
}

function detectDelimitedSeparator(text: string) {
  const sampleLine = text
    .split(/\r?\n/)
    .find((line) => line.trim().length > 0)
    ?? "";

  const tabCount = (sampleLine.match(/\t/g) ?? []).length;
  const commaCount = (sampleLine.match(/,/g) ?? []).length;
  const semicolonCount = (sampleLine.match(/;/g) ?? []).length;

  if (tabCount >= commaCount && tabCount >= semicolonCount && tabCount > 0) {
    return "\t";
  }
  if (semicolonCount > commaCount) {
    return ";";
  }
  return ",";
}

export function parseDelimitedRows(text: string, options?: { delimiter?: string }) {
  const delimiter = options?.delimiter ?? detectDelimitedSeparator(text);
  const rows: string[][] = [];
  let currentCell = "";
  let currentRow: string[] = [];
  let insideQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const nextCharacter = text[index + 1];

    if (character === '"') {
      if (insideQuotes && nextCharacter === '"') {
        currentCell += '"';
        index += 1;
        continue;
      }
      insideQuotes = !insideQuotes;
      continue;
    }

    if (character === delimiter && !insideQuotes) {
      currentRow.push(currentCell);
      currentCell = "";
      continue;
    }

    if ((character === "\n" || character === "\r") && !insideQuotes) {
      if (character === "\r" && nextCharacter === "\n") {
        index += 1;
      }
      currentRow.push(currentCell);
      rows.push(currentRow);
      currentCell = "";
      currentRow = [];
      continue;
    }

    currentCell += character;
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }

  return rows
    .map((row) => row.map((cell) => cell.trim()))
    .filter((row) => row.some((cell) => cell.length > 0));
}

export function normalizeDelimitedHeader(header: string) {
  return header.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

export function parseDelimitedTags(value?: string) {
  if (!value) {
    return [];
  }
  return value
    .split(/[|;,]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 20);
}
