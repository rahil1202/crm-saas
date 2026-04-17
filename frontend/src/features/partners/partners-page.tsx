"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Copy,
  Download,
  Eye,
  EyeOff,
  FileUp,
  HeartHandshake,
  Mail,
  MapPin,
  PencilLine,
  Phone,
  Plus,
  ShieldCheck,
  Trash2,
  UserRound,
  WandSparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  CrmColumnSettings,
  CrmDataTable,
  CrmFilterDrawer,
  CrmListPageHeader,
  CrmListToolbar,
  CrmPaginationBar,
} from "@/components/crm/crm-list-primitives";
import type { ColumnDefinition } from "@/components/crm/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiRequest } from "@/lib/api";
import { getInitials } from "@/lib/auth-ui";
import { loadMe } from "@/lib/me-cache";
import { cn } from "@/lib/utils";
import {
  buildPartnerNotes,
  emptyPartnerMetadata,
  parsePartnerNotes,
  partnerBusinessTypeOptions,
  type PartnerBusinessType,
  type PartnerMetadata,
} from "@/features/partners/partner-metadata";

type Partner = {
  id: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  status: "active" | "inactive";
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

type PartnerListResponse = {
  items: Partner[];
  total: number;
  limit?: number;
  offset?: number;
};

type PartnerUser = {
  id: string;
  partnerCompanyId: string;
  fullName: string;
  email: string;
  phone: string | null;
  title: string | null;
  status: "active" | "inactive";
  accessLevel: "restricted" | "standard" | "manager";
  lastAccessAt?: string | null;
  createdAt: string;
};

type PartnerUserListResponse = {
  items: PartnerUser[];
  total: number;
};

type PartnerTableRow = Partner & {
  metadata: PartnerMetadata;
  accessUsers: number;
  activeUsers: number;
};

type ModalMode = "create" | "edit" | "delete" | "import" | "filter" | null;
type PartnerTab = "all" | "mine";
type PartnerColumnKey =
  | "partner"
  | "businessType"
  | "contact"
  | "email"
  | "phone"
  | "location"
  | "agreements"
  | "status"
  | "users"
  | "createdAt"
  | "updatedAt"
  | "actions";
type PartnerSortKey = Exclude<PartnerColumnKey, "actions" | "agreements">;
type PartnerSortDirection = "asc" | "desc";
type PartnerColumnVisibility = Record<PartnerColumnKey, boolean>;
type PartnerFilters = {
  q: string;
  status: string;
  businessType: string;
  contactName: string;
  email: string;
  country: string;
  state: string;
  city: string;
  ndaSigned: string;
  partnershipAgreement: string;
};
type PartnerFilterKey = keyof PartnerFilters;
type PartnerFilterChip = {
  key: PartnerFilterKey;
  label: string;
  value: string;
};

type PartnerFormState = {
  companyName: string;
  contactName: string;
  email: string;
  password: string;
  businessType: PartnerBusinessType;
  phone: string;
  country: string;
  state: string;
  city: string;
  ndaSigned: boolean;
  partnershipAgreement: boolean;
  status: "active" | "inactive";
  notes: string;
};

const rowsPerPageOptions = [10, 20, 50, 100] as const;
const columnStorageKey = "crm-saas-partners-columns";
const lockedPartnerColumns: Exclude<PartnerColumnKey, "actions">[] = ["partner", "contact"];
const partnerSortKeys: PartnerSortKey[] = [
  "partner",
  "businessType",
  "contact",
  "email",
  "phone",
  "location",
  "status",
  "users",
  "createdAt",
  "updatedAt",
];

const defaultPartnerColumnVisibility: PartnerColumnVisibility = {
  partner: true,
  businessType: true,
  contact: true,
  email: true,
  phone: true,
  location: true,
  agreements: true,
  status: true,
  users: true,
  createdAt: true,
  updatedAt: true,
  actions: true,
};

const emptyPartnerFilters: PartnerFilters = {
  q: "",
  status: "",
  businessType: "",
  contactName: "",
  email: "",
  country: "",
  state: "",
  city: "",
  ndaSigned: "",
  partnershipAgreement: "",
};

const partnerColumnLabels: Record<Exclude<PartnerColumnKey, "actions">, string> = {
  partner: "Partner",
  businessType: "Business Type",
  contact: "Contact Person",
  email: "Email",
  phone: "Phone",
  location: "Location",
  agreements: "Agreements",
  status: "Status",
  users: "Access Users",
  createdAt: "Created",
  updatedAt: "Updated",
};

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Not Available";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Not Available";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function getLocationLabel(metadata: PartnerMetadata) {
  return [metadata.city, metadata.state, metadata.country].filter(Boolean).join(", ");
}

function createEmptyPartnerForm(): PartnerFormState {
  return {
    companyName: "",
    contactName: "",
    email: "",
    password: "",
    businessType: "Solution",
    phone: "",
    country: "",
    state: "",
    city: "",
    ndaSigned: false,
    partnershipAgreement: false,
    status: "active",
    notes: "",
  };
}

function partnerToFormState(partner: Partner): PartnerFormState {
  const metadata = parsePartnerNotes(partner.notes);
  return {
    companyName: metadata.companyName || partner.name,
    contactName: partner.contactName ?? "",
    email: partner.email ?? "",
    password: "",
    businessType: metadata.businessType,
    phone: partner.phone ?? "",
    country: metadata.country,
    state: metadata.state,
    city: metadata.city,
    ndaSigned: metadata.ndaSigned,
    partnershipAgreement: metadata.partnershipAgreement,
    status: partner.status,
    notes: metadata.extraNotes,
  };
}

function buildPartnerPayload(form: PartnerFormState) {
  const metadata: PartnerMetadata = {
    ...emptyPartnerMetadata,
    companyName: form.companyName.trim(),
    businessType: form.businessType,
    country: form.country.trim(),
    state: form.state.trim(),
    city: form.city.trim(),
    ndaSigned: form.ndaSigned,
    partnershipAgreement: form.partnershipAgreement,
    extraNotes: form.notes.trim(),
  };

  return {
    name: form.companyName.trim(),
    contactName: form.contactName.trim() || undefined,
    email: form.email.trim() || undefined,
    password: form.password.trim() || undefined,
    phone: form.phone.trim() || undefined,
    status: form.status,
    notes: buildPartnerNotes(metadata) || undefined,
  };
}

async function loadAllPartners() {
  const items: Partner[] = [];
  let offset = 0;
  const limit = 100;

  for (;;) {
    const data = await apiRequest<PartnerListResponse>(`/partners?limit=${limit}&offset=${offset}`);
    items.push(...data.items);
    if (data.items.length < limit) {
      return items;
    }
    offset += limit;
  }
}

function compareValues(a: string | number, b: string | number, direction: PartnerSortDirection) {
  if (typeof a === "number" && typeof b === "number") {
    return direction === "asc" ? a - b : b - a;
  }

  return direction === "asc"
    ? String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" })
    : String(b).localeCompare(String(a), undefined, { numeric: true, sensitivity: "base" });
}

function Modal({
  title,
  description,
  children,
  onClose,
  headerActions,
  maxWidthClassName = "max-w-5xl",
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
  headerActions?: ReactNode;
  maxWidthClassName?: string;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-950/45 px-4 py-5 backdrop-blur-sm">
      <div className="flex h-full items-start justify-center overflow-y-auto">
        <div
          className={cn(
            "w-full overflow-hidden rounded-[1.5rem] border border-border/70 bg-white shadow-[0_30px_80px_-40px_rgba(15,23,42,0.45)]",
            maxWidthClassName,
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-border/60 px-5 py-4">
            <div>
              <div className="text-base font-semibold text-slate-900">{title}</div>
              {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
            </div>
            <div className="flex items-center gap-2">
              {headerActions}
              <Button type="button" variant="destructive" size="xs" onClick={onClose}>
                <X className="size-4" />
              </Button>
            </div>
          </div>
          <div className="max-h-[calc(100vh-7.5rem)] overflow-y-auto px-5 py-4">{children}</div>
        </div>
      </div>
    </div>
  );
}

export default function PartnersPage() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [partnerUsers, setPartnerUsers] = useState<PartnerUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [selectedPartner, setSelectedPartner] = useState<Partner | null>(null);
  const [form, setForm] = useState<PartnerFormState>(createEmptyPartnerForm);
  const [tab, setTab] = useState<PartnerTab>("all");
  const [filters, setFilters] = useState<PartnerFilters>(emptyPartnerFilters);
  const [filterDraft, setFilterDraft] = useState<PartnerFilters>(emptyPartnerFilters);
  const [sortBy, setSortBy] = useState<PartnerSortKey>("updatedAt");
  const [sortDir, setSortDir] = useState<PartnerSortDirection>("desc");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState<number>(10);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [columnVisibility, setColumnVisibility] = useState<PartnerColumnVisibility>(defaultPartnerColumnVisibility);
  const [columnSettingsOpen, setColumnSettingsOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [partnerRows, partnerUserResponse, me] = await Promise.all([
        loadAllPartners(),
        apiRequest<PartnerUserListResponse>("/partners/users?limit=100"),
        loadMe(),
      ]);

      setPartners(partnerRows);
      setPartnerUsers(partnerUserResponse.items);
      setMyUserId(me.user.id);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to load partners");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(columnStorageKey);
    if (!stored) return;

    try {
      const parsed = JSON.parse(stored) as Partial<PartnerColumnVisibility>;
      setColumnVisibility((current) => {
        const next = { ...current, ...parsed };
        for (const key of lockedPartnerColumns) {
          next[key] = true;
        }
        return next;
      });
    } catch {
      window.localStorage.removeItem(columnStorageKey);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(columnStorageKey, JSON.stringify(columnVisibility));
  }, [columnVisibility]);

  const partnerRows = useMemo<PartnerTableRow[]>(() => {
    const userCounts = new Map<string, { total: number; active: number }>();

    for (const user of partnerUsers) {
      const current = userCounts.get(user.partnerCompanyId) ?? { total: 0, active: 0 };
      current.total += 1;
      if (user.status === "active") current.active += 1;
      userCounts.set(user.partnerCompanyId, current);
    }

    return partners.map((partner) => {
      const metadata = parsePartnerNotes(partner.notes);
      const counts = userCounts.get(partner.id) ?? { total: 0, active: 0 };
      return {
        ...partner,
        metadata,
        accessUsers: counts.total,
        activeUsers: counts.active,
      };
    });
  }, [partners, partnerUsers]);

  const filteredPartners = useMemo(() => {
    const normalizedSearch = filters.q.trim().toLowerCase();

    const rows = partnerRows.filter((partner) => {
      if (tab === "mine" && myUserId && partner.createdBy !== myUserId) return false;
      if (filters.status && partner.status !== filters.status) return false;
      if (filters.businessType && partner.metadata.businessType !== filters.businessType) return false;
      if (filters.contactName && !(partner.contactName ?? "").toLowerCase().includes(filters.contactName.toLowerCase())) return false;
      if (filters.email && !(partner.email ?? "").toLowerCase().includes(filters.email.toLowerCase())) return false;
      if (filters.country && !partner.metadata.country.toLowerCase().includes(filters.country.toLowerCase())) return false;
      if (filters.state && !partner.metadata.state.toLowerCase().includes(filters.state.toLowerCase())) return false;
      if (filters.city && !partner.metadata.city.toLowerCase().includes(filters.city.toLowerCase())) return false;
      if (filters.ndaSigned) {
        const expected = filters.ndaSigned === "yes";
        if (partner.metadata.ndaSigned !== expected) return false;
      }
      if (filters.partnershipAgreement) {
        const expected = filters.partnershipAgreement === "yes";
        if (partner.metadata.partnershipAgreement !== expected) return false;
      }

      if (!normalizedSearch) return true;

      const haystack = [
        partner.name,
        partner.contactName ?? "",
        partner.email ?? "",
        partner.phone ?? "",
        partner.metadata.businessType,
        partner.metadata.country,
        partner.metadata.state,
        partner.metadata.city,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedSearch);
    });

    return [...rows].sort((left, right) => {
      switch (sortBy) {
        case "partner":
          return compareValues(left.name, right.name, sortDir);
        case "businessType":
          return compareValues(left.metadata.businessType, right.metadata.businessType, sortDir);
        case "contact":
          return compareValues(left.contactName ?? "", right.contactName ?? "", sortDir);
        case "email":
          return compareValues(left.email ?? "", right.email ?? "", sortDir);
        case "phone":
          return compareValues(left.phone ?? "", right.phone ?? "", sortDir);
        case "location":
          return compareValues(getLocationLabel(left.metadata), getLocationLabel(right.metadata), sortDir);
        case "status":
          return compareValues(left.status, right.status, sortDir);
        case "users":
          return compareValues(left.accessUsers, right.accessUsers, sortDir);
        case "createdAt":
          return compareValues(new Date(left.createdAt).getTime(), new Date(right.createdAt).getTime(), sortDir);
        case "updatedAt":
          return compareValues(new Date(left.updatedAt).getTime(), new Date(right.updatedAt).getTime(), sortDir);
        default:
          return 0;
      }
    });
  }, [filters, myUserId, partnerRows, sortBy, sortDir, tab]);

  const total = filteredPartners.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const paginatedPartners = filteredPartners.slice((page - 1) * limit, page * limit);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const activeFilterChips = useMemo<PartnerFilterChip[]>(() => {
    const chips: PartnerFilterChip[] = [];
    if (filters.q) chips.push({ key: "q", label: "Search", value: filters.q });
    if (filters.status) chips.push({ key: "status", label: "Status", value: filters.status });
    if (filters.businessType) chips.push({ key: "businessType", label: "Business Type", value: filters.businessType });
    if (filters.contactName) chips.push({ key: "contactName", label: "Contact", value: filters.contactName });
    if (filters.email) chips.push({ key: "email", label: "Email", value: filters.email });
    if (filters.country) chips.push({ key: "country", label: "Country", value: filters.country });
    if (filters.state) chips.push({ key: "state", label: "State", value: filters.state });
    if (filters.city) chips.push({ key: "city", label: "City", value: filters.city });
    if (filters.ndaSigned) chips.push({ key: "ndaSigned", label: "NDA", value: filters.ndaSigned });
    if (filters.partnershipAgreement) chips.push({ key: "partnershipAgreement", label: "Partnership", value: filters.partnershipAgreement });
    return chips;
  }, [filters]);

  const partnerColumns = useMemo<Array<ColumnDefinition<PartnerTableRow, PartnerColumnKey, PartnerSortKey>>>(() => [
    {
      key: "partner",
      label: "Partner",
      sortKey: "partner",
      sortable: true,
      widthClassName: "min-w-[240px]",
      renderCell: (partner) => (
        <Link href={`/dashboard/partners/${partner.id}`} className="group flex items-center gap-3">
          <Avatar className="size-11 border border-border/60 bg-slate-50">
            <AvatarFallback className="bg-primary/10 text-primary">{getInitials(partner.contactName || partner.name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="font-semibold text-slate-900 transition group-hover:text-primary">{partner.contactName || partner.name}</div>
            <div className="truncate text-sm text-muted-foreground">{partner.name}</div>
          </div>
        </Link>
      ),
    },
    {
      key: "businessType",
      label: "Business Type",
      sortKey: "businessType",
      sortable: true,
      renderCell: (partner) => <Badge variant="outline">{partner.metadata.businessType}</Badge>,
    },
    {
      key: "contact",
      label: "Contact Person",
      sortKey: "contact",
      sortable: true,
      renderCell: (partner) => (
        <div className="flex items-center gap-2 text-slate-700">
          <UserRound className="size-4 text-slate-400" />
          <span>{partner.contactName || "Not Available"}</span>
        </div>
      ),
    },
    {
      key: "email",
      label: "Email",
      sortKey: "email",
      sortable: true,
      widthClassName: "min-w-[220px]",
      renderCell: (partner) => (
        <div className="flex items-center gap-2 text-slate-700">
          <Mail className="size-4 text-slate-400" />
          <span className="truncate">{partner.email || "Not Available"}</span>
        </div>
      ),
    },
    {
      key: "phone",
      label: "Phone",
      sortKey: "phone",
      sortable: true,
      renderCell: (partner) => (
        <div className="flex items-center gap-2 text-slate-700">
          <Phone className="size-4 text-slate-400" />
          <span>{partner.phone || "Not Available"}</span>
        </div>
      ),
    },
    {
      key: "location",
      label: "Location",
      sortKey: "location",
      sortable: true,
      widthClassName: "min-w-[220px]",
      renderCell: (partner) => (
        <div className="flex items-center gap-2 text-slate-700">
          <MapPin className="size-4 text-slate-400" />
          <span>{getLocationLabel(partner.metadata) || "Not Available"}</span>
        </div>
      ),
    },
    {
      key: "agreements",
      label: "Agreements",
      renderCell: (partner) => (
        <div className="flex flex-wrap gap-2">
          <Badge variant={partner.metadata.ndaSigned ? "secondary" : "outline"}>{partner.metadata.ndaSigned ? "NDA Signed" : "NDA Pending"}</Badge>
          <Badge variant={partner.metadata.partnershipAgreement ? "secondary" : "outline"}>
            {partner.metadata.partnershipAgreement ? "Partnership Signed" : "Partnership Pending"}
          </Badge>
        </div>
      ),
    },
    {
      key: "status",
      label: "Status",
      sortKey: "status",
      sortable: true,
      renderCell: (partner) => <Badge variant={partner.status === "active" ? "secondary" : "outline"}>{partner.status}</Badge>,
    },
    {
      key: "users",
      label: "Access Users",
      sortKey: "users",
      sortable: true,
      renderCell: (partner) => (
        <div className="flex flex-col">
          <span className="font-medium text-slate-900">{partner.accessUsers}</span>
          <span className="text-xs text-muted-foreground">{partner.activeUsers} active</span>
        </div>
      ),
    },
    {
      key: "createdAt",
      label: "Created",
      sortKey: "createdAt",
      sortable: true,
      renderCell: (partner) => <span>{formatDate(partner.createdAt)}</span>,
    },
    {
      key: "updatedAt",
      label: "Updated",
      sortKey: "updatedAt",
      sortable: true,
      renderCell: (partner) => <span>{formatDate(partner.updatedAt)}</span>,
    },
  ], []);

  const openCreateModal = () => {
    setSelectedPartner(null);
    setForm(createEmptyPartnerForm());
    setModalMode("create");
  };

  const openEditModal = (partner: Partner) => {
    setSelectedPartner(partner);
    setForm(partnerToFormState(partner));
    setModalMode("edit");
  };

  const closeModal = () => {
    setModalMode(null);
    setSelectedPartner(null);
    setForm(createEmptyPartnerForm());
    setShowPassword(false);
  };

  const generateRandomPassword = () => {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
    const specials = "!@#$%^&*";
    const pick = (source: string) => source[Math.floor(Math.random() * source.length)] ?? "";

    const generated = [
      pick("ABCDEFGHJKLMNPQRSTUVWXYZ"),
      pick("abcdefghijkmnopqrstuvwxyz"),
      pick("23456789"),
      pick(specials),
      ...Array.from({ length: 8 }, () => pick(alphabet + specials)),
    ]
      .sort(() => Math.random() - 0.5)
      .join("");

    setForm((current) => ({ ...current, password: generated }));
    setShowPassword(true);
    setError(null);
    toast.success("Random password generated");
  };

  const copyPassword = async () => {
    if (!form.password.trim()) {
      setError("Generate or enter a password first");
      return;
    }

    try {
      await navigator.clipboard.writeText(form.password);
      toast.success("Password copied");
    } catch {
      setError("Unable to copy password");
    }
  };

  const handleSave = async () => {
    if (!form.companyName.trim()) {
      setError("Company name is required");
      return;
    }
    if (!form.contactName.trim()) {
      setError("Contact person is required");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const payload = buildPartnerPayload(form);
      if (modalMode === "edit" && selectedPartner) {
        await apiRequest(`/partners/${selectedPartner.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        toast.success("Partner updated");
      } else {
        await apiRequest("/partners", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        toast.success("Partner created");
      }

      closeModal();
      await loadData();
    } catch (requestError) {
      const message = requestError instanceof ApiError ? requestError.message : "Unable to save partner";
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedPartner) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiRequest(`/partners/${selectedPartner.id}`, { method: "DELETE" });
      toast.success("Partner removed");
      closeModal();
      await loadData();
    } catch (requestError) {
      const message = requestError instanceof ApiError ? requestError.message : "Unable to delete partner";
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleExport = async () => {
    try {
      const rows = filteredPartners.map((partner) => ({
        companyName: partner.name,
        contactPerson: partner.contactName ?? "",
        email: partner.email ?? "",
        phone: partner.phone ?? "",
        businessType: partner.metadata.businessType,
        country: partner.metadata.country,
        state: partner.metadata.state,
        city: partner.metadata.city,
        ndaSigned: partner.metadata.ndaSigned ? "Yes" : "No",
        partnershipAgreement: partner.metadata.partnershipAgreement ? "Yes" : "No",
        status: partner.status,
        createdAt: formatDateTime(partner.createdAt),
        updatedAt: formatDateTime(partner.updatedAt),
      }));

      const headers = Object.keys(rows[0] ?? {
        companyName: "",
        contactPerson: "",
        email: "",
        phone: "",
        businessType: "",
        country: "",
        state: "",
        city: "",
        ndaSigned: "",
        partnershipAgreement: "",
        status: "",
        createdAt: "",
        updatedAt: "",
      });

      const csv = [
        headers.join(","),
        ...rows.map((row) =>
          headers
            .map((header) => `"${String(row[header as keyof typeof row] ?? "").replaceAll('"', '""')}"`)
            .join(","),
        ),
      ].join("\n");

      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "partners.csv";
      link.click();
      URL.revokeObjectURL(url);
      toast.success("Partners exported");
    } catch {
      toast.error("Unable to export partners");
    }
  };

  const applyFilters = () => {
    setFilters(filterDraft);
    setPage(1);
    setModalMode(null);
  };

  const clearFilterDraft = () => {
    setFilterDraft(emptyPartnerFilters);
  };

  const clearAllFilters = () => {
    setFilters(emptyPartnerFilters);
    setFilterDraft(emptyPartnerFilters);
    setPage(1);
  };

  const removeAppliedFilter = (key: PartnerFilterKey) => {
    setFilters((current) => ({ ...current, [key]: "" }));
    setFilterDraft((current) => ({ ...current, [key]: "" }));
    setPage(1);
  };

  const toggleColumn = (key: PartnerColumnKey) => {
    if (lockedPartnerColumns.includes(key as Exclude<PartnerColumnKey, "actions">)) return;
    setColumnVisibility((current) => ({ ...current, [key]: !current[key] }));
  };

  const resetColumns = () => {
    setColumnVisibility(defaultPartnerColumnVisibility);
  };

  const requestSort = (key: PartnerSortKey) => {
    setPage(1);
    if (sortBy === key) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortBy(key);
    setSortDir("asc");
  };

  return (
    <div className="grid gap-5">
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Request failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <CrmListPageHeader
        title="Partners"
        actions={
          <>
            <Button type="button" variant="outline" size="sm" onClick={handleExport}>
              <Download className="size-4" /> Export
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => setModalMode("import")}>
              <FileUp className="size-4" /> Import
            </Button>
            <Button type="button" size="sm" onClick={openCreateModal}>
              <Plus className="size-4" /> Add Partner
            </Button>
          </>
        }
      />

      <section className="overflow-hidden rounded-[1.75rem] border border-border/70 bg-white shadow-[0_24px_60px_-40px_rgba(15,23,42,0.35)]">
        <div className="px-4 pt-3">
          <Tabs value={tab} onValueChange={(value) => { setTab(value as PartnerTab); setPage(1); }}>
            <TabsList variant="line" className="border-b border-border/60 p-0">
              <TabsTrigger value="all" className="rounded-none px-4 py-3 text-sm">
                Partner List
              </TabsTrigger>
              <TabsTrigger value="mine" className="rounded-none px-4 py-3 text-sm">
                Added By Me
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <CrmListToolbar
          searchValue={filters.q}
          searchPlaceholder="Search by company, contact person, email, phone, or location"
          onSearchChange={(value) => {
            setPage(1);
            setFilters((current) => ({ ...current, q: value }));
            setFilterDraft((current) => ({ ...current, q: value }));
          }}
          onOpenFilters={() => setModalMode("filter")}
          filterCount={activeFilterChips.length}
          onOpenColumns={() => setColumnSettingsOpen(true)}
          onRefresh={() => void loadData()}
          extraContent={
            <div className="rounded-lg border bg-white px-3 py-2 text-sm text-muted-foreground">
              {tab === "mine" ? `${filteredPartners.length} partners created by you` : `${filteredPartners.length} partners in workspace`}
            </div>
          }
        />

        <div className="grid gap-3 border-b border-border/60 bg-gradient-to-r from-slate-50 via-white to-sky-50/70 px-4 py-4">
          <div className="flex flex-wrap gap-2">
            {activeFilterChips.length ? (
              activeFilterChips.map((chip) => (
                <button
                  key={`${chip.key}-${chip.value}`}
                  type="button"
                  onClick={() => removeAppliedFilter(chip.key)}
                  className="inline-flex items-center gap-2 rounded-full border border-sky-100 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-sky-200 hover:text-sky-700"
                >
                  <span>{chip.label}: {chip.value}</span>
                  <X className="size-3.5" />
                </button>
              ))
            ) : (
              <div className="text-xs text-muted-foreground">No active filters.</div>
            )}
            {activeFilterChips.length ? (
              <Button type="button" variant="ghost" size="sm" className="h-7 rounded-full px-3 text-xs" onClick={clearAllFilters}>
                Clear all
              </Button>
            ) : null}
          </div>
        </div>

        <CrmDataTable
          columns={partnerColumns}
          rows={paginatedPartners}
          rowKey={(partner) => partner.id}
          loading={loading}
          emptyLabel={tab === "mine" ? "You have not added any partners yet." : "No partners found."}
          columnVisibility={columnVisibility}
          sortBy={sortBy}
          sortDir={sortDir}
          onSort={requestSort}
          actionColumn={{
            header: "Actions",
            renderCell: (partner) => (
              <div className="flex items-center gap-2">
                <Link href={`/dashboard/partners/${partner.id}`} className="inline-flex size-8 items-center justify-center rounded-lg border border-border/60 text-slate-700 transition hover:bg-slate-50">
                  <HeartHandshake className="size-4" />
                </Link>
                <Button type="button" variant="ghost" size="icon" className="size-8 rounded-lg" onClick={() => openEditModal(partner)}>
                  <PencilLine className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 rounded-lg text-rose-600 hover:text-rose-700"
                  onClick={() => {
                    setSelectedPartner(partner);
                    setModalMode("delete");
                  }}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ),
          }}
        />

        <CrmPaginationBar
          limit={limit}
          onLimitChange={(value) => {
            setLimit(value);
            setPage(1);
          }}
          rowsPerPageOptions={rowsPerPageOptions}
          total={total}
          page={page}
          totalPages={totalPages}
          onPrev={() => setPage((current) => Math.max(1, current - 1))}
          onNext={() => setPage((current) => Math.min(totalPages, current + 1))}
        />
      </section>

      {(modalMode === "create" || modalMode === "edit") ? (
        <Modal
          title={modalMode === "edit" ? "Edit Partner" : "Add Partner"}
          description="Capture the partner company, primary contact, location, and agreement details."
          onClose={closeModal}
          headerActions={
            <>
              {/* <Button type="button" variant="destructive" size="xs" onClick={closeModal}>
                Close
              </Button> */}
              <Button type="button" size="xs" disabled={submitting} onClick={() => void handleSave()}>
                {submitting ? "Saving..." : "Save"}
              </Button>
            </>
          }
          maxWidthClassName="max-w-6xl"
        >
          <div className="grid gap-5">
            <div className="grid gap-4 rounded-2xl border border-border/60 bg-white p-4">
              <div className="text-sm font-semibold text-slate-900">Basic Information</div>
              <FieldGroup className="grid gap-4 md:grid-cols-2">
                <Field className="md:col-span-2">
                  <FieldLabel>Partner Company *</FieldLabel>
                  <Input
                    value={form.companyName}
                    onChange={(event) => setForm((current) => ({ ...current, companyName: event.target.value }))}
                    className="h-10 text-sm"
                    placeholder="eg: The One Branding"
                  />
                </Field>
                <Field>
                  <FieldLabel>Email *</FieldLabel>
                  <Input
                    value={form.email}
                    onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                    className="h-10 text-sm"
                    placeholder="eg: anmol@gmail.com"
                    type="email"
                  />
                </Field>
                <Field>
                  <FieldLabel>Password</FieldLabel>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input
                        value={form.password}
                        onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                        className="h-10 pr-20 text-sm"
                        placeholder="Create a login password"
                        type={showPassword ? "text" : "password"}
                      />
                      <div className="absolute inset-y-0 right-2 flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setShowPassword((current) => !current)}
                          className="inline-flex size-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                          aria-label={showPassword ? "Hide password" : "Show password"}
                        >
                          {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => void copyPassword()}
                          className="inline-flex size-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                          aria-label="Copy password"
                        >
                          <Copy className="size-4" />
                        </button>
                      </div>
                    </div>
                    <Button type="button" variant="outline" className="h-10 shrink-0" onClick={generateRandomPassword}>
                      <WandSparkles className="size-4" />
                      Generate
                    </Button>
                  </div>
                  <FieldDescription>Only required when this email does not already have an existing partner login.</FieldDescription>
                </Field>
                <Field className="md:col-span-2">
                  <FieldLabel>Business Type *</FieldLabel>
                  <NativeSelect
                    value={form.businessType}
                    onChange={(event) => setForm((current) => ({ ...current, businessType: event.target.value as PartnerBusinessType }))}
                    className="h-10 rounded-xl px-3 text-sm"
                  >
                    {partnerBusinessTypeOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field>
                  <FieldLabel>Contact Person *</FieldLabel>
                  <Input
                    value={form.contactName}
                    onChange={(event) => setForm((current) => ({ ...current, contactName: event.target.value }))}
                    className="h-10 text-sm"
                    placeholder="eg: Anmol"
                  />
                </Field>
                <Field>
                  <FieldLabel>Phone</FieldLabel>
                  <Input
                    value={form.phone}
                    onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                    className="h-10 text-sm"
                    placeholder="eg: 9876543210"
                  />
                </Field>
                <Field>
                  <FieldLabel>Country</FieldLabel>
                  <Input
                    value={form.country}
                    onChange={(event) => setForm((current) => ({ ...current, country: event.target.value }))}
                    className="h-10 text-sm"
                    placeholder="eg: India"
                  />
                </Field>
                <Field>
                  <FieldLabel>State</FieldLabel>
                  <Input
                    value={form.state}
                    onChange={(event) => setForm((current) => ({ ...current, state: event.target.value }))}
                    className="h-10 text-sm"
                    placeholder="eg: Maharashtra"
                  />
                </Field>
                <Field>
                  <FieldLabel>City</FieldLabel>
                  <Input
                    value={form.city}
                    onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))}
                    className="h-10 text-sm"
                    placeholder="eg: Mumbai"
                  />
                </Field>
                <Field>
                  <FieldLabel>Status</FieldLabel>
                  <NativeSelect
                    value={form.status}
                    onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as "active" | "inactive" }))}
                    className="h-10 rounded-xl px-3 text-sm"
                  >
                    <option value="active">active</option>
                    <option value="inactive">inactive</option>
                  </NativeSelect>
                </Field>
                <Field className="md:col-span-2">
                  <FieldLabel>Agreements</FieldLabel>
                  <div className="grid gap-3 rounded-2xl border border-border/60 bg-slate-50/60 p-4 md:grid-cols-2">
                    <label className="flex items-center gap-3 text-sm text-slate-700">
                      <Checkbox
                        checked={form.ndaSigned}
                        onCheckedChange={(checked) => setForm((current) => ({ ...current, ndaSigned: checked === true }))}
                      />
                      NDA Signed
                    </label>
                    <label className="flex items-center gap-3 text-sm text-slate-700">
                      <Checkbox
                        checked={form.partnershipAgreement}
                        onCheckedChange={(checked) => setForm((current) => ({ ...current, partnershipAgreement: checked === true }))}
                      />
                      Partnership Agreement
                    </label>
                  </div>
                </Field>
                <Field className="md:col-span-2">
                  <FieldLabel>Notes</FieldLabel>
                  <Textarea
                    value={form.notes}
                    onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                    className="min-h-32 text-sm"
                    placeholder="Add extra notes about the partner"
                  />
                </Field>
              </FieldGroup>
            </div>
          </div>
        </Modal>
      ) : null}

      {modalMode === "import" ? (
        <Modal
          title="Import Partners"
          description="Partner CSV import will be wired in the next backend pass."
          onClose={closeModal}
          maxWidthClassName="max-w-xl"
        >
          <Alert>
            <AlertTitle>Import pending</AlertTitle>
            <AlertDescription>
              The list, filters, add modal, export flow, and profile page are now in place. Bulk partner import is still pending backend support.
            </AlertDescription>
          </Alert>
        </Modal>
      ) : null}

      {modalMode === "delete" && selectedPartner ? (
        <Modal
          title="Delete Partner"
          description={`Remove ${selectedPartner.name} from the workspace.`}
          onClose={closeModal}
          maxWidthClassName="max-w-xl"
        >
          <div className="grid gap-3">
            <p className="text-sm text-muted-foreground">This action cannot be undone.</p>
            <div className="flex gap-2">
              <Button type="button" variant="destructive" onClick={() => void handleDelete()} disabled={submitting}>
                {submitting ? "Deleting..." : "Delete"}
              </Button>
              <Button type="button" variant="destructive" onClick={closeModal}>
                Cancel
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}

      <CrmFilterDrawer
        open={modalMode === "filter"}
        title="Filter"
        description="Shape the partner table with focused filters."
        onClose={closeModal}
        onClear={clearFilterDraft}
        onApply={applyFilters}
      >
        <div className="grid gap-4">
          <div className="grid gap-4 rounded-[1.35rem] border border-border/60 bg-slate-50/70 p-4">
            <div className="text-sm font-semibold text-slate-900">Search</div>
            <Field>
              <FieldLabel>Search term</FieldLabel>
              <Input
                value={filterDraft.q}
                onChange={(event) => setFilterDraft((current) => ({ ...current, q: event.target.value }))}
                className="h-10 text-sm"
                placeholder="Company, contact, email, phone, or location"
              />
            </Field>
            <Field>
              <FieldLabel>Contact Person</FieldLabel>
              <Input
                value={filterDraft.contactName}
                onChange={(event) => setFilterDraft((current) => ({ ...current, contactName: event.target.value }))}
                className="h-10 text-sm"
                placeholder="Filter by contact name"
              />
            </Field>
            <Field>
              <FieldLabel>Email</FieldLabel>
              <Input
                value={filterDraft.email}
                onChange={(event) => setFilterDraft((current) => ({ ...current, email: event.target.value }))}
                className="h-10 text-sm"
                placeholder="Filter by email"
              />
            </Field>
          </div>

          <div className="grid gap-4 rounded-[1.35rem] border border-border/60 bg-white p-4">
            <div className="text-sm font-semibold text-slate-900">Partner details</div>
            <Field>
              <FieldLabel>Status</FieldLabel>
              <NativeSelect
                value={filterDraft.status}
                onChange={(event) => setFilterDraft((current) => ({ ...current, status: event.target.value }))}
                className="h-10 rounded-xl px-3 text-sm"
              >
                <option value="">All statuses</option>
                <option value="active">active</option>
                <option value="inactive">inactive</option>
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel>Business Type</FieldLabel>
              <NativeSelect
                value={filterDraft.businessType}
                onChange={(event) => setFilterDraft((current) => ({ ...current, businessType: event.target.value }))}
                className="h-10 rounded-xl px-3 text-sm"
              >
                <option value="">All business types</option>
                {partnerBusinessTypeOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel>Country</FieldLabel>
              <Input
                value={filterDraft.country}
                onChange={(event) => setFilterDraft((current) => ({ ...current, country: event.target.value }))}
                className="h-10 text-sm"
                placeholder="Country"
              />
            </Field>
            <Field>
              <FieldLabel>State</FieldLabel>
              <Input
                value={filterDraft.state}
                onChange={(event) => setFilterDraft((current) => ({ ...current, state: event.target.value }))}
                className="h-10 text-sm"
                placeholder="State"
              />
            </Field>
            <Field>
              <FieldLabel>City</FieldLabel>
              <Input
                value={filterDraft.city}
                onChange={(event) => setFilterDraft((current) => ({ ...current, city: event.target.value }))}
                className="h-10 text-sm"
                placeholder="City"
              />
            </Field>
          </div>

          <div className="grid gap-4 rounded-[1.35rem] border border-border/60 bg-white p-4">
            <div className="text-sm font-semibold text-slate-900">Agreements</div>
            <Field>
              <FieldLabel>NDA Signed</FieldLabel>
              <NativeSelect
                value={filterDraft.ndaSigned}
                onChange={(event) => setFilterDraft((current) => ({ ...current, ndaSigned: event.target.value }))}
                className="h-10 rounded-xl px-3 text-sm"
              >
                <option value="">Any</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel>Partnership Agreement</FieldLabel>
              <NativeSelect
                value={filterDraft.partnershipAgreement}
                onChange={(event) => setFilterDraft((current) => ({ ...current, partnershipAgreement: event.target.value }))}
                className="h-10 rounded-xl px-3 text-sm"
              >
                <option value="">Any</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </NativeSelect>
            </Field>
          </div>
        </div>
      </CrmFilterDrawer>

      <CrmColumnSettings
        open={columnSettingsOpen}
        description="Choose which partner columns stay visible in the table."
        columns={partnerColumns.map((column) => ({ key: column.key, label: partnerColumnLabels[column.key as Exclude<PartnerColumnKey, "actions">] ?? column.label }))}
        columnVisibility={columnVisibility}
        lockedColumns={lockedPartnerColumns}
        onToggleColumn={toggleColumn}
        onReset={resetColumns}
        onClose={() => setColumnSettingsOpen(false)}
      />
    </div>
  );
}
