"use client";

/**
 * NEXUS BANK — Follow-up Centre: the 4-day purchase monitoring programme.
 * Every online purchase gets ONE automatic follow-up. The user records whether
 * the order arrived; unresolved orders surface merchant-support guidance and —
 * only if the user deliberately chooses — a dispute. The system never disputes
 * automatically.
 */
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { DemoBadge, EmptyState, ErrorNote, LoadingBlock, Money, PageHeader, SectionCard, fmtDate } from "@/lib/bank-ui";
import { bankApi, nestedErrorText } from "@/lib/bank-client";
import { useToast } from "@/hooks/use-toast";
import { FollowUpDTO } from "@/lib/types";

interface FollowUpsResponse {
  due: FollowUpDTO[];
  upcoming: FollowUpDTO[];
  resolved: FollowUpDTO[];
}

interface FollowUpResolveResponse {
  followUp: FollowUpDTO;
  nextStep: { guidance: string } | null;
}

interface Guidance {
  merchant: string;
  text: string;
}

// ---------- Small local atoms ----------

function OrderRefChip({ value }: { value: string }) {
  return (
    <span className="inline-flex items-center rounded border border-border/70 bg-muted/30 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
      {value}
    </span>
  );
}

function DueChip() {
  return (
    <span className="inline-flex items-center rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-400">
      DUE
    </span>
  );
}

function InDaysChip({ days }: { days: number }) {
  const n = Math.max(0, days);
  return (
    <span className="inline-flex items-center rounded border border-zinc-500/40 bg-zinc-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
      in {n} {n === 1 ? "day" : "days"}
    </span>
  );
}

function ReceivedChip({ received }: { received: boolean | null }) {
  if (received === null) {
    return (
      <span className="inline-flex items-center rounded border border-zinc-500/40 bg-zinc-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
        unanswered
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        received ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400" : "border-rose-500/40 bg-rose-500/10 text-rose-400",
      )}
    >
      {received ? "order received" : "order not received"}
    </span>
  );
}

function StepNumber({ n }: { n: number }) {
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-emerald-500/40 bg-emerald-500/10 text-xs font-bold text-emerald-400">
      {n}
    </span>
  );
}

function merchantName(f: FollowUpDTO): string {
  return f.transaction?.merchantName ?? "Unknown merchant";
}

// ---------- View ----------

export function FollowUpsView({ onNavigate }: { onNavigate: (v: "disputes" | "transactions" | "insights") => void }) {
  const { toast } = useToast();
  const [data, setData] = useState<FollowUpsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  // Optional note flow for the "not received" path
  const [notReceived, setNotReceived] = useState<FollowUpDTO | null>(null);
  const [note, setNote] = useState("");

  // Post-resolution guidance card
  const [guidance, setGuidance] = useState<Guidance | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await bankApi.get<FollowUpsResponse>("/followups"));
    } catch (err) {
      setError(nestedErrorText(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function resolveFollowUp(id: string, merchant: string, orderReceived: boolean, noteText?: string) {
    setResolvingId(id);
    try {
      const resp = await bankApi.post<FollowUpResolveResponse>(`/followups/${id}/resolve`, {
        orderReceived,
        ...(noteText && noteText.trim() ? { note: noteText.trim() } : {}),
      });
      toast({
        title: orderReceived ? "Follow-up resolved — order received" : "Recorded: order not received",
        description: orderReceived
          ? "Glad it arrived. The follow-up is closed and nothing else is triggered."
          : "Next steps are shown below. The system never disputes automatically.",
      });
      if (resp.nextStep?.guidance) {
        setGuidance({ merchant, text: resp.nextStep.guidance });
      }
      await load();
    } catch (err) {
      toast({ title: "Could not resolve the follow-up", description: nestedErrorText(err) });
    } finally {
      setResolvingId(null);
    }
  }

  function markReceived(f: FollowUpDTO) {
    void resolveFollowUp(f.id, merchantName(f), true);
  }

  function openNotReceived(f: FollowUpDTO) {
    setNote("");
    setNotReceived(f);
  }

  function confirmNotReceived() {
    if (!notReceived) return;
    const target = notReceived;
    setNotReceived(null);
    void resolveFollowUp(target.id, merchantName(target), false, note);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Protection"
        title="Follow-up Centre"
        description="Every online purchase gets one automatic 4-day check-in. You record what happened and decide what to do next — nothing is disputed for you."
        actions={
          <>
            <DemoBadge />
            <Button variant="outline" className="min-h-[44px] border-zinc-700" onClick={() => void load()} disabled={loading}>
              {loading ? "Refreshing…" : "Refresh"}
            </Button>
          </>
        }
      />

      <ErrorNote message={error} />

      {/* Explainer */}
      <SectionCard
        title="How the 4-day follow-up works"
        description="A reminder programme for online orders: it keeps delivery problems visible until you close them."
      >
        <div className="grid gap-2.5 sm:grid-cols-2">
          <div className="flex items-start gap-3 rounded-lg border border-border/70 bg-muted/20 p-3">
            <StepNumber n={1} />
            <p className="text-xs leading-relaxed text-zinc-300">
              A purchase is recorded. Online payments create a follow-up automatically at the moment of purchase.
            </p>
          </div>
          <div className="flex items-start gap-3 rounded-lg border border-border/70 bg-muted/20 p-3">
            <StepNumber n={2} />
            <p className="text-xs leading-relaxed text-zinc-300">
              The follow-up date is the recorded date plus 4 days — a realistic delivery window for most online orders.
            </p>
          </div>
          <div className="flex items-start gap-3 rounded-lg border border-border/70 bg-muted/20 p-3">
            <StepNumber n={3} />
            <p className="text-xs leading-relaxed text-zinc-300">When the date arrives, the reminder appears here in the &quot;Due now&quot; section.</p>
          </div>
          <div className="flex items-start gap-3 rounded-lg border border-border/70 bg-muted/20 p-3">
            <StepNumber n={4} />
            <p className="text-xs leading-relaxed text-zinc-300">
              You record whether the order arrived. Unresolved orders point you to merchant support and — only if you choose — a dispute.
            </p>
          </div>
        </div>
        <p className="mt-3 rounded-lg border border-dashed border-amber-500/30 bg-amber-500/5 px-3 py-2.5 text-xs font-medium text-amber-400">
          The system never disputes automatically.
        </p>
      </SectionCard>

      {loading ? (
        <LoadingBlock rows={5} />
      ) : !data ? (
        <EmptyState title="Nothing loaded" hint="Refresh to retry." />
      ) : (
        <>
          {/* Guidance card after a "not received" resolution */}
          {guidance ? (
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 sm:p-5">
              <p className="text-sm font-semibold text-emerald-300">Suggested next steps — {guidance.merchant}</p>
              <p className="mt-2 text-xs leading-relaxed text-emerald-100/80">{guidance.text}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  className="min-h-[44px] border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25"
                  onClick={() => onNavigate("disputes")}
                >
                  Go to Dispute Centre
                </Button>
                <Button variant="ghost" className="min-h-[44px] text-muted-foreground" onClick={() => setGuidance(null)}>
                  Dismiss
                </Button>
              </div>
            </div>
          ) : null}

          {/* Due now */}
          <SectionCard title="Due now" description="These follow-ups reached their 4-day date. Confirm whether the orders arrived.">
            {data.due.length === 0 ? (
              <EmptyState
                title="Nothing due right now"
                hint="Online purchases automatically appear here 4 days after they are recorded. No action is needed until then."
              />
            ) : (
              <div className="max-h-96 space-y-3 overflow-y-auto nb-scroll">
                {data.due.map((f) => (
                  <div key={f.id} className="rounded-xl border border-amber-500/30 bg-amber-500/[0.07] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-semibold text-foreground">{merchantName(f)}</p>
                          {f.transaction?.orderRef ? <OrderRefChip value={f.transaction.orderRef} /> : null}
                          {f.transaction?.isDemo ? <DemoBadge /> : null}
                        </div>
                        <p className="mt-1.5 text-[11px] text-muted-foreground">
                          Purchased {fmtDate(f.transaction?.createdAt)} · Follow-up due {fmtDate(f.dueAt)}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1.5">
                        <Money minor={f.transaction?.amountMinor ?? 0} currency={f.transaction?.currency} className="text-sm" />
                        <DueChip />
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        className="min-h-[44px] flex-1 border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-300 sm:flex-none sm:px-6"
                        disabled={resolvingId !== null}
                        onClick={() => markReceived(f)}
                      >
                        {resolvingId === f.id ? "Recording…" : "Order received"}
                      </Button>
                      <Button
                        variant="outline"
                        className="min-h-[44px] flex-1 border-rose-500/40 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 hover:text-rose-300 sm:flex-none sm:px-6"
                        disabled={resolvingId !== null}
                        onClick={() => openNotReceived(f)}
                      >
                        Not received
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {/* Upcoming */}
          <SectionCard title="Upcoming" description="Purchases still inside their 4-day delivery window.">
            {data.upcoming.length === 0 ? (
              <EmptyState
                title="No upcoming follow-ups"
                hint="Record an online purchase in Shopping & Purchases and its 4-day follow-up will be created automatically."
                action={
                  <Button variant="outline" className="min-h-[44px] border-zinc-700" onClick={() => onNavigate("transactions")}>
                    Go to Transactions
                  </Button>
                }
              />
            ) : (
              <div className="max-h-96 space-y-3 overflow-y-auto nb-scroll">
                {data.upcoming.map((f) => (
                  <div key={f.id} className="rounded-xl border border-border/70 bg-muted/20 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-medium text-zinc-200">{merchantName(f)}</p>
                          {f.transaction?.orderRef ? <OrderRefChip value={f.transaction.orderRef} /> : null}
                          {f.transaction?.isDemo ? <DemoBadge /> : null}
                        </div>
                        <p className="mt-1.5 text-[11px] text-muted-foreground">
                          Purchased {fmtDate(f.transaction?.createdAt)} · Follow-up due {fmtDate(f.dueAt)}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1.5">
                        <Money minor={f.transaction?.amountMinor ?? 0} currency={f.transaction?.currency} className="text-sm" />
                        {f.daysRemaining !== undefined ? <InDaysChip days={f.daysRemaining} /> : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {/* Recently resolved */}
          <SectionCard title="Recently resolved" description="Follow-ups you closed in the last 30 days.">
            {data.resolved.length === 0 ? (
              <EmptyState title="Nothing resolved yet" hint="Follow-ups you resolve are listed here for 30 days." />
            ) : (
              <div className="max-h-96 space-y-2.5 overflow-y-auto nb-scroll">
                {data.resolved.map((f) => (
                  <div key={f.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 bg-muted/20 px-3 py-2.5">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm text-zinc-200">{merchantName(f)}</p>
                        {f.transaction?.orderRef ? <OrderRefChip value={f.transaction.orderRef} /> : null}
                      </div>
                      <p className="mt-1 truncate text-[11px] text-zinc-500">
                        Resolved {fmtDate(f.resolvedAt)}
                        {f.note ? ` · ${f.note}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {f.transaction?.isDemo ? <DemoBadge className="hidden sm:inline-flex" /> : null}
                      <ReceivedChip received={f.orderReceived} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </>
      )}

      {/* Not-received dialog (optional note) */}
      <Dialog
        open={notReceived !== null}
        onOpenChange={(o) => {
          if (!o) setNotReceived(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Record: order not received</DialogTitle>
            <DialogDescription>
              This closes the follow-up and surfaces next-step guidance (merchant support first, dispute only if you choose). Nothing is
              disputed automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="followup-note">Note (optional)</Label>
              <Input
                id="followup-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. tracking shows no movement since Monday"
                maxLength={500}
              />
            </div>
            <Button
              variant="outline"
              className="min-h-[44px] w-full border-rose-500/40 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 hover:text-rose-300"
              onClick={confirmNotReceived}
            >
              Record order not received
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
