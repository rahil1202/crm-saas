"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { ApiError, apiRequest } from "@/lib/api";
import { OutreachTopNav } from "@/features/outreach/outreach-top-nav";

type OutreachStatus = "pending" | "sent" | "opened" | "replied" | "bounced";

type AccountItem = {
  id: string;
  name: string;
  contactsCount: number;
  contacts: Array<{ id: string; fullName: string; email: string | null; status: OutreachStatus }>;
};

type ContactItem = {
  id: string;
  fullName: string;
  email: string | null;
  status: OutreachStatus;
  accountName: string;
  title: string | null;
};

export function OutreachLeadsPage() {
  const [mode, setMode] = useState<"company" | "contact">("company");
  const [status, setStatus] = useState<"all" | OutreachStatus>("all");
  const [q, setQ] = useState("");
  const [accounts, setAccounts] = useState<AccountItem[]>([]);
  const [contacts, setContacts] = useState<ContactItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;

    const load = async () => {
      try {
        if (mode === "company") {
          const params = new URLSearchParams({ limit: "50", offset: "0", q });
          if (status !== "all") params.set("status", status);
          const response = await apiRequest<{ items: AccountItem[] }>(`/outreach/accounts?${params.toString()}`);
          if (!disposed) setAccounts(response.items);
          return;
        }

        const params = new URLSearchParams({ limit: "100", offset: "0", q });
        if (status !== "all") params.set("status", status);
        const response = await apiRequest<{ items: ContactItem[] }>(`/outreach/contacts?${params.toString()}`);
        if (!disposed) setContacts(response.items);
      } catch (caughtError) {
        if (!disposed) setError(caughtError instanceof ApiError ? caughtError.message : "Unable to load outreach leads");
      }
    };

    void load();
    return () => {
      disposed = true;
    };
  }, [mode, q, status]);

  const total = useMemo(() => (mode === "company" ? accounts.length : contacts.length), [mode, accounts.length, contacts.length]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Email Outreach Agent</h1>
        <p className="mt-1 text-sm text-slate-600">AI-driven discovery and automated email campaigns</p>
      </div>

      <OutreachTopNav />

      <Card className="border-border/70">
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant={mode === "company" ? "default" : "outline"} size="sm" onClick={() => setMode("company")}>By Company</Button>
            <Button variant={mode === "contact" ? "default" : "outline"} size="sm" onClick={() => setMode("contact")}>By Contact</Button>
            <div className="ml-auto flex items-center gap-2">
              <Button variant={status === "all" ? "default" : "outline"} size="sm" onClick={() => setStatus("all")}>All</Button>
              <Button variant={status === "pending" ? "default" : "outline"} size="sm" onClick={() => setStatus("pending")}>Pending</Button>
              <Button variant={status === "sent" ? "default" : "outline"} size="sm" onClick={() => setStatus("sent")}>Sent</Button>
              <Button variant={status === "opened" ? "default" : "outline"} size="sm" onClick={() => setStatus("opened")}>Opened</Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <NativeSelect className="h-10 w-44 rounded-xl px-3 text-sm" defaultValue="all">
              <option value="all">All time</option>
            </NativeSelect>
            <Input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search..." className="h-10 w-80" />
          </div>

          {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}

          <div className="rounded-xl border border-border/60">
            {mode === "company" ? (
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-4 py-2">Company</th>
                    <th className="px-4 py-2">Contacts</th>
                    <th className="px-4 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((account) => (
                    <tr key={account.id} className="border-t border-border/50">
                      <td className="px-4 py-3 font-semibold text-slate-900">{account.name}</td>
                      <td className="px-4 py-3 text-slate-600">{account.contactsCount}</td>
                      <td className="px-4 py-3 text-slate-600">{account.contacts[0]?.status ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-4 py-2">Contact</th>
                    <th className="px-4 py-2">Company</th>
                    <th className="px-4 py-2">Title</th>
                    <th className="px-4 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.map((contact) => (
                    <tr key={contact.id} className="border-t border-border/50">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{contact.fullName}</div>
                        <div className="text-slate-500">{contact.email ?? "No email"}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{contact.accountName}</td>
                      <td className="px-4 py-3 text-slate-600">{contact.title ?? "-"}</td>
                      <td className="px-4 py-3 text-slate-600">{contact.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {total === 0 ? <div className="px-4 py-8 text-sm text-slate-500">No outreach leads found.</div> : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
