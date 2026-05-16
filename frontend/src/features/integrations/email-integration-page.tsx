"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Mail, RefreshCw, Trash2, Unplug, Zap } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ApiError, apiRequest } from "@/lib/api";
import { getAuthCallbackUrl } from "@/lib/env";
import { cn } from "@/lib/utils";
import {
  clearPendingIntegrationOauthContext,
  savePendingIntegrationOauthContext,
} from "@/lib/integration-oauth";
import { oauthProviders } from "@/features/integrations/config";

interface EmailAccount {
  id: string;
  label: string;
  fromEmail: string;
  fromName: string | null;
  provider: string;
  status: "connected" | "disconnected" | "error";
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

const gmailProvider = oauthProviders.find((p) => p.provider === "google")!;
function ProviderIcon({ provider }: { provider: string }) {
  if (provider === "google") {
    return (
      <svg className="size-5" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
      </svg>
    );
  }
  return <Mail className="size-5 text-slate-400" />;
}

function providerLabel(provider: string) {
  if (provider === "google") return "Gmail / Google Workspace";
  if (provider === "resend") return "Resend (system)";
  return provider;
}

export function EmailIntegrationPage() {
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [oauthLoading, setOauthLoading] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [settingDefault, setSettingDefault] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [oauthSuccess, setOauthSuccess] = useState<string | null>(null);

  // Test email state
  const [testEmail, setTestEmail] = useState("");
  const [sendingTest, setSendingTest] = useState(false);

  const loadAccounts = async () => {
    const response = await apiRequest<{ items: EmailAccount[] }>("/campaigns/email-accounts", { skipCache: true });
    setAccounts(response.items);
  };

  useEffect(() => {
    let disposed = false;

    const load = async () => {
      try {
        // Check for OAuth success return
        if (typeof window !== "undefined") {
          const params = new URLSearchParams(window.location.search);
          if (params.get("oauth") === "success") {
            const provider = params.get("provider");
            setOauthSuccess(provider === "google" ? "Gmail connected successfully." : "Email account connected.");
            // Clean URL
            window.history.replaceState(null, "", window.location.pathname);
          }
        }

        await loadAccounts();
      } catch (caughtError) {
        if (!disposed) setError(caughtError instanceof ApiError ? caughtError.message : "Unable to load email accounts.");
      } finally {
        if (!disposed) setLoading(false);
      }
    };

    void load();
    return () => { disposed = true; };
  }, []);

  const startOauth = async (providerConfig: typeof gmailProvider) => {
    setOauthLoading(providerConfig.provider);
    setError(null);
    clearPendingIntegrationOauthContext();
    savePendingIntegrationOauthContext({
      provider: providerConfig.provider,
      channel: "email",
      returnPath: "/dashboard/integrations/email",
      scopes: providerConfig.scopes,
    });

    const { supabase } = await import("@/lib/supabase");
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: providerConfig.provider,
      options: {
        redirectTo: getAuthCallbackUrl(),
        scopes: providerConfig.scopes.join(" "),
        queryParams: providerConfig.queryParams,
      },
    });

    if (oauthError) {
      clearPendingIntegrationOauthContext();
      setOauthLoading(null);
      setError(oauthError.message);
    }
    // If no error, browser redirects — no need to reset loading
  };

  const disconnectAccount = async (accountId: string, provider: string) => {
    setDisconnecting(accountId);
    setError(null);
    try {
      await apiRequest("/settings/integrations/oauth/disconnect", {
        method: "POST",
        body: JSON.stringify({ channel: "email", provider }),
      });
      await loadAccounts();
      toast.success("Email account disconnected.");
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : "Unable to disconnect account.");
    } finally {
      setDisconnecting(null);
    }
  };

  const setDefaultAccount = async (accountId: string) => {
    setSettingDefault(accountId);
    setError(null);
    try {
      await apiRequest(`/campaigns/email-accounts/${accountId}/set-default`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      await loadAccounts();
      toast.success("Default sending account updated.");
    } catch (caughtError) {
      // Fallback: endpoint may not exist yet, just reload
      await loadAccounts();
    } finally {
      setSettingDefault(null);
    }
  };

  const sendTestEmailFn = async () => {
    if (!testEmail.trim()) return;
    setSendingTest(true);
    setError(null);
    try {
      await apiRequest("/campaigns/test-email", {
        method: "POST",
        body: JSON.stringify({
          recipientEmail: testEmail.trim(),
          subject: "Test email from your CRM",
          body: "<p>This is a test email sent from your CRM email integration. If you received this, your email account is connected and working correctly.</p>",
        }),
      });
      toast.success(`Test email queued to ${testEmail.trim()}`);
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : "Unable to send test email.");
    } finally {
      setSendingTest(false);
    }
  };

  const connectedAccounts = accounts.filter((a) => a.status === "connected");
  const hasConnected = connectedAccounts.length > 0;

  return (
    <div className="grid gap-4">
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {oauthSuccess ? (
        <Alert>
          <CheckCircle2 className="size-4" />
          <AlertTitle>Connected</AlertTitle>
          <AlertDescription>{oauthSuccess}</AlertDescription>
        </Alert>
      ) : null}

      {/* Header */}
      <Card className="border-border/60" size="sm">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <Link href="/dashboard/integrations" className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))} aria-label="Back">
                <ArrowLeft className="size-4" />
              </Link>
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
                <Mail className="size-5" />
              </span>
              <div>
                <CardTitle>Email Integration</CardTitle>
                <CardDescription>Connect your Gmail account to send outreach emails on your behalf.</CardDescription>
              </div>
            </div>
            <Badge variant={hasConnected ? "secondary" : "outline"}>
              {hasConnected ? `${connectedAccounts.length} connected` : "Not connected"}
            </Badge>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        {/* Main content */}
        <div className="grid gap-4">
          {/* Connect new account */}
          <Card className="border-border/60">
            <CardHeader>
              <CardTitle className="text-base">Connect your email account</CardTitle>
              <CardDescription>
                Each team member or company can connect their own Gmail account. Emails will be sent from that address — not a shared system address.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {/* Gmail */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/70 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-red-50">
                    <ProviderIcon provider="google" />
                  </div>
                  <div>
                    <div className="font-semibold text-slate-900">Gmail / Google Workspace</div>
                    <div className="text-xs text-slate-500">Send from your @gmail.com or @yourcompany.com address</div>
                  </div>
                </div>
                <Button
                  type="button"
                  onClick={() => void startOauth(gmailProvider)}
                  disabled={oauthLoading === "google"}
                  className="gap-2 shrink-0"
                >
                  {oauthLoading === "google" ? (
                    <>
                      <RefreshCw className="size-4 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <ProviderIcon provider="google" />
                      Connect Gmail
                    </>
                  )}
                </Button>
              </div>

              <p className="text-xs text-slate-500">
                We request only the permissions needed to send email on your behalf. We never read your inbox or store your email password.
              </p>
            </CardContent>
          </Card>

          {/* Connected accounts */}
          <Card className="border-border/60">
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base">Connected accounts</CardTitle>
                  <CardDescription>These are the email addresses used to send outreach.</CardDescription>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => void loadAccounts()}
                  aria-label="Refresh"
                >
                  <RefreshCw className="size-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-sm text-slate-500">Loading accounts...</div>
              ) : accounts.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border/60 py-10 text-center">
                  <Mail className="mx-auto mb-3 size-8 text-slate-300" />
                  <div className="text-sm font-medium text-slate-600">No email accounts connected</div>
                  <p className="mt-1 text-xs text-slate-400">Connect Gmail above to get started.</p>
                </div>
              ) : (
                <div className="grid gap-2">
                  {accounts.map((account) => (
                    <div
                      key={account.id}
                      className={cn(
                        "flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4",
                        account.status === "connected"
                          ? "border-emerald-200 bg-emerald-50/50"
                          : "border-border/60 bg-slate-50/50",
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm">
                          <ProviderIcon provider={account.provider} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-900">{account.fromEmail}</span>
                            {account.isDefault ? (
                              <Badge variant="secondary" className="text-xs">Default</Badge>
                            ) : null}
                            <Badge
                              variant={account.status === "connected" ? "secondary" : "destructive"}
                              className="text-xs"
                            >
                              {account.status === "connected" ? "✓ Connected" : account.status}
                            </Badge>
                          </div>
                          <div className="mt-0.5 text-xs text-slate-500">
                            {providerLabel(account.provider)}
                            {account.fromName ? ` · ${account.fromName}` : ""}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {!account.isDefault && account.status === "connected" ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => void setDefaultAccount(account.id)}
                            disabled={settingDefault === account.id}
                            className="gap-1.5"
                          >
                            <Zap className="size-3.5" />
                            Set default
                          </Button>
                        ) : null}
                        {account.provider === "google" || account.provider === "azure" ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="gap-1.5 text-slate-500 hover:text-rose-600"
                            onClick={() => void disconnectAccount(account.id, account.provider)}
                            disabled={disconnecting === account.id}
                          >
                            <Unplug className="size-3.5" />
                            {disconnecting === account.id ? "Disconnecting..." : "Disconnect"}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Test email */}
          {hasConnected ? (
            <Card className="border-border/60">
              <CardHeader>
                <CardTitle className="text-base">Send a test email</CardTitle>
                <CardDescription>Verify your connected account is working by sending a test message.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <Field className="flex-1">
                    <FieldLabel>Recipient email</FieldLabel>
                    <Input
                      type="email"
                      value={testEmail}
                      onChange={(e) => setTestEmail(e.target.value)}
                      placeholder="you@example.com"
                    />
                  </Field>
                  <div className="flex items-end">
                    <Button
                      type="button"
                      onClick={() => void sendTestEmailFn()}
                      disabled={sendingTest || !testEmail.trim()}
                      className="gap-1.5"
                    >
                      {sendingTest ? <RefreshCw className="size-4 animate-spin" /> : <Mail className="size-4" />}
                      {sendingTest ? "Sending..." : "Send test"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>

        {/* Right sidebar: how it works */}
        <div className="grid gap-4 lg:self-start">
          <Card className="border-border/60" size="sm">
            <CardHeader>
              <CardTitle className="text-sm">How it works</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm text-slate-600">
              <div className="flex gap-2">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-sky-100 text-xs font-bold text-sky-700">1</span>
                <span>Click "Connect Gmail" and sign in with your Google account.</span>
              </div>
              <div className="flex gap-2">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-sky-100 text-xs font-bold text-sky-700">2</span>
                <span>We store an OAuth token — never your password. Emails are sent from your actual address.</span>
              </div>
              <div className="flex gap-2">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-sky-100 text-xs font-bold text-sky-700">3</span>
                <span>Go to Email Outreach and start sending campaigns. Recipients see your real email address.</span>
              </div>
              <div className="flex gap-2">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-sky-100 text-xs font-bold text-sky-700">4</span>
                <span>Multiple team members can each connect their own account. Set one as the default for outreach.</span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/60" size="sm">
            <CardHeader>
              <CardTitle className="text-sm">Permissions requested</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-xs text-slate-600">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />
                <span>Send email on your behalf</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />
                <span>Read your email address and profile</span>
              </div>
              <div className="flex items-start gap-2">
                <Trash2 className="mt-0.5 size-3.5 shrink-0 text-slate-300" />
                <span className="text-slate-400">We do NOT read your inbox</span>
              </div>
              <div className="flex items-start gap-2">
                <Trash2 className="mt-0.5 size-3.5 shrink-0 text-slate-300" />
                <span className="text-slate-400">We do NOT store your password</span>
              </div>
              <div className="flex items-start gap-2">
                <Trash2 className="mt-0.5 size-3.5 shrink-0 text-slate-300" />
                <span className="text-slate-400">We do NOT access your contacts or calendar</span>
              </div>
            </CardContent>
          </Card>

          {hasConnected ? (
            <Card className="border-emerald-200 bg-emerald-50/50" size="sm">
              <CardContent className="pt-4">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                  <div>
                    <div className="text-sm font-semibold text-emerald-900">Ready to send</div>
                    <p className="mt-0.5 text-xs text-emerald-700">
                      Your email account is connected. Go to{" "}
                      <Link href="/dashboard/outreach" className="underline">
                        Email Outreach
                      </Link>{" "}
                      to start sending.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
