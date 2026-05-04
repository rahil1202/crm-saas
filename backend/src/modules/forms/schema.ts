import { z } from "zod";

const formFieldTypeSchema = z.enum(["text", "email", "phone", "textarea", "select", "radio", "checkbox", "url"]);
const formFieldWidthSchema = z.enum(["full", "half"]);

export const formFieldSchema = z.object({
  id: z.string().trim().min(1).max(80),
  type: formFieldTypeSchema,
  name: z.string().trim().min(1).max(80).regex(/^[a-zA-Z][a-zA-Z0-9_]*$/),
  label: z.string().trim().min(1).max(120),
  placeholder: z.string().trim().max(180).optional(),
  helpText: z.string().trim().max(240).optional(),
  required: z.boolean().default(false),
  width: formFieldWidthSchema.default("full"),
  options: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
}).superRefine((value, ctx) => {
  if ((value.type === "select" || value.type === "radio") && (!value.options || value.options.length === 0)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Options are required for select and radio fields", path: ["options"] });
  }
  if (value.type !== "select" && value.type !== "radio" && value.options && value.options.length > 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Options are allowed only for select and radio fields", path: ["options"] });
  }
});

export const formThemeSettingsSchema = z.object({
  heading: z.string().trim().max(180).default(""),
  subheading: z.string().trim().max(500).default(""),
  submitButtonText: z.string().trim().min(1).max(80).default("Submit"),
  primaryColor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).default("#0ea5e9"),
  backgroundColor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).default("#ffffff"),
});

export const formResponseSettingsSchema = z.object({
  mode: z.literal("message").default("message"),
  messageTitle: z.string().trim().min(1).max(160).default("Thank you"),
  messageBody: z.string().trim().min(1).max(500).default("Your response has been submitted successfully."),
  captchaEnabled: z.boolean().default(true),
});

export const listFormsSchema = z.object({
  q: z.string().trim().optional(),
  status: z.enum(["draft", "published", "archived"]).optional(),
  websiteDomain: z.string().trim().optional(),
  lifecycle: z.enum(["active", "deleted"]).default("active"),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

const baseFormSchema = z.object({
  name: z.string().trim().min(1).max(180),
  websiteDomain: z.string().trim().max(255).optional(),
  description: z.string().trim().max(1000).optional(),
  schema: z.array(formFieldSchema).max(100).default([]),
  themeSettings: formThemeSettingsSchema.default({
    heading: "",
    subheading: "",
    submitButtonText: "Submit",
    primaryColor: "#0ea5e9",
    backgroundColor: "#ffffff",
  }),
  responseSettings: formResponseSettingsSchema.default({
    mode: "message",
    messageTitle: "Thank you",
    messageBody: "Your response has been submitted successfully.",
    captchaEnabled: true,
  }),
});

export const createFormSchema = baseFormSchema.superRefine((value, ctx) => {
  const names = new Set<string>();
  const ids = new Set<string>();

  for (const [index, field] of value.schema.entries()) {
    const normalizedName = field.name.trim().toLowerCase();
    const normalizedId = field.id.trim().toLowerCase();

    if (names.has(normalizedName)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Field names must be unique",
        path: ["schema", index, "name"],
      });
    }

    if (ids.has(normalizedId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Field ids must be unique",
        path: ["schema", index, "id"],
      });
    }

    names.add(normalizedName);
    ids.add(normalizedId);
  }
});

export const updateFormSchema = baseFormSchema.partial();


export const formParamSchema = z.object({
  formId: z.string().uuid(),
});

export const listFormResponsesSchema = z.object({
  q: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const publicFormSlugSchema = z.object({
  slug: z.string().trim().min(1).max(220),
});

export const publicSubmitSchema = z.object({
  values: z.record(z.string(), z.union([z.string(), z.boolean(), z.array(z.string())])),
  sourceUrl: z.string().trim().url().optional(),
  websiteDomain: z.string().trim().max(255).optional(),
  honey: z.string().max(0).optional(),
  captchaToken: z.string().trim().max(4096).optional(),
});

export type CreateFormInput = z.infer<typeof createFormSchema>;
export type UpdateFormInput = z.infer<typeof updateFormSchema>;
export type ListFormsQuery = z.infer<typeof listFormsSchema>;
export type ListFormResponsesQuery = z.infer<typeof listFormResponsesSchema>;
export type PublicFormSubmitInput = z.infer<typeof publicSubmitSchema>;
