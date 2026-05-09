"use client";

import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { COUNTRY_OPTIONS, DEPARTMENT_OPTIONS, JOB_TITLE_OPTIONS, OtherSelectField, PhoneNumberField, SuggestionInputField, TagInputWithSuggestions, countryLabel } from "@/components/crm/crm-form-fields";

export type LeadStatus = "new" | "qualified" | "proposal" | "won" | "lost";

export type LeadFormState = {
  firstName: string;
  lastName: string;
  title: string;
  associatedCompany: string;
  email: string;
  country: string;
  phoneCode: string;
  phone: string;
  source: string;
  status: LeadStatus;
  score: string;
  tags: string;
  linkedin: string;
  facebook: string;
  twitter: string;
  notes: string;
  department: string;
};

export const emptyLeadForm: LeadFormState = {
  firstName: "",
  lastName: "",
  title: "",
  associatedCompany: "",
  email: "",
  country: "India",
  phoneCode: "+91",
  phone: "",
  source: "",
  status: "new",
  score: "0",
  tags: "",
  linkedin: "",
  facebook: "",
  twitter: "",
  notes: "",
  department: "",
};

export function parseTags(value: string) {
  return value
    .split(/[|,;]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function buildLeadNotes(form: LeadFormState) {
  const lines = [
    ["Title", form.title],
    ["Country", form.country],
    ["Department", form.department],
    ["Phone code", form.phoneCode],
    ["LinkedIn", form.linkedin],
    ["Facebook", form.facebook],
    ["Twitter", form.twitter],
  ]
    .filter(([, value]) => value.trim())
    .map(([label, value]) => `${label}: ${value}`);
  return [form.notes.trim(), lines.length ? ["Lead details:", ...lines].join("\n") : null].filter(Boolean).join("\n\n");
}

export function buildLeadPayload(form: LeadFormState) {
  return {
    title: form.title.trim(),
    fullName: [form.firstName.trim(), form.lastName.trim()].filter(Boolean).join(" ") || undefined,
    associatedCompany: form.associatedCompany.trim() || undefined,
    email: form.email.trim() || undefined,
    phone: `${form.phoneCode} ${form.phone}`.trim() || undefined,
    source: form.source || undefined,
    status: form.status,
    score: Number(form.score) || 0,
    notes: buildLeadNotes(form) || undefined,
    tags: parseTags(form.tags),
  };
}

export function LeadFormFields({
  form,
  setForm,
  leadSources,
  tagSuggestions,
  companySuggestions,
}: {
  form: LeadFormState;
  setForm: (next: (current: LeadFormState) => LeadFormState) => void;
  leadSources: Array<{ key: string; label: string }>;
  tagSuggestions: string[];
  companySuggestions: string[];
}) {
  return (
    <div className="grid gap-4 rounded-2xl border border-border/60 bg-slate-50/70 p-4 md:grid-cols-2">
      <Field>
        <FieldLabel>First Name</FieldLabel>
        <Input value={form.firstName} onChange={(event) => setForm((current) => ({ ...current, firstName: event.target.value }))} className="h-10 text-sm" />
      </Field>
      <Field>
        <FieldLabel>Last Name</FieldLabel>
        <Input value={form.lastName} onChange={(event) => setForm((current) => ({ ...current, lastName: event.target.value }))} className="h-10 text-sm" />
      </Field>
      <OtherSelectField label="Job Title" value={form.title} options={JOB_TITLE_OPTIONS} onChange={(value) => setForm((current) => ({ ...current, title: value }))} />
      <OtherSelectField label="Department" value={form.department} options={DEPARTMENT_OPTIONS} onChange={(value) => setForm((current) => ({ ...current, department: value }))} />
      <SuggestionInputField label="Associated Company" value={form.associatedCompany} suggestions={companySuggestions} onChange={(value) => setForm((current) => ({ ...current, associatedCompany: value }))} placeholder="Start typing a company" />
      <Field>
        <FieldLabel>Email</FieldLabel>
        <Input value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} className="h-10 text-sm" />
      </Field>
      <Field>
        <FieldLabel>Country</FieldLabel>
        <NativeSelect value={form.country} onChange={(event) => setForm((current) => ({ ...current, country: event.target.value }))} className="h-10 rounded-xl px-3 text-sm">
          {COUNTRY_OPTIONS.map((country) => <option key={country.code} value={country.name}>{countryLabel(country)}</option>)}
        </NativeSelect>
      </Field>
      <PhoneNumberField label="Mobile Phone" code={form.phoneCode} number={form.phone} onCodeChange={(value) => setForm((current) => ({ ...current, phoneCode: value }))} onNumberChange={(value) => setForm((current) => ({ ...current, phone: value }))} />
      <Field>
        <FieldLabel>Source</FieldLabel>
        <NativeSelect value={form.source} onChange={(event) => setForm((current) => ({ ...current, source: event.target.value }))} className="h-10 rounded-xl px-3 text-sm">
          <option value="">Select source</option>
          {leadSources.map((source) => <option key={source.key} value={source.key}>{source.label}</option>)}
        </NativeSelect>
      </Field>
      <Field>
        <FieldLabel>Lead Status</FieldLabel>
        <NativeSelect value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as LeadStatus }))} className="h-10 rounded-xl px-3 text-sm">
          <option value="new">new</option><option value="qualified">qualified</option><option value="proposal">proposal</option><option value="won">won</option><option value="lost">lost</option>
        </NativeSelect>
      </Field>
      <Field>
        <FieldLabel>Score</FieldLabel>
        <Input type="number" min={0} value={form.score} onChange={(event) => setForm((current) => ({ ...current, score: event.target.value }))} className="h-10 text-sm" />
      </Field>
      <TagInputWithSuggestions label="Product Tags" value={form.tags} suggestions={tagSuggestions} onChange={(value) => setForm((current) => ({ ...current, tags: value }))} />
      <Field><FieldLabel>LinkedIn</FieldLabel><Input value={form.linkedin} onChange={(event) => setForm((current) => ({ ...current, linkedin: event.target.value }))} className="h-10 text-sm" /></Field>
      <Field><FieldLabel>Facebook</FieldLabel><Input value={form.facebook} onChange={(event) => setForm((current) => ({ ...current, facebook: event.target.value }))} className="h-10 text-sm" /></Field>
      <Field><FieldLabel>Twitter</FieldLabel><Input value={form.twitter} onChange={(event) => setForm((current) => ({ ...current, twitter: event.target.value }))} className="h-10 text-sm" /></Field>
      <Field className="md:col-span-2"><FieldLabel>Notes</FieldLabel><Textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} className="min-h-28 text-sm" /></Field>
    </div>
  );
}
