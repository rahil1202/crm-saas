"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { UserPlus, Users } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { ApiError, apiRequest } from "@/lib/api";
import { getInitials } from "@/lib/auth-ui";
import type { AuthMePayload } from "@/lib/auth-client";

type CompanyRole = "owner" | "admin" | "member";
type MembershipStatus = "active" | "disabled";

interface CompanySnapshot {
  company: {
    id: string;
    name: string;
  };
  stores: Array<{
    id: string;
    name: string;
  }>;
  members: Array<{
    membershipId: string;
    userId: string;
    role: CompanyRole;
    status: string;
    storeId: string | null;
    storeName: string | null;
    email: string;
    fullName: string | null;
  }>;
  invites: Array<{
    inviteId: string;
    email: string;
    role: CompanyRole;
    status: string;
    storeId: string | null;
    storeName: string | null;
    expiresAt: string;
  }>;
}

export default function TeamPage() {
  const [me, setMe] = useState<AuthMePayload | null>(null);
  const [snapshot, setSnapshot] = useState<CompanySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<CompanyRole>("member");
  const [inviteStoreId, setInviteStoreId] = useState("");
  const [sendingInvite, setSendingInvite] = useState(false);
  const [membershipActionId, setMembershipActionId] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;

    const load = async () => {
      try {
        const [mePayload, companyPayload] = await Promise.all([
          apiRequest<AuthMePayload>("/auth/me"),
          apiRequest<CompanySnapshot>("/companies/current"),
        ]);

        if (!disposed) {
          setMe(mePayload);
          setSnapshot(companyPayload);
        }
      } catch (caughtError) {
        if (!disposed) {
          setError(caughtError instanceof Error ? caughtError.message : "Unable to load team data.");
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

  const activeCount = useMemo(
    () => snapshot?.members.filter((member) => member.status === "active").length ?? 0,
    [snapshot?.members],
  );
  const pendingInviteCount = useMemo(
    () => snapshot?.invites.filter((invite) => invite.status === "pending").length ?? 0,
    [snapshot?.invites],
  );

  const handleInviteSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSendingInvite(true);
    setError(null);

    try {
      const response = await apiRequest<{
        inviteId: string;
        email: string;
        role: CompanyRole;
        expiresAt: string;
        storeId: string | null;
      }>("/auth/invite", {
        method: "POST",
        body: JSON.stringify({
          email: inviteEmail,
          role: inviteRole,
          storeId: inviteStoreId || null,
          expiresInDays: 7,
        }),
      });

      setInviteEmail("");
      setInviteRole("member");
      setInviteStoreId("");
      setSnapshot((current) =>
        current
          ? {
              ...current,
              invites: [
                ...current.invites,
                {
                  inviteId: response.inviteId,
                  email: response.email,
                  role: response.role,
                  status: "pending",
                  storeId: response.storeId,
                  storeName: current.stores.find((store) => store.id === response.storeId)?.name ?? null,
                  expiresAt: response.expiresAt,
                },
              ],
            }
          : current,
      );
      toast.success("Invite sent.");
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : "Unable to send invite.");
    } finally {
      setSendingInvite(false);
    }
  };

  const handleMembershipUpdate = async (
    membershipId: string,
    payload: {
      role?: CompanyRole;
      status?: MembershipStatus;
    },
  ) => {
    setMembershipActionId(membershipId);
    setError(null);

    try {
      const response = await apiRequest<{
        membership: {
          id: string;
          role: CompanyRole;
          status: string;
        };
      }>(`/users/memberships/${membershipId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });

      setSnapshot((current) =>
        current
          ? {
              ...current,
              members: current.members.map((member) =>
                member.membershipId === membershipId
                  ? { ...member, role: response.membership.role, status: response.membership.status }
                  : member,
              ),
            }
          : current,
      );
      toast.success("Member updated.");
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : "Unable to update member.");
    } finally {
      setMembershipActionId(null);
    }
  };

  return (
    <div className="grid gap-5">
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Team management error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardDescription>Total members</CardDescription>
            <CardTitle>{snapshot?.members.length ?? 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardDescription>Active members</CardDescription>
            <CardTitle>{activeCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardDescription>Pending invites</CardDescription>
            <CardTitle>{pendingInviteCount}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.1fr_1fr]">
        <Card className="border-border/60">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Users className="size-4 text-primary" />
              <CardTitle>Team Members</CardTitle>
            </div>
            <CardDescription>Manage role and access status.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {(snapshot?.members ?? []).map((member) => (
              <div key={member.membershipId} className="rounded-xl border border-border/60 bg-background px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Avatar size="sm">
                      <AvatarFallback>{getInitials(member.fullName ?? member.email)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="text-sm font-medium">{member.fullName ?? member.email}</div>
                      <div className="text-xs text-muted-foreground">{member.email}</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={member.status === "active" ? "secondary" : "outline"}>{member.status}</Badge>
                    {member.storeName ? <Badge variant="outline">{member.storeName}</Badge> : null}
                  </div>
                </div>

                <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                  <Field>
                    <FieldLabel>Role</FieldLabel>
                    <NativeSelect
                      className="h-9 rounded-xl px-3 text-sm"
                      value={member.role}
                      onChange={(event) =>
                        void handleMembershipUpdate(member.membershipId, {
                          role: event.target.value as CompanyRole,
                        })
                      }
                      disabled={membershipActionId === member.membershipId || member.userId === me?.user.id}
                    >
                      <option value="owner">owner</option>
                      <option value="admin">admin</option>
                      <option value="member">member</option>
                    </NativeSelect>
                    <FieldDescription>{member.userId === me?.user.id ? "Your own role is protected." : "Role updates apply immediately."}</FieldDescription>
                  </Field>
                  <Button
                    type="button"
                    variant={member.status === "active" ? "destructive" : "outline"}
                    size="sm"
                    disabled={membershipActionId === member.membershipId || member.userId === me?.user.id}
                    onClick={() =>
                      void handleMembershipUpdate(member.membershipId, {
                        status: member.status === "active" ? "disabled" : "active",
                      })
                    }
                  >
                    {membershipActionId === member.membershipId ? "Saving..." : member.status === "active" ? "Deactivate" : "Restore"}
                  </Button>
                </div>
              </div>
            ))}
            {!loading && (snapshot?.members.length ?? 0) === 0 ? (
              <div className="rounded-xl border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">No team members found.</div>
            ) : null}
          </CardContent>
        </Card>

        <div className="grid gap-5">
          <Card className="border-border/60">
            <CardHeader>
              <div className="flex items-center gap-2">
                <UserPlus className="size-4 text-primary" />
                <CardTitle>Invite Member</CardTitle>
              </div>
              <CardDescription>Invite a teammate with role and branch scope.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleInviteSubmit} className="grid gap-4">
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="invite-email">Email</FieldLabel>
                    <Input id="invite-email" type="email" required value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="invite-role">Role</FieldLabel>
                    <NativeSelect
                      id="invite-role"
                      className="h-9 rounded-xl px-3 text-sm"
                      value={inviteRole}
                      onChange={(event) => setInviteRole(event.target.value as CompanyRole)}
                    >
                      <option value="owner">owner</option>
                      <option value="admin">admin</option>
                      <option value="member">member</option>
                    </NativeSelect>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="invite-store">Branch</FieldLabel>
                    <NativeSelect id="invite-store" className="h-9 rounded-xl px-3 text-sm" value={inviteStoreId || "__company__"} onChange={(event) => setInviteStoreId(event.target.value === "__company__" ? "" : event.target.value)}>
                      <option value="__company__">Company-wide access</option>
                      {(snapshot?.stores ?? []).map((store) => (
                        <option key={store.id} value={store.id}>
                          {store.name}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                </FieldGroup>
                <Button type="submit" size="sm" disabled={sendingInvite}>
                  {sendingInvite ? "Sending..." : "Send Invite"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="border-border/60">
            <CardHeader>
              <CardTitle>Pending Invites</CardTitle>
              <CardDescription>Recent invitations waiting for acceptance.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {(snapshot?.invites ?? []).map((invite) => (
                <div key={invite.inviteId} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/60 bg-background px-3 py-2.5">
                  <div>
                    <div className="text-sm font-medium">{invite.email}</div>
                    <div className="text-xs text-muted-foreground">Expires {new Date(invite.expiresAt).toLocaleDateString()}</div>
                  </div>
                  <div className="flex gap-2">
                    <Badge variant="secondary">{invite.role}</Badge>
                    {invite.storeName ? <Badge variant="outline">{invite.storeName}</Badge> : null}
                  </div>
                </div>
              ))}
              {!loading && (snapshot?.invites.length ?? 0) === 0 ? (
                <div className="rounded-xl border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">No pending invites.</div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
