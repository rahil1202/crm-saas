"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

import { CrmListPageHeader } from "@/components/crm/crm-list-primitives";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useCrmFormSuggestions } from "@/components/crm/use-crm-form-suggestions";
import { ApiError, apiRequest } from "@/lib/api";
import { buildLeadPayload, emptyLeadForm, LeadFormFields, type LeadFormState } from "@/features/leads/lead-form";

interface LeadSourceSettings {
  leadSources: Array<{ key: string; label: string }>;
}

export default function LeadCreatePage() {
  const [form, setForm] = useState<LeadFormState>(emptyLeadForm);
  const [leadSources, setLeadSources] = useState<Array<{ key: string; label: string }>>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { productTags, associatedCompanies, error: suggestionError } = useCrmFormSuggestions();

  useEffect(() => {
    void apiRequest<LeadSourceSettings>("/settings/lead-sources")
      .then((sources) => {
        setLeadSources(sources.leadSources);
        setForm((current) => ({ ...current, source: current.source || sources.leadSources[0]?.key || "" }));
      })
      .catch((requestError) => {
        setError(requestError instanceof ApiError ? requestError.message : "Unable to load lead form data.");
      });
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiRequest("/leads", { method: "POST", body: JSON.stringify(buildLeadPayload(form)) });
      toast.success("Lead created");
      window.location.href = "/dashboard/leads";
    } catch (requestError) {
      const message = requestError instanceof ApiError ? requestError.message : "Unable to save lead";
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid gap-5">
      {error || suggestionError ? <Alert variant="destructive"><AlertTitle>Lead error</AlertTitle><AlertDescription>{error ?? suggestionError}</AlertDescription></Alert> : null}
      <CrmListPageHeader
        title="Create Lead"
        actions={<Button type="button" variant="outline" size="sm" asChild><Link href="/dashboard/leads"><ArrowLeft className="size-4" /> Back to Leads</Link></Button>}
      />
      <form onSubmit={handleSubmit} className="grid gap-4">
        <LeadFormFields form={form} setForm={setForm} leadSources={leadSources} tagSuggestions={productTags} companySuggestions={associatedCompanies} />
        <div className="flex justify-end"><Button type="submit" disabled={submitting}>{submitting ? "Saving..." : "Save Lead"}</Button></div>
      </form>
    </div>
  );
}
