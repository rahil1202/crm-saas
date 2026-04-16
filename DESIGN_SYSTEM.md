# CRM SaaS Design System

This workspace uses the existing `components/ui` primitives as the base design system.

## Tokens

- Use `globals.css` tokens as the only source of truth for color, radius, spacing, and typography.
- Prefer semantic tokens over raw color values: `primary`, `secondary`, `muted`, `destructive`, `border`, `ring`.
- Use the typography roles already implied by component composition:
  - page title: shell header title
  - section title: `PageSection`
  - card title: `CardTitle`
  - helper text: `CardDescription`, `FieldDescription`

## Approved primitives

- Surface and structure: `Card`, `Alert`, `Tabs`, `Separator`
- Data/status: `Badge`, `Progress`, `Skeleton`
- Inputs: `Input`, `Textarea`, `Checkbox`, `Select`, `NativeSelect`
- Field composition: `Field`, `FieldGroup`, `FieldContent`, `FieldDescription`, `FieldError`
- Actions: `Button`

## Approved composition patterns

- `AppShell` for dashboard navigation and page framing
- `AuthShell` for auth-only flows
- `PageSection` for page subsections
- `CrudPanel` for create/edit/list cards
- `StatCard` for metrics
- `FilterBar` for filter and bulk-action rows
- `EmptyState` for no-data screens
- `LoadingState` for async loading copy
- `FormSection`, `FormErrorSummary`, `FormActions` for form composition

## Usage rules

- Use `Card` when content is a reusable panel; do not recreate custom bordered containers unless the pattern is genuinely new.
- Use `Alert` for page or form level failures and stateful guidance.
- Use `FieldDescription` for helper text and `FieldError` for field validation.
- Use `Badge` only for compact status/category indicators, not as a layout element.
- Avoid inline styles in app-facing UI. Prefer tokenized class-based composition.
- Use `SELECT_EMPTY` / `SELECT_ALL` helpers for optional filter/select state instead of ad hoc sentinel strings.
