"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ArrowLeft, ArrowRight, Building2, CheckCircle2, LoaderCircle, Plus, Trash2, UserRound, Users } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Progress, ProgressLabel } from "@/components/ui/progress";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError, apiRequest } from "@/lib/api";
import { fetchAuthMe, readApiError, type AuthMePayload } from "@/lib/auth-client";
import { clearCachedMe } from "@/lib/me-cache";
import { setCompanyCookie, setStoreCookie } from "@/lib/cookies";
import { getFrontendEnv } from "@/lib/env";

interface OnboardingResponse {
  companyId: string;
  storeId: string;
}

interface InviteRow {
  id: string;
  email: string;
  role: "owner" | "admin" | "member";
  storeScope: "company" | "primary";
}

interface OnboardingDraft {
  companyName: string;
  companyWebsite: string;
  companyAddress: string;
  country: string;
  state: string;
  city: string;
  timezone: string;
  currency: string;
  firstName: string;
  lastName: string;
  mobileNumber: string;
  secondaryContact: string;
  branchName: string;
  branchAddress: string;
  branchCountry: string;
  branchState: string;
  branchCity: string;
  invites: InviteRow[];
}

const STEP_COUNT = 4;
const STEP_META = [
  { title: "Company Info", icon: Building2 },
  { title: "Owner Info", icon: UserRound },
  { title: "Main Branch", icon: Building2 },
  { title: "Invite Team", icon: Users },
];

const FALLBACK_TIMEZONES = ["Asia/Kolkata", "UTC", "America/New_York", "America/Los_Angeles", "Europe/London", "Europe/Berlin", "Asia/Dubai", "Asia/Singapore", "Australia/Sydney"];
const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SAR", "SGD", "AUD", "CAD"];

const LOCATION_DATA: Record<
  string,
  {
    timezone: string;
    currency: string;
    states: Record<string, string[]>;
  }
> = {
  India: {
    timezone: "Asia/Kolkata",
    currency: "INR",
    states: {
      Maharashtra: ["Mumbai", "Pune", "Nagpur"],
      Karnataka: ["Bengaluru", "Mysuru", "Hubli"],
      Delhi: ["New Delhi"],
      "Tamil Nadu": ["Chennai", "Coimbatore", "Madurai"],
      Gujarat: ["Ahmedabad", "Surat", "Vadodara"],
    },
  },
  "United States": {
    timezone: "America/New_York",
    currency: "USD",
    states: {
      California: ["Los Angeles", "San Francisco", "San Diego"],
      Texas: ["Houston", "Dallas", "Austin"],
      Florida: ["Miami", "Orlando", "Tampa"],
      "New York": ["New York City", "Buffalo", "Rochester"],
    },
  },
  "United Arab Emirates": {
    timezone: "Asia/Dubai",
    currency: "AED",
    states: {
      Dubai: ["Dubai"],
      AbuDhabi: ["Abu Dhabi"],
      Sharjah: ["Sharjah"],
    },
  },
  Singapore: {
    timezone: "Asia/Singapore",
    currency: "SGD",
    states: {
      Singapore: ["Singapore"],
    },
  },
  "United Kingdom": {
    timezone: "Europe/London",
    currency: "GBP",
    states: {
      England: ["London", "Manchester", "Birmingham"],
      Scotland: ["Edinburgh", "Glasgow", "Aberdeen"],
    },
  },
};

const COUNTRY_CODE_MAP: Record<string, string> = {
  IN: "India",
  US: "United States",
  AE: "United Arab Emirates",
  SG: "Singapore",
  GB: "United Kingdom",
};

function createInviteRow(): InviteRow {
  return { id: crypto.randomUUID(), email: "", role: "member", storeScope: "company" };
}

function createInitialDraft(fullName?: string | null): OnboardingDraft {
  const [firstName, ...lastNameParts] = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  return {
    companyName: "",
    companyWebsite: "",
    companyAddress: "",
    country: "India",
    state: "",
    city: "",
    timezone: "Asia/Kolkata",
    currency: "INR",
    firstName: firstName ?? "",
    lastName: lastNameParts.join(" "),
    mobileNumber: "",
    secondaryContact: "",
    branchName: "",
    branchAddress: "",
    branchCountry: "",
    branchState: "",
    branchCity: "",
    invites: [createInviteRow()],
  };
}

function normalizeStep(value: string | null) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > STEP_COUNT) {
    return 1;
  }
  return parsed;
}

function getTimezones() {
  if (typeof Intl.supportedValuesOf === "function") {
    try {
      return Intl.supportedValuesOf("timeZone");
    } catch {
      return FALLBACK_TIMEZONES;
    }
  }
  return FALLBACK_TIMEZONES;
}

function getDefaultState(country: string) {
  const states = Object.keys(LOCATION_DATA[country]?.states ?? {});
  return states[0] ?? "";
}

function getDefaultCity(country: string, state: string) {
  const cities = LOCATION_DATA[country]?.states[state] ?? [];
  return cities[0] ?? "";
}

function detectBrowserCountry() {
  if (typeof navigator === "undefined") {
    return null;
  }

  const regionFromLocale = Intl.DateTimeFormat().resolvedOptions().locale.match(/-([A-Z]{2})$/i)?.[1]?.toUpperCase() ?? null;
  if (regionFromLocale && COUNTRY_CODE_MAP[regionFromLocale]) {
    return COUNTRY_CODE_MAP[regionFromLocale];
  }

  const languageRegion = navigator.language.match(/-([A-Z]{2})$/i)?.[1]?.toUpperCase() ?? null;
  if (languageRegion && COUNTRY_CODE_MAP[languageRegion]) {
    return COUNTRY_CODE_MAP[languageRegion];
  }

  return null;
}

function draftStorageKey(userId: string) {
  return `crm.company-onboarding-draft:${userId}`;
}

function field(value: string) {
  return value.trim();
}

function firstInvalidStep(draft: OnboardingDraft) {
  if (!field(draft.companyName) || !field(draft.companyAddress) || !field(draft.country) || !field(draft.state) || !field(draft.city) || !field(draft.timezone) || !field(draft.currency)) {
    return 1;
  }

  if (!field(draft.firstName) || !field(draft.lastName) || !field(draft.mobileNumber)) {
    return 2;
  }

  return null;
}

function canEnterStep(draft: OnboardingDraft, step: number) {
  const invalid = firstInvalidStep(draft);
  return !invalid || step <= invalid;
}

function CompanyOnboardingContent() {
  const env = getFrontendEnv();
  const router = useRouter();
  const searchParams = useSearchParams();
  const step = normalizeStep(searchParams.get("step"));
  const [authMe, setAuthMe] = useState<AuthMePayload | null>(null);
  const [draft, setDraft] = useState<OnboardingDraft>(() => createInitialDraft());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteErrors, setInviteErrors] = useState<Array<{ email: string; message: string }>>([]);
  const timezoneAutofilledRef = useRef(false);
  const timezones = useMemo(() => getTimezones(), []);
  const countries = useMemo(() => Object.keys(LOCATION_DATA), []);
  const companyStates = useMemo(() => Object.keys(LOCATION_DATA[draft.country]?.states ?? {}), [draft.country]);
  const companyCities = useMemo(() => LOCATION_DATA[draft.country]?.states[draft.state] ?? [], [draft.country, draft.state]);
  const branchCountry = draft.branchCountry || draft.country;
  const branchStates = useMemo(() => Object.keys(LOCATION_DATA[branchCountry]?.states ?? {}), [branchCountry]);
  const branchState = draft.branchState || draft.state;
  const branchCities = useMemo(() => LOCATION_DATA[branchCountry]?.states[branchState] ?? [], [branchCountry, branchState]);
  const progress = Math.round((step / STEP_COUNT) * 100);
  const StepIcon = STEP_META[step - 1]?.icon ?? Building2;

  useEffect(() => {
    let disposed = false;

    const bootstrap = async () => {
      const me = await fetchAuthMe();
      if (!me) {
        router.replace("/auth/login");
        return;
      }

      if (!me.needsOnboarding) {
        router.replace("/dashboard");
        return;
      }

      if (disposed) {
        return;
      }

      const key = draftStorageKey(me.user.id);
      const initial = createInitialDraft(me.user.fullName);
      const stored = typeof window !== "undefined" ? window.sessionStorage.getItem(key) : null;
      if (stored) {
        try {
          setDraft({ ...initial, ...(JSON.parse(stored) as Partial<OnboardingDraft>) });
        } catch {
          setDraft(initial);
        }
      } else {
        setDraft(initial);
      }

      setAuthMe(me);
      setLoading(false);
    };

    void bootstrap();

    return () => {
      disposed = true;
    };
  }, [router]);

  useEffect(() => {
    if (!authMe || loading) {
      return;
    }

    window.sessionStorage.setItem(draftStorageKey(authMe.user.id), JSON.stringify(draft));
  }, [authMe, draft, loading]);

  useEffect(() => {
    if (loading || timezoneAutofilledRef.current) {
      return;
    }

    const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const browserCountry = detectBrowserCountry();

    setDraft((current) => {
      const nextCountry = browserCountry && LOCATION_DATA[browserCountry] ? browserCountry : current.country;
      const nextState = current.state || getDefaultState(nextCountry);
      const nextCity = current.city || getDefaultCity(nextCountry, nextState);
      const nextTimezone = browserTimezone || LOCATION_DATA[nextCountry]?.timezone || current.timezone;
      const nextCurrency = LOCATION_DATA[nextCountry]?.currency || current.currency;
      return {
        ...current,
        country: nextCountry,
        state: nextState,
        city: nextCity,
        timezone: nextTimezone,
        currency: nextCurrency,
      };
    });

    timezoneAutofilledRef.current = true;
  }, [loading]);

  useEffect(() => {
    if (loading) {
      return;
    }

    const normalized = normalizeStep(searchParams.get("step"));
    if (normalized !== step) {
      router.replace(`/company-onboarding?step=${normalized}`);
      return;
    }

    if (!canEnterStep(draft, step)) {
      router.replace(`/company-onboarding?step=${firstInvalidStep(draft) ?? 1}`);
    }
  }, [draft, loading, router, searchParams, step]);

  const updateDraft = (values: Partial<OnboardingDraft>) => {
    setDraft((current) => ({ ...current, ...values }));
  };

  const handleCountryChange = (country: string) => {
    const state = getDefaultState(country);
    const city = getDefaultCity(country, state);
    updateDraft({
      country,
      state,
      city,
      timezone: LOCATION_DATA[country]?.timezone ?? draft.timezone,
      currency: LOCATION_DATA[country]?.currency ?? draft.currency,
    });
  };

  const handleStateChange = (state: string) => {
    const city = getDefaultCity(draft.country, state);
    updateDraft({
      state,
      city,
      timezone: LOCATION_DATA[draft.country]?.timezone ?? draft.timezone,
    });
  };

  const handleBranchCountryChange = (country: string) => {
    if (!country) {
      updateDraft({ branchCountry: "", branchState: "", branchCity: "" });
      return;
    }

    const state = getDefaultState(country);
    const city = getDefaultCity(country, state);
    updateDraft({ branchCountry: country, branchState: state, branchCity: city });
  };

  const handleBranchStateChange = (state: string) => {
    if (!state) {
      updateDraft({ branchState: "", branchCity: "" });
      return;
    }

    const city = getDefaultCity(branchCountry, state);
    updateDraft({ branchState: state, branchCity: city });
  };

  const goToStep = (nextStep: number) => {
    setError(null);
    const invalid = firstInvalidStep(draft);
    if (invalid && nextStep > invalid) {
      router.push(`/company-onboarding?step=${invalid}`);
      return;
    }
    router.push(`/company-onboarding?step=${Math.min(Math.max(nextStep, 1), STEP_COUNT)}`);
  };

  const handleInviteChange = (inviteId: string, fieldName: keyof InviteRow, value: string) => {
    updateDraft({
      invites: draft.invites.map((invite) => (invite.id === inviteId ? { ...invite, [fieldName]: value } : invite)),
    });
  };

  const addInvite = () => {
    updateDraft({ invites: [...draft.invites, createInviteRow()] });
  };

  const removeInvite = (inviteId: string) => {
    const next = draft.invites.length > 1 ? draft.invites.filter((invite) => invite.id !== inviteId) : [{ ...draft.invites[0]!, email: "" }];
    updateDraft({ invites: next });
  };

  const finalizeSetup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const invalid = firstInvalidStep(draft);
    if (invalid) {
      router.push(`/company-onboarding?step=${invalid}`);
      return;
    }

    setSubmitting(true);
    setError(null);
    setInviteErrors([]);

    const onboardingResponse = await fetch(`${env.apiUrl}/api/v1/auth/onboarding`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyName: field(draft.companyName),
        companyWebsite: field(draft.companyWebsite),
        companyAddress: field(draft.companyAddress),
        country: field(draft.country),
        state: field(draft.state),
        city: field(draft.city),
        timezone: field(draft.timezone),
        currency: field(draft.currency).toUpperCase(),
        firstName: field(draft.firstName),
        lastName: field(draft.lastName),
        mobileNumber: field(draft.mobileNumber),
        secondaryContact: field(draft.secondaryContact),
        branchName: field(draft.branchName),
        branchAddress: field(draft.branchAddress),
        branchCountry: field(draft.branchCountry),
        branchState: field(draft.branchState),
        branchCity: field(draft.branchCity),
      }),
    });

    if (!onboardingResponse.ok) {
      setError(await readApiError(onboardingResponse, "Onboarding failed"));
      setSubmitting(false);
      return;
    }

    const onboardingPayload = (await onboardingResponse.json()) as { data?: OnboardingResponse };
    const onboardingData = onboardingPayload.data;
    if (!onboardingData?.companyId || !onboardingData.storeId) {
      setError("Onboarding response is missing company context.");
      setSubmitting(false);
      return;
    }

    setCompanyCookie(onboardingData.companyId);
    setStoreCookie(onboardingData.storeId);
    clearCachedMe();

    const failedInvites: Array<{ email: string; message: string }> = [];
    for (const invite of draft.invites.filter((row) => row.email.trim())) {
      try {
        await apiRequest("/auth/invite", {
          method: "POST",
          body: JSON.stringify({
            email: invite.email.trim(),
            role: invite.role,
            storeId: invite.storeScope === "primary" ? onboardingData.storeId : null,
            expiresInDays: 7,
          }),
        });
      } catch (caughtError) {
        failedInvites.push({
          email: invite.email,
          message: caughtError instanceof ApiError ? caughtError.message : "Unable to send invite.",
        });
      }
    }

    if (authMe) {
      window.sessionStorage.removeItem(draftStorageKey(authMe.user.id));
    }

    if (failedInvites.length) {
      setInviteErrors(failedInvites);
      toast.error("Workspace created, but some invites failed.");
      setSubmitting(false);
      return;
    }

    toast.success("Workspace created.");
    router.replace("/company-onboarding-tour");
  };

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-5">
      <div className="mx-auto flex min-h-[calc(100vh-2.5rem)] w-full max-w-5xl flex-col gap-5">
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-sky-200/70 bg-white px-4 py-3 shadow-sm">
          <Link href="/" className="font-heading text-sm font-extrabold text-sky-950">
            The One CRM
          </Link>
          <div className="flex items-center gap-3 text-sm text-slate-600">
            <StepIcon className="size-4 text-sky-700" />
            Step {step} of {STEP_COUNT}: {STEP_META[step - 1]?.title}
          </div>
        </header>

        <section className="flex flex-1 items-center justify-center">
          <Card className="w-full max-w-4xl border-sky-200/70 bg-white shadow-sm">
            <CardHeader className="gap-4">
              <div>
                <CardTitle className="text-3xl">{STEP_META[step - 1]?.title}</CardTitle>
                <CardDescription>Complete your company setup. Each step is saved in this browser until the workspace is created.</CardDescription>
              </div>
              <Progress value={progress}>
                <ProgressLabel>{progress}% complete</ProgressLabel>
              </Progress>
            </CardHeader>
            <CardContent className="grid gap-6">
              {loading ? (
                <Alert>
                  <LoaderCircle className="animate-spin" />
                  <AlertTitle>Loading onboarding</AlertTitle>
                  <AlertDescription>Checking your account before setup.</AlertDescription>
                </Alert>
              ) : null}

              {error ? (
                <Alert variant="destructive">
                  <AlertCircle />
                  <AlertTitle>Onboarding failed</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}

              {inviteErrors.length ? (
                <Alert variant="destructive">
                  <AlertCircle />
                  <AlertTitle>Workspace created, but some invites failed</AlertTitle>
                  <AlertDescription>
                    <div className="grid gap-1">
                      {inviteErrors.map((entry) => (
                        <span key={`${entry.email}-${entry.message}`}>{entry.email}: {entry.message}</span>
                      ))}
                    </div>
                    <Button type="button" className="mt-3" onClick={() => router.replace("/company-onboarding-tour")}>
                      Continue to tour
                    </Button>
                  </AlertDescription>
                </Alert>
              ) : null}

              {!loading && step === 1 ? (
                <div className="grid gap-6">
                  <FieldGroup className="grid gap-4 md:grid-cols-2">
                    <Field className="md:col-span-2">
                      <FieldLabel>Company name *</FieldLabel>
                      <Input value={draft.companyName} onChange={(event) => updateDraft({ companyName: event.target.value })} required />
                    </Field>
                    <Field>
                      <FieldLabel>Company website</FieldLabel>
                      <Input type="url" value={draft.companyWebsite} onChange={(event) => updateDraft({ companyWebsite: event.target.value })} placeholder="https://example.com" />
                    </Field>
                    <Field>
                      <FieldLabel>Currency *</FieldLabel>
                      <NativeSelect value={draft.currency} onChange={(event) => updateDraft({ currency: event.target.value })}>
                        {CURRENCIES.map((currency) => (
                          <option key={currency} value={currency}>{currency}</option>
                        ))}
                      </NativeSelect>
                    </Field>
                    <Field className="md:col-span-2">
                      <FieldLabel>Company address *</FieldLabel>
                      <Input value={draft.companyAddress} onChange={(event) => updateDraft({ companyAddress: event.target.value })} required />
                    </Field>
                    <Field>
                      <FieldLabel>Country *</FieldLabel>
                      <NativeSelect value={draft.country} onChange={(event) => handleCountryChange(event.target.value)} required>
                        {countries.map((country) => (
                          <option key={country} value={country}>{country}</option>
                        ))}
                      </NativeSelect>
                    </Field>
                    <Field>
                      <FieldLabel>State *</FieldLabel>
                      <NativeSelect value={draft.state} onChange={(event) => handleStateChange(event.target.value)} required>
                        {companyStates.map((state) => (
                          <option key={state} value={state}>{state}</option>
                        ))}
                      </NativeSelect>
                    </Field>
                    <Field>
                      <FieldLabel>City *</FieldLabel>
                      <NativeSelect value={draft.city} onChange={(event) => updateDraft({ city: event.target.value })} required>
                        {companyCities.map((city) => (
                          <option key={city} value={city}>{city}</option>
                        ))}
                      </NativeSelect>
                    </Field>
                    <Field>
                      <FieldLabel>Timezone *</FieldLabel>
                      <NativeSelect value={draft.timezone} onChange={(event) => updateDraft({ timezone: event.target.value })}>
                        {timezones.map((timezone) => (
                          <option key={timezone} value={timezone}>{timezone}</option>
                        ))}
                      </NativeSelect>
                    </Field>
                  </FieldGroup>
                  <div className="flex justify-end">
                    <Button type="button" onClick={() => goToStep(2)}>
                      Next <ArrowRight data-icon="inline-end" />
                    </Button>
                  </div>
                </div>
              ) : null}

              {!loading && step === 2 ? (
                <div className="grid gap-6">
                  <FieldGroup className="grid gap-4 md:grid-cols-2">
                    <Field>
                      <FieldLabel>First name *</FieldLabel>
                      <Input value={draft.firstName} onChange={(event) => updateDraft({ firstName: event.target.value })} required />
                    </Field>
                    <Field>
                      <FieldLabel>Last name *</FieldLabel>
                      <Input value={draft.lastName} onChange={(event) => updateDraft({ lastName: event.target.value })} required />
                    </Field>
                    <Field>
                      <FieldLabel>Mobile number with country code *</FieldLabel>
                      <Input value={draft.mobileNumber} onChange={(event) => updateDraft({ mobileNumber: event.target.value })} placeholder="+91 98765 43210" required />
                    </Field>
                    <Field>
                      <FieldLabel>Secondary email or phone number</FieldLabel>
                      <Input value={draft.secondaryContact} onChange={(event) => updateDraft({ secondaryContact: event.target.value })} />
                    </Field>
                  </FieldGroup>
                  <div className="flex justify-between">
                    <Button type="button" variant="outline" onClick={() => goToStep(1)}>
                      <ArrowLeft data-icon="inline-start" /> Previous
                    </Button>
                    <Button type="button" onClick={() => goToStep(3)}>
                      Next <ArrowRight data-icon="inline-end" />
                    </Button>
                  </div>
                </div>
              ) : null}

              {!loading && step === 3 ? (
                <div className="grid gap-6">
                  <FieldGroup className="grid gap-4 md:grid-cols-2">
                    <Field className="md:col-span-2">
                      <FieldLabel>Main branch name</FieldLabel>
                      <Input value={draft.branchName} onChange={(event) => updateDraft({ branchName: event.target.value })} placeholder="Main Branch" />
                      <FieldDescription>Leave blank to use Main Branch.</FieldDescription>
                    </Field>
                    <Field className="md:col-span-2">
                      <FieldLabel>Main branch address</FieldLabel>
                      <Input value={draft.branchAddress} onChange={(event) => updateDraft({ branchAddress: event.target.value })} placeholder={draft.companyAddress || "Uses company address"} />
                    </Field>
                    <Field>
                      <FieldLabel>Country</FieldLabel>
                      <NativeSelect value={draft.branchCountry} onChange={(event) => handleBranchCountryChange(event.target.value)}>
                        <option value="">Uses company country ({draft.country})</option>
                        {countries.map((country) => (
                          <option key={country} value={country}>{country}</option>
                        ))}
                      </NativeSelect>
                    </Field>
                    <Field>
                      <FieldLabel>State</FieldLabel>
                      <NativeSelect value={draft.branchState} onChange={(event) => handleBranchStateChange(event.target.value)}>
                        <option value="">Uses company state ({draft.state || "-"})</option>
                        {branchStates.map((state) => (
                          <option key={state} value={state}>{state}</option>
                        ))}
                      </NativeSelect>
                    </Field>
                    <Field>
                      <FieldLabel>City</FieldLabel>
                      <NativeSelect value={draft.branchCity} onChange={(event) => updateDraft({ branchCity: event.target.value })}>
                        <option value="">Uses company city ({draft.city || "-"})</option>
                        {branchCities.map((city) => (
                          <option key={city} value={city}>{city}</option>
                        ))}
                      </NativeSelect>
                    </Field>
                  </FieldGroup>
                  <div className="flex justify-between">
                    <Button type="button" variant="outline" onClick={() => goToStep(2)}>
                      <ArrowLeft data-icon="inline-start" /> Previous
                    </Button>
                    <Button type="button" onClick={() => goToStep(4)}>
                      Next <ArrowRight data-icon="inline-end" />
                    </Button>
                  </div>
                </div>
              ) : null}

              {!loading && step === 4 ? (
                <form onSubmit={finalizeSetup} className="grid gap-6">
                  <div className="grid gap-3">
                    {draft.invites.map((invite, index) => (
                      <div key={invite.id} className="grid gap-3 rounded-xl border border-sky-100 bg-sky-50/30 p-3 md:grid-cols-[1fr_160px_180px_auto]">
                        <Field>
                          <FieldLabel>Email #{index + 1}</FieldLabel>
                          <Input type="email" value={invite.email} onChange={(event) => handleInviteChange(invite.id, "email", event.target.value)} placeholder="teammate@company.com" />
                        </Field>
                        <Field>
                          <FieldLabel>Role</FieldLabel>
                          <Select value={invite.role} onValueChange={(value) => handleInviteChange(invite.id, "role", value ?? invite.role)}>
                            <SelectTrigger className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectGroup>
                                <SelectItem value="owner">owner</SelectItem>
                                <SelectItem value="admin">admin</SelectItem>
                                <SelectItem value="member">member</SelectItem>
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                        </Field>
                        <Field>
                          <FieldLabel>Scope</FieldLabel>
                          <Select value={invite.storeScope} onValueChange={(value) => handleInviteChange(invite.id, "storeScope", value ?? invite.storeScope)}>
                            <SelectTrigger className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectGroup>
                                <SelectItem value="company">Company-wide</SelectItem>
                                <SelectItem value="primary">Main branch only</SelectItem>
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                        </Field>
                        <div className="flex items-end">
                          <Button type="button" variant="ghost" size="icon-sm" onClick={() => removeInvite(invite.id)} aria-label="Remove invite row">
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <Button type="button" variant="outline" className="w-fit" onClick={addInvite}>
                    <Plus data-icon="inline-start" /> Add invite row
                  </Button>
                  <div className="flex justify-between">
                    <Button type="button" variant="outline" onClick={() => goToStep(3)} disabled={submitting}>
                      <ArrowLeft data-icon="inline-start" /> Previous
                    </Button>
                    <Button type="submit" size="lg" disabled={submitting}>
                      <CheckCircle2 data-icon="inline-start" />
                      {submitting ? "Creating workspace..." : "Create workspace and start tour"}
                    </Button>
                  </div>
                </form>
              ) : null}
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}

export default function CompanyOnboardingPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
          <Alert className="max-w-md">
            <LoaderCircle className="animate-spin" />
            <AlertTitle>Loading onboarding</AlertTitle>
            <AlertDescription>Preparing your setup flow.</AlertDescription>
          </Alert>
        </main>
      }
    >
      <CompanyOnboardingContent />
    </Suspense>
  );
}
