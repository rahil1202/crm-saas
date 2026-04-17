"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Download, Plus, Upload, UserCog } from "lucide-react";
import { toast } from "sonner";

import {
  CrmColumnSettings,
  CrmDataTable,
  CrmFilterDrawer,
  CrmListPageHeader,
  CrmListToolbar,
  CrmListViewTabs,
  CrmPaginationBar,
} from "@/components/crm/crm-list-primitives";
import type { ColumnDefinition, ColumnVisibility, CrmListTabKey } from "@/components/crm/types";
import { useCrmListState } from "@/components/crm/use-crm-list-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiRequest } from "@/lib/api";
import { getInitials } from "@/lib/auth-ui";
import type { AuthMePayload } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

type CompanyRole = "owner" | "admin" | "member";
type MembershipStatus = "active" | "disabled";

type TeamSortKey = "name" | "email" | "role" | "phone" | "totalLeads" | "status" | "country" | "admin" | "createdAt";
type TeamColumnKey = TeamSortKey | "actions";
type TeamDataColumnKey = Exclude<TeamColumnKey, "actions">;

type InviteSortKey = "email" | "role" | "status" | "expiresAt";
type InviteColumnKey = InviteSortKey;

type RoleSortKey = "name" | "modules" | "createdAt";
type RoleColumnKey = RoleSortKey | "actions";
type RoleDataColumnKey = Exclude<RoleColumnKey, "actions">;

type TeamFilters = {
  q: string;
  role: string;
  status: string;
  storeId: string;
  admin: string;
  createdFrom: string;
};

type TeamFilterKey = keyof TeamFilters;

type TeamFilterChip = {
  key: TeamFilterKey;
  label: string;
  value: string;
};

interface CompanySnapshot {
  company: {
    id: string;
    name: string;
    timezone: string;
    currency: string;
    createdAt: string;
    updatedAt: string;
  };
  stores: Array<{
    id: string;
    name: string;
    code?: string;
    isDefault?: boolean;
  }>;
  members: Array<{
    membershipId: string;
    userId: string;
    role: CompanyRole;
    customRoleId: string | null;
    customRoleName: string | null;
    status: string;
    storeId: string | null;
    storeName: string | null;
    email: string;
    fullName: string | null;
    createdAt: string;
  }>;
  invites: Array<{
    inviteId: string;
    email: string;
    role: CompanyRole;
    status: string;
    storeId: string | null;
    storeName: string | null;
    expiresAt: string;
  }>;
  customRoles?: Array<{
    id: string;
    name: string;
    modules: string[];
    createdAt: string;
    updatedAt: string;
  }>;
}

type TeamRow = {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  role: CompanyRole;
  customRoleId: string | null;
  customRoleName: string | null;
  phone: string;
  totalLeads: string;
  status: MembershipStatus;
  country: string;
  admin: "Yes" | "No";
  createdAt: string;
  storeId: string | null;
  storeName: string | null;
};

type InviteRow = {
  inviteId: string;
  email: string;
  role: CompanyRole;
  status: string;
  storeName: string | null;
  expiresAt: string;
};

type RoleDefinition = {
  id: string;
  name: string;
  modules: string[];
  createdAt: string;
  updatedAt: string;
};

type RoleEditorState = {
  id: string | null;
  name: string;
  modules: string[];
};

const rowsPerPageOptions = [10, 20, 50] as const;
const teamColumnStorageKey = "crm-saas-team-columns";
const rolesColumnStorageKey = "crm-saas-team-roles-columns";

const emptyTeamFilters: TeamFilters = {
  q: "",
  role: "",
  status: "",
  storeId: "",
  admin: "",
  createdFrom: "",
};

const teamColumnLabels: Record<TeamSortKey, string> = {
  name: "Name",
  email: "Email",
  role: "Role",
  phone: "Phone",
  totalLeads: "Total Leads",
  status: "Status Count",
  country: "Country",
  admin: "Admin",
  createdAt: "Created At",
};

const inviteColumnLabels: Record<InviteSortKey, string> = {
  email: "Email",
  role: "Role",
  status: "Status",
  expiresAt: "Expires At",
};

const defaultTeamColumnVisibility: ColumnVisibility<TeamDataColumnKey> = {
  name: true,
  email: true,
  role: true,
  phone: true,
  totalLeads: true,
  status: true,
  country: true,
  admin: true,
  createdAt: true,
};

const lockedTeamColumns: TeamDataColumnKey[] = ["name", "email"];

const defaultRoleColumnVisibility: ColumnVisibility<RoleDataColumnKey> = {
  name: true,
  modules: true,
  createdAt: true,
};

const inviteColumnVisibility: ColumnVisibility<InviteColumnKey> = {
  email: true,
  role: true,
  status: true,
  expiresAt: true,
};

const teamColumnOrder: TeamColumnKey[] = [
  "name",
  "email",
  "role",
  "phone",
  "totalLeads",
  "status",
  "country",
  "admin",
  "createdAt",
  "actions",
];

const roleColumnOrder: RoleColumnKey[] = ["name", "modules", "createdAt", "actions"];

const roleModuleOptions = [
  { key: "contacts", label: "Contacts" },
  { key: "leads", label: "Leads" },
  { key: "deals", label: "Deals" },
  { key: "templates", label: "Templates" },
  { key: "teams", label: "Teams" },
  { key: "tasks", label: "Tasks" },
  { key: "campaigns", label: "Campaigns" },
  { key: "reports", label: "Reports" },
  { key: "settings", label: "Settings" },
] as const;

const roleModuleLabelByKey = roleModuleOptions.reduce<Record<string, string>>((acc, item) => {
  acc[item.key] = item.label;
  return acc;
}, {});

function formatDate(value: string) {
  return new Date(value).toLocaleDateString();
}

function compareValues(left: string | number, right: string | number, direction: "asc" | "desc") {
  if (typeof left === "number" && typeof right === "number") {
    return direction === "asc" ? left - right : right - left;
  }

  const comparison = String(left).localeCompare(String(right), undefined, {
    numeric: true,
    sensitivity: "base",
  });
  return direction === "asc" ? comparison : -comparison;
}

function getTeamSortValue(row: TeamRow, key: TeamSortKey) {
  switch (key) {
    case "name":
      return row.name;
    case "email":
      return row.email;
    case "role":
      return row.role;
    case "phone":
      return row.phone;
    case "totalLeads":
      return Number(row.totalLeads) || 0;
    case "status":
      return row.status;
    case "country":
      return row.country;
    case "admin":
      return row.admin;
    case "createdAt":
      return new Date(row.createdAt).getTime();
    default:
      return "";
  }
}

function getRoleSortValue(role: RoleDefinition, key: RoleSortKey) {
  switch (key) {
    case "name":
      return role.name;
    case "modules":
      return role.modules.length;
    case "createdAt":
      return new Date(role.createdAt).getTime();
    default:
      return "";
  }
}

function getInviteSortValue(row: InviteRow, key: InviteSortKey) {
  switch (key) {
    case "email":
      return row.email;
    case "role":
      return row.role;
    case "status":
      return row.status;
    case "expiresAt":
      return new Date(row.expiresAt).getTime();
    default:
      return "";
  }
}

function readTeamFiltersFromSearchParams(params: Pick<URLSearchParams, "get">): TeamFilters {
  return {
    q: params.get("q") ?? "",
    role: params.get("role") ?? "",
    status: params.get("status") ?? "",
    storeId: params.get("storeId") ?? "",
    admin: params.get("admin") ?? "",
    createdFrom: params.get("createdFrom") ?? "",
  };
}

function writeTeamFiltersToSearchParams(params: URLSearchParams, filters: TeamFilters) {
  if (filters.q.trim()) params.set("q", filters.q.trim());
  if (filters.role.trim()) params.set("role", filters.role.trim());
  if (filters.status.trim()) params.set("status", filters.status.trim());
  if (filters.storeId.trim()) params.set("storeId", filters.storeId.trim());
  if (filters.admin.trim()) params.set("admin", filters.admin.trim());
  if (filters.createdFrom.trim()) params.set("createdFrom", filters.createdFrom.trim());
}

function normalizeTeamSortKey(value: string | null): TeamSortKey {
  const allowed: TeamSortKey[] = ["name", "email", "role", "phone", "totalLeads", "status", "country", "admin", "createdAt"];
  return allowed.includes(value as TeamSortKey) ? (value as TeamSortKey) : "createdAt";
}

function getTeamFilterChips(filters: TeamFilters, stores: CompanySnapshot["stores"]): TeamFilterChip[] {
  const chips: TeamFilterChip[] = [];
  if (filters.q.trim()) chips.push({ key: "q", label: "Search", value: filters.q.trim() });
  if (filters.role.trim()) chips.push({ key: "role", label: "Role", value: filters.role.trim() });
  if (filters.status.trim()) chips.push({ key: "status", label: "Status", value: filters.status.trim() });
  if (filters.admin.trim()) chips.push({ key: "admin", label: "Admin", value: filters.admin.trim() });
  if (filters.createdFrom.trim()) chips.push({ key: "createdFrom", label: "Created From", value: filters.createdFrom.trim() });
  if (filters.storeId.trim()) {
    const storeLabel = stores.find((store) => store.id === filters.storeId)?.name ?? "Branch";
    chips.push({ key: "storeId", label: "Branch", value: storeLabel });
  }
  return chips;
}

function toCsvCell(value: string | null | undefined) {
  const raw = value ?? "";
  return /[",\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

function buildTeamsCsv(items: TeamRow[]) {
  return [
    ["name", "email", "role", "phone", "total_leads", "status", "country", "admin", "created_at", "branch"],
    ...items.map((row) => [
      row.name,
      row.email,
      row.role,
      row.phone,
      row.totalLeads,
      row.status,
      row.country,
      row.admin,
      row.createdAt,
      row.storeName ?? "Company-wide",
    ]),
  ]
    .map((line) => line.map((cell) => toCsvCell(cell)).join(","))
    .join("\n");
}

function buildInvitesCsv(items: InviteRow[]) {
  return [["email", "role", "status", "branch", "expires_at"], ...items.map((row) => [row.email, row.role, row.status, row.storeName ?? "Company-wide", row.expiresAt])]
    .map((line) => line.map((cell) => toCsvCell(cell)).join(","))
    .join("\n");
}

function normalizeMembershipStatus(value: string): MembershipStatus {
  return value === "disabled" ? "disabled" : "active";
}

function Modal({
  title,
  description,
  children,
  onClose,
  headerActions,
  maxWidthClassName = "max-w-3xl",
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
            <div className="flex items-center gap-2">{headerActions}</div>
          </div>
          <div className="max-h-[calc(100vh-7.5rem)] overflow-y-auto px-5 py-4">{children}</div>
        </div>
      </div>
    </div>
  );
}

export default function TeamPage() {
  const [me, setMe] = useState<AuthMePayload | null>(null);
  const [snapshot, setSnapshot] = useState<CompanySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteFullName, setInviteFullName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePhoneNumber, setInvitePhoneNumber] = useState("");
  const [inviteAddress, setInviteAddress] = useState("");
  const [inviteGovernmentId, setInviteGovernmentId] = useState("");
  const [inviteRemark, setInviteRemark] = useState("");
  const [inviteRoleSelection, setInviteRoleSelection] = useState("member");
  const [inviteStoreId, setInviteStoreId] = useState("");
  const [sendingInvite, setSendingInvite] = useState(false);

  const [memberModalOpen, setMemberModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamRow | null>(null);
  const [memberRoleDraft, setMemberRoleDraft] = useState<CompanyRole>("member");
  const [memberCustomRoleIdDraft, setMemberCustomRoleIdDraft] = useState("");
  const [memberStatusDraft, setMemberStatusDraft] = useState<MembershipStatus>("active");
  const [savingMember, setSavingMember] = useState(false);

  const [roles, setRoles] = useState<RoleDefinition[]>([]);
  const [rolesSearch, setRolesSearch] = useState("");
  const [rolesFilterModule, setRolesFilterModule] = useState("");
  const [rolesFilterDraftModule, setRolesFilterDraftModule] = useState("");
  const [rolesFilterOpen, setRolesFilterOpen] = useState(false);
  const [rolesColumnSettingsOpen, setRolesColumnSettingsOpen] = useState(false);
  const [rolesColumnVisibility, setRolesColumnVisibility] =
    useState<ColumnVisibility<RoleDataColumnKey>>(defaultRoleColumnVisibility);
  const [roleSortBy, setRoleSortBy] = useState<RoleSortKey>("name");
  const [roleSortDir, setRoleSortDir] = useState<"asc" | "desc">("asc");
  const [roleEditorOpen, setRoleEditorOpen] = useState(false);
  const [roleEditor, setRoleEditor] = useState<RoleEditorState>({ id: null, name: "", modules: [] });

  const [teamFilterOpen, setTeamFilterOpen] = useState(false);
  const [teamColumnSettingsOpen, setTeamColumnSettingsOpen] = useState(false);

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
  } = useCrmListState<TeamFilters, TeamSortKey, TeamDataColumnKey>({
    defaultFilters: emptyTeamFilters,
    defaultSortBy: "createdAt",
    defaultSortDir: "desc",
    defaultLimit: rowsPerPageOptions[0],
    rowsPerPageOptions,
    parseFilters: readTeamFiltersFromSearchParams,
    writeFilters: writeTeamFiltersToSearchParams,
    normalizeSortBy: normalizeTeamSortKey,
    columnStorageKey: teamColumnStorageKey,
    defaultColumnVisibility: defaultTeamColumnVisibility,
    lockedColumns: lockedTeamColumns,
  });

  const loadRoles = useCallback(async () => {
    const response = await apiRequest<{ roles: RoleDefinition[] }>("/companies/current/roles");
    setRoles(response.roles);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [mePayload, companyPayload, rolesPayload] = await Promise.all([
        apiRequest<AuthMePayload>("/auth/me"),
        apiRequest<CompanySnapshot>("/companies/current"),
        apiRequest<{ roles: RoleDefinition[] }>("/companies/current/roles"),
      ]);
      setMe(mePayload);
      setSnapshot(companyPayload);
      setRoles(rolesPayload.roles);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to load team data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const storedColumns = window.localStorage.getItem(rolesColumnStorageKey);
    if (storedColumns) {
      try {
        const parsed = JSON.parse(storedColumns) as Partial<ColumnVisibility<RoleDataColumnKey>>;
        setRolesColumnVisibility((current) => ({ ...current, ...parsed }));
      } catch {
        window.localStorage.removeItem(rolesColumnStorageKey);
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(rolesColumnStorageKey, JSON.stringify(rolesColumnVisibility));
  }, [rolesColumnVisibility]);

  const teamRows = useMemo<TeamRow[]>(() => {
    return (snapshot?.members ?? []).map((member) => ({
      membershipId: member.membershipId,
      userId: member.userId,
      name: member.fullName?.trim() || member.email,
      email: member.email,
      role: member.role,
      customRoleId: member.customRoleId,
      customRoleName: member.customRoleName,
      phone: "-",
      totalLeads: "0",
      status: normalizeMembershipStatus(member.status),
      country: "-",
      admin: member.role === "owner" || member.role === "admin" ? "Yes" : "No",
      createdAt: member.createdAt,
      storeId: member.storeId,
      storeName: member.storeName,
    }));
  }, [snapshot?.members]);

  const inviteRows = useMemo<InviteRow[]>(() => {
    return (snapshot?.invites ?? []).map((invite) => ({
      inviteId: invite.inviteId,
      email: invite.email,
      role: invite.role,
      status: invite.status,
      storeName: invite.storeName,
      expiresAt: invite.expiresAt,
    }));
  }, [snapshot?.invites]);

  const isTeamsTab = tab === "all";
  const isInvitedTab = tab === "mine";
  const isRolesTab = tab === "documents";

  const filteredTeamRows = useMemo(() => {
    if (!isTeamsTab) {
      return [];
    }

    const q = filters.q.trim().toLowerCase();
    return teamRows.filter((row) => {
      if (q) {
        const haystack = `${row.name} ${row.email} ${row.role} ${row.customRoleName ?? ""} ${row.status} ${row.storeName ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) {
          return false;
        }
      }

      if (filters.role && row.role !== filters.role) {
        return false;
      }

      if (filters.status && row.status !== filters.status) {
        return false;
      }

      if (filters.storeId && row.storeId !== filters.storeId) {
        return false;
      }

      if (filters.admin && row.admin.toLowerCase() !== filters.admin.toLowerCase()) {
        return false;
      }

      if (filters.createdFrom) {
        const selectedDate = new Date(filters.createdFrom);
        const createdDate = new Date(row.createdAt);
        if (createdDate < selectedDate) {
          return false;
        }
      }

      return true;
    });
  }, [filters, isTeamsTab, teamRows]);

  const filteredInviteRows = useMemo(() => {
    if (!isInvitedTab) {
      return [];
    }

    const q = filters.q.trim().toLowerCase();
    return inviteRows.filter((row) => {
      if (q) {
        const haystack = `${row.email} ${row.role} ${row.status} ${row.storeName ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) {
          return false;
        }
      }

      if (filters.role && row.role !== filters.role) {
        return false;
      }

      if (filters.status && row.status !== filters.status) {
        return false;
      }

      if (filters.storeId) {
        const storeName = snapshot?.stores.find((store) => store.id === filters.storeId)?.name;
        if ((row.storeName ?? "") !== (storeName ?? "")) {
          return false;
        }
      }

      return true;
    });
  }, [filters.q, filters.role, filters.status, filters.storeId, inviteRows, isInvitedTab, snapshot?.stores]);

  const sortedTeamRows = useMemo(() => {
    const next = [...filteredTeamRows];
    next.sort((left, right) => compareValues(getTeamSortValue(left, sortBy), getTeamSortValue(right, sortBy), sortDir));
    return next;
  }, [filteredTeamRows, sortBy, sortDir]);

  const sortedInviteRows = useMemo(() => {
    const next = [...filteredInviteRows];
    next.sort((left, right) => compareValues(getInviteSortValue(left, "expiresAt"), getInviteSortValue(right, "expiresAt"), "asc"));
    return next;
  }, [filteredInviteRows]);

  const totalTeamRows = isInvitedTab ? sortedInviteRows.length : sortedTeamRows.length;
  const totalTeamPages = Math.max(1, Math.ceil(totalTeamRows / limit));
  const paginatedTeamRows = useMemo<TeamRow[]>(() => {
    if (!isTeamsTab) {
      return [];
    }
    const start = (page - 1) * limit;
    return sortedTeamRows.slice(start, start + limit);
  }, [isTeamsTab, limit, page, sortedTeamRows]);

  const paginatedInviteRows = useMemo<InviteRow[]>(() => {
    if (!isInvitedTab) {
      return [];
    }
    const start = (page - 1) * limit;
    return sortedInviteRows.slice(start, start + limit);
  }, [isInvitedTab, limit, page, sortedInviteRows]);

  useEffect(() => {
    if (page > totalTeamPages) {
      setPage(totalTeamPages);
    }
  }, [page, setPage, totalTeamPages]);

  const activeTeamFilterChips = useMemo(
    () => getTeamFilterChips(filters, snapshot?.stores ?? []),
    [filters, snapshot?.stores],
  );

  const pendingInviteCount = useMemo(
    () => snapshot?.invites.filter((invite) => invite.status === "pending").length ?? 0,
    [snapshot?.invites],
  );

  const roleFilterCount = rolesFilterModule ? 1 : 0;

  const filteredRoles = useMemo(() => {
    const searchNeedle = rolesSearch.trim().toLowerCase();
    const moduleNeedle = rolesFilterModule.trim().toLowerCase();

    return roles.filter((role) => {
      if (searchNeedle) {
        const haystack = `${role.name} ${role.modules.join(" ")}`.toLowerCase();
        if (!haystack.includes(searchNeedle)) {
          return false;
        }
      }

      if (moduleNeedle) {
        const hasModule = role.modules.some((moduleName) => moduleName.toLowerCase() === moduleNeedle);
        if (!hasModule) {
          return false;
        }
      }

      return true;
    });
  }, [roles, rolesFilterModule, rolesSearch]);

  const sortedRoles = useMemo(() => {
    const next = [...filteredRoles];
    next.sort((left, right) => compareValues(getRoleSortValue(left, roleSortBy), getRoleSortValue(right, roleSortBy), roleSortDir));
    return next;
  }, [filteredRoles, roleSortBy, roleSortDir]);

  const handleTeamSort = (key: TeamSortKey) => {
    requestSort(key, key === "createdAt" ? "desc" : "asc");
  };

  const handleRoleSort = (key: RoleSortKey) => {
    if (roleSortBy === key) {
      setRoleSortDir((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setRoleSortBy(key);
    setRoleSortDir(key === "createdAt" ? "desc" : "asc");
  };

  const openInviteModal = async () => {
    try {
      await loadRoles();
    } catch {
      // Keep modal usable with currently loaded roles.
    }
    setInviteRoleSelection("member");
    setInviteStoreId("");
    setInviteFullName("");
    setInviteEmail("");
    setInvitePhoneNumber("");
    setInviteAddress("");
    setInviteGovernmentId("");
    setInviteRemark("");
    setInviteOpen(true);
  };

  const handleInviteSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSendingInvite(true);
    setError(null);

    const selected = inviteRoleSelection.trim();
    const isCustomRole = selected.startsWith("custom:");
    const customRoleId = isCustomRole ? selected.slice("custom:".length) : null;
    const inviteRole: CompanyRole =
      selected === "owner" || selected === "admin" || selected === "member" ? selected : "member";

    try {
      const response = await apiRequest<{
        inviteId: string;
        email: string;
        role: CompanyRole;
        expiresAt: string;
        storeId: string | null;
      }>("/auth/invite", {
        method: "POST",
        body: JSON.stringify({
          fullName: inviteFullName,
          email: inviteEmail,
          role: inviteRole,
          customRoleId,
          storeId: inviteStoreId || null,
          phoneNumber: invitePhoneNumber,
          address: inviteAddress,
          governmentId: inviteGovernmentId,
          remark: inviteRemark,
          inviteMessage: inviteRemark,
          expiresInDays: 7,
        }),
      });

      setSnapshot((current) =>
        current
          ? {
              ...current,
              invites: [
                ...current.invites,
                {
                  inviteId: response.inviteId,
                  email: response.email,
                  role: response.role,
                  status: "pending",
                  storeId: response.storeId,
                  storeName: current.stores.find((store) => store.id === response.storeId)?.name ?? null,
                  expiresAt: response.expiresAt,
                },
              ],
            }
          : current,
      );

      setInviteOpen(false);
      toast.success("Invite sent.");
    } catch (caughtError) {
      const message = caughtError instanceof ApiError ? caughtError.message : "Unable to send invite.";
      setError(message);
      toast.error(message);
    } finally {
      setSendingInvite(false);
    }
  };

  const openMemberEditor = (member: TeamRow) => {
    setEditingMember(member);
    setMemberRoleDraft(member.role);
    setMemberCustomRoleIdDraft(member.customRoleId ?? "");
    setMemberStatusDraft(member.status);
    setMemberModalOpen(true);
  };

  const handleMemberUpdate = async () => {
    if (!editingMember) {
      return;
    }

    const isSelf = editingMember.userId === me?.user.id;
    if (isSelf) {
      toast.error("Your own membership role is protected.");
      return;
    }

    setSavingMember(true);
    setError(null);
    try {
      const response = await apiRequest<{
        membership: {
          id: string;
          role: CompanyRole;
          customRoleId: string | null;
          status: string;
        };
      }>(`/users/memberships/${editingMember.membershipId}`, {
        method: "PATCH",
        body: JSON.stringify({
          role: memberRoleDraft,
          status: memberStatusDraft,
          customRoleId: memberRoleDraft === "member" ? (memberCustomRoleIdDraft || null) : null,
        }),
      });

      setSnapshot((current) =>
        current
          ? {
              ...current,
              members: current.members.map((member) =>
                member.membershipId === editingMember.membershipId
                  ? {
                      ...member,
                      role: response.membership.role,
                      customRoleId: response.membership.customRoleId ?? null,
                      customRoleName:
                        response.membership.customRoleId != null
                          ? roles.find((role) => role.id === response.membership.customRoleId)?.name ?? member.customRoleName
                          : null,
                      status: response.membership.status,
                    }
                  : member,
              ),
            }
          : current,
      );

      setMemberModalOpen(false);
      setEditingMember(null);
      toast.success("Member updated.");
    } catch (caughtError) {
      const message = caughtError instanceof ApiError ? caughtError.message : "Unable to update member.";
      setError(message);
      toast.error(message);
    } finally {
      setSavingMember(false);
    }
  };

  const handleTeamsExport = () => {
    try {
      if (isRolesTab) {
        toast.info("Export is available for All Teams and Invited.");
        return;
      }
      const csv = isInvitedTab ? buildInvitesCsv(sortedInviteRows) : buildTeamsCsv(sortedTeamRows);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = isInvitedTab ? "team-invites.csv" : "teams.csv";
      link.click();
      URL.revokeObjectURL(url);
      toast.success(isInvitedTab ? "Invites exported." : "Teams exported.");
    } catch {
      toast.error(isInvitedTab ? "Unable to export invites." : "Unable to export teams.");
    }
  };

  const openAddRole = () => {
    setRoleEditor({ id: null, name: "", modules: [] });
    setRoleEditorOpen(true);
  };

  const openEditRole = (role: RoleDefinition) => {
    setRoleEditor({ id: role.id, name: role.name, modules: role.modules });
    setRoleEditorOpen(true);
  };

  const saveRole = async () => {
    const roleName = roleEditor.name.trim();
    if (!roleName) {
      toast.error("Role name is required.");
      return;
    }

    try {
      if (roleEditor.id) {
        await apiRequest(`/companies/current/roles/${roleEditor.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            name: roleName,
            modules: roleEditor.modules,
          }),
        });
        toast.success("Role updated.");
      } else {
        await apiRequest("/companies/current/roles", {
          method: "POST",
          body: JSON.stringify({
            name: roleName,
            modules: roleEditor.modules,
          }),
        });
        toast.success("Role added.");
      }

      await loadRoles();
      setRoleEditorOpen(false);
    } catch (caughtError) {
      const message = caughtError instanceof ApiError ? caughtError.message : "Unable to save role.";
      toast.error(message);
      setError(message);
    }
  };

  const teamColumns: Array<ColumnDefinition<TeamRow, TeamDataColumnKey, TeamSortKey>> = [
    {
      key: "name",
      label: teamColumnLabels.name,
      sortable: true,
      sortKey: "name",
      widthClassName: "min-w-[170px]",
      renderCell: (row) => (
        <div className="flex min-w-[170px] items-center gap-2.5">
          <Avatar size="sm">
            <AvatarFallback>{getInitials(row.name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="truncate font-medium text-slate-900">{row.name}</div>
            <div className="truncate text-xs text-muted-foreground">{row.storeName ?? "Company-wide"}</div>
          </div>
        </div>
      ),
    },
    {
      key: "email",
      label: teamColumnLabels.email,
      sortable: true,
      sortKey: "email",
      widthClassName: "min-w-[200px]",
      renderCell: (row) => <span className="text-slate-700">{row.email}</span>,
    },
    {
      key: "role",
      label: teamColumnLabels.role,
      sortable: true,
      sortKey: "role",
      renderCell: (row) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className="capitalize">
            {row.role}
          </Badge>
          {row.customRoleName ? <Badge variant="secondary">{row.customRoleName}</Badge> : null}
        </div>
      ),
    },
    {
      key: "phone",
      label: teamColumnLabels.phone,
      sortable: true,
      sortKey: "phone",
      renderCell: (row) => <span className="text-slate-600">{row.phone}</span>,
    },
    {
      key: "totalLeads",
      label: teamColumnLabels.totalLeads,
      sortable: true,
      sortKey: "totalLeads",
      renderCell: (row) => <span className="text-slate-600">{row.totalLeads}</span>,
    },
    {
      key: "status",
      label: teamColumnLabels.status,
      sortable: true,
      sortKey: "status",
      renderCell: (row) => (
        <Badge variant={row.status === "active" ? "secondary" : "outline"} className="capitalize">
          {row.status}
        </Badge>
      ),
    },
    {
      key: "country",
      label: teamColumnLabels.country,
      sortable: true,
      sortKey: "country",
      renderCell: (row) => <span className="text-slate-600">{row.country}</span>,
    },
    {
      key: "admin",
      label: teamColumnLabels.admin,
      sortable: true,
      sortKey: "admin",
      renderCell: (row) => (
        <Badge variant={row.admin === "Yes" ? "default" : "outline"}>{row.admin}</Badge>
      ),
    },
    {
      key: "createdAt",
      label: teamColumnLabels.createdAt,
      sortable: true,
      sortKey: "createdAt",
      renderCell: (row) => <span className="text-slate-600">{formatDate(row.createdAt)}</span>,
    },
  ];

  const roleColumns: Array<ColumnDefinition<RoleDefinition, RoleDataColumnKey, RoleSortKey>> = [
    {
      key: "name",
      label: "Role",
      sortable: true,
      sortKey: "name",
      widthClassName: "min-w-[170px]",
      renderCell: (role) => <span className="font-medium text-slate-900">{role.name}</span>,
    },
    {
      key: "modules",
      label: "Allowed Modules",
      sortable: true,
      sortKey: "modules",
      widthClassName: "min-w-[260px]",
      renderCell: (role) => (
        <div className="flex min-w-[260px] flex-wrap gap-1.5">
          {role.modules.length > 0 ? (
            role.modules.map((moduleName) => (
              <Badge key={`${role.id}-${moduleName}`} variant="outline">
                {roleModuleLabelByKey[moduleName] ?? moduleName}
              </Badge>
            ))
          ) : (
            <span className="text-muted-foreground">No modules selected</span>
          )}
        </div>
      ),
    },
    {
      key: "createdAt",
      label: "Created At",
      sortable: true,
      sortKey: "createdAt",
      renderCell: (role) => <span className="text-slate-600">{formatDate(role.createdAt)}</span>,
    },
  ];

  const inviteColumns: Array<ColumnDefinition<InviteRow, InviteColumnKey, InviteSortKey>> = [
    {
      key: "email",
      label: inviteColumnLabels.email,
      sortable: false,
      widthClassName: "min-w-[220px]",
      renderCell: (row) => <span className="text-slate-800">{row.email}</span>,
    },
    {
      key: "role",
      label: inviteColumnLabels.role,
      sortable: false,
      renderCell: (row) => (
        <Badge variant="outline" className="capitalize">
          {row.role}
        </Badge>
      ),
    },
    {
      key: "status",
      label: inviteColumnLabels.status,
      sortable: false,
      renderCell: (row) => <Badge variant="secondary">{row.status}</Badge>,
    },
    {
      key: "expiresAt",
      label: inviteColumnLabels.expiresAt,
      sortable: false,
      renderCell: (row) => <span className="text-slate-600">{formatDate(row.expiresAt)}</span>,
    },
  ];

  return (
    <div className="grid gap-5">
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Team management error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <CrmListPageHeader
        title="Team"
        actions={
          isRolesTab ? (
            <Button type="button" size="sm" onClick={openAddRole}>
              <Plus className="size-4" /> Add New Role
            </Button>
          ) : (
            <>
              <Button type="button" variant="outline" size="sm" onClick={() => setExportModalOpen(true)}>
                <Download className="size-4" /> Export
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={() => setImportModalOpen(true)}>
                <Upload className="size-4" /> Import
              </Button>
              <Button type="button" size="sm" onClick={() => void openInviteModal()}>
                <Plus className="size-4" /> Add New Team
              </Button>
            </>
          )
        }
      />

      <section className="overflow-hidden rounded-[1.75rem] border border-border/70 bg-white shadow-[0_24px_60px_-40px_rgba(15,23,42,0.35)]">
        <div className="px-4 pt-3">
          <CrmListViewTabs
            value={tab}
            onValueChange={(value) => {
              setTab(value as CrmListTabKey);
              setPage(1);
            }}
            labels={{
              all: "All Teams",
              mine: `Invited (${pendingInviteCount})`,
              documents: "Roles",
            }}
          />
        </div>

        {isRolesTab ? (
          <>
            <CrmListToolbar
              searchValue={rolesSearch}
              searchPlaceholder="Search role or module"
              onSearchChange={setRolesSearch}
              onOpenFilters={() => setRolesFilterOpen(true)}
              filterCount={roleFilterCount}
              onOpenColumns={() => setRolesColumnSettingsOpen(true)}
              onRefresh={() => void loadRoles()}
              extraContent={<Badge variant="outline">Module-level selection only</Badge>}
            />

            <CrmDataTable
              columns={roleColumns}
              rows={sortedRoles}
              rowKey={(role) => role.id}
              loading={false}
              emptyLabel="No roles found."
              columnVisibility={rolesColumnVisibility}
              sortBy={roleSortBy}
              sortDir={roleSortDir}
              onSort={handleRoleSort}
              actionColumn={{
                header: "Actions",
                renderCell: (role) => (
                  <Button type="button" variant="ghost" size="sm" className="h-8" onClick={() => openEditRole(role)}>
                    Manage
                  </Button>
                ),
              }}
            />
          </>
        ) : (
          <>
            <CrmListToolbar
              searchValue={filters.q}
              searchPlaceholder={isInvitedTab ? "Search invites by email, role, branch" : "Search by name, email, branch, role"}
              onSearchChange={(value) => {
                setPage(1);
                setFilters((current) => ({ ...current, q: value }));
                setFilterDraft((current) => ({ ...current, q: value }));
              }}
              onOpenFilters={() => setTeamFilterOpen(true)}
              filterCount={activeTeamFilterChips.length}
              onOpenColumns={() => {
                if (!isInvitedTab) {
                  setTeamColumnSettingsOpen(true);
                }
              }}
              onRefresh={() => void loadData()}
            />

            <div className="grid gap-3 border-b border-border/60 bg-gradient-to-r from-slate-50 via-white to-sky-50/70 px-4 py-4">
              <div className="flex flex-wrap gap-2">
                {activeTeamFilterChips.length > 0 ? (
                  activeTeamFilterChips.map((chip) => (
                    <button
                      key={`${chip.key}-${chip.value}`}
                      type="button"
                      onClick={() => removeAppliedFilter(chip.key)}
                      className="inline-flex items-center gap-2 rounded-full border border-sky-100 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-sky-200 hover:text-sky-700"
                    >
                      <span>{chip.label}: {chip.value}</span>
                    </button>
                  ))
                ) : (
                  <div className="text-xs text-muted-foreground">No active filters.</div>
                )}
              </div>
            </div>

            {isInvitedTab ? (
              <CrmDataTable
                columns={inviteColumns}
                rows={paginatedInviteRows}
                rowKey={(row) => row.inviteId}
                loading={loading}
                emptyLabel="No pending invites found."
                columnVisibility={inviteColumnVisibility}
              />
            ) : (
              <CrmDataTable
                columns={teamColumns}
                rows={paginatedTeamRows}
                rowKey={(row) => row.membershipId}
                loading={loading}
                emptyLabel="No team members found."
                columnVisibility={columnVisibility}
                sortBy={sortBy}
                sortDir={sortDir}
                onSort={handleTeamSort}
                actionColumn={{
                  header: "Actions",
                  renderCell: (row) => (
                    <Button type="button" variant="ghost" size="sm" className="h-8" onClick={() => openMemberEditor(row)}>
                      <UserCog className="size-3.5" /> Manage
                    </Button>
                  ),
                }}
              />
            )}

            <CrmPaginationBar
              limit={limit}
              onLimitChange={(value) => {
                setLimit(value);
                setPage(1);
              }}
              rowsPerPageOptions={rowsPerPageOptions}
              total={totalTeamRows}
              page={page}
              totalPages={totalTeamPages}
              onPrev={() => setPage((current) => Math.max(1, current - 1))}
              onNext={() => setPage((current) => Math.min(totalTeamPages, current + 1))}
            />
          </>
        )}
      </section>

      <CrmFilterDrawer
        open={teamFilterOpen}
        title="Team filters"
        description="Filter by role, status, branch, admin flag, and member creation date."
        onClose={() => setTeamFilterOpen(false)}
        onClear={clearFilterDraft}
        onApply={() => {
          applyFilterDraft();
          setTeamFilterOpen(false);
        }}
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
                placeholder="Name, email, role, branch"
              />
            </Field>
          </div>

          <div className="grid gap-4 rounded-[1.35rem] border border-border/60 bg-white p-4">
            <div className="text-sm font-semibold text-slate-900">Member details</div>
            <Field>
              <FieldLabel>Role</FieldLabel>
              <NativeSelect
                value={filterDraft.role}
                onChange={(event) => setFilterDraft((current) => ({ ...current, role: event.target.value }))}
                className="h-10 rounded-xl px-3 text-sm"
              >
                <option value="">All roles</option>
                <option value="owner">owner</option>
                <option value="admin">admin</option>
                <option value="member">member</option>
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel>Status</FieldLabel>
              <NativeSelect
                value={filterDraft.status}
                onChange={(event) => setFilterDraft((current) => ({ ...current, status: event.target.value }))}
                className="h-10 rounded-xl px-3 text-sm"
              >
                <option value="">All statuses</option>
                <option value="active">active</option>
                <option value="disabled">disabled</option>
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel>Branch</FieldLabel>
              <NativeSelect
                value={filterDraft.storeId || "__all__"}
                onChange={(event) =>
                  setFilterDraft((current) => ({
                    ...current,
                    storeId: event.target.value === "__all__" ? "" : event.target.value,
                  }))
                }
                className="h-10 rounded-xl px-3 text-sm"
              >
                <option value="__all__">All branches</option>
                {(snapshot?.stores ?? []).map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel>Admin</FieldLabel>
              <NativeSelect
                value={filterDraft.admin}
                onChange={(event) => setFilterDraft((current) => ({ ...current, admin: event.target.value }))}
                className="h-10 rounded-xl px-3 text-sm"
              >
                <option value="">All</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel>Created from</FieldLabel>
              <Input
                type="date"
                value={filterDraft.createdFrom}
                onChange={(event) => setFilterDraft((current) => ({ ...current, createdFrom: event.target.value }))}
                className="h-10 text-sm"
              />
            </Field>
          </div>
        </div>
      </CrmFilterDrawer>

      <CrmColumnSettings
        open={teamColumnSettingsOpen}
        description="Choose which team columns stay visible in the table."
        columns={teamColumnOrder
          .filter((key): key is TeamDataColumnKey => key !== "actions")
          .map((key) => ({ key, label: teamColumnLabels[key] }))}
        columnVisibility={columnVisibility}
        lockedColumns={lockedTeamColumns}
        onToggleColumn={toggleColumn}
        onReset={resetColumns}
        onClose={() => setTeamColumnSettingsOpen(false)}
      />

      <CrmFilterDrawer
        open={rolesFilterOpen}
        title="Role filters"
        description="Filter roles by assigned module."
        onClose={() => setRolesFilterOpen(false)}
        onClear={() => {
          setRolesFilterDraftModule("");
          setRolesFilterModule("");
        }}
        onApply={() => {
          setRolesFilterModule(rolesFilterDraftModule);
          setRolesFilterOpen(false);
        }}
      >
        <div className="grid gap-4 rounded-[1.35rem] border border-border/60 bg-white p-4">
          <Field>
            <FieldLabel>Module</FieldLabel>
            <NativeSelect
              value={rolesFilterDraftModule}
              onChange={(event) => setRolesFilterDraftModule(event.target.value)}
              className="h-10 rounded-xl px-3 text-sm"
            >
              <option value="">All modules</option>
              {roleModuleOptions.map((moduleItem) => (
                <option key={moduleItem.key} value={moduleItem.key}>
                  {moduleItem.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>
      </CrmFilterDrawer>

      <CrmColumnSettings
        open={rolesColumnSettingsOpen}
        description="Choose which role columns stay visible in the table."
        columns={roleColumnOrder
          .filter((key): key is RoleDataColumnKey => key !== "actions")
          .map((key) => ({
            key,
            label: key === "name" ? "Role" : key === "modules" ? "Allowed Modules" : "Created At",
          }))}
        columnVisibility={rolesColumnVisibility}
        onToggleColumn={(key) =>
          setRolesColumnVisibility((current) => ({
            ...current,
            [key]: !current[key],
          }))
        }
        onReset={() => setRolesColumnVisibility(defaultRoleColumnVisibility)}
        onClose={() => setRolesColumnSettingsOpen(false)}
      />

      {exportModalOpen ? (
        <Modal
          title="Export Teams"
          description="Download the currently filtered teams as CSV."
          onClose={() => setExportModalOpen(false)}
          maxWidthClassName="max-w-xl"
        >
          <div className="grid gap-4">
            <p className="text-sm text-muted-foreground">Export includes the active team search and applied filters.</p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="destructive" onClick={() => setExportModalOpen(false)}>
                Close
              </Button>
              <Button
                type="button"
                onClick={() => {
                  handleTeamsExport();
                  setExportModalOpen(false);
                }}
              >
                Export CSV
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}

      {importModalOpen ? (
        <Modal
          title="Import Teams"
          description="Bulk team import is not available yet. Invite members using role and branch assignment."
          onClose={() => setImportModalOpen(false)}
          maxWidthClassName="max-w-xl"
        >
          <div className="grid gap-4">
            <Alert>
              <AlertTitle>Import pending</AlertTitle>
              <AlertDescription>Use Add New Team to send invites. CSV/XLS import for teams will be wired when backend import endpoints are added.</AlertDescription>
            </Alert>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="destructive" onClick={() => setImportModalOpen(false)}>
                Close
              </Button>
              <Button
                type="button"
                onClick={() => {
                  setImportModalOpen(false);
                  void openInviteModal();
                }}
              >
                Add New Team
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}

      {inviteOpen ? (
        <Modal
          title="Add New Team"
          description="Select role, capture teammate details, then send invite."
          onClose={() => setInviteOpen(false)}
          maxWidthClassName="max-w-xl"
          headerActions={
            <>
              <Button type="button" variant="destructive" size="xs" onClick={() => setInviteOpen(false)}>
                Close
              </Button>
              <Button type="submit" form="invite-team-form" size="xs" disabled={sendingInvite}>
                {sendingInvite ? "Sending..." : "Send Invite"}
              </Button>
            </>
          }
        >
          <form id="invite-team-form" onSubmit={handleInviteSubmit} className="grid gap-4">
            <Field>
              <FieldLabel>Role</FieldLabel>
              <NativeSelect
                value={inviteRoleSelection}
                onChange={(event) => setInviteRoleSelection(event.target.value)}
                className="h-10 rounded-xl px-3 text-sm"
              >
                <option value="owner">Owner</option>
                <option value="admin">Admin</option>
                <option value="member">Member</option>
                {roles.length > 0 ? <option value="" disabled>Custom Roles</option> : null}
                {roles.map((role) => (
                  <option key={role.id} value={`custom:${role.id}`}>
                    {role.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>

            <Field>
              <FieldLabel>Full Name</FieldLabel>
              <Input
                value={inviteFullName}
                onChange={(event) => setInviteFullName(event.target.value)}
                className="h-10"
                placeholder="eg: Alex Johnson"
              />
            </Field>

            <Field>
              <FieldLabel>Branch</FieldLabel>
              <NativeSelect
                value={inviteStoreId || "__company__"}
                onChange={(event) => setInviteStoreId(event.target.value === "__company__" ? "" : event.target.value)}
                className="h-10 rounded-xl px-3 text-sm"
              >
                <option value="__company__">Company-wide access</option>
                {(snapshot?.stores ?? []).map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>

            <Field>
              <FieldLabel>Email</FieldLabel>
              <Input
                type="email"
                required
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
                className="h-10"
              />
            </Field>

            <Field>
              <FieldLabel>Phone Number</FieldLabel>
              <Input
                value={invitePhoneNumber}
                onChange={(event) => setInvitePhoneNumber(event.target.value)}
                className="h-10"
                placeholder="eg: +1 555-111-2233"
              />
            </Field>

            <Field>
              <FieldLabel>Address</FieldLabel>
              <Textarea
                value={inviteAddress}
                onChange={(event) => setInviteAddress(event.target.value)}
                className="min-h-20 text-sm"
                placeholder="Street, city, state, postal code"
              />
            </Field>

            <Field>
              <FieldLabel>Government ID</FieldLabel>
              <Input
                value={inviteGovernmentId}
                onChange={(event) => setInviteGovernmentId(event.target.value)}
                className="h-10"
                placeholder="Optional ID reference"
              />
            </Field>

            <Field>
              <FieldLabel>Remark</FieldLabel>
              <Textarea
                value={inviteRemark}
                onChange={(event) => setInviteRemark(event.target.value)}
                className="min-h-24 text-sm"
                placeholder="Notes for this invite"
              />
            </Field>
          </form>
        </Modal>
      ) : null}

      {memberModalOpen && editingMember ? (
        <Modal
          title="Manage Team Member"
          description="Update membership role and active status."
          onClose={() => {
            setMemberModalOpen(false);
            setEditingMember(null);
          }}
          maxWidthClassName="max-w-xl"
          headerActions={
            <>
              <Button
                type="button"
                variant="destructive"
                size="xs"
                onClick={() => {
                  setMemberModalOpen(false);
                  setEditingMember(null);
                }}
              >
                Close
              </Button>
              <Button
                type="button"
                size="xs"
                disabled={savingMember || editingMember.userId === me?.user.id}
                onClick={() => void handleMemberUpdate()}
              >
                {savingMember ? "Saving..." : "Save"}
              </Button>
            </>
          }
        >
          <div className="grid gap-4">
            <div className="rounded-xl border border-border/60 bg-slate-50 px-3 py-2.5">
              <div className="text-sm font-medium text-slate-900">{editingMember.name}</div>
              <div className="text-xs text-muted-foreground">{editingMember.email}</div>
            </div>

            <Field>
              <FieldLabel>Role</FieldLabel>
              <NativeSelect
                value={memberRoleDraft}
                onChange={(event) => {
                  const nextRole = event.target.value as CompanyRole;
                  setMemberRoleDraft(nextRole);
                  if (nextRole !== "member") {
                    setMemberCustomRoleIdDraft("");
                  }
                }}
                disabled={editingMember.userId === me?.user.id}
                className="h-10 rounded-xl px-3 text-sm"
              >
                <option value="owner">owner</option>
                <option value="admin">admin</option>
                <option value="member">member</option>
              </NativeSelect>
            </Field>

            {memberRoleDraft === "member" ? (
              <Field>
                <FieldLabel>Custom Role</FieldLabel>
                <NativeSelect
                  value={memberCustomRoleIdDraft || "__none__"}
                  onChange={(event) => setMemberCustomRoleIdDraft(event.target.value === "__none__" ? "" : event.target.value)}
                  disabled={editingMember.userId === me?.user.id}
                  className="h-10 rounded-xl px-3 text-sm"
                >
                  <option value="__none__">No custom role</option>
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            ) : null}

            <Field>
              <FieldLabel>Status</FieldLabel>
              <NativeSelect
                value={memberStatusDraft}
                onChange={(event) => setMemberStatusDraft(event.target.value as MembershipStatus)}
                disabled={editingMember.userId === me?.user.id}
                className="h-10 rounded-xl px-3 text-sm"
              >
                <option value="active">active</option>
                <option value="disabled">disabled</option>
              </NativeSelect>
            </Field>

            {editingMember.userId === me?.user.id ? (
              <p className="text-xs text-muted-foreground">Your own role and status are protected.</p>
            ) : null}
          </div>
        </Modal>
      ) : null}

      {roleEditorOpen ? (
        <Modal
          title={roleEditor.id ? "Edit Role" : "Add New Role"}
          description="Select module-level access for this role. Assigned members will be constrained by these backend-enforced modules."
          onClose={() => setRoleEditorOpen(false)}
          maxWidthClassName="max-w-2xl"
          headerActions={
            <>
              <Button type="button" variant="destructive" size="xs" onClick={() => setRoleEditorOpen(false)}>
                Close
              </Button>
              <Button type="button" size="xs" onClick={() => void saveRole()}>
                Save
              </Button>
            </>
          }
        >
          <div className="grid gap-4">
            <Field>
              <FieldLabel>Role name</FieldLabel>
              <Input
                value={roleEditor.name}
                onChange={(event) => setRoleEditor((current) => ({ ...current, name: event.target.value }))}
                className="h-10"
                placeholder="eg: Regional Sales"
              />
            </Field>

            <div className="grid gap-3 rounded-[1.2rem] border border-border/60 bg-slate-50/60 p-4">
              <div className="text-sm font-semibold text-slate-900">Allowed modules</div>
              <div className="grid gap-2 sm:grid-cols-2">
                {roleModuleOptions.map((moduleItem) => {
                  const checked = roleEditor.modules.includes(moduleItem.key);
                  return (
                    <label
                      key={moduleItem.key}
                      className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-white px-3 py-2"
                    >
                      <span className="text-sm text-slate-700">{moduleItem.label}</span>
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(nextChecked) => {
                          setRoleEditor((current) => {
                            const include = nextChecked === true;
                            return {
                              ...current,
                              modules: include
                                ? [...new Set([...current.modules, moduleItem.key])]
                                : current.modules.filter((item) => item !== moduleItem.key),
                            };
                          });
                        }}
                      />
                    </label>
                  );
                })}
              </div>
            </div>

            <p className="text-xs text-muted-foreground">Role and module changes are saved to backend and used by server-side module access checks.</p>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
