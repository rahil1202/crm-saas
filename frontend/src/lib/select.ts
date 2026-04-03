export const SELECT_EMPTY = "__none";
export const SELECT_ALL = "__all";

export function readOptionalSelectValue(value: string | null | undefined) {
  return !value || value === SELECT_EMPTY || value === SELECT_ALL ? "" : value;
}

export function optionalSelectValue(value: string | null | undefined, fallback = SELECT_EMPTY) {
  return value && value.length > 0 ? value : fallback;
}
