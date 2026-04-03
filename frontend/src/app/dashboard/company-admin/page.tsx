"use client";

import { FormEvent, useEffect, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { FormErrorSummary, FormSection } from "@/components/forms/form-primitives";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { CrudPanel, EmptyState, LoadingState, PageSection, StatCard } from "@/components/ui/page-patterns";
import { apiRequest } from "@/lib/api";
import { useAsyncForm } from "@/hooks/use-async-form";

interface CompanyAdminResponse {
  company: {
    id: string;
    name: string;
    timezone: string;
    currency: string;
  };
  plan: {
    planCode: string;
    planName: string;
    status: string;
    billingInterval: string;
    seatLimit: number;
    monthlyPrice: number;
    currency: string;
    trialEndsAt: string | null;
    renewalDate: string | null;
    notes: string | null;
  } | null;
  stores: Array<{
    id: string;
    name: string;
    code: string;
    isDefault: boolean;
  }>;
  members: Array<{ membershipId: string }>;
  invites: Array<{ inviteId: string }>;
}

interface CompanyPlanResponse {
  plan: CompanyAdminResponse["plan"];
}

export default function CompanyAdminPage() {
  const [snapshot, setSnapshot] = useState<CompanyAdminResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [branchName, setBranchName] = useState("");
  const [branchCode, setBranchCode] = useState("");
  const { submitting, formError, fieldErrors, clearFieldError, runSubmit } = useAsyncForm();

  useEffect(() => {
    let disposed = false;

    const load = async () => {
      try {
        const [companySnapshot, planPayload] = await Promise.all([
          apiRequest<CompanyAdminResponse>("/companies/current"),
          apiRequest<CompanyPlanResponse>("/companies/current/plan"),
        ]);

        if (!disposed) {
          setSnapshot({
            ...companySnapshot,
            plan: planPayload.plan,
          });
        }
      } catch (requestError) {
        if (!disposed) {
          // surface through the shared summary below
        }
      } finally {
        if (!disposed) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      disposed = true;
    };
  }, []);

  const createBranch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      const response = await runSubmit(
        () =>
          apiRequest<{ store: CompanyAdminResponse["stores"][number] }>("/companies/stores", {
            method: "POST",
            body: JSON.stringify({
              name: branchName,
              code: branchCode,
            }),
          }),
        "Unable to create branch",
      );

      setSnapshot((current) =>
        current
          ? {
              ...current,
              stores: [...current.stores, response.store],
            }
          : current,
      );
      setBranchName("");
      setBranchCode("");
    } catch {}
  };

  return (
    <AppShell
      title="Company Admin"
      description="Company-level administration for workspace profile, branch footprint, and current subscription plan."
    >
      <div className="grid gap-6">
        <FormErrorSummary title="Company admin request failed" error={formError} />

        {loading ? <LoadingState label="Loading company admin data..." /> : null}

        {snapshot ? (
          <PageSection>
            <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
            <CrudPanel title="Workspace overview" description="Operational identity and current plan details for the active company.">
              <div className="grid gap-3">
                <div className="rounded-xl border px-4 py-3">
                  <div className="text-sm text-muted-foreground">Company</div>
                  <div className="mt-1 font-medium">{snapshot.company.name}</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {snapshot.company.timezone} • {snapshot.company.currency}
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <StatCard label="Members" value={snapshot.members.length} />
                  <StatCard label="Pending invites" value={snapshot.invites.length} />
                </div>
                <div className="rounded-xl border px-4 py-3">
                  <div className="text-sm text-muted-foreground">Plan</div>
                  <div className="mt-1 font-medium">
                    {snapshot.plan?.planName ?? "No plan assigned"} {snapshot.plan ? `(${snapshot.plan.status})` : ""}
                  </div>
                  {snapshot.plan ? (
                    <div className="mt-1 text-sm text-muted-foreground">
                      {snapshot.plan.seatLimit} seats • ${snapshot.plan.monthlyPrice}/mo • {snapshot.plan.billingInterval}
                    </div>
                  ) : null}
                </div>
              </div>
            </CrudPanel>

            <CrudPanel title="Branch management" description="Add new company branches and review the current workspace footprint.">
              <div className="grid gap-4">
                <form className="grid gap-4 rounded-xl border bg-muted/20 p-4" onSubmit={createBranch}>
                  <FormSection title="Create branch" description="Use a stable code that can be reused in invites and store scoping.">
                    <FieldGroup>
                      <Field>
                        <FieldLabel htmlFor="branch-name">Branch name</FieldLabel>
                        <Input id="branch-name" value={branchName} onChange={(event) => { clearFieldError("name"); setBranchName(event.target.value); }} required />
                        <FieldError errors={fieldErrors.name?.map((message) => ({ message }))} />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="branch-code">Branch code</FieldLabel>
                        <Input id="branch-code" value={branchCode} onChange={(event) => { clearFieldError("code"); setBranchCode(event.target.value); }} required />
                        <FieldError errors={fieldErrors.code?.map((message) => ({ message }))} />
                      </Field>
                    </FieldGroup>
                  </FormSection>
                  <Button type="submit" disabled={submitting} className="w-fit">
                    {submitting ? "Creating..." : "Create branch"}
                  </Button>
                </form>

                <div className="grid gap-3">
                  {snapshot.stores.map((store) => (
                    <div key={store.id} className="rounded-xl border px-4 py-3">
                      <div className="font-medium">{store.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {store.code} {store.isDefault ? "• default branch" : ""}
                      </div>
                    </div>
                  ))}
                  {snapshot.stores.length === 0 ? <EmptyState title="No branches yet" description="Create the first branch to scope members and workspace operations." /> : null}
                </div>
              </div>
            </CrudPanel>
          </div>
          </PageSection>
        ) : null}
      </div>
    </AppShell>
  );
}
