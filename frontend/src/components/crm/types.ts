import type { ReactNode } from "react";

export type CrmListTabKey = "all" | "mine" | "documents";
export type CrmSortDirection = "asc" | "desc";
export type ColumnVisibility<TColumnKey extends string> = Record<TColumnKey, boolean>;

export interface ColumnDefinition<TRecord, TColumnKey extends string, TSortKey extends string = never> {
  key: TColumnKey;
  label: string;
  widthClassName?: string;
  sortable?: boolean;
  sortKey?: TSortKey;
  headerClassName?: string;
  cellClassName?: string;
  renderCell: (record: TRecord) => ReactNode;
}

export type CrmListQueryState<TFilters, TSortKey extends string> = {
  tab: CrmListTabKey;
  filters: TFilters;
  page: number;
  limit: number;
  sortBy: TSortKey;
  sortDir: CrmSortDirection;
};
