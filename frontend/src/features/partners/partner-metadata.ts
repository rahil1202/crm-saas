export type PartnerBusinessType =
  | "Solution"
  | "Agency"
  | "Consultant"
  | "Distributor"
  | "Reseller"
  | "Technology";

export type PartnerMetadata = {
  businessType: PartnerBusinessType;
  country: string;
  state: string;
  city: string;
  ndaSigned: boolean;
  partnershipAgreement: boolean;
  companyName: string;
  extraNotes: string;
};

export const partnerBusinessTypeOptions: PartnerBusinessType[] = [
  "Solution",
  "Agency",
  "Consultant",
  "Distributor",
  "Reseller",
  "Technology",
];

export const emptyPartnerMetadata: PartnerMetadata = {
  businessType: "Solution",
  country: "",
  state: "",
  city: "",
  ndaSigned: false,
  partnershipAgreement: false,
  companyName: "",
  extraNotes: "",
};

export function parsePartnerNotes(notes: string | null | undefined): PartnerMetadata {
  const result: PartnerMetadata = { ...emptyPartnerMetadata };
  const extraLines: string[] = [];

  for (const line of (notes ?? "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const match = trimmed.match(/^([^:]+):\s*(.+)$/);
    if (!match) {
      extraLines.push(line);
      continue;
    }

    const key = match[1]?.trim().toLowerCase();
    const value = match[2]?.trim() ?? "";

    if (!key) {
      extraLines.push(line);
      continue;
    }

    if (key === "business type") result.businessType = (value as PartnerBusinessType) || "Solution";
    else if (key === "country") result.country = value;
    else if (key === "state") result.state = value;
    else if (key === "city") result.city = value;
    else if (key === "company name") result.companyName = value;
    else if (key === "nda signed") result.ndaSigned = /^yes|true|signed$/i.test(value);
    else if (key === "partnership agreement") result.partnershipAgreement = /^yes|true|signed$/i.test(value);
    else if (key === "auth user id") continue;
    else extraLines.push(line);
  }

  result.extraNotes = extraLines.join("\n").trim();
  return result;
}

export function buildPartnerNotes(metadata: PartnerMetadata) {
  const lines = [
    ["Company Name", metadata.companyName],
    ["Business Type", metadata.businessType],
    ["Country", metadata.country],
    ["State", metadata.state],
    ["City", metadata.city],
    ["NDA Signed", metadata.ndaSigned ? "Yes" : "No"],
    ["Partnership Agreement", metadata.partnershipAgreement ? "Yes" : "No"],
  ]
    .filter(([, value]) => String(value ?? "").trim().length > 0)
    .map(([label, value]) => `${label}: ${value}`);

  if (metadata.extraNotes.trim()) {
    lines.push(metadata.extraNotes.trim());
  }

  return lines.join("\n").trim();
}
