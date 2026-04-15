"use client";

import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Filter, RefreshCw, Search, Settings2, X } from "lucide-react";

import type { ColumnDefinition, ColumnVisibility, CrmListTabKey, CrmSortDirection } from "@/components/crm/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export function CrmListPageHeader({
  title,
  actions,
}: {
  title: string;
  actions?: ReactNode;
}) {
  return (
    <div className="grid min-w-0 gap-3 rounded-[1.25rem] border border-border/60 bg-white px-5 py-4 shadow-[0_18px_38px_-30px_rgba(15,23,42,0.18)] lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
      <div className="min-w-0">
        <h1 className="text-[1.7rem] font-semibold tracking-[-0.03em] text-slate-900">{title}</h1>
      </div>
      {actions ? <div className="flex min-w-0 flex-wrap gap-2 lg:justify-end [&>button]:min-w-[120px] [&>button]:justify-center">{actions}</div> : null}
    </div>
  );
}

export function CrmListViewTabs({
  value,
  onValueChange,
  labels,
}: {
  value: CrmListTabKey;
  onValueChange: (value: CrmListTabKey) => void;
  labels: Record<CrmListTabKey, string>;
}) {
  return (
    <Tabs value={value} onValueChange={(next) => onValueChange(next as CrmListTabKey)}>
      <TabsList variant="line" className="border-b border-border/60 p-0">
        <TabsTrigger value="all" className="rounded-none px-4 py-3 text-sm">
          {labels.all}
        </TabsTrigger>
        <TabsTrigger value="mine" className="rounded-none px-4 py-3 text-sm">
          {labels.mine}
        </TabsTrigger>
        <TabsTrigger value="documents" className="rounded-none px-4 py-3 text-sm">
          {labels.documents}
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}

export function CrmListToolbar({
  searchValue,
  searchPlaceholder,
  onSearchChange,
  onOpenFilters,
  filterCount,
  onOpenColumns,
  extraContent,
  onRefresh,
}: {
  searchValue: string;
  searchPlaceholder: string;
  onSearchChange: (value: string) => void;
  onOpenFilters: () => void;
  filterCount: number;
  onOpenColumns: () => void;
  extraContent?: ReactNode;
  onRefresh?: () => void;
}) {
  return (
    <div className="grid gap-3 border-b border-border/60 bg-slate-50/45 px-4 py-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={searchPlaceholder}
            className="h-11 rounded-2xl border-border/70 bg-white pl-10 text-sm shadow-sm"
          />
        </div>
        <div className="flex flex-wrap gap-2 lg:flex-nowrap">
          <Button type="button" variant="outline" size="sm" className="h-11 min-w-[112px] justify-center rounded-2xl border-border/70 bg-white" onClick={onOpenFilters}>
            <Filter className="size-4" />
            Filter
            {filterCount > 0 ? <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[0.65rem]">{filterCount}</Badge> : null}
          </Button>
          {onRefresh ? (
            <Button type="button" variant="outline" size="sm" className="h-11 min-w-[112px] justify-center rounded-2xl border-border/70 bg-white" onClick={onRefresh}>
              <RefreshCw className="size-4" />
              Refresh
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" className="h-11 min-w-[112px] justify-center rounded-2xl border-border/70 bg-white" onClick={onOpenColumns}>
            <Settings2 className="size-4" />
            Columns
          </Button>
        </div>
        {extraContent ? <div className="flex flex-wrap items-center gap-2 lg:justify-end">{extraContent}</div> : null}
      </div>
    </div>
  );
}

function SortIcon({ active, direction }: { active: boolean; direction: CrmSortDirection }) {
  if (!active) {
    return <ArrowUpDown className="size-3.5" />;
  }
  return direction === "asc" ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />;
}

export function CrmDataTable<TRecord, TColumnKey extends string, TSortKey extends string>({
  columns,
  rows,
  rowKey,
  loading,
  emptyLabel,
  columnVisibility,
  selectable = false,
  selectedRowIds = [],
  onToggleRow,
  onToggleAllVisible,
  sortBy,
  sortDir,
  onSort,
  actionColumn,
}: {
  columns: Array<ColumnDefinition<TRecord, TColumnKey, TSortKey>>;
  rows: TRecord[];
  rowKey: (record: TRecord) => string;
  loading: boolean;
  emptyLabel: string;
  columnVisibility: ColumnVisibility<TColumnKey>;
  selectable?: boolean;
  selectedRowIds?: string[];
  onToggleRow?: (rowId: string, checked: boolean) => void;
  onToggleAllVisible?: (checked: boolean) => void;
  sortBy?: TSortKey;
  sortDir?: CrmSortDirection;
  onSort?: (sortKey: TSortKey) => void;
  actionColumn?: {
    header: string;
    className?: string;
    renderCell: (record: TRecord) => ReactNode;
  };
}) {
  const visibleColumns = columns.filter((column) => columnVisibility[column.key]);
  const allVisibleSelected = rows.length > 0 && rows.every((row) => selectedRowIds.includes(rowKey(row)));
  const colSpan = visibleColumns.length + (selectable ? 1 : 0) + (actionColumn ? 1 : 0);

  return (
    <div className="overflow-hidden rounded-[1.35rem] border border-border/60 bg-white shadow-[0_18px_40px_-34px_rgba(15,23,42,0.18)]">
      <div className="overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-0">
          <thead className="bg-slate-50/90">
            <tr className="text-left">
            {selectable ? (
              <th className="w-12 border-b border-border/60 px-4 py-3.5">
                <Checkbox
                  checked={allVisibleSelected}
                  onCheckedChange={(checked) => onToggleAllVisible?.(checked === true)}
                  aria-label="Select all visible rows"
                />
              </th>
            ) : null}
            {visibleColumns.map((column) => (
              <th key={column.key} className={cn("border-b border-border/60 px-4 py-3.5", column.headerClassName, column.widthClassName)}>
                {column.sortable && column.sortKey && onSort ? (
                  <button
                    type="button"
                    onClick={() => onSort(column.sortKey!)}
                    className="inline-flex items-center gap-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500 transition hover:text-slate-900"
                  >
                    <span>{column.label}</span>
                    <SortIcon active={sortBy === column.sortKey} direction={sortDir ?? "asc"} />
                  </button>
                ) : (
                  <span className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500">{column.label}</span>
                )}
              </th>
            ))}
            {actionColumn ? (
              <th className={cn("border-b border-border/60 px-4 py-3.5 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500", actionColumn.className)}>
                {actionColumn.header}
              </th>
            ) : null}
            </tr>
          </thead>
          <tbody className="bg-white">
            {loading ? (
              <tr>
                <td colSpan={colSpan} className="px-4 py-20 text-center text-sm text-muted-foreground">
                  Loading...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={colSpan} className="px-4 py-20 text-center text-sm text-muted-foreground">
                  {emptyLabel}
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const id = rowKey(row);
                const selected = selectedRowIds.includes(id);
                return (
                  <tr
                    key={id}
                    className={cn(
                      "text-sm transition-colors",
                      selected ? "bg-sky-50/70" : "bg-white hover:bg-slate-50/75",
                    )}
                  >
                  {selectable ? (
                    <td className="border-b border-border/50 px-4 py-3.5 align-middle">
                      <Checkbox
                        checked={selected}
                        onCheckedChange={(checked) => onToggleRow?.(id, checked === true)}
                        aria-label={`Select row ${id}`}
                      />
                    </td>
                  ) : null}
                  {visibleColumns.map((column) => (
                    <td key={column.key} className={cn("border-b border-border/50 px-4 py-3.5 align-middle text-slate-700", column.cellClassName, column.widthClassName)}>
                      {column.renderCell(row)}
                    </td>
                  ))}
                  {actionColumn ? <td className="border-b border-border/50 px-4 py-3.5 align-middle">{actionColumn.renderCell(row)}</td> : null}
                </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function CrmPaginationBar({
  limit,
  onLimitChange,
  rowsPerPageOptions,
  total,
  page,
  totalPages,
  onPrev,
  onNext,
  summary,
}: {
  limit: number;
  onLimitChange: (value: number) => void;
  rowsPerPageOptions: readonly number[];
  total: number;
  page: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
  summary?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-t border-border/60 bg-slate-50/55 px-4 py-4 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-2">
        <span>Rows per page:</span>
        <NativeSelect
          value={String(limit)}
          onChange={(event) => onLimitChange(Number(event.target.value))}
          className="h-9 w-20 rounded-xl border-border/70 bg-white px-2 text-sm"
        >
          {rowsPerPageOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="text-sm text-slate-600">{summary ?? `Total Results: ${total}`}</div>
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" className="h-9 rounded-xl border-border/70 bg-white px-3" disabled={page <= 1} onClick={onPrev}>
          Prev
        </Button>
        <span className="min-w-[72px] text-center text-sm font-medium text-slate-700">
          {page} / {totalPages}
        </span>
        <Button type="button" variant="outline" size="sm" className="h-9 rounded-xl border-border/70 bg-white px-3" disabled={page >= totalPages} onClick={onNext}>
          Next
        </Button>
      </div>
    </div>
  );
}

export function CrmColumnSettings<TColumnKey extends string>({
  open,
  title = "Table columns",
  description,
  columns,
  columnVisibility,
  lockedColumns = [],
  onToggleColumn,
  onReset,
  onClose,
}: {
  open: boolean;
  title?: string;
  description: string;
  columns: Array<{ key: TColumnKey; label: string }>;
  columnVisibility: ColumnVisibility<TColumnKey>;
  lockedColumns?: readonly TColumnKey[];
  onToggleColumn: (key: TColumnKey) => void;
  onReset?: () => void;
  onClose: () => void;
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50">
      <button type="button" aria-label="Close column settings" className="absolute inset-0 bg-slate-950/35 backdrop-blur-[1px]" onClick={onClose} />
      <div className="absolute right-4 top-24 w-full max-w-sm rounded-[1.35rem] border border-border/70 bg-white p-4 shadow-[0_28px_70px_-38px_rgba(15,23,42,0.42)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">{title}</div>
            <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          </div>
          <div className="flex items-center gap-2">
            {onReset ? (
              <Button type="button" variant="ghost" size="xs" onClick={onReset}>
                Reset
              </Button>
            ) : null}
            <Button type="button" variant="ghost" size="xs" onClick={onClose}>
              <X className="size-4" />
            </Button>
          </div>
        </div>
        <div className="mt-4 grid gap-2">
          {columns.map((column) => {
            const locked = lockedColumns.includes(column.key);
            return (
              <label key={column.key} className="flex items-center justify-between gap-3 rounded-xl border border-border/60 px-3 py-2">
                <div className="text-sm text-slate-700">{column.label}</div>
                <Checkbox checked={locked || columnVisibility[column.key]} disabled={locked} onCheckedChange={() => onToggleColumn(column.key)} />
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function CrmFilterDrawer({
  open,
  title,
  description,
  children,
  onClose,
  onClear,
  onApply,
  applyFormId,
}: {
  open: boolean;
  title: string;
  description: string;
  children: ReactNode;
  onClose: () => void;
  onClear: () => void;
  onApply?: () => void;
  applyFormId?: string;
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-sm">
      <button type="button" aria-label="Close filters" className="absolute inset-0 z-0 cursor-default" onClick={onClose} />
      <aside className="absolute right-0 top-0 z-10 flex h-full w-full max-w-[440px] flex-col border-l border-border/60 bg-white shadow-[-18px_0_48px_-28px_rgba(15,23,42,0.42)]">
        <div className="flex items-start justify-between gap-3 border-b border-border/60 px-5 py-4">
          <div className="min-w-0">
            <div className="text-lg font-semibold tracking-tight text-slate-900">{title}</div>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" size="xs" onClick={onClear}>
              Clear All
            </Button>
            {applyFormId ? (
              <Button type="submit" form={applyFormId} size="xs">
                Apply
              </Button>
            ) : (
              <Button type="button" size="xs" onClick={onApply}>
                Apply
              </Button>
            )}
            <Button type="button" variant="ghost" size="xs" onClick={onClose} aria-label="Close filters">
              <X className="size-4" />
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </aside>
    </div>
  );
}
