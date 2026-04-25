export type FormFieldDefinition = {
  id: string;
  type: "text" | "email" | "phone" | "textarea" | "select" | "radio" | "checkbox" | "url";
  name: string;
  label: string;
  placeholder?: string;
  helpText?: string;
  required: boolean;
  width?: "full" | "half";
  options?: string[];
};

export type FormThemeSettings = {
  heading: string;
  subheading: string;
  submitButtonText: string;
  primaryColor: string;
  backgroundColor: string;
};

export type FormResponseSettings = {
  mode: "message";
  messageTitle: string;
  messageBody: string;
  captchaEnabled: boolean;
};

export type FormDefinition = {
  id: string;
  companyId: string;
  name: string;
  slug: string;
  websiteDomain: string | null;
  description: string | null;
  status: "draft" | "published" | "archived";
  schema: FormFieldDefinition[];
  themeSettings: FormThemeSettings;
  responseSettings: FormResponseSettings;
  createdBy: string;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  publicUrl: string;
  embedSnippet: string;
};

export type FormListItem = FormDefinition & {
  submissions: number;
  lastSubmissionAt: string | null;
};

export type FormListResponse = {
  items: FormListItem[];
  total: number;
  limit: number;
  offset: number;
};

export type FormDetailResponse = FormDefinition & {
  stats: {
    submissions: number;
    lastSubmissionAt: string | null;
    conversions: number;
  };
};

export type FormResponseRow = {
  id: string;
  formId: string;
  companyId: string;
  linkedLeadId: string | null;
  payload: Record<string, unknown>;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  websiteDomain: string | null;
  sourceUrl: string | null;
  referer: string | null;
  userAgent: string | null;
  ipHash: string | null;
  submittedAt: string;
};

export type FormResponseListResponse = {
  items: FormResponseRow[];
  total: number;
  limit: number;
  offset: number;
};

export type PublicFormResponse = Pick<FormDefinition, "id" | "name" | "slug" | "websiteDomain" | "schema" | "themeSettings" | "responseSettings">;
