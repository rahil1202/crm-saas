"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { ColumnVisibility, CrmListQueryState, CrmListTabKey, CrmSortDirection } from "@/components/crm/types";

type SearchParamsReader = Pick<URLSearchParams, "get">;
const EMPTY_LOCKED_COLUMNS: readonly string[] = [];

interface UseCrmListStateOptions<TFilters extends Record<string, string>, TSortKey extends string, TColumnKey extends string> {
  defaultTab?: CrmListTabKey;
  defaultFilters: TFilters;
  defaultSortBy: TSortKey;
  defaultSortDir?: CrmSortDirection;
  defaultLimit?: number;
  rowsPerPageOptions: readonly number[];
  parseFilters: (params: SearchParamsReader) => TFilters;
  writeFilters: (params: URLSearchParams, filters: TFilters) => void;
  normalizeSortBy: (value: string | null) => TSortKey;
  columnStorageKey: string;
  defaultColumnVisibility: ColumnVisibility<TColumnKey>;
  lockedColumns?: readonly TColumnKey[];
}

function normalizePage(value: string | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
}

function normalizeLimit(value: string | null, rowsPerPageOptions: readonly number[], fallback: number) {
  const parsed = Number(value);
  return rowsPerPageOptions.includes(parsed) ? parsed : fallback;
}

function normalizeTab(value: string | null, fallback: CrmListTabKey) {
  return value === "mine" || value === "documents" ? value : fallback;
}

function hasVisibilityChanges<TColumnKey extends string>(
  current: Record<TColumnKey, boolean>,
  next: Record<TColumnKey, boolean>,
) {
  const currentKeys = Object.keys(current) as TColumnKey[];
  for (const key of currentKeys) {
    if (current[key] !== next[key]) {
      return true;
    }
  }

  const nextKeys = Object.keys(next) as TColumnKey[];
  for (const key of nextKeys) {
    if (!(key in current)) {
      return true;
    }
  }

  return false;
}

export function useCrmListState<
  TFilters extends Record<string, string>,
  TSortKey extends string,
  TColumnKey extends string,
>({
  defaultTab = "all",
  defaultFilters,
  defaultSortBy,
  defaultSortDir = "desc",
  defaultLimit = 10,
  rowsPerPageOptions,
  parseFilters,
  writeFilters,
  normalizeSortBy,
  columnStorageKey,
  defaultColumnVisibility,
  lockedColumns = EMPTY_LOCKED_COLUMNS as readonly TColumnKey[],
}: UseCrmListStateOptions<TFilters, TSortKey, TColumnKey>) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const initialFilters = parseFilters(searchParams);

  const [tab, setTab] = useState<CrmListTabKey>(() => normalizeTab(searchParams.get("tab"), defaultTab));
  const [filters, setFilters] = useState<TFilters>(initialFilters);
  const [filterDraft, setFilterDraft] = useState<TFilters>(initialFilters);
  const [page, setPage] = useState(() => normalizePage(searchParams.get("page")));
  const [limit, setLimit] = useState(() => normalizeLimit(searchParams.get("limit"), rowsPerPageOptions, defaultLimit));
  const [sortBy, setSortBy] = useState<TSortKey>(() => normalizeSortBy(searchParams.get("sortBy")));
  const [sortDir, setSortDir] = useState<CrmSortDirection>(
    () => (searchParams.get("sortDir") === "asc" ? "asc" : defaultSortDir),
  );
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibility<TColumnKey>>(defaultColumnVisibility);

  const buildQueryString = useCallback(
    (next: CrmListQueryState<TFilters, TSortKey>) => {
      const params = new URLSearchParams();
      if (next.tab !== defaultTab) {
        params.set("tab", next.tab);
      }
      writeFilters(params, next.filters);
      if (next.page > 1) {
        params.set("page", String(next.page));
      }
      if (next.limit !== defaultLimit) {
        params.set("limit", String(next.limit));
      }
      if (next.sortBy !== defaultSortBy) {
        params.set("sortBy", next.sortBy);
      }
      if (next.sortDir !== defaultSortDir) {
        params.set("sortDir", next.sortDir);
      }
      return params.toString();
    },
    [defaultLimit, defaultSortBy, defaultSortDir, defaultTab, writeFilters],
  );

  useEffect(() => {
    const next = buildQueryString({ tab, filters, page, limit, sortBy, sortDir });
    if (next !== searchParams.toString()) {
      router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
    }
  }, [buildQueryString, filters, limit, page, pathname, router, searchParams, sortBy, sortDir, tab]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const stored = window.localStorage.getItem(columnStorageKey);
    if (!stored) {
      return;
    }

    try {
      const parsed = JSON.parse(stored) as Partial<ColumnVisibility<TColumnKey>>;
      setColumnVisibility((current) => {
        const next = { ...current, ...parsed } as ColumnVisibility<TColumnKey>;
        for (const key of lockedColumns) {
          next[key] = true as ColumnVisibility<TColumnKey>[TColumnKey];
        }

        if (!hasVisibilityChanges(current, next)) {
          return current;
        }

        return next;
      });
    } catch {
      window.localStorage.removeItem(columnStorageKey);
    }
  }, [columnStorageKey, lockedColumns]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(columnStorageKey, JSON.stringify(columnVisibility));
  }, [columnStorageKey, columnVisibility]);

  const applyFilterDraft = useCallback(() => {
    setFilters(filterDraft);
    setPage(1);
  }, [filterDraft]);

  const clearFilterDraft = useCallback(() => {
    setFilterDraft(defaultFilters);
  }, [defaultFilters]);

  const clearAllFilters = useCallback(() => {
    setFilters(defaultFilters);
    setFilterDraft(defaultFilters);
    setPage(1);
  }, [defaultFilters]);

  const removeAppliedFilter = useCallback((key: keyof TFilters) => {
    setFilters((current) => ({ ...current, [key]: "" }));
    setFilterDraft((current) => ({ ...current, [key]: "" }));
    setPage(1);
  }, []);

  const toggleColumn = useCallback(
    (key: TColumnKey) => {
      if (lockedColumns.includes(key)) {
        return;
      }

      setColumnVisibility((current) => ({
        ...current,
        [key]: !current[key],
      }));
    },
    [lockedColumns],
  );

  const resetColumns = useCallback(() => {
    setColumnVisibility(defaultColumnVisibility);
  }, [defaultColumnVisibility]);

  const requestSort = useCallback(
    (key: TSortKey, defaultDirection: CrmSortDirection = "asc") => {
      setPage(1);
      if (sortBy === key) {
        setSortDir((current) => (current === "asc" ? "desc" : "asc"));
        return;
      }

      setSortBy(key);
      setSortDir(defaultDirection);
    },
    [sortBy],
  );

  const setTabAndReset = useCallback((nextTab: CrmListTabKey) => {
    setTab(nextTab);
    setPage(1);
  }, []);

  return {
    tab,
    setTab: setTabAndReset,
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
    setSortBy,
    setSortDir,
    columnVisibility,
    setColumnVisibility,
    applyFilterDraft,
    clearFilterDraft,
    clearAllFilters,
    removeAppliedFilter,
    toggleColumn,
    resetColumns,
    requestSort,
    buildQueryString,
  };
}

export function usePersistedColumnVisibility<TColumnKey extends string>({
  storageKey,
  defaultVisibility,
  lockedColumns = EMPTY_LOCKED_COLUMNS as readonly TColumnKey[],
}: {
  storageKey: string;
  defaultVisibility: Record<TColumnKey, boolean>;
  lockedColumns?: readonly TColumnKey[];
}) {
  const [columnVisibility, setColumnVisibility] = useState<Record<TColumnKey, boolean>>(defaultVisibility);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const stored = window.localStorage.getItem(storageKey);
    if (!stored) {
      return;
    }

    try {
      const parsed = JSON.parse(stored) as Partial<Record<TColumnKey, boolean>>;
      setColumnVisibility((current) => {
        const next = { ...current, ...parsed } as Record<TColumnKey, boolean>;
        for (const key of lockedColumns) {
          next[key] = true;
        }

        if (!hasVisibilityChanges(current, next)) {
          return current;
        }

        return next;
      });
    } catch {
      window.localStorage.removeItem(storageKey);
    }
  }, [lockedColumns, storageKey]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(storageKey, JSON.stringify(columnVisibility));
  }, [columnVisibility, storageKey]);

  const toggleColumn = useCallback(
    (key: TColumnKey) => {
      if (lockedColumns.includes(key)) {
        return;
      }

      setColumnVisibility((current) => ({
        ...current,
        [key]: !current[key],
      }));
    },
    [lockedColumns],
  );

  const resetColumns = useCallback(() => {
    setColumnVisibility(defaultVisibility);
  }, [defaultVisibility]);

  return {
    columnVisibility,
    setColumnVisibility,
    toggleColumn,
    resetColumns,
  };
}
