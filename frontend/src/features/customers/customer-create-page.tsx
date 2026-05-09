"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

import { CrmListPageHeader } from "@/components/crm/crm-list-primitives";
import { DEPARTMENT_OPTIONS, JOB_TITLE_OPTIONS, COUNTRY_OPTIONS, OtherSelectField, PhoneNumberField, SuggestionInputField, TagInputWithSuggestions, countryLabel } from "@/components/crm/crm-form-fields";
import { useCrmFormSuggestions } from "@/components/crm/use-crm-form-suggestions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiRequest } from "@/lib/api";

const callRemarkOptions = ["Interested", "Not Interested", "No Assets", "Not Started"] as const;
const callStatusOptions = ["Not Started", "Answered", "Not Answered 1", "Not Answered 2", "Not Connected", "Out of Reach", "Wrong Number"] as const;

type CreateFormState = {
  firstName: string;
  lastName: string;
  title: string;
  seniority: string;
  departments: string;
  callRemark: string;
  callStatus: string;
  country: string;
  associatedCompany: string;
  email: string;
  corporatePhoneCode: string;
  corporatePhone: string;
  mobilePhoneCode: string;
  mobilePhone: string;
  otherPhone: string;
  workDirectPhone: string;
  tags: string;
  linkedin: string;
  facebook: string;
  twitter: string;
  notes: string;
};

const emptyCreateForm: CreateFormState = {
  firstName: "",
  lastName: "",
  title: "",
  seniority: "",
  departments: "",
  callRemark: "Not Started",
  callStatus: "Not Started",
  country: "India",
  associatedCompany: "",
  email: "",
  corporatePhoneCode: "+91",
  corporatePhone: "",
  mobilePhoneCode: "+91",
  mobilePhone: "",
  otherPhone: "",
  workDirectPhone: "",
  tags: "",
  linkedin: "",
  facebook: "",
  twitter: "",
  notes: "",
};

function parseTags(value: string) {
  return value
    .split(/[|,;]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildCreateNotes(form: CreateFormState) {
  const lines = [
    ["Title", form.title],
    ["Seniority", form.seniority],
    ["Departments", form.departments],
    ["Country", form.country],
    ["Corporate phone", `${form.corporatePhoneCode} ${form.corporatePhone}`.trim()],
    ["Mobile phone", `${form.mobilePhoneCode} ${form.mobilePhone}`.trim()],
    ["Other phone", form.otherPhone],
    ["Work direct phone", form.workDirectPhone],
    ["LinkedIn", form.linkedin],
    ["Facebook", form.facebook],
    ["Twitter", form.twitter],
  ]
    .filter(([, value]) => value.trim())
    .map(([label, value]) => `${label}: ${value}`);

  return [form.notes.trim(), lines.length ? ["Contact details:", ...lines].join("\n") : null].filter(Boolean).join("\n\n");
}

function buildCreatePayload(form: CreateFormState) {
  const fullName = [form.firstName.trim(), form.lastName.trim()].filter(Boolean).join(" ");
  const primaryPhone =
    `${form.corporatePhoneCode} ${form.corporatePhone}`.trim() ||
    `${form.mobilePhoneCode} ${form.mobilePhone}`.trim() ||
    form.workDirectPhone.trim() ||
    form.otherPhone.trim();

  return {
    fullName,
    associatedCompany: form.associatedCompany.trim() || undefined,
    email: form.email.trim() || undefined,
    phone: primaryPhone || undefined,
    tags: parseTags(form.tags),
    notes: buildCreateNotes(form) || undefined,
  };
}

export default function ContactCreatePage() {
  const [form, setForm] = useState<CreateFormState>(emptyCreateForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { productTags, associatedCompanies, error: suggestionError } = useCrmFormSuggestions();

  const countryValue = useMemo(() => {
    return COUNTRY_OPTIONS.some((item) => item.name === form.country) ? form.country : "";
  }, [form.country]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await apiRequest("/customers", {
        method: "POST",
        body: JSON.stringify(buildCreatePayload(form)),
      });
      toast.success("Contact created.");
      window.location.href = "/dashboard/contacts";
    } catch (requestError) {
      const message = requestError instanceof ApiError ? requestError.message : "Unable to create contact.";
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid gap-5">
      {error || suggestionError ? (
        <Alert variant="destructive">
          <AlertTitle>Contact error</AlertTitle>
          <AlertDescription>{error ?? suggestionError}</AlertDescription>
        </Alert>
      ) : null}

      <CrmListPageHeader
        title="Create Contact"
        actions={
          <Button type="button" asChild variant="outline" size="sm">
            <Link href="/dashboard/contacts">
              <ArrowLeft className="size-4" /> Back to Contacts
            </Link>
          </Button>
        }
      />

      <form onSubmit={handleSubmit} className="grid gap-5">
        <div className="grid gap-4 rounded-2xl border border-border/60 bg-slate-50/70 p-4 md:grid-cols-2">
          <Field>
            <FieldLabel>First Name *</FieldLabel>
            <Input value={form.firstName} onChange={(event) => setForm((current) => ({ ...current, firstName: event.target.value }))} required className="h-10 text-sm" />
          </Field>
          <Field>
            <FieldLabel>Last Name *</FieldLabel>
            <Input value={form.lastName} onChange={(event) => setForm((current) => ({ ...current, lastName: event.target.value }))} required className="h-10 text-sm" />
          </Field>
          <OtherSelectField label="Job Title" value={form.title} options={JOB_TITLE_OPTIONS} onChange={(value) => setForm((current) => ({ ...current, title: value }))} />
          <Field>
            <FieldLabel>Seniority</FieldLabel>
            <Input value={form.seniority} onChange={(event) => setForm((current) => ({ ...current, seniority: event.target.value }))} className="h-10 text-sm" />
          </Field>
          <OtherSelectField label="Department" value={form.departments} options={DEPARTMENT_OPTIONS} onChange={(value) => setForm((current) => ({ ...current, departments: value }))} />
          <SuggestionInputField label="Associated Company" value={form.associatedCompany} suggestions={associatedCompanies} onChange={(value) => setForm((current) => ({ ...current, associatedCompany: value }))} placeholder="Start typing a company" />
          <Field>
            <FieldLabel>Country</FieldLabel>
            <NativeSelect value={countryValue} onChange={(event) => setForm((current) => ({ ...current, country: event.target.value }))} className="h-10 rounded-xl px-3 text-sm">
              <option value="">Select country</option>
              {COUNTRY_OPTIONS.map((country) => (
                <option key={country.code} value={country.name}>
                  {countryLabel(country)}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel>Email *</FieldLabel>
            <Input type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} required className="h-10 text-sm" />
          </Field>
          <PhoneNumberField label="Corporate Phone" code={form.corporatePhoneCode} number={form.corporatePhone} onCodeChange={(value) => setForm((current) => ({ ...current, corporatePhoneCode: value }))} onNumberChange={(value) => setForm((current) => ({ ...current, corporatePhone: value }))} />
          <PhoneNumberField label="Mobile Phone" code={form.mobilePhoneCode} number={form.mobilePhone} onCodeChange={(value) => setForm((current) => ({ ...current, mobilePhoneCode: value }))} onNumberChange={(value) => setForm((current) => ({ ...current, mobilePhone: value }))} />
          <Field>
            <FieldLabel>Other Phone</FieldLabel>
            <Input value={form.otherPhone} onChange={(event) => setForm((current) => ({ ...current, otherPhone: event.target.value }))} className="h-10 text-sm" />
          </Field>
          <Field>
            <FieldLabel>Work Direct Phone</FieldLabel>
            <Input value={form.workDirectPhone} onChange={(event) => setForm((current) => ({ ...current, workDirectPhone: event.target.value }))} className="h-10 text-sm" />
          </Field>
          <Field>
            <FieldLabel>Call Remark</FieldLabel>
            <NativeSelect value={form.callRemark} onChange={(event) => setForm((current) => ({ ...current, callRemark: event.target.value }))} className="h-10 rounded-xl px-3 text-sm">
              {callRemarkOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel>Call Status</FieldLabel>
            <NativeSelect value={form.callStatus} onChange={(event) => setForm((current) => ({ ...current, callStatus: event.target.value }))} className="h-10 rounded-xl px-3 text-sm">
              {callStatusOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </NativeSelect>
          </Field>
        </div>

        <div className="grid gap-4 rounded-2xl border border-border/60 bg-white p-4">
          <TagInputWithSuggestions label="Product Tags" value={form.tags} suggestions={productTags} onChange={(value) => setForm((current) => ({ ...current, tags: value }))} />
          <div className="grid gap-4 md:grid-cols-3">
            <Field><FieldLabel>LinkedIn</FieldLabel><Input value={form.linkedin} onChange={(event) => setForm((current) => ({ ...current, linkedin: event.target.value }))} className="h-10 text-sm" /></Field>
            <Field><FieldLabel>Facebook</FieldLabel><Input value={form.facebook} onChange={(event) => setForm((current) => ({ ...current, facebook: event.target.value }))} className="h-10 text-sm" /></Field>
            <Field><FieldLabel>Twitter</FieldLabel><Input value={form.twitter} onChange={(event) => setForm((current) => ({ ...current, twitter: event.target.value }))} className="h-10 text-sm" /></Field>
          </div>
          <Field>
            <FieldLabel>Notes</FieldLabel>
            <Textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} className="min-h-28 text-sm" />
          </Field>
        </div>

        <div className="flex justify-end">
          <Button type="submit" disabled={submitting}>{submitting ? "Saving..." : "Save Contact"}</Button>
        </div>
      </form>
    </div>
  );
}
