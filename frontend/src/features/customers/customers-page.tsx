"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Download, Import, PencilLine, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import {
  CrmColumnSettings,
  CrmDataTable,
  CrmFilterDrawer,
  CrmAppliedFiltersBar,
  CrmListPageHeader,
  CrmListToolbar,
  CrmListViewTabs,
  CrmModalShell,
  CrmPaginationBar,
} from "@/components/crm/crm-list-primitives";
import { downloadCsvFile, toCsvCell } from "@/components/crm/csv-export";
import type { ColumnDefinition, CrmListTabKey } from "@/components/crm/types";
import { useCrmListState, usePersistedColumnVisibility } from "@/components/crm/use-crm-list-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiRequest, buildApiUrl } from "@/lib/api";
import { getInitials } from "@/lib/auth-ui";
import { getCompanyCookie } from "@/lib/cookies";
import { loadMe } from "@/lib/me-cache";
import { cn } from "@/lib/utils";
import { buildDocumentsCsv, formatDocumentFileSize } from "@/features/documents/helpers";
import type { DocumentItem, DocumentListResponse } from "@/features/documents/types";

interface Customer {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  assignedToUserId: string | null;
  createdAt: string;
  updatedAt: string;
  tags?: string[];
  notes?: string | null;
}

interface ListResponse {
  items: Customer[];
  total: number;
  limit?: number;
  offset?: number;
}

interface PreviewRow {
  row: number;
  fullName: string;
  email: string | null;
  phone: string | null;
  tags: string[];
  notes: string | null;
}

interface PreviewResponse {
  headers: string[];
  rows: PreviewRow[];
  totalRows: number;
}

interface ImportResponse {
  createdCount: number;
  attemptedCount: number;
  errorCount: number;
  customerIds: string[];
  errors: Array<{ row: number; message: string }>;
}

type CustomerFormState = {
  fullName: string;
  email: string;
  phone: string;
  tagsInput: string;
  notes: string;
};

type CustomerEditFormState = {
  fullName: string;
  email: string;
  phone: string;
  tagsInput: string;
  title: string;
  seniority: string;
  departments: string;
  country: string;
  source: string;
  status: string;
  callRemark: string;
  callStatus: string;
  remarks: string;
  linkedin: string;
  facebook: string;
  twitter: string;
  notes: string;
};

type CreateFormState = {
  firstName: string;
  lastName: string;
  title: string;
  seniority: string;
  departments: string;
  callRemark: string;
  callStatus: string;
  country: string;
  email: string;
  corporatePhoneCode: string;
  corporatePhone: string;
  mobilePhoneCode: string;
  mobilePhone: string;
  otherPhone: string;
  workDirectPhone: string;
  tags: string;
  linkedin: string;
  facebook: string;
  twitter: string;
  notes: string;
};

type CustomerQuickUpdateFormState = {
  remarks: string;
  callRemark: string;
  callStatus: string;
};

type ModalMode = "create" | "import" | "edit" | "delete" | "export" | "filter" | "quickUpdate" | null;
type ImportMode = "paste" | "sheet" | "pdf";
type CustomerColumnKey =
  | "name"
  | "email"
  | "mobile"
  | "title"
  | "remarks"
  | "callRemark"
  | "callStatus"
  | "productTags"
  | "country"
  | "source"
  | "status"
  | "createdAt"
  | "updatedAt"
  | "actions";

type CustomerColumnVisibility = Record<CustomerColumnKey, boolean>;
type CustomerSortKey = Exclude<CustomerColumnKey, "actions">;
type CustomerSortDirection = "asc" | "desc";
type DocumentColumnKey = "name" | "folder" | "type" | "size" | "createdAt";
type DocumentColumnVisibility = Record<DocumentColumnKey, boolean>;

type CustomerFilters = {
  q: string;
  email: string;
  title: string;
  callRemark: string;
  callStatus: string;
  productTags: string;
  country: string;
  source: string;
  phone: string;
  createdFrom: string;
  createdTo: string;
  documentFolder: string;
};

type CustomerFilterKey = keyof CustomerFilters;

type CustomerFilterChip = {
  key: CustomerFilterKey;
  label: string;
  value: string;
};

type CustomerTableRow = Customer & {
  details: ReturnType<typeof parseContactNotes>;
};

const rowsPerPageOptions = [10, 20, 50, 100] as const;
const columnStorageKey = "crm-saas-customers-columns";
const documentColumnStorageKey = "crm-saas-customer-documents-columns";
const callRemarkOptions = ["Interested", "Not Interested", "No Assets", "Not Started"] as const;
const callStatusOptions = ["Not Started", "Answered", "Not Answered 1", "Not Answered 2", "Not Connected", "Out of Reach", "Wrong Number"] as const;

const customerColumnLabels: Record<Exclude<CustomerColumnKey, "actions">, string> = {
  name: "Name",
  email: "Email",
  mobile: "Mobile",
  title: "Title",
  remarks: "Remarks",
  callRemark: "Call Remark",
  callStatus: "Call Status",
  productTags: "Product Tags",
  country: "Country",
  source: "Source",
  status: "Status",
  createdAt: "Created",
  updatedAt: "Updated",
};

const defaultCustomerColumnVisibility: CustomerColumnVisibility = {
  name: true,
  email: true,
  mobile: true,
  title: true,
  remarks: true,
  callRemark: true,
  callStatus: true,
  productTags: true,
  country: true,
  source: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  actions: true,
};

const defaultDocumentColumnVisibility: DocumentColumnVisibility = {
  name: true,
  folder: true,
  type: true,
  size: true,
  createdAt: true,
};

const lockedCustomerColumns: Exclude<CustomerColumnKey, "actions">[] = ["name", "mobile"];
const customerSortKeys: CustomerSortKey[] = ["name", "email", "mobile", "title", "remarks", "callRemark", "callStatus", "productTags", "country", "source", "status", "createdAt", "updatedAt"];

const emptyCustomerFilters: CustomerFilters = {
  q: "",
  email: "",
  title: "",
  callRemark: "",
  callStatus: "",
  productTags: "",
  country: "",
  source: "",
  phone: "",
  createdFrom: "",
  createdTo: "",
  documentFolder: "",
};

const customerTableColumns: Array<{
  key: CustomerSortKey;
  width: string;
  render: (customer: CustomerTableRow) => ReactNode;
}> = [
  {
    key: "name",
    width: "min-w-[240px]",
    render: (customer) => (
      <div className="flex items-center gap-2.5">
        <Avatar size="sm">
          <AvatarFallback>{getInitials(customer.fullName)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <Link href={`/dashboard/contacts/${customer.id}`} className="truncate font-medium text-slate-900 transition-colors hover:text-sky-700 hover:underline">
            {customer.fullName}
          </Link>
          <div className="text-[0.72rem] text-muted-foreground">{customer.id.slice(0, 8)}</div>
        </div>
      </div>
    ),
  },
  {
    key: "email",
    width: "min-w-[220px]",
    render: (customer) => <div className="text-[0.82rem] text-muted-foreground">{customer.email ?? "-"}</div>,
  },
  {
    key: "mobile",
    width: "min-w-[160px]",
    render: (customer) => <div className="text-[0.82rem] text-muted-foreground">{customer.phone ?? "-"}</div>,
  },
  {
    key: "title",
    width: "min-w-[180px]",
    render: (customer) => <div className="text-[0.82rem] text-muted-foreground">{customer.details.title ?? "-"}</div>,
  },
  {
    key: "remarks",
    width: "min-w-[260px]",
    render: (customer) => <div className="max-w-[260px] truncate text-[0.82rem] text-muted-foreground">{customer.details.remarks ?? "-"}</div>,
  },
  {
    key: "callRemark",
    width: "min-w-[200px]",
    render: (customer) => <div className="max-w-[200px] truncate text-[0.82rem] text-muted-foreground">{customer.details.callRemark ?? "-"}</div>,
  },
  {
    key: "callStatus",
    width: "min-w-[140px]",
    render: (customer) => <div className="text-[0.82rem] text-muted-foreground">{customer.details.callStatus ?? "-"}</div>,
  },
  {
    key: "productTags",
    width: "min-w-[200px]",
    render: (customer) => (
      <div className="flex flex-wrap gap-1">
        {(customer.tags ?? []).length > 0 ? (
          customer.tags!.map((tag) => (
            <Badge key={tag} variant="secondary" className="px-2 py-0.5 text-[0.68rem]">
              {tag}
            </Badge>
          ))
        ) : (
          <span className="text-[0.8rem] text-muted-foreground">-</span>
        )}
      </div>
    ),
  },
  {
    key: "country",
    width: "min-w-[120px]",
    render: (customer) => <div className="text-[0.82rem] text-muted-foreground">{customer.details.country ?? "-"}</div>,
  },
  {
    key: "source",
    width: "min-w-[140px]",
    render: (customer) => <div className="text-[0.82rem] text-muted-foreground">{customer.details.source ?? "-"}</div>,
  },
  {
    key: "status",
    width: "min-w-[120px]",
    render: (customer) => <div className="text-[0.82rem] text-muted-foreground">{customer.details.status ?? "-"}</div>,
  },
  {
    key: "createdAt",
    width: "min-w-[150px]",
    render: (customer) => <div className="text-[0.8rem] text-muted-foreground">{formatDate(customer.createdAt)}</div>,
  },
  {
    key: "updatedAt",
    width: "min-w-[160px]",
    render: (customer) => <div className="text-[0.8rem] text-muted-foreground">{formatDateTime(customer.updatedAt)}</div>,
  },
];

const emptyEditForm: CustomerEditFormState = {
  fullName: "",
  email: "",
  phone: "",
  tagsInput: "",
  title: "",
  seniority: "",
  departments: "",
  country: "",
  source: "",
  status: "",
  callRemark: "",
  callStatus: "",
  remarks: "",
  linkedin: "",
  facebook: "",
  twitter: "",
  notes: "",
};

const emptyCreateForm: CreateFormState = {
  firstName: "",
  lastName: "",
  title: "",
  seniority: "",
  departments: "",
  callRemark: "Not Started",
  callStatus: "Not Started",
  country: "India",
  email: "",
  corporatePhoneCode: "+91",
  corporatePhone: "",
  mobilePhoneCode: "+91",
  mobilePhone: "",
  otherPhone: "",
  workDirectPhone: "",
  tags: "",
  linkedin: "",
  facebook: "",
  twitter: "",
  notes: "",
};

const emptyQuickUpdateForm: CustomerQuickUpdateFormState = {
  remarks: "",
  callRemark: "Not Started",
  callStatus: "Not Started",
};

const defaultImportText = `full_name,email,phone,tags,notes
Riya Mehta,riya@example.com,+91 98765 43210,priority|renewals,Priority contact
Vikram Singh,vikram@example.com,+91 98111 22233,enterprise|follow-up,Requested callback`;

function parseTags(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildCustomersCsv(items: Customer[]) {
  return [
    ["full_name", "email", "phone", "tags", "notes", "created_at"],
    ...items.map((customer) => [
      customer.fullName,
      customer.email ?? "",
      customer.phone ?? "",
      (customer.tags ?? []).join(", "),
      customer.notes ?? "",
      customer.createdAt,
    ]),
  ]
    .map((row) => row.map((cell) => toCsvCell(cell)).join(","))
    .join("\n");
}

function customerToForm(customer: Customer): CustomerFormState {
  return {
    fullName: customer.fullName,
    email: customer.email ?? "",
    phone: customer.phone ?? "",
    tagsInput: (customer.tags ?? []).join(", "),
    notes: customer.notes ?? "",
  };
}

function customerToEditForm(customer: Customer): CustomerEditFormState {
  const details = parseContactNotes(customer.notes);
  return {
    fullName: customer.fullName,
    email: customer.email ?? "",
    phone: customer.phone ?? "",
    tagsInput: (customer.tags ?? []).join(", "),
    title: details.title ?? "",
    seniority: details.seniority ?? "",
    departments: details.departments ?? "",
    country: details.country ?? "",
    source: details.source ?? "",
    status: details.status ?? "",
    callRemark: details.callRemark ?? "",
    callStatus: details.callStatus ?? "",
    remarks: details.remarks ?? "",
    linkedin: details.linkedin ?? "",
    facebook: details.facebook ?? "",
    twitter: details.twitter ?? "",
    notes: "",
  };
}

function normalizePage(value: string | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
}

function normalizeLimit(value: string | null) {
  const parsed = Number(value);
  return rowsPerPageOptions.includes(parsed as (typeof rowsPerPageOptions)[number]) ? parsed : 10;
}

function normalizeSortKey(value: string | null): CustomerSortKey {
  return customerSortKeys.includes(value as CustomerSortKey) ? (value as CustomerSortKey) : "updatedAt";
}

function normalizeSortDirection(value: string | null): CustomerSortDirection {
  return value === "asc" ? "asc" : "desc";
}

function readFiltersFromSearchParams(params: Pick<URLSearchParams, "get">): CustomerFilters {
  return {
    q: params.get("q") ?? "",
    email: params.get("email") ?? "",
    title: params.get("title") ?? "",
    callRemark: params.get("callRemark") ?? "",
    callStatus: params.get("callStatus") ?? "",
    productTags: params.get("productTags") ?? "",
    country: params.get("country") ?? "",
    source: params.get("source") ?? "",
    phone: params.get("phone") ?? "",
    createdFrom: params.get("createdFrom") ?? "",
    createdTo: params.get("createdTo") ?? "",
    documentFolder: params.get("documentFolder") ?? "",
  };
}

function writeFiltersToSearchParams(params: URLSearchParams, filters: CustomerFilters) {
  if (filters.q.trim()) params.set("q", filters.q.trim());
  if (filters.email.trim()) params.set("email", filters.email.trim());
  if (filters.title.trim()) params.set("title", filters.title.trim());
  if (filters.callRemark.trim()) params.set("callRemark", filters.callRemark.trim());
  if (filters.callStatus.trim()) params.set("callStatus", filters.callStatus.trim());
  if (filters.productTags.trim()) params.set("productTags", filters.productTags.trim());
  if (filters.country.trim()) params.set("country", filters.country.trim());
  if (filters.source.trim()) params.set("source", filters.source.trim());
  if (filters.phone.trim()) params.set("phone", filters.phone.trim());
  if (filters.createdFrom.trim()) params.set("createdFrom", filters.createdFrom.trim());
  if (filters.createdTo.trim()) params.set("createdTo", filters.createdTo.trim());
  if (filters.documentFolder.trim()) params.set("documentFolder", filters.documentFolder.trim());
}

function getCustomerFilterChips(filters: CustomerFilters): CustomerFilterChip[] {
  const chips: CustomerFilterChip[] = [];

  if (filters.q.trim()) chips.push({ key: "q", label: "Search", value: filters.q.trim() });
  if (filters.email.trim()) chips.push({ key: "email", label: "Email", value: filters.email.trim() });
  if (filters.title.trim()) chips.push({ key: "title", label: "Title", value: filters.title.trim() });
  if (filters.callRemark.trim()) chips.push({ key: "callRemark", label: "Call Remark", value: filters.callRemark.trim() });
  if (filters.callStatus.trim()) chips.push({ key: "callStatus", label: "Call Status", value: filters.callStatus.trim() });
  if (filters.productTags.trim()) chips.push({ key: "productTags", label: "Product Tags", value: filters.productTags.trim() });
  if (filters.country.trim()) chips.push({ key: "country", label: "Country", value: filters.country.trim() });
  if (filters.source.trim()) chips.push({ key: "source", label: "Source", value: filters.source.trim() });
  if (filters.phone.trim()) chips.push({ key: "phone", label: "Phone", value: filters.phone.trim() });
  if (filters.createdFrom.trim()) chips.push({ key: "createdFrom", label: "Created From", value: filters.createdFrom.trim() });
  if (filters.createdTo.trim()) chips.push({ key: "createdTo", label: "Created To", value: filters.createdTo.trim() });
  if (filters.documentFolder.trim()) chips.push({ key: "documentFolder", label: "Folder", value: filters.documentFolder.trim() });

  return chips;
}

function getDefaultSortDirection(sortKey: CustomerSortKey): CustomerSortDirection {
  return sortKey === "createdAt" || sortKey === "updatedAt" ? "desc" : "asc";
}

function buildCreateNotes(form: CreateFormState) {
  const lines = [
    ["Title", form.title],
    ["Seniority", form.seniority],
    ["Departments", form.departments],
    ["Country", form.country],
    ["Corporate phone", `${form.corporatePhoneCode} ${form.corporatePhone}`.trim()],
    ["Mobile phone", `${form.mobilePhoneCode} ${form.mobilePhone}`.trim()],
    ["Other phone", form.otherPhone],
    ["Work direct phone", form.workDirectPhone],
    ["LinkedIn", form.linkedin],
    ["Facebook", form.facebook],
    ["Twitter", form.twitter],
  ]
    .filter(([, value]) => value.trim())
    .map(([label, value]) => `${label}: ${value}`);

  return [form.notes.trim(), lines.length ? ["Contact details:", ...lines].join("\n") : null].filter(Boolean).join("\n\n");
}

function buildCustomerNotes(form: CustomerEditFormState) {
  const lines = [
    ["Title", form.title],
    ["Seniority", form.seniority],
    ["Departments", form.departments],
    ["Country", form.country],
    ["Source", form.source],
    ["Status", form.status],
    ["Call Remark", form.callRemark],
    ["Call Status", form.callStatus],
    ["Corporate phone", form.phone],
    ["LinkedIn", form.linkedin],
    ["Facebook", form.facebook],
    ["Twitter", form.twitter],
  ]
    .filter(([, value]) => value.trim())
    .map(([label, value]) => `${label}: ${value}`);

  const blocks = [form.notes.trim(), form.remarks.trim() ? `Remarks: ${form.remarks.trim()}` : null, lines.length ? ["Contact details:", ...lines].join("\n") : null].filter(Boolean);
  return blocks.join("\n\n");
}

function buildCreatePayload(form: CreateFormState) {
  const fullName = [form.firstName.trim(), form.lastName.trim()].filter(Boolean).join(" ");
  const primaryPhone =
    `${form.corporatePhoneCode} ${form.corporatePhone}`.trim() ||
    `${form.mobilePhoneCode} ${form.mobilePhone}`.trim() ||
    form.workDirectPhone.trim() ||
    form.otherPhone.trim();

  return {
    fullName,
    email: form.email.trim() || undefined,
    phone: primaryPhone || undefined,
    tags: parseTags(form.tags),
    notes: buildCreateNotes(form) || undefined,
  };
}

function parseContactNotes(notes: string | null | undefined) {
  const result: Partial<
    Record<
      | "title"
      | "seniority"
      | "departments"
      | "remarks"
      | "callRemark"
      | "callStatus"
      | "country"
      | "source"
      | "status"
      | "linkedin"
      | "facebook"
      | "twitter",
      string
    >
  > = {};
  const raw = notes ?? "";

  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^([^:]+):\s*(.+)$/);
    if (!match) {
      continue;
    }

    const key = match[1]?.trim().toLowerCase();
    const value = match[2]?.trim() ?? "";
    if (!value) {
      continue;
    }

    if (key === "title") result.title = value;
    if (key === "seniority") result.seniority = value;
    if (key === "departments") result.departments = value;
    if (key === "remarks") result.remarks = value;
    if (key === "call remark") result.callRemark = value;
    if (key === "call status") result.callStatus = value;
    if (key === "country") result.country = value;
    if (key === "source") result.source = value;
    if (key === "status") result.status = value;
    if (key === "linkedin") result.linkedin = value;
    if (key === "facebook") result.facebook = value;
    if (key === "twitter") result.twitter = value;
  }

  if (!result.remarks && raw.trim()) {
    result.remarks = raw.trim();
  }

  if (!result.callRemark) {
    result.callRemark = "Not Started";
  }

  if (!result.callStatus) {
    result.callStatus = "Not Started";
  }

  return result;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString();
}

function initialColumnVisibility(): CustomerColumnVisibility {
  return {
    ...defaultCustomerColumnVisibility,
    actions: true,
  };
}

export default function CustomersPage() {
  const companyId = getCompanyCookie();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [total, setTotal] = useState(0);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [createForm, setCreateForm] = useState<CreateFormState>(emptyCreateForm);
  const [editForm, setEditForm] = useState<CustomerEditFormState>(emptyEditForm);
  const [quickUpdateForm, setQuickUpdateForm] = useState<CustomerQuickUpdateFormState>(emptyQuickUpdateForm);
  const [submittingCreate, setSubmittingCreate] = useState(false);
  const [submittingEdit, setSubmittingEdit] = useState(false);
  const [submittingQuickUpdate, setSubmittingQuickUpdate] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [importMode, setImportMode] = useState<ImportMode>("paste");
  const [importText, setImportText] = useState(defaultImportText);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<PreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [columnSettingsOpen, setColumnSettingsOpen] = useState(false);
  const {
    columnVisibility: documentColumnVisibility,
    toggleColumn: toggleDocumentColumn,
    resetColumns: resetDocumentColumns,
  } = usePersistedColumnVisibility<DocumentColumnKey>({
    storageKey: documentColumnStorageKey,
    defaultVisibility: defaultDocumentColumnVisibility,
  });
  const {
    tab,
    setTab,
    filters,
    setFilters,
    filterDraft,
    setFilterDraft,
    page,
    setPage,
    limit,
    setLimit,
    sortBy,
    sortDir,
    columnVisibility,
    applyFilterDraft,
    clearFilterDraft,
    removeAppliedFilter,
    toggleColumn,
    resetColumns,
    requestSort,
  } = useCrmListState<CustomerFilters, CustomerSortKey, Exclude<CustomerColumnKey, "actions">>({
    defaultFilters: emptyCustomerFilters,
    defaultSortBy: "updatedAt",
    defaultSortDir: "desc",
    defaultLimit: rowsPerPageOptions[0],
    rowsPerPageOptions,
    parseFilters: readFiltersFromSearchParams,
    writeFilters: writeFiltersToSearchParams,
    normalizeSortBy: normalizeSortKey,
    columnStorageKey,
    defaultColumnVisibility: initialColumnVisibility(),
    lockedColumns: lockedCustomerColumns,
  });

  const offset = (page - 1) * limit;
  const customersWithDetails = useMemo<CustomerTableRow[]>(
    () => customers.map((customer) => ({ ...customer, details: parseContactNotes(customer.notes) })),
    [customers],
  );
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const startRow = total === 0 ? 0 : offset + 1;
  const endRow = total === 0 ? 0 : Math.min(offset + (tab === "documents" ? documents.length : customersWithDetails.length), total);
  const activeFilterChips = getCustomerFilterChips(filters).filter((chip) => tab === "documents" ? chip.key === "q" || chip.key === "documentFolder" : chip.key !== "documentFolder");
  const activeFilterCount = activeFilterChips.length;

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    params.set("limit", String(limit));
    params.set("offset", String(offset));
    if (filters.q.trim()) params.set("q", filters.q.trim());
    if (filters.email.trim()) params.set("email", filters.email.trim());
    if (filters.title.trim()) params.set("title", filters.title.trim());
    if (filters.callRemark.trim()) params.set("callRemark", filters.callRemark.trim());
    if (filters.callStatus.trim()) params.set("callStatus", filters.callStatus.trim());
    if (filters.productTags.trim()) params.set("productTags", filters.productTags.trim());
    if (filters.country.trim()) params.set("country", filters.country.trim());
    if (filters.source.trim()) params.set("source", filters.source.trim());
    if (filters.phone.trim()) params.set("phone", filters.phone.trim());
    if (filters.createdFrom.trim()) params.set("createdFrom", filters.createdFrom.trim());
    if (filters.createdTo.trim()) params.set("createdTo", filters.createdTo.trim());
    if (tab === "mine" && myUserId) params.set("assignedToUserId", myUserId);
    params.set("sortBy", sortBy);
    params.set("sortDir", sortDir);

    try {
      const data = await apiRequest<ListResponse>(`/customers?${params.toString()}`);
      const nextTotalPages = Math.max(1, Math.ceil((data.total ?? 0) / limit));
      if (page > nextTotalPages && data.total > 0) {
        setPage(nextTotalPages);
        return;
      }
      setCustomers(data.items);
      setTotal(data.total);
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : "Unable to load contacts.");
    } finally {
      setLoading(false);
    }
  }, [filters, limit, myUserId, offset, page, sortBy, sortDir, tab]);

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    params.set("limit", String(limit));
    params.set("offset", String(offset));
    params.set("entityType", "customer");
    if (filters.q.trim()) params.set("q", filters.q.trim());
    if (filters.documentFolder.trim()) params.set("folder", filters.documentFolder.trim());

    try {
      const data = await apiRequest<DocumentListResponse>(`/documents/list?${params.toString()}`);
      const nextTotalPages = Math.max(1, Math.ceil((data.total ?? 0) / limit));
      if (page > nextTotalPages && data.total > 0) {
        setPage(nextTotalPages);
        return;
      }
      setDocuments(data.items);
      setTotal(data.total);
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : "Unable to load uploaded documents.");
    } finally {
      setLoading(false);
    }
  }, [filters.documentFolder, filters.q, limit, offset, page, setPage]);

  useEffect(() => {
    void loadMe()
      .then((me) => setMyUserId(me.user.id))
      .catch(() => setMyUserId(null));
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (tab === "documents") {
        void loadDocuments();
        return;
      }

      if (tab === "mine" && !myUserId) {
        return;
      }

      void loadCustomers();
    }, 220);
    return () => window.clearTimeout(timer);
  }, [loadCustomers, loadDocuments, myUserId, tab]);

  useEffect(() => {
    if (!loading && total > 0 && page > totalPages) {
      setPage(totalPages);
    }
  }, [loading, page, total, totalPages]);

  const closeModal = () => {
    setModalMode(null);
    setSelectedCustomer(null);
  };

  const openCreate = () => {
    setCreateForm(emptyCreateForm);
    setModalMode("create");
  };

  const openImport = () => {
    setImportMode("paste");
    setImportText(defaultImportText);
    setImportFile(null);
    setImportPreview(null);
    setImportError(null);
    setModalMode("import");
  };

  const openEdit = (customer: Customer) => {
    setSelectedCustomer(customer);
    setEditForm(customerToEditForm(customer));
    setModalMode("edit");
  };

  const openQuickUpdate = (customer: Customer) => {
    const details = parseContactNotes(customer.notes);
    setSelectedCustomer(customer);
    setQuickUpdateForm({
      remarks: details.remarks ?? "",
      callRemark: details.callRemark ?? "Not Started",
      callStatus: details.callStatus ?? "Not Started",
    });
    setModalMode("quickUpdate");
  };

  const openFilter = () => {
    setFilterDraft(filters);
    setModalMode("filter");
  };

  const commitFilterDraft = () => {
    applyFilterDraft();
    setModalMode(null);
  };

  const closeColumnSettings = () => {
    setColumnSettingsOpen(false);
  };

  const openColumnSettings = () => {
    setColumnSettingsOpen(true);
  };

  const customerColumns: Array<ColumnDefinition<CustomerTableRow, Exclude<CustomerColumnKey, "actions">, CustomerSortKey>> =
    customerTableColumns.map((column) => ({
      key: column.key,
      label: customerColumnLabels[column.key],
      widthClassName: column.width,
      sortable: true,
      sortKey: column.key,
      renderCell: (customer) => {
        if (column.key === "remarks") {
          return (
            <button
              type="button"
              onClick={() => openQuickUpdate(customer)}
              className="group flex w-full items-start rounded-xl border border-transparent px-2 py-2 text-left transition-colors hover:border-sky-200 hover:bg-sky-50/70"
            >
              <div className="min-w-0">
                <div className="max-w-[260px] truncate text-[0.82rem] text-muted-foreground">{customer.details.remarks ?? "-"}</div>
                <div className="mt-1 text-[0.68rem] font-medium uppercase tracking-[0.12em] text-sky-700/80 opacity-0 transition-opacity group-hover:opacity-100">
                  Edit remarks
                </div>
              </div>
            </button>
          );
        }

        if (column.key === "callRemark") {
          return (
            <button type="button" onClick={() => openQuickUpdate(customer)} className="group inline-flex w-full justify-start">
              <span className="inline-flex max-w-full items-center rounded-full border border-sky-200/70 bg-sky-50 px-2.5 py-1 text-[0.76rem] font-medium text-sky-900 transition-colors group-hover:border-sky-300 group-hover:bg-sky-100">
                <span className="truncate">{customer.details.callRemark ?? "Not Started"}</span>
              </span>
            </button>
          );
        }

        if (column.key === "callStatus") {
          return (
            <button type="button" onClick={() => openQuickUpdate(customer)} className="group inline-flex w-full justify-start">
              <span className="inline-flex max-w-full items-center rounded-full border border-slate-200/80 bg-slate-50 px-2.5 py-1 text-[0.76rem] font-medium text-slate-800 transition-colors group-hover:border-sky-300 group-hover:bg-sky-50 group-hover:text-sky-900">
                <span className="truncate">{customer.details.callStatus ?? "Not Started"}</span>
              </span>
            </button>
          );
        }

        return column.render(customer);
      },
    }));

  const documentColumns: Array<ColumnDefinition<DocumentItem, "name" | "folder" | "type" | "size" | "createdAt">> = [
    {
      key: "name",
      label: "File Name",
      widthClassName: "min-w-[280px]",
      renderCell: (document) => (
        <div className="min-w-0">
          <div className="truncate font-medium text-slate-900">{document.originalName}</div>
          <div className="mt-1 text-xs text-muted-foreground">{document.entityId ? document.entityId.slice(0, 8) : "Unlinked"}</div>
        </div>
      ),
    },
    {
      key: "folder",
      label: "Folder",
      widthClassName: "min-w-[140px]",
      renderCell: (document) => <span className="text-slate-600">{document.folder}</span>,
    },
    {
      key: "type",
      label: "Type",
      widthClassName: "min-w-[140px]",
      renderCell: (document) => (
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{document.entityType}</Badge>
          {document.mimeType ? <Badge variant="secondary">{document.mimeType}</Badge> : null}
        </div>
      ),
    },
    {
      key: "size",
      label: "Size",
      widthClassName: "min-w-[110px]",
      renderCell: (document) => <span className="text-slate-600">{formatDocumentFileSize(document.sizeBytes)}</span>,
    },
    {
      key: "createdAt",
      label: "Uploaded",
      widthClassName: "min-w-[180px]",
      renderCell: (document) => <span className="text-slate-600">{formatDateTime(document.createdAt)}</span>,
    },
  ];

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmittingCreate(true);
    setError(null);
    try {
      await apiRequest("/customers", {
        method: "POST",
        body: JSON.stringify(buildCreatePayload(createForm)),
      });
      toast.success("Contact created.");
      closeModal();
      await loadCustomers();
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : "Unable to create contact.");
    } finally {
      setSubmittingCreate(false);
    }
  };

  const handleEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedCustomer) return;
    setSubmittingEdit(true);
    setError(null);
    try {
      const updated = await apiRequest<Customer>(`/customers/${selectedCustomer.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          fullName: editForm.fullName,
          email: editForm.email.trim() ? editForm.email.trim() : null,
          phone: editForm.phone.trim() ? editForm.phone.trim() : null,
          tags: parseTags(editForm.tagsInput),
          notes: buildCustomerNotes(editForm) || null,
        }),
      });
      setCustomers((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      toast.success("Contact updated.");
      closeModal();
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : "Unable to update contact.");
    } finally {
      setSubmittingEdit(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedCustomer) return;
    setDeletingId(selectedCustomer.id);
    setError(null);
    try {
      await apiRequest(`/customers/${selectedCustomer.id}`, { method: "DELETE" });
      setCustomers((current) => current.filter((item) => item.id !== selectedCustomer.id));
      toast.success("Contact deleted.");
      closeModal();
      await loadCustomers();
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : "Unable to delete contact.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleQuickUpdate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedCustomer) return;

    setSubmittingQuickUpdate(true);
    setError(null);
    try {
      const baseForm = customerToEditForm(selectedCustomer);
      const updated = await apiRequest<Customer>(`/customers/${selectedCustomer.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          notes: buildCustomerNotes({
            ...baseForm,
            remarks: quickUpdateForm.remarks,
            callRemark: quickUpdateForm.callRemark,
            callStatus: quickUpdateForm.callStatus,
          }) || null,
        }),
      });

      setCustomers((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      toast.success("Call details updated.");
      closeModal();
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : "Unable to update call details.");
    } finally {
      setSubmittingQuickUpdate(false);
    }
  };

  const loadAllForExport = useCallback(async () => {
    const items: Customer[] = [];
    let nextOffset = 0;
    while (true) {
      const params = new URLSearchParams();
      params.set("limit", "100");
      params.set("offset", String(nextOffset));
      if (filters.q.trim()) params.set("q", filters.q.trim());
      if (filters.email.trim()) params.set("email", filters.email.trim());
      if (filters.title.trim()) params.set("title", filters.title.trim());
      if (filters.callRemark.trim()) params.set("callRemark", filters.callRemark.trim());
      if (filters.callStatus.trim()) params.set("callStatus", filters.callStatus.trim());
      if (filters.productTags.trim()) params.set("productTags", filters.productTags.trim());
      if (filters.country.trim()) params.set("country", filters.country.trim());
      if (filters.source.trim()) params.set("source", filters.source.trim());
      if (filters.phone.trim()) params.set("phone", filters.phone.trim());
      if (filters.createdFrom.trim()) params.set("createdFrom", filters.createdFrom.trim());
      if (filters.createdTo.trim()) params.set("createdTo", filters.createdTo.trim());
      if (tab === "mine" && myUserId) params.set("assignedToUserId", myUserId);
      params.set("sortBy", sortBy);
      params.set("sortDir", sortDir);
      const response = await apiRequest<ListResponse>(`/customers?${params.toString()}`, { skipCache: true });
      items.push(...response.items);
      nextOffset += response.items.length;
      if (response.items.length === 0 || items.length >= response.total) break;
    }
    return items;
  }, [filters, myUserId, sortBy, sortDir, tab]);

  const loadAllDocumentsForExport = useCallback(async () => {
    const items: DocumentItem[] = [];
    let nextOffset = 0;
    while (true) {
      const params = new URLSearchParams();
      params.set("limit", "100");
      params.set("offset", String(nextOffset));
      params.set("entityType", "customer");
      if (filters.q.trim()) params.set("q", filters.q.trim());
      if (filters.documentFolder.trim()) params.set("folder", filters.documentFolder.trim());
      const response = await apiRequest<DocumentListResponse>(`/documents/list?${params.toString()}`, { skipCache: true });
      items.push(...response.items);
      nextOffset += response.items.length;
      if (response.items.length === 0 || items.length >= response.total) break;
    }
    return items;
  }, [filters.documentFolder, filters.q]);

  const handleExport = async () => {
    setExporting(true);
    setError(null);
    try {
      const csv =
        tab === "documents"
          ? buildDocumentsCsv(await loadAllDocumentsForExport())
          : buildCustomersCsv(await loadAllForExport());
      downloadCsvFile(csv, tab === "documents" ? "contact-documents.csv" : "contacts.csv");
      toast.success(tab === "documents" ? "Documents exported." : "Contacts exported.");
      closeModal();
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : `Unable to export ${tab === "documents" ? "documents" : "contacts"}.`);
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteDocument = async (documentId: string) => {
    setDeletingId(documentId);
    setError(null);
    try {
      await apiRequest(`/documents/${documentId}`, { method: "DELETE" });
      toast.success("Document deleted.");
      await loadDocuments();
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : "Unable to delete document.");
    } finally {
      setDeletingId(null);
    }
  };

  const previewImport = async () => {
    setPreviewLoading(true);
    setImportError(null);
    try {
      const response =
        importMode === "paste"
          ? await apiRequest<PreviewResponse>("/customers/import-preview", {
              method: "POST",
              body: JSON.stringify({ text: importText }),
            })
          : await apiRequest<PreviewResponse>("/customers/import-preview", {
              method: "POST",
              body: (() => {
                if (!importFile) throw new Error("Select a file first.");
                const formData = new FormData();
                formData.set("mode", importMode);
                formData.set("file", importFile);
                return formData;
              })(),
            });
      setImportPreview(response);
      toast.success(`Preview ready for ${response.totalRows} rows.`);
    } catch (caughtError) {
      setImportError(
        caughtError instanceof ApiError
          ? caughtError.message
          : caughtError instanceof Error
            ? caughtError.message
            : "Unable to preview import.",
      );
    } finally {
      setPreviewLoading(false);
    }
  };

  const submitImport = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!importPreview) {
      setImportError("Preview the data before importing.");
      return;
    }
    setImporting(true);
    setImportError(null);
    setError(null);
    try {
      const response: ImportResponse =
        importMode === "paste"
          ? await apiRequest("/customers/import", {
              method: "POST",
              body: JSON.stringify({ text: importText }),
            })
          : await apiRequest("/customers/import", {
              method: "POST",
              body: (() => {
                if (!importFile) throw new Error("Select a file first.");
                const formData = new FormData();
                formData.set("mode", importMode);
                formData.set("file", importFile);
                return formData;
              })(),
            });

      toast.success(`Imported ${response.createdCount} contacts.`);
      if (response.errorCount > 0) toast(`Skipped ${response.errorCount} invalid rows.`);
      closeModal();
      await loadCustomers();
    } catch (caughtError) {
      setImportError(
        caughtError instanceof ApiError
          ? caughtError.message
          : caughtError instanceof Error
            ? caughtError.message
            : "Unable to import contacts.",
      );
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="grid gap-4">
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Contacts error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <CrmListPageHeader
        title="Contact"
        actions={
          <>
            <Button type="button" variant="outline" size="sm" onClick={() => setModalMode("export")}>
              <Download className="size-4" /> Export
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={openImport}>
              <Import className="size-4" /> Import
            </Button>
            <Button type="button" size="sm" onClick={openCreate}>
              <Plus className="size-4" /> Create
            </Button>
          </>
        }
      />

      <section className="min-w-0 max-w-full overflow-hidden rounded-[1.35rem] border border-border/60 bg-white shadow-[0_16px_44px_-34px_rgba(35,86,166,0.2)]">
        <div className="px-4 pt-3">
          <CrmListViewTabs
            value={tab}
            onValueChange={setTab}
            labels={{
              all: "All Contacts",
              mine: "My Contacts",
              documents: "Uploaded Docs",
            }}
          />
        </div>

        <CrmListToolbar
          searchValue={filters.q}
          searchPlaceholder={tab === "documents" ? "Search uploaded documents" : "Search customers, email, phone, or notes"}
          onSearchChange={(value) => {
            setPage(1);
            setFilters((current) => ({ ...current, q: value }));
            setFilterDraft((current) => ({ ...current, q: value }));
          }}
          onOpenFilters={openFilter}
          filterCount={activeFilterCount}
          onOpenColumns={openColumnSettings}
          onRefresh={() => {
            if (tab === "documents") {
              void loadDocuments();
              return;
            }
            void loadCustomers();
          }}
        />

        <CrmAppliedFiltersBar chips={activeFilterChips} onRemove={removeAppliedFilter} />

        {tab === "documents" ? (
          <CrmDataTable
            columns={documentColumns}
            rows={documents}
            rowKey={(record) => record.id}
            loading={loading}
            emptyLabel="No documents found."
            columnVisibility={documentColumnVisibility}
            actionColumn={{
              header: "Actions",
              renderCell: (record) => (
                <div className="flex justify-end gap-1.5">
                  <a href={buildApiUrl(`/documents/${record.id}/download`, { companyId })} className="inline-flex items-center rounded-xl border border-border/60 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50">
                    Download
                  </a>
                  <Button type="button" size="xs" variant="ghost" disabled={deletingId === record.id} onClick={() => void handleDeleteDocument(record.id)}>
                    <Trash2 className="size-3.5" /> Delete
                  </Button>
                </div>
              ),
            }}
          />
        ) : (
          <CrmDataTable
            columns={customerColumns}
            rows={customersWithDetails}
            rowKey={(record) => record.id}
            loading={loading}
            emptyLabel="No contacts found."
            columnVisibility={columnVisibility}
            sortBy={sortBy}
            sortDir={sortDir}
            onSort={(key) => requestSort(key, getDefaultSortDirection(key))}
            actionColumn={{
              header: "Actions",
              renderCell: (record) => (
                <div className="flex justify-end gap-1.5">
                  <Button type="button" size="xs" variant="outline" onClick={() => openEdit(record)}>
                    <PencilLine className="size-3.5" /> Edit
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    disabled={deletingId === record.id}
                    onClick={() => {
                      setSelectedCustomer(record);
                      setModalMode("delete");
                    }}
                  >
                    <Trash2 className="size-3.5" /> Delete
                  </Button>
                </div>
              ),
            }}
          />
        )}

        <CrmPaginationBar
          limit={limit}
          onLimitChange={(value) => {
            setPage(1);
            setLimit(value);
          }}
          rowsPerPageOptions={rowsPerPageOptions}
          total={total}
          page={page}
          totalPages={totalPages}
          onPrev={() => setPage((current) => Math.max(1, current - 1))}
          onNext={() => setPage((current) => Math.min(totalPages, current + 1))}
          summary={
            <div className="text-sm text-muted-foreground">
              Showing <span className="font-medium text-slate-900">{startRow}</span> to <span className="font-medium text-slate-900">{endRow}</span> of <span className="font-medium text-slate-900">{total}</span>
            </div>
          }
        />
      </section>

      {tab === "documents" ? (
        <CrmColumnSettings
          open={columnSettingsOpen}
          description="Choose which document columns stay visible in the uploaded docs table."
          columns={documentColumns.map((column) => ({ key: column.key, label: column.label }))}
          columnVisibility={documentColumnVisibility}
          onToggleColumn={toggleDocumentColumn}
          onReset={resetDocumentColumns}
          onClose={closeColumnSettings}
        />
      ) : (
        <CrmColumnSettings
          open={columnSettingsOpen}
          description="Name and Mobile stay on. Toggle the rest."
          columns={(Object.keys(customerColumnLabels) as Exclude<CustomerColumnKey, "actions">[]).map((key) => ({ key, label: customerColumnLabels[key] }))}
          columnVisibility={columnVisibility}
          lockedColumns={lockedCustomerColumns}
          onToggleColumn={toggleColumn}
          onReset={resetColumns}
          onClose={closeColumnSettings}
        />
      )}

      {modalMode === "create" ? (
        <CrmModalShell
          open
          title="Add New Contact"
          description="Capture the contact profile in a compact, form-first layout."
          onClose={closeModal}
          maxWidthClassName="max-w-6xl"
          headerActions={
            <>
              <Button type="button" variant="destructive" size="xs" onClick={closeModal}>
                Close
              </Button>
              <Button type="submit" form="create-contact-form" size="xs" disabled={submittingCreate}>
                {submittingCreate ? "Saving..." : "Save"}
              </Button>
            </>
          }
        >
          <form id="create-contact-form" onSubmit={handleCreate} className="grid gap-5">
            <div className="grid gap-4 rounded-2xl border border-border/60 bg-slate-50/70 p-4">
              <div>
                <div className="text-sm font-semibold text-slate-900">Contact Information</div>
                <p className="text-xs text-muted-foreground">Basic identity, contact, and profile data.</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Field>
                  <FieldLabel>First Name *</FieldLabel>
                  <Input
                    value={createForm.firstName}
                    onChange={(event) => setCreateForm((current) => ({ ...current, firstName: event.target.value }))}
                    placeholder="eg: Timothy"
                    required
                    className="h-9 text-sm"
                  />
                </Field>
                <Field>
                  <FieldLabel>Last Name *</FieldLabel>
                  <Input
                    value={createForm.lastName}
                    onChange={(event) => setCreateForm((current) => ({ ...current, lastName: event.target.value }))}
                    placeholder="eg: Collinson"
                    required
                    className="h-9 text-sm"
                  />
                </Field>
                <Field>
                  <FieldLabel>Title</FieldLabel>
                  <Input value={createForm.title} onChange={(event) => setCreateForm((current) => ({ ...current, title: event.target.value }))} placeholder="eg: CTO" className="h-9 text-sm" />
                </Field>
                <Field>
                  <FieldLabel>Seniority</FieldLabel>
                  <Input value={createForm.seniority} onChange={(event) => setCreateForm((current) => ({ ...current, seniority: event.target.value }))} placeholder="eg: C suite" className="h-9 text-sm" />
                </Field>
                <Field>
                  <FieldLabel>Departments</FieldLabel>
                  <Input value={createForm.departments} onChange={(event) => setCreateForm((current) => ({ ...current, departments: event.target.value }))} placeholder="eg: Engineering & Technical" className="h-9 text-sm" />
                </Field>
                <Field>
                  <FieldLabel>Call Remark</FieldLabel>
                  <NativeSelect value={createForm.callRemark} onChange={(event) => setCreateForm((current) => ({ ...current, callRemark: event.target.value }))} className="h-9 rounded-xl px-3 text-sm">
                    {callRemarkOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field>
                  <FieldLabel>Call Status</FieldLabel>
                  <NativeSelect value={createForm.callStatus} onChange={(event) => setCreateForm((current) => ({ ...current, callStatus: event.target.value }))} className="h-9 rounded-xl px-3 text-sm">
                    {callStatusOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field>
                  <FieldLabel>Country *</FieldLabel>
                  <NativeSelect value={createForm.country} onChange={(event) => setCreateForm((current) => ({ ...current, country: event.target.value }))} className="h-9 rounded-xl px-3 text-sm">
                    <option value="India">India</option>
                    <option value="United States">United States</option>
                    <option value="United Kingdom">United Kingdom</option>
                    <option value="Other">Other</option>
                  </NativeSelect>
                </Field>
                <Field>
                  <FieldLabel>Email *</FieldLabel>
                  <Input
                    type="email"
                    value={createForm.email}
                    onChange={(event) => setCreateForm((current) => ({ ...current, email: event.target.value }))}
                    placeholder="eg: timothy.collinson@company.com"
                    required
                    className="h-9 text-sm"
                  />
                </Field>
                <Field>
                  <FieldLabel>Corporate Phone</FieldLabel>
                  <div className="grid grid-cols-[88px_minmax(0,1fr)] overflow-hidden rounded-xl border border-input bg-white">
                    <NativeSelect value={createForm.corporatePhoneCode} onChange={(event) => setCreateForm((current) => ({ ...current, corporatePhoneCode: event.target.value }))} className="h-9 rounded-none border-0 border-r bg-transparent px-2 text-xs">
                      <option value="+91">+91</option>
                      <option value="+1">+1</option>
                      <option value="+44">+44</option>
                      <option value="+971">+971</option>
                    </NativeSelect>
                    <Input value={createForm.corporatePhone} onChange={(event) => setCreateForm((current) => ({ ...current, corporatePhone: event.target.value }))} placeholder="Phone Number" className="h-9 rounded-none border-0 text-sm shadow-none focus-visible:ring-0" />
                  </div>
                </Field>
                <Field>
                  <FieldLabel>Mobile Phone</FieldLabel>
                  <div className="grid grid-cols-[88px_minmax(0,1fr)] overflow-hidden rounded-xl border border-input bg-white">
                    <NativeSelect value={createForm.mobilePhoneCode} onChange={(event) => setCreateForm((current) => ({ ...current, mobilePhoneCode: event.target.value }))} className="h-9 rounded-none border-0 border-r bg-transparent px-2 text-xs">
                      <option value="+91">+91</option>
                      <option value="+1">+1</option>
                      <option value="+44">+44</option>
                      <option value="+971">+971</option>
                    </NativeSelect>
                    <Input value={createForm.mobilePhone} onChange={(event) => setCreateForm((current) => ({ ...current, mobilePhone: event.target.value }))} placeholder="Phone Number" className="h-9 rounded-none border-0 text-sm shadow-none focus-visible:ring-0" />
                  </div>
                </Field>
                <Field>
                  <FieldLabel>Other Phone</FieldLabel>
                  <Input value={createForm.otherPhone} onChange={(event) => setCreateForm((current) => ({ ...current, otherPhone: event.target.value }))} placeholder="eg: +1 888-369-1159" className="h-9 text-sm" />
                </Field>
                <Field>
                  <FieldLabel>Work Direct Phone</FieldLabel>
                  <Input value={createForm.workDirectPhone} onChange={(event) => setCreateForm((current) => ({ ...current, workDirectPhone: event.target.value }))} placeholder="eg: +1 888-369-1159" className="h-9 text-sm" />
                </Field>
              </div>
            </div>
            <div className="grid gap-4 rounded-2xl border border-border/60 bg-slate-50/70 p-4">
              <div>
                <div className="text-sm font-semibold text-slate-900">Tags and Social Media</div>
                <p className="text-xs text-muted-foreground">Store tags and key network links for quick follow-up.</p>
              </div>
              <Field>
                <FieldLabel>Product Tags</FieldLabel>
                <Input value={createForm.tags} onChange={(event) => setCreateForm((current) => ({ ...current, tags: event.target.value }))} placeholder="Select existing tag or type to create new..." className="h-9 text-sm" />
                <FieldDescription>Separate tags with commas.</FieldDescription>
              </Field>
              <div className="grid gap-4 md:grid-cols-3">
                <Field><FieldLabel>LinkedIn</FieldLabel><Input value={createForm.linkedin} onChange={(event) => setCreateForm((current) => ({ ...current, linkedin: event.target.value }))} placeholder="https://www.linkedin.com/..." className="h-9 text-sm" /></Field>
                <Field><FieldLabel>Facebook</FieldLabel><Input value={createForm.facebook} onChange={(event) => setCreateForm((current) => ({ ...current, facebook: event.target.value }))} placeholder="https://facebook.com/..." className="h-9 text-sm" /></Field>
                <Field><FieldLabel>Twitter</FieldLabel><Input value={createForm.twitter} onChange={(event) => setCreateForm((current) => ({ ...current, twitter: event.target.value }))} placeholder="https://twitter.com/..." className="h-9 text-sm" /></Field>
              </div>
            </div>
            <Field>
              <FieldLabel>Notes</FieldLabel>
              <Textarea value={createForm.notes} onChange={(event) => setCreateForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Add extra context for the team..." className="min-h-24 text-sm" />
            </Field>
          </form>
        </CrmModalShell>
      ) : null}

      {modalMode === "import" ? (
        <CrmModalShell
          open
          title="Import Contacts"
          description="Preview data before importing. Paste CSV/XLS text, upload a sheet, or upload a PDF."
          onClose={closeModal}
          maxWidthClassName="max-w-6xl"
          headerActions={
            <Button type="button" variant="ghost" size="xs" onClick={() => void previewImport()} disabled={previewLoading || importing}>
              {previewLoading ? "Previewing..." : "Preview"}
            </Button>
          }
        >
          <form id="import-contact-form" onSubmit={submitImport} className="grid gap-5">
            {importError ? (
              <Alert variant="destructive">
                <AlertTitle>Import error</AlertTitle>
                <AlertDescription>{importError}</AlertDescription>
              </Alert>
            ) : null}
            <div className="grid gap-3 md:grid-cols-3">
              {[
                { key: "paste" as const, title: "Paste CSV / XLS text", description: "Paste comma, tab, or semicolon separated rows from Excel or CSV." },
                { key: "sheet" as const, title: "Upload sheet", description: "Upload an .xlsx or .xls file and preview the mapped rows." },
                { key: "pdf" as const, title: "Upload PDF", description: "Upload a PDF and preview extracted rows before importing." },
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    setImportMode(item.key);
                    setImportPreview(null);
                    setImportError(null);
                  }}
                  className={cn(
                    "rounded-2xl border px-4 py-3 text-left transition-colors",
                    importMode === item.key ? "border-primary/40 bg-primary/5" : "border-border/60 bg-white hover:border-primary/20 hover:bg-slate-50",
                  )}
                >
                  <div className="text-sm font-semibold text-slate-900">{item.title}</div>
                  <div className="mt-1 text-xs leading-5 text-muted-foreground">{item.description}</div>
                </button>
              ))}
            </div>

            {importMode === "paste" ? (
              <Field>
                <FieldLabel>Paste rows</FieldLabel>
                <Textarea
                  value={importText}
                  onChange={(event) => {
                    setImportText(event.target.value);
                    setImportPreview(null);
                    setImportError(null);
                  }}
                  className="min-h-56 font-mono text-xs"
                  placeholder={`full_name,email,phone,tags,notes\nFaizal Vohora,faizal@acme.com,+91 98765 43210,vip|renewals,Priority contact`}
                />
                <FieldDescription>CSV, tab-separated, or semicolon-separated text works here.</FieldDescription>
              </Field>
            ) : (
              <Field>
                <FieldLabel>Upload file</FieldLabel>
                <Input
                  type="file"
                  accept={importMode === "pdf" ? ".pdf" : ".xlsx,.xls"}
                  onChange={(event) => {
                    setImportFile(event.target.files?.[0] ?? null);
                    setImportPreview(null);
                    setImportError(null);
                  }}
                  className="h-9 text-sm"
                />
                <FieldDescription>{importMode === "pdf" ? "Upload a PDF file to extract rows." : "Upload a sheet file to read the first worksheet."}</FieldDescription>
              </Field>
            )}

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => void previewImport()} disabled={previewLoading || importing}>
                {previewLoading ? "Previewing..." : "Preview data"}
              </Button>
              <Button type="submit" form="import-contact-form" disabled={!importPreview || previewLoading || importing}>
                {importing ? "Importing..." : "Import contacts"}
              </Button>
            </div>

            <div className="rounded-2xl border border-border/60 bg-slate-50/70 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-slate-900">Preview</div>
                  <p className="text-xs text-muted-foreground">
                    {importPreview
                      ? `Showing ${Math.min(importPreview.rows.length, 50)} preview rows from ${importPreview.totalRows} imported rows.`
                      : "Preview the mapped rows before importing."}
                  </p>
                </div>
                {importPreview ? <Badge variant="secondary">{importPreview.totalRows} rows</Badge> : null}
              </div>
              {importPreview ? (
                <div className="mt-4 overflow-x-auto rounded-xl border border-border/60 bg-white">
                  <table className="min-w-full border-separate border-spacing-0 text-xs">
                    <thead>
                      <tr className="bg-muted/30 text-left uppercase tracking-[0.14em] text-muted-foreground">
                        <th className="px-3 py-2 font-medium">Row</th>
                        <th className="px-3 py-2 font-medium">Name</th>
                        <th className="px-3 py-2 font-medium">Email</th>
                        <th className="px-3 py-2 font-medium">Phone</th>
                        <th className="px-3 py-2 font-medium">Tags</th>
                        <th className="px-3 py-2 font-medium">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importPreview.rows.map((row) => (
                        <tr key={row.row} className="border-b border-border/40 last:border-b-0">
                          <td className="px-3 py-2 text-muted-foreground">{row.row}</td>
                          <td className="px-3 py-2 font-medium text-slate-900">{row.fullName}</td>
                          <td className="px-3 py-2 text-muted-foreground">{row.email ?? "-"}</td>
                          <td className="px-3 py-2 text-muted-foreground">{row.phone ?? "-"}</td>
                          <td className="px-3 py-2 text-muted-foreground">{row.tags.length ? row.tags.join(", ") : "-"}</td>
                          <td className="px-3 py-2 text-muted-foreground">{row.notes ?? "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="mt-4 rounded-xl border border-dashed border-border/60 bg-white px-4 py-8 text-sm text-muted-foreground">
                  No preview yet. Choose a source, then preview the import to inspect the rows.
                </div>
              )}
            </div>
          </form>
        </CrmModalShell>
      ) : null}

      <CrmFilterDrawer
        open={modalMode === "filter"}
        title="Filter"
        description={tab === "documents" ? "Shape the uploaded docs table." : "Shape the table with live customer filters."}
        onClose={closeModal}
        onClear={clearFilterDraft}
        applyFormId="customer-filter-form"
      >
        <form
          id="customer-filter-form"
          onSubmit={(event) => {
            event.preventDefault();
            commitFilterDraft();
          }}
          className="grid gap-4"
        >
          <div className="grid gap-4 rounded-[1.35rem] border border-border/60 bg-slate-50/70 p-4">
            <div className="text-sm font-semibold text-slate-900">Search</div>
            <Field>
              <FieldLabel>Search term</FieldLabel>
              <Input
                value={filterDraft.q}
                onChange={(event) => setFilterDraft((current) => ({ ...current, q: event.target.value }))}
                placeholder={tab === "documents" ? "Search by filename" : "Search by name, email, phone, or notes"}
                className="h-10 text-sm"
              />
            </Field>
            {tab === "documents" ? (
              <Field>
                <FieldLabel>Folder</FieldLabel>
                <Input
                  value={filterDraft.documentFolder}
                  onChange={(event) => setFilterDraft((current) => ({ ...current, documentFolder: event.target.value }))}
                  placeholder="general"
                  className="h-10 text-sm"
                />
              </Field>
            ) : (
              <Field>
                <FieldLabel>Email</FieldLabel>
                <Input
                  value={filterDraft.email}
                  onChange={(event) => setFilterDraft((current) => ({ ...current, email: event.target.value }))}
                  placeholder="Exact email or fragment"
                  className="h-10 text-sm"
                />
              </Field>
            )}
          </div>

          {tab !== "documents" ? (
            <>
              <div className="grid gap-4 rounded-[1.35rem] border border-border/60 bg-white p-4">
                <div className="text-sm font-semibold text-slate-900">Contact details</div>
                <Field>
                  <FieldLabel>Title</FieldLabel>
                  <Input value={filterDraft.title} onChange={(event) => setFilterDraft((current) => ({ ...current, title: event.target.value }))} placeholder="eg: CTO" className="h-10 text-sm" />
                </Field>
                <Field>
                  <FieldLabel>Call Remark</FieldLabel>
                  <NativeSelect value={filterDraft.callRemark} onChange={(event) => setFilterDraft((current) => ({ ...current, callRemark: event.target.value }))} className="h-10 rounded-xl px-3 text-sm">
                    <option value="">All call remarks</option>
                    {callRemarkOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field>
                  <FieldLabel>Call Status</FieldLabel>
                  <NativeSelect value={filterDraft.callStatus} onChange={(event) => setFilterDraft((current) => ({ ...current, callStatus: event.target.value }))} className="h-10 rounded-xl px-3 text-sm">
                    <option value="">All call statuses</option>
                    {callStatusOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field>
                  <FieldLabel>Product Tags</FieldLabel>
                  <Input value={filterDraft.productTags} onChange={(event) => setFilterDraft((current) => ({ ...current, productTags: event.target.value }))} placeholder="priority, enterprise" className="h-10 text-sm" />
                </Field>
                <Field>
                  <FieldLabel>Country</FieldLabel>
                  <Input value={filterDraft.country} onChange={(event) => setFilterDraft((current) => ({ ...current, country: event.target.value }))} placeholder="eg: India" className="h-10 text-sm" />
                </Field>
                <Field>
                  <FieldLabel>Source</FieldLabel>
                  <Input value={filterDraft.source} onChange={(event) => setFilterDraft((current) => ({ ...current, source: event.target.value }))} placeholder="eg: inbound, referral" className="h-10 text-sm" />
                </Field>
                <Field>
                  <FieldLabel>Phone</FieldLabel>
                  <Input value={filterDraft.phone} onChange={(event) => setFilterDraft((current) => ({ ...current, phone: event.target.value }))} placeholder="Search mobile or work number" className="h-10 text-sm" />
                </Field>
              </div>

              <div className="grid gap-4 rounded-[1.35rem] border border-border/60 bg-slate-50/70 p-4">
                <div className="text-sm font-semibold text-slate-900">Created on</div>
                <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
                  <Input type="date" value={filterDraft.createdFrom} onChange={(event) => setFilterDraft((current) => ({ ...current, createdFrom: event.target.value }))} className="h-10 text-sm" />
                  <span className="px-1 text-sm text-muted-foreground">to</span>
                  <Input type="date" value={filterDraft.createdTo} onChange={(event) => setFilterDraft((current) => ({ ...current, createdTo: event.target.value }))} className="h-10 text-sm" />
                </div>
              </div>
            </>
          ) : null}

          <div className="rounded-[1.35rem] border border-dashed border-border/70 bg-white px-4 py-3 text-xs leading-5 text-muted-foreground">
            Filters update the table after Apply. Clear All only resets this drawer until you confirm the changes.
          </div>
        </form>
      </CrmFilterDrawer>

      {modalMode === "edit" && selectedCustomer ? (
        <CrmModalShell
          open
          title="Edit Contact"
          description="Update the selected contact."
          onClose={closeModal}
          headerActions={
            <>
              <Button type="button" variant="destructive" size="xs" onClick={closeModal}>
                Close
              </Button>
              <Button type="submit" form="edit-contact-form" size="xs" disabled={submittingEdit}>
                {submittingEdit ? "Saving..." : "Save"}
              </Button>
            </>
          }
        >
          <form id="edit-contact-form" onSubmit={handleEdit} className="grid gap-5">
            <div className="grid gap-4 rounded-2xl border border-border/60 bg-slate-50/70 p-4">
              <div>
                <div className="text-sm font-semibold text-slate-900">Identity</div>
                <p className="text-xs text-muted-foreground">Core contact details and the primary phone number.</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Field>
                  <FieldLabel>Full name</FieldLabel>
                  <Input
                    className="h-9 text-sm"
                    value={editForm.fullName}
                    onChange={(event) => setEditForm((current) => ({ ...current, fullName: event.target.value }))}
                  />
                </Field>
                <Field>
                  <FieldLabel>Email</FieldLabel>
                  <Input
                    className="h-9 text-sm"
                    value={editForm.email}
                    onChange={(event) => setEditForm((current) => ({ ...current, email: event.target.value }))}
                  />
                </Field>
                <Field className="md:col-span-2">
                  <FieldLabel>Phone</FieldLabel>
                  <Input
                    className="h-9 text-sm"
                    value={editForm.phone}
                    onChange={(event) => setEditForm((current) => ({ ...current, phone: event.target.value }))}
                    placeholder="Primary phone number"
                  />
                </Field>
                <Field className="md:col-span-2">
                  <FieldLabel>Tags</FieldLabel>
                  <Input
                    className="h-9 text-sm"
                    value={editForm.tagsInput}
                    onChange={(event) => setEditForm((current) => ({ ...current, tagsInput: event.target.value }))}
                    placeholder="Separate tags with commas"
                  />
                </Field>
              </div>
            </div>

            <div className="grid gap-4 rounded-2xl border border-border/60 bg-white p-4">
              <div>
                <div className="text-sm font-semibold text-slate-900">Profile details</div>
                <p className="text-xs text-muted-foreground">Structured contact info saved in the notes field.</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Field><FieldLabel>Title</FieldLabel><Input className="h-9 text-sm" value={editForm.title} onChange={(event) => setEditForm((current) => ({ ...current, title: event.target.value }))} /></Field>
                <Field><FieldLabel>Seniority</FieldLabel><Input className="h-9 text-sm" value={editForm.seniority} onChange={(event) => setEditForm((current) => ({ ...current, seniority: event.target.value }))} /></Field>
                <Field><FieldLabel>Departments</FieldLabel><Input className="h-9 text-sm" value={editForm.departments} onChange={(event) => setEditForm((current) => ({ ...current, departments: event.target.value }))} /></Field>
                <Field><FieldLabel>Country</FieldLabel><Input className="h-9 text-sm" value={editForm.country} onChange={(event) => setEditForm((current) => ({ ...current, country: event.target.value }))} /></Field>
                <Field><FieldLabel>Source</FieldLabel><Input className="h-9 text-sm" value={editForm.source} onChange={(event) => setEditForm((current) => ({ ...current, source: event.target.value }))} /></Field>
                <Field><FieldLabel>Status</FieldLabel><Input className="h-9 text-sm" value={editForm.status} onChange={(event) => setEditForm((current) => ({ ...current, status: event.target.value }))} /></Field>
                <Field>
                  <FieldLabel>Call Remark</FieldLabel>
                  <NativeSelect className="h-9 rounded-xl px-3 text-sm" value={editForm.callRemark} onChange={(event) => setEditForm((current) => ({ ...current, callRemark: event.target.value }))}>
                    <option value="">Select call remark</option>
                    {callRemarkOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field>
                  <FieldLabel>Call Status</FieldLabel>
                  <NativeSelect className="h-9 rounded-xl px-3 text-sm" value={editForm.callStatus} onChange={(event) => setEditForm((current) => ({ ...current, callStatus: event.target.value }))}>
                    <option value="">Select call status</option>
                    {callStatusOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
              </div>
            </div>

            <div className="grid gap-4 rounded-2xl border border-border/60 bg-slate-50/70 p-4">
              <div>
                <div className="text-sm font-semibold text-slate-900">Social links</div>
                <p className="text-xs text-muted-foreground">Keep the main web profiles connected to the contact.</p>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <Field><FieldLabel>LinkedIn</FieldLabel><Input className="h-9 text-sm" value={editForm.linkedin} onChange={(event) => setEditForm((current) => ({ ...current, linkedin: event.target.value }))} /></Field>
                <Field><FieldLabel>Facebook</FieldLabel><Input className="h-9 text-sm" value={editForm.facebook} onChange={(event) => setEditForm((current) => ({ ...current, facebook: event.target.value }))} /></Field>
                <Field><FieldLabel>Twitter</FieldLabel><Input className="h-9 text-sm" value={editForm.twitter} onChange={(event) => setEditForm((current) => ({ ...current, twitter: event.target.value }))} /></Field>
              </div>
            </div>

            <Field>
              <FieldLabel>Remarks</FieldLabel>
              <Textarea
                className="min-h-24 text-sm"
                value={editForm.remarks}
                onChange={(event) => setEditForm((current) => ({ ...current, remarks: event.target.value }))}
                placeholder="Short internal note or summary"
              />
            </Field>

            <Field>
              <FieldLabel>Extra notes</FieldLabel>
              <Textarea
                className="min-h-24 text-sm"
                value={editForm.notes}
                onChange={(event) => setEditForm((current) => ({ ...current, notes: event.target.value }))}
                placeholder="Add any additional notes or context"
              />
            </Field>

            <div className="flex gap-2">
              <Button type="button" variant="destructive" onClick={closeModal}>
                Cancel
              </Button>
            </div>
          </form>
        </CrmModalShell>
      ) : null}

      {modalMode === "quickUpdate" && selectedCustomer ? (
        <CrmModalShell
          open
          title="Update Call Details"
          description={`Quick update for ${selectedCustomer.fullName}.`}
          onClose={closeModal}
          maxWidthClassName="max-w-xl"
          headerActions={
            <>
              <Button type="button" variant="destructive" size="xs" onClick={closeModal}>
                Close
              </Button>
              <Button type="submit" form="quick-update-form" size="xs" disabled={submittingQuickUpdate}>
                {submittingQuickUpdate ? "Saving..." : "Save"}
              </Button>
            </>
          }
        >
          <form id="quick-update-form" onSubmit={handleQuickUpdate} className="grid gap-4">
            <div className="grid gap-4 rounded-2xl border border-border/60 bg-slate-50/70 p-4">
              <Field>
                <FieldLabel>Call Remark</FieldLabel>
                <NativeSelect
                  className="h-10 rounded-xl px-3 text-sm"
                  value={quickUpdateForm.callRemark}
                  onChange={(event) => setQuickUpdateForm((current) => ({ ...current, callRemark: event.target.value }))}
                >
                  {callRemarkOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel>Call Status</FieldLabel>
                <NativeSelect
                  className="h-10 rounded-xl px-3 text-sm"
                  value={quickUpdateForm.callStatus}
                  onChange={(event) => setQuickUpdateForm((current) => ({ ...current, callStatus: event.target.value }))}
                >
                  {callStatusOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel>Remarks</FieldLabel>
                <Textarea
                  className="min-h-24 text-sm"
                  value={quickUpdateForm.remarks}
                  onChange={(event) => setQuickUpdateForm((current) => ({ ...current, remarks: event.target.value }))}
                  placeholder="Add or update the call remark summary"
                />
              </Field>
            </div>
          </form>
        </CrmModalShell>
      ) : null}

      {modalMode === "delete" && selectedCustomer ? (
        <CrmModalShell open title="Delete Contact" description={`Remove ${selectedCustomer.fullName} from the workspace.`} onClose={closeModal} maxWidthClassName="max-w-xl">
          <div className="grid gap-3">
            <p className="text-sm text-muted-foreground">This action cannot be undone.</p>
            <div className="flex gap-2">
              <Button type="button" variant="destructive" onClick={() => void handleDelete()} disabled={deletingId === selectedCustomer.id}>
                {deletingId === selectedCustomer.id ? "Deleting..." : "Delete"}
              </Button>
              <Button type="button" variant="destructive" onClick={closeModal}>
                Cancel
              </Button>
            </div>
          </div>
        </CrmModalShell>
      ) : null}

      {modalMode === "export" ? (
        <CrmModalShell open title="Export Contacts" description="Download the currently filtered contacts as CSV." onClose={closeModal} maxWidthClassName="max-w-xl">
          <div className="grid gap-3">
            <div className="rounded-2xl border border-border/60 bg-slate-50/70 p-4 text-sm text-muted-foreground">
              Export includes the active search and email filters, not just the current page.
            </div>
            <div className="flex gap-2">
              <Button type="button" onClick={() => void handleExport()} disabled={exporting}>
                {exporting ? "Exporting..." : "Export CSV"}
              </Button>
              <Button type="button" variant="destructive" onClick={closeModal}>
                Cancel
              </Button>
            </div>
          </div>
        </CrmModalShell>
      ) : null}
    </div>
  );
}
