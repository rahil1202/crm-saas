"use client";

import { useEffect, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ApiError, apiRequest } from "@/lib/api";
import { OutreachTopNav } from "@/features/outreach/outreach-top-nav";

type Template = {
  id: string;
  name: string;
  subject: string | null;
  updatedAt: string;
};

export function OutreachTemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    const load = async () => {
      try {
        const params = new URLSearchParams({ type: "email", limit: "100", offset: "0" });
        if (q.trim()) params.set("q", q.trim());
        const response = await apiRequest<{ items: Template[] }>(`/templates/list?${params.toString()}`);
        if (!disposed) setTemplates(response.items);
      } catch (caughtError) {
        if (!disposed) setError(caughtError instanceof ApiError ? caughtError.message : "Unable to load templates");
      }
    };
    void load();
    return () => {
      disposed = true;
    };
  }, [q]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Email Outreach Agent</h1>
        <p className="mt-1 text-sm text-slate-600">AI-driven discovery and automated email campaigns</p>
      </div>

      <OutreachTopNav />

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle>Email Templates</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search templates..." className="h-10" />
          {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}
          <div className="rounded-xl border border-border/60">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-2">Name</th>
                  <th className="px-4 py-2">Subject</th>
                  <th className="px-4 py-2">Updated</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((template) => (
                  <tr key={template.id} className="border-t border-border/50">
                    <td className="px-4 py-3 font-semibold text-slate-900">{template.name}</td>
                    <td className="px-4 py-3 text-slate-600">{template.subject ?? "-"}</td>
                    <td className="px-4 py-3 text-slate-600">{new Date(template.updatedAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {templates.length === 0 ? <div className="px-4 py-8 text-sm text-slate-500">No templates found.</div> : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
