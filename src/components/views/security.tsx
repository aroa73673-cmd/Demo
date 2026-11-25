"use client";

/**
 * NEXUS BANK — Security centre. Active sessions, password change with honest
 * requirements, a protection self-assessment, and the append-only audit trail.
 */
import { useCallback, useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader, SectionCard, StatusBadge, DemoBadge, EmptyState, LoadingBlock, ErrorNote, fmtDateTime, fmtDate } from "@/lib/bank-ui";
import { bankApi, nestedErrorText } from "@/lib/bank-client";
import { SecurityDTO } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";

type SessionRow = SecurityDTO["sessions"][number];

function maskIp(ip: string | null): string {
  if (!ip) return "ip unavailable";
  const segments = ip.split(".");
  if (segments.length === 4) return `${segments[0] ?? ""}.•••.•••.•••`;
  return "•••";
}

function passwordIssues(pw: string): string[] {
  const issues: string[] = [];
  if (pw.length < 10) issues.push("10+ characters");
  if (!/[A-Z]/.test(pw)) issues.push("an uppercase letter");
  if (!/[a-z]/.test(pw)) issues.push("a lowercase letter");
  if (!/[0-9]/.test(pw)) issues.push("a digit");
  return issues;
}

export function SecurityView() {
  const { toast } = useToast();

  const [data, setData] = useState<SecurityDTO | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  // Session revoke
  const [revokeTarget, setRevokeTarget] = useState<SessionRow | null>(null);
  const [revoking, setRevoking] = useState(false);

  // Password change
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [pwError, setPwError] = useState("");
  const [changingPw, setChangingPw] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await bankApi.get<SecurityDTO>("/security"));
    } catch (err) {
      setError(nestedErrorText(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function confirmRevoke() {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      await bankApi.del("/auth/sessions", { id: revokeTarget.id });
      toast({ title: "Session revoked", description: "That device will need to sign in again." });
      setRevokeTarget(null);
      await load();
    } catch (err) {
      toast({ title: "Could not revoke session", description: nestedErrorText(err), variant: "destructive" });
    } finally {
      setRevoking(false);
    }
  }

  async function submitPasswordChange() {
    setPwError("");
    if (!currentPassword) {
      setPwError("Enter your current password.");
      return;
    }
    const issues = passwordIssues(newPassword);
    if (issues.length > 0) {
      setPwError(`New password needs: ${issues.join(", ")}.`);
      return;
    }
    setChangingPw(true);
    try {
      await bankApi.post("/auth/password", { currentPassword, newPassword });
      toast({ title: "Password changed", description: "Other sessions were revoked." });
      setCurrentPassword("");
      setNewPassword("");
      await load();
    } catch (err) {
      toast({ title: "Could not change password", description: nestedErrorText(err), variant: "destructive" });
    } finally {
      setChangingPw(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Security"
        title="Security Centre"
        description="What is actually protecting this account, which sessions are live, and every security-relevant action recorded in the audit trail."
        actions={
          <>
            <DemoBadge />
            <Button variant="outline" size="sm" className="border-zinc-700" onClick={load} disabled={loading}>
              {loading ? "Refreshing…" : "Refresh"}
            </Button>
          </>
        }
      />

      <ErrorNote message={error} />

      {loading ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-32 animate-pulse rounded-xl bg-muted/50" />
            ))}
          </div>
          <LoadingBlock rows={4} />
        </div>
      ) : data ? (
        <>
          {/* ---------- Protections grid ---------- */}
          <SectionCard
            title="Protections"
            description="An honest self-assessment: what is fully in place and what is only partial in this sandbox environment."
          >
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {data.protections.map((p) => (
                <div key={p.name} className="rounded-lg border border-border/70 bg-muted/20 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-zinc-200">{p.name}</p>
                    <StatusBadge status={p.status} />
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-zinc-400">{p.detail}</p>
                </div>
              ))}
            </div>
          </SectionCard>

          {/* ---------- Sessions ---------- */}
          <SectionCard
            title="Active sessions"
            description="Devices currently signed in to this account. Revoke any session except the one you are using now."
          >
            {data.sessions.length === 0 ? (
              <EmptyState title="No active sessions" hint="Sign in again to see session activity here." />
            ) : (
              <div className="max-h-96 space-y-3 overflow-y-auto nb-scroll pr-1">
                {data.sessions.map((s) => (
                  <div
                    key={s.id}
                    className="flex flex-col gap-2 rounded-lg border border-border/70 bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm text-zinc-200" title={s.userAgent ?? undefined}>
                        {s.userAgent || "Unknown device"}
                      </p>
                      <p className="mt-0.5 font-mono text-[11px] text-zinc-500">
                        {maskIp(s.ip)} · {fmtDate(s.createdAt)} → {fmtDate(s.expiresAt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {s.current ? (
                        <span className="rounded border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-400">
                          This session
                        </span>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-rose-500/40 text-rose-400 hover:bg-rose-500/10"
                          onClick={() => setRevokeTarget(s)}
                        >
                          Revoke
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {/* ---------- Password change ---------- */}
          <SectionCard
            title="Change password"
            description="Changing your password revokes every other session immediately — account-takeover containment."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="pw-current" className="text-xs text-zinc-400">
                  Current password
                </Label>
                <Input
                  id="pw-current"
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="min-h-[44px]"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pw-new" className="text-xs text-zinc-400">
                  New password
                </Label>
                <Input
                  id="pw-new"
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="min-h-[44px]"
                />
              </div>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-zinc-500">
              Requirements: 10+ characters with an uppercase letter, a lowercase letter and a digit. The server enforces the same rules.
            </p>
            {pwError ? <p className="mt-2 text-xs text-rose-400">{pwError}</p> : null}
            <div className="mt-4">
              <Button onClick={submitPasswordChange} disabled={changingPw} className="min-h-[44px]">
                {changingPw ? "Updating…" : "Update password"}
              </Button>
            </div>
          </SectionCard>

          {/* ---------- Audit trail ---------- */}
          <SectionCard
            title="Audit trail"
            description="Append-only record of security-relevant actions on this account. Newest first; nothing in this list can be edited or removed."
            actions={<DemoBadge tooltip="Audit entries cover demo records only." />}
          >
            {data.auditEvents.length === 0 ? (
              <EmptyState title="No audit events yet" hint="Actions like signing in, changing a password or erasing data will be recorded here." />
            ) : (
              <div className="max-h-96 divide-y divide-border/60 overflow-y-auto nb-scroll pr-1">
                {data.auditEvents.map((e) => (
                  <div key={e.id} className="flex flex-col gap-1.5 py-2.5 sm:flex-row sm:items-baseline sm:gap-3">
                    <span className="shrink-0 self-start rounded border border-border/70 bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-zinc-400 sm:w-52 sm:truncate">
                      {e.action}
                    </span>
                    <span className="min-w-0 flex-1 break-words text-xs leading-relaxed text-zinc-300">{e.detail}</span>
                    <span className="shrink-0 text-[11px] text-zinc-500">{fmtDateTime(e.createdAt)}</span>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </>
      ) : (
        <EmptyState title="Nothing loaded" hint="Refresh to retry." />
      )}

      {/* ---------- Revoke session confirm ---------- */}
      <AlertDialog open={revokeTarget !== null} onOpenChange={(open) => { if (!open) setRevokeTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke this session?</AlertDialogTitle>
            <AlertDialogDescription>
              The device &ldquo;{revokeTarget?.userAgent || "Unknown device"}&rdquo; will be signed out immediately and will need to
              authenticate again to regain access.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                confirmRevoke();
              }}
            >
              {revoking ? "Revoking…" : "Revoke session"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
